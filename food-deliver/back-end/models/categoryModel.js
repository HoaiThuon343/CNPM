import mongoose from 'mongoose';
import productModel from './productModel.js';

export const defaultCategories = ['Main course', 'Drinks', 'Dessert', 'Fast food', 'Bakery'];

const categorySchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        key: { type: String, required: true, unique: true },
        code: { type: String, trim: true, uppercase: true, unique: true, sparse: true },
        description: { type: String, trim: true, default: '' },
        status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    },
    { timestamps: true },
);

const categoryModel = mongoose.models.Category || mongoose.model('Category', categorySchema, 'categories');

export const initializeCategories = async () => {
    await mongoose.connection.transaction(async session => {
        const marker = mongoose.connection.collection('settings');
        const seeded = await marker.findOne({ _id: 'default-categories' }, { session });
        const names = [...new Set([
            ...(!seeded ? defaultCategories : []),
            ...(await productModel.distinct('category').session(session)),
        ])].filter(name => typeof name === 'string' && name.trim());
        for (const name of names) {
            const key = name.trim().toLocaleLowerCase('vi');
            await categoryModel.updateOne({ key }, { $setOnInsert: { name: name.trim(), key } }, { upsert: true, session });
        }
        const categories = await categoryModel.find().session(session);
        for (const category of categories) {
            if (!category.code) {
                category.code = 'DM-' + category._id;
                await category.save({ session });
            }
            await productModel.updateMany({ category: { $regex: new RegExp('^' + category.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'), $ne: category.name } },
                { $set: { category: category.name } }, { session, timestamps: false });
        }
        const products = await productModel.find({ code: { $exists: false } }).select('_id').session(session).lean();
        for (const product of products) await productModel.updateOne({ _id: product._id },
            { $set: { code: 'SP-' + product._id } }, { session, timestamps: false });
        await marker.updateOne({ _id: 'default-categories' }, { $set: { seeded: true } }, { upsert: true, session });
    });
};

export const checkMenuProducts = async (products, session) => {
    if (products.some(product => product.status !== 'active')) {
        throw Object.assign(new Error('A product is unavailable. Please review your cart.'), { status: 409 });
    }
    if (session) {
        const ids = [...new Set(products.map(product => String(product._id)))];
        const result = await productModel.updateMany({ _id: { $in: ids }, status: 'active' },
            { $inc: { __v: 1 } }, { session });
        if (result.matchedCount !== ids.length) throw Object.assign(new Error('The menu changed. Please review your cart.'), { status: 409 });
    }
    const names = [...new Set(products.map(product => product.category).filter(Boolean))].sort();
    for (const name of names) {
        const filter = { key: name.trim().toLocaleLowerCase('vi') };
        const category = session
            ? await categoryModel.findOneAndUpdate(filter, { $inc: { __v: 1 } }, { session, new: true })
            : await categoryModel.findOne(filter).lean();
        if (category?.status === 'inactive') {
            throw Object.assign(new Error('This category is unavailable. Please review your cart.'), { status: 409 });
        }
    }
};

export default categoryModel;

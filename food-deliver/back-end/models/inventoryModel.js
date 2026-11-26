import mongoose from 'mongoose';

const { Schema } = mongoose;
const requiredText = { type: String, required: true, trim: true };
const status = { type: String, enum: ['active', 'inactive'], default: 'active' };
const code = { ...requiredText, uppercase: true, unique: true };

export const Ingredient = mongoose.model('Ingredient', new Schema({
    code, name: requiredText, unit: requiredText, description: String, status,
    minimum: { type: Number, default: 0 },
    stock: { type: Number, default: 0 }, // Thousandths of the ingredient's unit.
}, { timestamps: true }));

export const Supplier = mongoose.model('Supplier', new Schema({
    code, name: requiredText, contact: String, phone: requiredText,
    email: String, address: requiredText, note: String, status,
}, { timestamps: true }));

const purchaseLine = new Schema({
    ingredientId: { type: Schema.Types.ObjectId, required: true },
    name: requiredText, unit: requiredText, quantity: Number, unitPrice: Number, amount: Number,
}, { _id: false });

export const Purchase = mongoose.model('Purchase', new Schema({
    code,
    supplierId: { type: Schema.Types.ObjectId, required: true },
    supplierName: requiredText,
    items: [purchaseLine],
    total: Number,
    currency: { type: String, enum: ['VND', 'USD'] },
    note: String,
    status: { type: String, enum: ['DRAFT', 'CONFIRMED', 'CANCELLED'], default: 'DRAFT' },
    revision: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    createdByName: requiredText,
    confirmedBy: Schema.Types.ObjectId,
    confirmedByName: String,
    confirmedAt: Date,
}, { timestamps: true }));

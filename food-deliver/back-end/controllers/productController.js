import productModel from "../models/productModel.js";
import mongoose from "mongoose";
import categoryModel, { defaultCategories } from "../models/categoryModel.js";
import orderModel from "../models/orderModel.js";
import Invoice from "../models/invoiceModel.js";
import { toCents } from "../../shared/money.js";
import { writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const text = value => typeof value === "string" ? value.trim() : "";
const keyOf = name => text(name).toLocaleLowerCase("vi");
const escaped = name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const categoryMatch = key => new RegExp("^" + escaped(key) + "$", "i");
const requireId = id => {
    if (!mongoose.isObjectIdOrHexString(id)) fail("Mã dữ liệu không hợp lệ.");
    return id;
};
const handle = (action, status = 200) => async (req, res) => {
    let image;
    try {
        if (req.file) {
            const { buffer, mimetype } = req.file;
            const type = mimetype === "image/jpeg" && buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ? "jpg" :
                mimetype === "image/png" && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "png" :
                mimetype === "image/webp" && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP" ? "webp" : "";
            if (!type) fail("Ảnh phải có định dạng JPEG, PNG hoặc WebP hợp lệ.");
            image = randomUUID() + "." + type;
            await writeFile(new URL("../uploads/" + image, import.meta.url), buffer);
        }
        const data = await action(req, image);
        res.status(status).json({ success: true, data });
    } catch (error) {
        if (image) await unlink(new URL("../uploads/" + image, import.meta.url)).catch(() => {});
        const status = error.status || (error.code === 11000 ? 409 :
            error instanceof RangeError || error.name === "ValidationError" ? 400 : 500);
        if (status === 500) console.error(error);
        res.status(status).json({ success: false, message: error.status ? error.message :
            error.code === 11000 ? "Mã hoặc tên danh mục đã tồn tại, hoặc mã món bị trùng." :
                status === 400 ? "Kiểm tra lại dữ liệu và giá bán lớn hơn 0." : "Không xử lý được thực đơn. Vui lòng thử lại." });
    }
};
const lockCategory = async (name, session, allowHidden = false) => {
    if (!text(name)) fail("Chọn danh mục hợp lệ.");
    const category = await categoryModel.findOneAndUpdate(
        { key: keyOf(name), ...(!allowHidden && { status: { $ne: "inactive" } }) },
        { $inc: { __v: 1 } }, { new: true, session },
    );
    if (!category) fail("Danh mục không tồn tại hoặc đã ngừng hiển thị.");
    return category;
};
const categoryRows = async includeHidden => {
    const [categories, products] = await Promise.all([
        categoryModel.find(includeHidden ? {} : { status: { $ne: "inactive" } }).sort({ name: 1 }).lean(),
        productModel.find({}).select("category").lean(),
    ]);
    return categories.map(category => ({
        ...category, label: category.name, status: category.status || "active",
        isDefault: defaultCategories.some(name => keyOf(name) === category.key),
        productCount: products.filter(product => keyOf(product.category) === category.key).length,
    }));
};
const listCategories = handle(() => categoryRows(false));
const manageCategories = handle(() => categoryRows(true));
const categoryValues = body => {
    const name = text(body.name), description = text(body.description);
    if (!name || name.length > 80 || description.length > 500) fail("Tên danh mục từ 1–80 ký tự, mô tả tối đa 500 ký tự.");
    const status = body.status || "active";
    if (!["active", "inactive"].includes(status)) fail("Trạng thái danh mục không hợp lệ.");
    return { name, key: keyOf(name), description, status };
};
const addCategory = handle(async ({ body = {} }) => {
    const id = new mongoose.Types.ObjectId();
    const code = text(body.code).toUpperCase() || "DM-" + id;
    if (body.code !== undefined && (!text(body.code) || code.length > 120)) fail("Nhập mã danh mục từ 1–120 ký tự.");
    return categoryModel.create({ _id: id, ...categoryValues(body), code });
}, 201);
const updateCategory = handle(async ({ params, body = {} }) => {
    const values = categoryValues(body);
    return mongoose.connection.transaction(async session => {
        const category = await categoryModel.findOneAndUpdate({ _id: requireId(params.id) },
            { $inc: { __v: 1 } }, { new: true, session });
        if (!category) fail("Không tìm thấy danh mục.", 404);
        await productModel.updateMany({ category: categoryMatch(category.key) }, { $set: { category: values.name } }, { session });
        Object.assign(category, values);
        await category.save({ session });
        return category;
    });
});
const removeCategory = handle(async ({ params }) => mongoose.connection.transaction(async session => {
    const category = await categoryModel.findOneAndUpdate({ _id: requireId(params.id) },
        { $inc: { __v: 1 } }, { new: true, session });
    if (!category) fail("Không tìm thấy danh mục.", 404);
    if (await productModel.exists({ category: categoryMatch(category.key) }).session(session)) {
        fail("Danh mục đang có món. Bạn có thể sửa trạng thái thành ngừng hiển thị.", 409);
    }
    await categoryModel.deleteOne({ _id: category._id }, { session });
    return { message: "Đã xóa danh mục." };
}));
const productValues = (body, creating = false) => {
    const values = {};
    for (const key of ["code", "name", "description", "attributes"]) {
        if (body[key] === undefined && !creating) continue;
        values[key] = text(body[key]);
        if (key !== "attributes" && !values[key]) fail("Nhập đủ mã, tên và mô tả món ăn.");
        if (values[key].length > (key === "description" || key === "attributes" ? 2000 : 120)) fail("Thông tin món ăn quá dài.");
    }
    if (values.code) values.code = values.code.toUpperCase();
    if (body.price !== undefined || creating) {
        values.price = toCents(body.price) / 100;
        if (values.price <= 0) fail("Giá bán phải lớn hơn 0 USD.");
    }
    if (body.status !== undefined || creating) {
        values.status = body.status || "active";
        if (!["active", "out_of_stock", "inactive"].includes(values.status)) fail("Trạng thái kinh doanh không hợp lệ.");
    }
    return values;
};
const addProduct = handle(async ({ body = {} }, image) => {
    const values = productValues(body, true);
    if (!image) fail("Chọn ảnh món ăn.");
    return mongoose.connection.transaction(async session => {
        const group = await lockCategory(body.category, session);
        return new productModel({ ...values, category: group.name, image }).save({ session });
    });
});
const updateProduct = handle(async ({ body = {} }, image) => {
    const values = productValues(body);
    if (image) values.image = image;
    else if (body.removeImage === true || body.removeImage === "true") values.image = "";
    return mongoose.connection.transaction(async session => {
        const product = await productModel.findById(requireId(body.id)).session(session);
        if (!product) fail("Không tìm thấy món ăn.", 404);
        if (body.category !== undefined) values.category = (await lockCategory(body.category, session,
            keyOf(body.category) === keyOf(product.category))).name;
        Object.assign(product, values);
        await product.save({ session, validateModifiedOnly: true });
        return product;
    });
});
const listProducts = handle(async () => {
    const [products, orders] = await Promise.all([
        productModel.find().sort({ createdAt: -1 }).lean(),
        orderModel.aggregate([
            { $match: { date: { $gte: new Date(Date.now() - 30 * 86400000) }, status: { $ne: "CANCELLED" } } },
            { $unwind: "$items" },
            { $group: { _id: { product: "$items.productId", order: "$_id" } } },
            { $group: { _id: "$_id.product", count: { $sum: 1 } } },
        ]),
    ]);
    const counts = new Map(orders.map(item => [String(item._id), item.count]));
    return products.map(product => ({ ...product, orderCount30: counts.get(String(product._id)) || 0 }));
});
const removeProduct = handle(async ({ body = {} }) => mongoose.connection.transaction(async session => {
    const product = await productModel.findOneAndUpdate({ _id: requireId(body.id) },
        { $inc: { __v: 1 } }, { new: true, session });
    if (!product) fail("Không tìm thấy món ăn.", 404);
    const used = await orderModel.exists({ "items.productId": product._id }).session(session) ||
        await Invoice.exists({ "items.productId": product._id }).session(session);
    if (used) {
        product.status = "inactive";
        await product.save({ session, validateModifiedOnly: true });
    } else await productModel.deleteOne({ _id: product._id }, { session });
    return { deleted: !used, message: used ? "Đã ngừng kinh doanh món có giao dịch." : "Đã xóa món chưa phát sinh giao dịch." };
}));
const publicProducts = async filter => {
    const [products, hidden] = await Promise.all([
        productModel.find({ ...filter, status: { $ne: "inactive" } }).lean(),
        categoryModel.find({ status: "inactive" }).select("key").lean(),
    ]);
    const hiddenKeys = new Set(hidden.map(category => category.key));
    return products.filter(product => !hiddenKeys.has(keyOf(product.category)));
};
const getProductById = handle(async ({ params }) => {
    const products = await publicProducts({ _id: requireId(params.id) });
    if (!products.length) fail("This product is no longer available.", 404);
    return products[0];
});
const listProductsByMenu = handle(({ params }) => publicProducts({ category: categoryMatch(keyOf(params.menuName)) }));
const listAllProductsPublic = handle(() => publicProducts({}));

export {
    listCategories, manageCategories, addCategory, updateCategory, removeCategory,
    addProduct, listProducts, removeProduct, updateProduct,
    getProductById, listProductsByMenu, listAllProductsPublic,
    addProduct as addFood, listProducts as listFood, removeProduct as removeFood,
    updateProduct as updateFood, getProductById as getFoodById,
    listProductsByMenu as listFoodByMenu, listAllProductsPublic as listAllFoodPublic,
};

import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import validator from 'validator';
import { toCents } from '../../shared/money.js';
import { Ingredient, Purchase, Supplier } from '../models/inventoryModel.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const validId = (id) => {
    if (typeof id !== 'string' || !mongoose.isObjectIdOrHexString(id)) fail('Mã tham chiếu không hợp lệ.');
    return id;
};
const field = (value, label, limit, required = false) => {
    const result = typeof value === 'string' ? value.trim() : '';
    if ((required && !result) || result.length > limit) fail(`${label} không hợp lệ (tối đa ${limit} ký tự).`);
    return result;
};
const decimal = (value, places, label) => {
    const number = Number(value);
    if (!['number', 'string'].includes(typeof value) ||
        !new RegExp(`^\\d+(\\.\\d{1,${places}})?$`).test(String(value).trim()) || number > 100000) {
        fail(`${label} phải từ 0 đến 100.000, tối đa ${places} chữ số thập phân.`);
    }
    return number;
};
const handle = (action) => async (req, res) => {
    try {
        res.json({ success: true, data: await action(req) });
    } catch (error) {
        const status = error.status || (error.code === 11000 ? 409 : error.name === 'ValidationError' ? 400 : 500);
        if (status === 500) console.error('Inventory operation failed:', error);
        res.status(status).json({
            success: false,
            message: error.status ? error.message : error.code === 11000 ? 'Mã này đã tồn tại.' :
                status === 400 ? 'Dữ liệu không hợp lệ.' : 'Không thể xử lý dữ liệu kho. Vui lòng thử lại.',
        });
    }
};

export const listInventory = handle(async () => {
    const [ingredients, suppliers, purchases] = await Promise.all([
        Ingredient.find().sort({ name: 1 }).lean(),
        Supplier.find().sort({ name: 1 }).lean(),
        Purchase.find().sort({ createdAt: -1, _id: -1 }).lean(),
    ]);
    return { ingredients, suppliers, purchases };
});

const catalogValues = (body) => {
    if (!['active', 'inactive'].includes(body.status)) fail('Trạng thái không hợp lệ.');
    return { name: field(body.name, 'Tên', 150, true), status: body.status };
};

const draftFilter = ({ params, body }) => {
    if (!Number.isSafeInteger(body.revision) || body.revision < 0) fail('Phiên bản phiếu nhập không hợp lệ.');
    return { _id: validId(params.id), status: 'DRAFT', revision: body.revision };
};

export const saveIngredient = handle(async ({ body, params }) => {
    const values = {
        ...catalogValues(body),
        unit: field(body.unit, 'Đơn vị tính', 25, true),
        description: field(body.description, 'Mô tả', 500),
        minimum: Math.round(decimal(body.minimum, 3, 'Mức tồn tối thiểu') * 1000),
    };
    if (!params.id) return Ingredient.create({ ...values, code: field(body.code, 'Mã nguyên liệu', 25, true) });
    const id = validId(params.id);
    const updated = await Ingredient.findOneAndUpdate(
        { _id: id, $or: [{ unit: values.unit }, { stock: 0 }] },
        values, { new: true, runValidators: true },
    );
    if (updated) return updated;
    if (await Ingredient.exists({ _id: id })) fail('Không thể đổi đơn vị tính khi nguyên liệu đã có tồn kho.', 409);
    fail('Không tìm thấy nguyên liệu.', 404);
});

export const saveSupplier = handle(async ({ body, params }) => {
    const values = {
        ...catalogValues(body),
        contact: field(body.contact, 'Người liên hệ', 100),
        phone: field(body.phone, 'Số điện thoại', 30, true),
        email: field(body.email, 'Email', 150),
        address: field(body.address, 'Địa chỉ', 250, true),
        note: field(body.note, 'Ghi chú', 500),
    };
    if (!/^\+?[\d ().-]+$/.test(values.phone) || !/^\d{7,15}$/.test(values.phone.replace(/\D/g, ''))) {
        fail('Số điện thoại nhà cung cấp không hợp lệ.');
    }
    if (values.email && !validator.isEmail(values.email)) fail('Email nhà cung cấp không hợp lệ.');
    if (!params.id) return Supplier.create({ ...values, code: field(body.code, 'Mã nhà cung cấp', 25, true) });
    const updated = await Supplier.findByIdAndUpdate(validId(params.id), values, { new: true, runValidators: true });
    if (!updated) fail('Không tìm thấy nhà cung cấp.', 404);
    return updated;
});

export const savePurchase = handle(async (req) => {
    const { body, params, user } = req;
    const filter = params.id ? draftFilter(req) : null;
    const conflictMessage = 'Phiếu đã thay đổi hoặc đã xử lý. Hãy làm mới để kiểm tra.';
    const draft = filter && await Purchase.findOne(filter).select('currency').lean();
    if (filter && !draft) fail(conflictMessage, 409);
    // Keep the currency of saved drafts. New receipts and unmarked legacy receipts use USD.
    const currency = draft?.currency || 'USD';
    const isVnd = currency === 'VND';
    const scale = isVnd ? 1 : 100;
    const supplierId = validId(body.supplierId);
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) {
        fail('Phiếu nhập cần có từ 1 đến 100 dòng nguyên liệu.');
    }
    const ids = body.items.map((item) => validId(item?.ingredientId).toLowerCase());
    if (new Set(ids).size !== ids.length) fail('Mỗi nguyên liệu chỉ xuất hiện một lần trong phiếu.');
    const [supplier, ingredients] = await Promise.all([
        Supplier.findOne({ _id: supplierId, status: 'active' }).lean(),
        Ingredient.find({ _id: { $in: ids }, status: 'active' }).lean(),
    ]);
    if (!supplier) fail('Chọn nhà cung cấp đang hoạt động.');
    if (ingredients.length !== ids.length) fail('Chỉ chọn nguyên liệu đang sử dụng.');
    const byId = new Map(ingredients.map((item) => [String(item._id), item]));
    let totalMinor = 0;
    const items = body.items.map((item, index) => {
        const ingredient = byId.get(ids[index]);
        const quantity = decimal(item.quantity, 3, 'Số lượng');
        if (quantity <= 0) fail('Số lượng nhập phải lớn hơn 0.');
        const unitPrice = isVnd ? Number(item.unitPrice) : decimal(item.unitPrice, 2, 'Đơn giá');
        if (isVnd && (!['number', 'string'].includes(typeof item.unitPrice) ||
            !/^\d+$/.test(String(item.unitPrice).trim()) || unitPrice > 10_000_000)) {
            fail('Đơn giá VND phải là số nguyên từ 0 đến 10.000.000 đồng.');
        }
        const priceMinor = isVnd ? unitPrice : toCents(unitPrice);
        const lineMinor = Math.round(Math.round(quantity * 1000) * priceMinor / 1000);
        totalMinor += lineMinor;
        return { ingredientId: ingredient._id, name: ingredient.name, unit: ingredient.unit,
            quantity, unitPrice, amount: lineMinor / scale };
    });
    const values = { supplierId, supplierName: supplier.name, items, currency, total: totalMinor / scale,
        note: field(body.note, 'Ghi chú', 500) };
    if (!params.id) return Purchase.create({
        ...values, code: `PN-${randomBytes(5).toString('hex').toUpperCase()}`,
        createdBy: user.id, createdByName: user.name,
    });
    const updated = await Purchase.findOneAndUpdate(
        filter, { $set: values, $inc: { revision: 1 } }, { new: true },
    );
    if (!updated) fail(conflictMessage, 409);
    return updated;
});

export const cancelPurchase = handle(async (req) => {
    const updated = await Purchase.findOneAndUpdate(
        draftFilter(req), { status: 'CANCELLED' }, { new: true },
    );
    if (!updated) fail('Phiếu đã thay đổi hoặc đã xử lý. Hãy làm mới để kiểm tra.', 409);
    return updated;
});

export const confirmPurchase = handle((req) => {
    const filter = draftFilter(req);
    const { user } = req;
    return mongoose.connection.transaction(async (session) => {
        const purchase = await Purchase.findOneAndUpdate(
            filter,
            { status: 'CONFIRMED', confirmedAt: new Date(), confirmedBy: user.id, confirmedByName: user.name },
            { new: true, session },
        );
        if (!purchase) fail('Phiếu đã thay đổi hoặc đã xử lý. Hãy làm mới để kiểm tra.', 409);
        if (!await Supplier.exists({ _id: purchase.supplierId, status: 'active' }).session(session)) {
            fail('Nhà cung cấp đã ngừng hợp tác. Hãy kiểm tra lại phiếu nhập.', 409);
        }
        for (const item of purchase.items) {
            const result = await Ingredient.updateOne(
                { _id: item.ingredientId, unit: item.unit, status: 'active' },
                { $inc: { stock: Math.round(item.quantity * 1000) } }, { session },
            );
            if (result.matchedCount !== 1) fail(`Nguyên liệu ${item.name} đã đổi đơn vị hoặc ngừng sử dụng. Hãy cập nhật lại phiếu.`, 409);
        }
        return purchase;
    });
});

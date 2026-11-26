import mongoose from 'mongoose';
import Promotion from '../models/promotionModel.js';
import Order from '../models/orderModel.js';
import { toCents } from '../../shared/money.js';

const fail = (message, status = 400) => {
    throw Object.assign(new Error(message), { status });
};

export const promotionCode = (value = '') => {
    if (typeof value !== 'string') fail('Mã khuyến mãi không hợp lệ.');
    const code = value.trim().toUpperCase();
    if (code && !/^[A-Z0-9_-]{1,24}$/.test(code)) fail('Mã chỉ gồm tối đa 24 chữ cái, số, dấu gạch ngang hoặc gạch dưới.');
    return code;
};

const available = (now) => ({
    active: true, startsAt: { $lte: now }, endsAt: { $gt: now },
    $expr: { $lt: ['$usedCount', '$usageLimit'] },
});

// A quote only reads the promotion. A real order reserves one use in its transaction.
export const pricePromotion = async (code, subtotalCents, session) => {
    if (!code) return {};
    const promo = await Promotion.findOne({ code }).session(session || null).lean();
    const now = new Date();
    if (!promo) fail('Không tìm thấy mã khuyến mãi.', 409);
    if (!promo.active) fail('Mã khuyến mãi đang tắt.', 409);
    if (now < promo.startsAt) fail('Mã khuyến mãi chưa đến thời gian áp dụng.', 409);
    if (now >= promo.endsAt) fail('Mã khuyến mãi đã hết hạn.', 409);
    if (promo.usedCount >= promo.usageLimit) fail('Mã khuyến mãi đã hết lượt sử dụng.', 409);
    if (subtotalCents < toCents(promo.minimum)) fail('Tiền món chưa đạt mức tối thiểu của mã.', 409);

    const value = toCents(promo.value);
    const discount = promo.type === 'percent'
        ? Number((BigInt(subtotalCents) * BigInt(value) + 5000n) / 10000n)
        : value;
    const cap = promo.maximumDiscount == null ? subtotalCents : toCents(promo.maximumDiscount);
    const discountCents = Math.min(subtotalCents, discount, cap);
    if (discountCents <= 0) fail('Mã này không giảm được tiền cho giỏ hàng hiện tại.', 409);

    if (session) {
        const result = await Promotion.updateOne(
            { _id: promo._id, __v: promo.__v, ...available(new Date()) },
            { $inc: { usedCount: 1, __v: 1 }, $set: { hasBeenUsed: true } },
            { session },
        );
        if (!result.matchedCount) fail('Mã khuyến mãi vừa thay đổi hoặc không còn lượt sử dụng.', 409);
    }
    return { promotionId: promo._id, promotionCode: code, discountAmount: discountCents / 100 };
};

export const releasePromotion = (id, session) => Promotion.updateOne(
    { _id: id, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1, __v: 1 } }, { session },
);

const handle = (action) => async (req, res) => {
    try {
        res.json({ success: true, data: await action(req) });
    } catch (error) {
        const status = error.status || (error.code === 11000 ? 409 : error instanceof RangeError ? 400 : 500);
        if (status === 500) console.error('Promotion operation failed:', error);
        res.status(status).json({ success: false, message: error.status ? error.message :
            error.code === 11000 ? 'Mã khuyến mãi đã tồn tại.' :
                status === 400 ? 'Giá trị khuyến mãi không hợp lệ.' : 'Không thể xử lý khuyến mãi. Vui lòng thử lại.' });
    }
};

export const publicPromotions = handle(() => Promotion.find(available(new Date()))
    .select('code name description type value minimum maximumDiscount startsAt endsAt')
    .sort({ endsAt: 1 }).lean());

export const listPromotions = handle(() => Promotion.find().sort({ createdAt: -1 }).lean());

const requireId = (id) => {
    if (!mongoose.isObjectIdOrHexString(id)) fail('Chương trình không hợp lệ.');
    return id;
};

const amount = (value) => {
    if (!['string', 'number'].includes(typeof value) || !/^\d+(\.\d{1,2})?$/.test(String(value))) {
        fail('Giá trị tiền và tỷ lệ phải không âm, tối đa hai chữ số thập phân.');
    }
    return toCents(value) / 100;
};

export const savePromotion = handle(async ({ body, params }) => {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (!name || name.length > 120 || description.length > 500) fail('Kiểm tra lại tên và mô tả chương trình.');
    if (!['percent', 'fixed'].includes(body.type)) fail('Chọn loại giảm giá.');
    const value = amount(body.value);
    if (!value || (body.type === 'percent' && value > 100)) fail('Tỷ lệ giảm phải lớn hơn 0 và tối đa 100%, hoặc nhập số tiền giảm dương.');
    const minimum = amount(body.minimum ?? 0);
    const maximumDiscount = body.type === 'percent' && body.maximumDiscount != null && body.maximumDiscount !== ''
        ? amount(body.maximumDiscount) : null;
    if (maximumDiscount === 0) fail('Mức giảm tối đa phải lớn hơn 0.');
    const startsAt = new Date(typeof body.startsAt === 'string' ? body.startsAt : NaN);
    const endsAt = new Date(typeof body.endsAt === 'string' ? body.endsAt : NaN);
    if (!(endsAt > startsAt)) fail('Thời gian kết thúc phải sau thời gian bắt đầu.');
    const usageLimit = Number(body.usageLimit);
    if (!['number', 'string'].includes(typeof body.usageLimit) || !String(body.usageLimit).trim() ||
        !Number.isSafeInteger(usageLimit) || usageLimit < 0) fail('Số lượt tối đa phải là số nguyên không âm.');

    const terms = { type: body.type, value, minimum, maximumDiscount };
    const values = { name, description, ...terms, startsAt, endsAt, usageLimit };
    if (!params.id || body.code !== undefined) {
        const code = promotionCode(body.code);
        if (!code) fail('Nhập mã khuyến mãi.');
        values.code = code;
    }
    if (!params.id) {
        if (body.active === true && endsAt <= new Date()) fail('Chương trình đã hết hạn. Hãy đổi thời gian kết thúc.');
        return Promotion.create({ ...values, active: body.active === true });
    }

    const current = await Promotion.findById(requireId(params.id)).lean();
    if (!current) fail('Không tìm thấy chương trình.', 404);
    if (current.hasBeenUsed && Object.entries(terms).some(([key, value]) => (current[key] ?? null) !== value)) {
        fail('Chương trình đã có đơn áp dụng nên các điều kiện giảm giá đã được khóa.');
    }
    if (usageLimit < current.usedCount) fail('Số lượt tối đa không được nhỏ hơn số lượt đã dùng.');
    const updated = await Promotion.findOneAndUpdate({ _id: current._id, __v: current.__v },
        { $set: values, $inc: { __v: 1 } }, { new: true });
    if (!updated) fail('Dữ liệu vừa thay đổi. Vui lòng tải lại chương trình.', 409);
    return updated;
});

export const togglePromotion = handle(async ({ body, params }) => {
    if (typeof body.active !== 'boolean') fail('Trạng thái không hợp lệ.');
    const id = requireId(params.id);
    const filter = { _id: id, ...(body.active && { endsAt: { $gt: new Date() } }) };
    const updated = await Promotion.findOneAndUpdate(filter,
        { $set: { active: body.active }, $inc: { __v: 1 } }, { new: true });
    if (updated) return updated;
    if (await Promotion.exists({ _id: id })) fail('Chương trình đã hết hạn. Hãy gia hạn trước khi bật.', 409);
    fail('Không tìm thấy chương trình.', 404);
});

export const promotionHistory = handle(async ({ params }) => {
    const promotion = await Promotion.findById(requireId(params.id)).select('usedCount').lean();
    if (!promotion) fail('Không tìm thấy chương trình.', 404);
    const orders = await Order.find({ promotionId: params.id })
        .select('orderCode discountAmount amount status date')
        .sort({ date: -1 }).lean();
    return { orders, usedCount: promotion.usedCount };
});

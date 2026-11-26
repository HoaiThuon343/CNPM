import mongoose from 'mongoose';
import { orderItemSchema, deliveryAddressSchema } from './orderModel.js';

const invoiceSchema = new mongoose.Schema(
    {
        invoiceCode: { type: String, required: true, unique: true },
        legacyInvoiceCode: { type: String, unique: true, sparse: true, select: false },
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order',
            required: true,
            unique: true,
        },
        orderCode: { type: String, required: true },
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
        items: { type: [orderItemSchema], required: true },
        address: { type: deliveryAddressSchema, required: true },
        subtotal: { type: Number, required: true, min: 0 },
        deliveryFee: { type: Number, required: true, min: 0 },
        totalBeforeDiscount: { type: Number, min: 0 },
        discountAmount: { type: Number, min: 0, default: 0 },
        promotionCode: String,
        amount: { type: Number, required: true, min: 0 },
        currency: { type: String, enum: ['USD'], default: 'USD' },
        paymentMethod: { type: String, enum: ['COD'], default: 'COD' },
        paymentStatus: {
            type: String,
            enum: ['UNPAID', 'PAID'],
            default: 'UNPAID',
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'user',
            required: true,
        },
        createdByName: String,
        paidAmount: { type: Number, min: 0 },
        paidAt: Date,
        paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
        paidByName: String,
    },
    { timestamps: true },
);

invoiceSchema.statics.initializeCodeCounter = async function () {
    const latest = await this.findOne({ invoiceCode: /^HD-\d{4}$/ })
        .sort({ invoiceCode: -1 })
        .select('invoiceCode')
        .lean();
    await this.db.collection('counters').updateOne(
        { _id: 'invoice-code' },
        { $max: { sequence: latest ? Number(latest.invoiceCode.slice(3)) : 0 } },
        { upsert: true },
    );
};

invoiceSchema.statics.nextCode = async function (session) {
    const counter = await this.db.collection('counters').findOneAndUpdate(
        { _id: 'invoice-code' },
        { $inc: { sequence: 1 } },
        { upsert: true, returnDocument: 'after', session },
    );
    if (counter.sequence > 9999) {
        const error = new Error('Đã dùng hết dải mã hóa đơn 4 số. Vui lòng liên hệ quản trị viên.');
        error.status = 409;
        throw error;
    }
    return `HD-${String(counter.sequence).padStart(4, '0')}`;
};

invoiceSchema.statics.upgradeLegacyCodes = async function () {
    return this.db.transaction(async (session) => {
        const invoices = await this.find({ invoiceCode: { $not: /^HD-\d{4}$/ } })
            .select('invoiceCode')
            .sort({ createdAt: 1, _id: 1 })
            .session(session)
            .lean();
        if (!invoices.length) return 0;
        const counter = await this.db.collection('counters').findOneAndUpdate(
            { _id: 'invoice-code' },
            { $inc: { sequence: invoices.length } },
            { upsert: true, returnDocument: 'after', session },
        );
        if (counter.sequence > 9999)
            throw new Error('Không đủ mã hóa đơn bốn số để chuyển đổi. Dữ liệu chưa bị thay đổi.');
        await this.bulkWrite(invoices.map((invoice, index) => ({
            updateOne: {
                filter: { _id: invoice._id },
                update: { $set: {
                    invoiceCode: `HD-${String(counter.sequence - invoices.length + index + 1).padStart(4, '0')}`,
                    ...(invoice.invoiceCode && { legacyInvoiceCode: invoice.invoiceCode }),
                } },
                timestamps: false,
            },
        })), { session });
        return invoices.length;
    });
};

export default mongoose.models.Invoice ||
    mongoose.model('Invoice', invoiceSchema, 'invoices');

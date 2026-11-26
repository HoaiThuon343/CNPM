import mongoose from 'mongoose';
import Order from '../models/orderModel.js';
import Invoice from '../models/invoiceModel.js';
import { Ingredient, Purchase, Supplier } from '../models/inventoryModel.js';
import { toCents } from '../../shared/money.js';

const dayMs = 86400000;
const vietnamOffset = 7 * 3600000;
const dayKey = date => new Date(+date + vietnamOffset).toISOString().slice(0, 10);
const parseDay = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const date = Date.parse(value + 'T00:00:00+07:00');
    return Number.isFinite(date) && dayKey(date) === value ? date : NaN;
};
const paymentNames = { PAID: 'Đã thanh toán', UNPAID: 'Chưa thanh toán' };
const groupBy = (items, getKey, makeRow, add) => {
    const groups = new Map();
    for (const item of items) {
        const key = getKey(item);
        if (!groups.has(key)) groups.set(key, makeRow(item));
        add(groups.get(key), item);
    }
    return [...groups.values()];
};
const sum = (items, read) => items.reduce((total, item) => total + read(item), 0);

async function revenueInvoices(period) {
    const orders = await Order.find({ status: 'COMPLETED', completedAt: { $lt: period.$lt } })
        .select('completedAt')
        .populate({
            path: 'invoice',
            match: { paymentStatus: 'PAID', paidAt: { $ne: null, $lt: period.$lt } },
            select: 'paidAt items amount subtotal deliveryFee discountAmount totalBeforeDiscount orderId',
        }).lean();
    return orders.flatMap(({ invoice, completedAt }) => {
        if (!invoice || !completedAt || !invoice.paidAt) return [];
        const date = Math.max(+completedAt, +invoice.paidAt);
        return date >= +period.$gte ? [{ ...invoice, date }] : [];
    });
}

const bucket = (date, cycle) => {
    const day = dayKey(date);
    if (cycle === 'year') return day.slice(0, 4);
    if (cycle === 'quarter') return `${day.slice(0, 4)} – Q${Math.ceil(Number(day.slice(5, 7)) / 3)}`;
    return cycle === 'month' ? day.slice(0, 7) : day;
};

const invoiceTotals = (items, getKey, describe, byAmount = false) => groupBy(
    items, getKey,
    item => ({ ...describe(item), count: 0, amount: 0 }),
    (row, item) => {
        row.count += 1;
        row.amount += toCents(item.amount);
    },
).sort(byAmount ? (a, b) => b.amount - a.amount : (a, b) => a.date.localeCompare(b.date));

const purchaseAmount = purchase => purchase.currency === 'VND' ? purchase.total : toCents(purchase.total);
const beforeDiscount = invoice => invoice.totalBeforeDiscount == null
    ? toCents(invoice.subtotal) + toCents(invoice.deliveryFee) : toCents(invoice.totalBeforeDiscount);
const purchasesIn = (period, filters = {}) => Purchase.find({
    status: 'CONFIRMED', confirmedAt: period, ...filters,
}).select('code confirmedAt supplierName currency total').sort({ confirmedAt: -1 }).lean();

async function reportRows(section, period, query) {
    switch (section) {
        case 'revenue': {
            const [invoices, orders] = await Promise.all([
                revenueInvoices(period),
                Order.find({ date: period, status: { $in: ['PENDING', 'CONFIRMED', 'PREPARING', 'DELIVERING'] } })
                    .select('amount').lean(),
            ]);
            const rows = invoiceTotals(invoices, item => bucket(item.date, query.cycle),
                item => ({ date: bucket(item.date, query.cycle) }));
            return { rows, processing: sum(orders, order => toCents(order.amount)) };
        }
        case 'invoices': {
            const invoices = await Invoice.find({
                createdAt: period, ...(query.status && { paymentStatus: query.status }),
            }).select('amount paymentStatus createdAt').lean();
            const rows = invoiceTotals(invoices, item => dayKey(item.createdAt) + item.paymentStatus, item => ({
                date: dayKey(item.createdAt), status: paymentNames[item.paymentStatus],
            }));
            return { rows };
        }
        case 'staff': {
            const invoices = await Invoice.find({ createdAt: period })
                .select('amount createdBy createdByName').sort({ createdAt: -1 }).lean();
            return { rows: invoiceTotals(invoices, item => String(item.createdBy), item => ({
                name: item.createdByName || 'Chưa ghi nhận',
            }), true) };
        }
        case 'customers': {
            const invoices = await Invoice.find({ createdAt: period })
                .select('amount customerId address.name address.phone').sort({ createdAt: -1 })
                .populate({
                    path: 'customerId', select: 'userId',
                    populate: { path: 'userId', select: 'name' },
                    transform: (customer, id) => customer || { _id: id },
                }).lean();
            const key = item => {
                if (item.customerId?._id) return 'customer:' + item.customerId._id;
                const phone = item.address?.phone?.replace(/\D/g, '').replace(/^84(?=\d{9}$)/, '0');
                return 'guest:' + (phone || item._id);
            };
            return { rows: invoiceTotals(invoices, key, item => ({
                name: item.customerId?.userId?.name || item.address?.name || 'Khách vãng lai',
                type: item.customerId?._id ? 'Có tài khoản' : 'Khách vãng lai',
            }), true) };
        }
        case 'products': {
            const invoices = await revenueInvoices(period);
            const items = invoices.flatMap(invoice => invoice.items);
            const rows = groupBy(items, item => String(item.productId),
                item => ({ name: item.name, quantity: 0, amount: 0 }),
                (row, item) => {
                    row.quantity += item.quantity;
                    row.amount += item.quantity * toCents(item.price);
                }).sort((a, b) => b.amount - a.amount);
            return { rows };
        }
        case 'discounts': {
            const invoices = await revenueInvoices(period);
            if (!invoices.length) return { rows: [] };
            const before = sum(invoices, beforeDiscount);
            const discount = sum(invoices, item => item.discountAmount == null
                ? beforeDiscount(item) - toCents(item.amount) : toCents(item.discountAmount));
            const amount = sum(invoices, item => toCents(item.amount));
            return { rows: [{ count: invoices.length, before, discount, amount }] };
        }
        case 'purchases': {
            const [purchases, ingredients, suppliers] = await Promise.all([
                purchasesIn(period, {
                    ...(query.supplier && { supplierId: query.supplier }),
                    ...(query.ingredient && { 'items.ingredientId': query.ingredient }),
                }),
                Ingredient.find().select('name code').sort({ name: 1 }).lean(),
                Supplier.find().select('name code').sort({ name: 1 }).lean(),
            ]);
            return { ingredients, suppliers, rows: purchases.map(item => ({
                code: item.code, name: item.supplierName, date: dayKey(item.confirmedAt),
                currency: item.currency || 'USD', amount: purchaseAmount(item),
            })) };
        }
        case 'stock': {
            const ingredients = await Ingredient.find().select('code name unit stock minimum').sort({ name: 1 }).lean();
            return { rows: ingredients.map(item => ({
                code: item.code, name: item.name, unit: item.unit,
                stock: (item.stock || 0) / 1000, minimum: (item.minimum || 0) / 1000,
                low: (item.stock || 0) < (item.minimum || 0),
            })) };
        }
        case 'cash-flow': {
            const [invoices, purchases] = await Promise.all([revenueInvoices(period), purchasesIn(period)]);
            if (!invoices.length && !purchases.length) return { rows: [] };
            const income = sum(invoices, item => toCents(item.amount));
            const expenses = sum(purchases.filter(item => item.currency !== 'VND'), purchaseAmount);
            const rows = [{ currency: 'USD', income, expenses, balance: income - expenses }];
            const vnd = purchases.filter(item => item.currency === 'VND');
            if (vnd.length) {
                const expenses = sum(vnd, purchaseAmount);
                rows.push({ currency: 'VND', income: 0, expenses, balance: -expenses });
            }
            return { rows };
        }
        default: return null;
    }
}

export const getReport = async (req, res) => {
    const { section } = req.params;
    const { from, to, cycle, status, ingredient, supplier } = req.query;
    const start = parseDay(from);
    const end = parseDay(to);
    if (section !== 'stock' && (!Number.isFinite(start) || !Number.isFinite(end) || start > end))
        return res.status(400).json({ message: 'Khoảng thời gian báo cáo không hợp lệ.' });
    if ((cycle && !['day', 'month', 'quarter', 'year'].includes(cycle)) ||
        (status && !['PAID', 'UNPAID'].includes(status)) ||
        [ingredient, supplier].some(value => value && !mongoose.isObjectIdOrHexString(value)))
        return res.status(400).json({ message: 'Bộ lọc báo cáo không hợp lệ.' });
    try {
        const data = await reportRows(section, { $gte: new Date(start), $lt: new Date(end + dayMs) }, req.query);
        if (!data) return res.status(404).json({ message: 'Không tìm thấy báo cáo.' });
        return res.json({ success: true, data });
    } catch (error) {
        console.error('Report error:', error);
        return res.status(500).json({ message: 'Không tải được báo cáo. Vui lòng thử lại.' });
    }
};

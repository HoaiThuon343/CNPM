import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import mongoose from 'mongoose';
import { toCents, formatMoney } from '../../shared/money.js';
import productModel from '../models/productModel.js';
import orderModel from '../models/orderModel.js';
import customerModel from '../models/customerModel.js';
import cartModel from '../models/cartModel.js';
import cartDetailModel from '../models/cartDetailModel.js';
import { placeOrder } from '../controllers/orderController.js';

afterEach(() => mock.restoreAll());

test('USD formatting keeps two digits without appending extra decimals', () => {
    assert.equal(formatMoney(5), '$5.00');
    assert.equal(formatMoney(5.5), '$5.50');
    assert.equal(formatMoney(1234.56), '$1,234.56');
    assert.equal((toCents(0.1) + toCents(0.2)) / 100, 0.3);
});

test('prices round to cents consistently and reject invalid USD inputs', () => {
    assert.equal(toCents('2.35'), 235);
    assert.equal(toCents(1.005), 101);
    assert.equal(toCents(10.075), 1008);
    assert.equal(toCents(1e-7), 0);
    for (const value of ['', 'abc', undefined, null, false, NaN, Infinity, -1]) {
        assert.throws(() => toCents(value), RangeError);
    }
    const product = new productModel({ name: 'Item', price: 2.345, description: 'Test', category: 'Drinks', image: 'item.png' });
    assert.equal(product.price, 2.35);
    assert.equal(product.validateSync(), undefined);
});

test('checkout computes USD totals from database prices using integer cents', async () => {
    const id = new mongoose.Types.ObjectId();
    const details = [
        { productId: { _id: id, name: 'Item A', price: 2.345, status: 'active', image: 'a.png' }, quantity: 3 },
        { productId: { _id: new mongoose.Types.ObjectId(), name: 'Item B', price: 1.1, status: 'active', image: 'b.png' }, quantity: 2 }
    ];
    mock.method(productModel, 'updateMany', async () => ({ matchedCount: details.length }));
    mock.method(mongoose, 'startSession', async () => ({
        async withTransaction(callback) { return callback(); }, async endSession() {}
    }));
    mock.method(customerModel, 'findOne', () => ({ session: async () => ({ _id: id }) }));
    mock.method(cartModel, 'findOne', () => ({ session: async () => ({ _id: id }) }));
    mock.method(cartDetailModel, 'find', () => ({ populate() { return this; }, session: async () => details }));
    let saved, cleared = false;
    mock.method(orderModel, 'nextCode', async () => 'FD-0001');
    mock.method(orderModel.prototype, 'save', async function () {
        assert.equal(this.validateSync(), undefined);
        saved = this;
        return this;
    });
    mock.method(cartDetailModel, 'deleteMany', async () => { cleared = true; });
    let status, result;
    const res = { status(value) { status = value; return this; }, json(value) { result = value; } };
    await placeOrder({ user: { id: String(id) }, body: {
        amount: 0.01, address: { name: 'Customer', email: 'customer@example.com', phone: '0900000000', address: 'Test address' }
    } }, res);
    assert.equal(status, 201);
    assert.equal(saved.items[0].price, 2.35);
    assert.equal(saved.subtotal, 9.25);
    assert.equal(saved.deliveryFee, 5);
    assert.equal(saved.amount, 14.25);
    assert.equal(result.amount, 14.25);
    assert.equal(cleared, true);
});

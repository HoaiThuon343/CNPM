import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, mock, test } from 'node:test';
import express from 'express';
import mongoose from 'mongoose';
import productModel from '../models/productModel.js';
import orderModel from '../models/orderModel.js';
import orderRouter from '../routes/orderRoute.js';

let server, url, products, orders;
const secret = 'a'.repeat(64);
const productId = new mongoose.Types.ObjectId().toString();
const payload = () => ({
    address: {
        name: 'Guest',
        phone: '0901234567',
        address: 'Delivery address',
    },
    items: [{ productId, quantity: 3, price: 2.35 }],
    expectedAmount: 12.05,
    requestId: 'guest-request-123456',
    trackingCode: secret,
});
const request = async (path, body) => {
    const response = await fetch(url + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
};
before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/order', orderRouter);
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    url = `http://127.0.0.1:${server.address().port}/api/order`;
});
after(async () => {
    await new Promise((resolve) => server.close(resolve));
});
afterEach(() => mock.restoreAll());
beforeEach(() => {
    mock.method(mongoose.connection, 'transaction', async action => action({}));
    mock.method(productModel, 'updateMany', async () => ({ matchedCount: products.length }));
    products = [
        {
            _id: productId,
            name: 'Item',
            price: 2.35,
            status: 'active',
            image: 'item.png',
        },
    ];
    orders = [];
    let sequence = 0;
    mock.method(orderModel, 'nextCode', async () => `FD-${String(++sequence).padStart(4, '0')}`);
    mock.method(productModel, 'find', () => ({ session() { return this; }, lean: async () => products }));
    mock.method(orderModel, 'findOne', (filter) => {
        const matches = (order, query) => Object.entries(query).every(([key, value]) => key === '$or'
            ? value.some(condition => matches(order, condition)) : String(order[key]) === String(value));
        const find = () =>
            orders.find(order => matches(order, filter)) || null;
        return {
            select() {
                return this;
            },
            then(resolve, reject) {
                return Promise.resolve(find()).then(resolve, reject);
            },
        };
    });
    mock.method(orderModel, 'create', async (values) => {
        const order = new orderModel(Array.isArray(values) ? values[0] : values);
        assert.equal(order.validateSync(), undefined);
        orders.push(order);
        return Array.isArray(values) ? [order] : order;
    });
    mock.method(orderModel, 'findOneAndUpdate', async (filter, values) => {
        const order = orders.find(
            (order) =>
                String(order._id) === String(filter._id) &&
                order.status === filter.status,
        );
        if (!order) return null;
        Object.assign(order, values.$set);
        return order;
    });
});

test('guest places COD without email or account and receives a public code', async () => {
    const result = await request('/guest', { ...payload(), note: ' Gọi trước khi giao ' });
    assert.equal(result.status, 201);
    assert.equal(result.data.order.status, 'PENDING');
    assert.equal(result.data.order.paymentMethod, 'COD');
    assert.equal(result.data.order.amount, 12.05);
    assert.equal(result.data.order.note, 'Gọi trước khi giao');
    assert.match(result.data.order.orderCode, /^FD-\d{4}$/);
    assert.equal(orders[0].customerId, undefined);
    assert.notEqual(orders[0].trackingHash, secret);
    for (const field of ['trackingHash', 'requestKey', 'requestHash'])
        assert.equal(result.data.order[field], undefined);
});

test('retry returns the same order and changing a reused request is rejected', async () => {
    const body = payload();
    const first = await request('/guest', body);
    products = [];
    const retry = await request('/guest', body);
    assert.equal(retry.status, 200);
    assert.equal(retry.data.order.orderCode, first.data.order.orderCode);
    assert.equal(orders.length, 1);
    body.address.name = 'Changed';
    assert.equal((await request('/guest', body)).status, 409);
    assert.equal(orders.length, 1);
});

test('server rejects changed prices, altered totals, unavailable products and invalid quantities', async () => {
    const wrongPrice = payload();
    wrongPrice.items[0].price = 0.01;
    assert.equal((await request('/guest', wrongPrice)).status, 409);
    assert.equal(
        (await request('/guest', { ...payload(), expectedAmount: 0.01 }))
            .status,
        409,
    );
    const wrongQuantity = payload();
    wrongQuantity.items[0].quantity = -1;
    assert.equal((await request('/guest', wrongQuantity)).status, 400);
    products[0].status = 'out_of_stock';
    assert.equal((await request('/guest', payload())).status, 409);
    assert.equal(orders.length, 0);
});

test('lookup and cancellation require the secret of that specific order', async () => {
    const placed = await request('/guest', payload());
    const credentials = {
        orderCode: placed.data.order.orderCode,
        trackingCode: secret,
    };
    assert.equal(
        (
            await request('/lookup', {
                ...credentials,
                trackingCode: 'b'.repeat(64),
            })
        ).status,
        404,
    );
    assert.equal(
        (
            await request('/guest/cancel', {
                ...credentials,
                trackingCode: 'b'.repeat(64),
            })
        ).status,
        404,
    );
    assert.equal(orders[0].status, 'PENDING');
    assert.equal(
        (await request('/lookup', credentials)).data.order.status,
        'PENDING',
    );
    const cancelled = await request('/guest/cancel', credentials);
    assert.equal(cancelled.data.order.status, 'CANCELLED');
    assert.equal(orders[0].cancelledBy, 'guest');
    assert.equal((await request('/guest/cancel', credentials)).status, 200);
});

test('a guest cannot cancel an order after confirmation', async () => {
    const placed = await request('/guest', payload());
    orders[0].status = 'CONFIRMED';
    const result = await request('/guest/cancel', {
        orderCode: placed.data.order.orderCode,
        trackingCode: secret,
    });
    assert.equal(result.status, 409);
    assert.equal(orders[0].status, 'CONFIRMED');
});

test('cancellation atomically checks status even when confirmation wins the race', async () => {
    const placed = await request('/guest', payload());
    mock.method(orderModel, 'findOneAndUpdate', async () => {
        orders[0].status = 'CONFIRMED';
        return null;
    });
    const result = await request('/guest/cancel', {
        orderCode: placed.data.order.orderCode,
        trackingCode: secret,
    });
    assert.equal(result.status, 409);
    assert.equal(orders[0].status, 'CONFIRMED');
});

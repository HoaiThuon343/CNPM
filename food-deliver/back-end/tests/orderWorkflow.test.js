import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, mock, test } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import orderRouter from '../routes/orderRoute.js';
import orderModel from '../models/orderModel.js';
import invoiceModel from '../models/invoiceModel.js';
import userModel from '../models/userModel.js';
import roleModel from '../models/roleModel.js';
import productModel from '../models/productModel.js';
import categoryModel, { initializeCategories } from '../models/categoryModel.js';
import productRouter from '../routes/productRoute.js';
import promotionRouter from '../routes/promotionRoute.js';
import userRouter from '../routes/userRoute.js';
import cartRouter from '../routes/cartRoute.js';
import Staff, { initializeStaff } from '../models/staffModel.js';
import { Purchase } from '../models/inventoryModel.js';
import Promotion from '../models/promotionModel.js';
import Customer from '../models/customerModel.js';
import Cart from '../models/cartModel.js';
import CartDetail from '../models/cartDetailModel.js';

// Explicit opt-in: this suite creates and removes only its own isolated MongoDB database.
describe(
    'MongoDB order, invoice and COD transactions',
    { skip: process.env.RUN_MONGO_ORDER_TESTS !== '1' },
    () => {
        const dbName = `cnpm_order_test_${randomUUID().slice(0, 8)}`;
        const secret = 'a'.repeat(64);
        const accounts = {};
        const uploadedImages = [];
        let server, url, courierRole;
        const token = (name) =>
            jwt.sign({ id: accounts[name]._id }, process.env.JWT_SECRET, {
                expiresIn: '1h',
            });
        const request = async (path, body, actor = 'manager', method = body === undefined ? 'GET' : 'POST') => {
            const response = await fetch(
                /^\/(product|promotions|user|cart)\b/.test(path) ? url.replace('/order', '') + path : url + path,
                {
                    method,
                    headers: {
                        'Content-Type': 'application/json',
                        ...(actor && { Authorization: `Bearer ${token(actor)}` }),
                    },
                    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                },
            );
            return { status: response.status, data: await response.json() };
        };
        const createOrder = () =>
            orderModel.create({
                orderCode: `FD-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
                trackingHash: createHash('sha256').update(secret).digest('hex'),
                items: [
                    {
                        productId: new mongoose.Types.ObjectId(),
                        name: 'Original item',
                        price: 2.35,
                        quantity: 3,
                    },
                ],
                address: {
                    name: 'Guest',
                    phone: '0901234567',
                    address: 'Original delivery address',
                },
                subtotal: 7.05,
                deliveryFee: 5,
                amount: 12.05,
            });
        const advance = (order, status, actor) =>
            request('/status', { orderId: String(order._id), status }, actor);
        const readyToDeliver = async () => {
            const order = await createOrder();
            assert.equal((await advance(order, 'CONFIRMED')).status, 200);
            assert.equal((await advance(order, 'PREPARING')).status, 200);
            assert.equal(
                (
                    await request('/assign', {
                        orderId: order._id,
                        staffId: accounts.courier._id,
                    })
                ).status,
                200,
            );
            assert.equal((await advance(order, 'DELIVERING', 'courier')).status, 200);
            return order;
        };
        before(async () => {
            assert.ok(process.env.MONGODB_URI, 'Set MONGODB_URI for the integration tests.');
            await mongoose.connect(process.env.MONGODB_URI, {
                dbName,
                serverSelectionTimeoutMS: 10000,
            });
            await Promise.all([
                orderModel.init(),
                invoiceModel.init(),
                userModel.init(),
                roleModel.init(),
                productModel.init(),
                categoryModel.init(),
                Promotion.init(),
                Customer.init(),
                Cart.init(),
                CartDetail.init(),
                Staff.init(),
                Purchase.init(),
            ]);
            await orderModel.initializeCodeCounter();
            await invoiceModel.initializeCodeCounter();
            const managerRole = await roleModel.create({
                name: 'Processing',
                permissions: [
                    'order.view',
                    'order.confirm',
                    'order.updateStatus',
                    'order.assignDelivery',
                    'invoice.view',
                ],
            });
            courierRole = await roleModel.create({
                name: 'Delivery',
                permissions: ['order.deliver', 'invoice.view', 'invoice.markPaid'],
            });
            const viewerRole = await roleModel.create({
                name: 'Viewer',
                permissions: ['order.view'],
            });
            const cashierRole = await roleModel.create({
                name: 'Cashier',
                permissions: ['order.view', 'invoice.view', 'invoice.markPaid'],
            });
            for (const [name, role] of Object.entries({
                manager: managerRole,
                courier: courierRole,
                other: courierRole,
                viewer: viewerRole,
                cashier: cashierRole,
            })) {
                accounts[name] = await userModel.create({
                    name,
                    email: `${name}@example.com`,
                    password: 'unused-test-hash',
                    role: 'staff',
                    roleId: role._id,
                });
            }
            accounts.customer = await userModel.create({
                name: 'Customer',
                email: 'customer@example.com',
                password: 'unused-test-hash',
            });
            accounts.admin = await userModel.create({
                name: 'Admin',
                email: 'admin@example.com',
                password: 'unused-test-hash',
                role: 'admin',
            });
            const app = express();
            app.use(express.json());
            app.use('/api/order', orderRouter);
            app.use('/api/product', productRouter);
            app.use('/api/promotions', promotionRouter);
            app.use('/api/user', userRouter);
            app.use('/api/cart', cartRouter);
            server = app.listen(0, '127.0.0.1');
            await new Promise((resolve) => server.once('listening', resolve));
            url = `http://127.0.0.1:${server.address().port}/api/order`;
        });
        beforeEach(async () => {
            assert.equal(mongoose.connection.name, dbName);
            await orderModel.deleteMany({});
            await invoiceModel.deleteMany({});
            await productModel.deleteMany({});
            await categoryModel.deleteMany({});
            await mongoose.connection.collection('settings').deleteMany({});
            await Promotion.deleteMany({});
            await Staff.deleteMany({});
            await Purchase.deleteMany({});
            await mongoose.connection
                .collection('counters')
                .updateOne({ _id: 'order-code' }, { $set: { sequence: 0 } }, { upsert: true });
            await mongoose.connection
                .collection('counters')
                .updateOne({ _id: 'invoice-code' }, { $set: { sequence: 0 } }, { upsert: true });
        });
        afterEach(async () => {
            mock.restoreAll();
            for (const image of uploadedImages.splice(0)) {
                assert.match(image, /^[a-f0-9-]{36}\.png$/);
                await unlink(new URL('../uploads/' + image, import.meta.url));
            }
        });
        after(async () => {
            if (server) await new Promise((resolve) => server.close(resolve));
            if (
                mongoose.connection.readyState === 1 &&
                mongoose.connection.name === dbName &&
                dbName.startsWith('cnpm_order_test_')
            )
                await mongoose.connection.dropDatabase();
            await mongoose.disconnect();
        });

        test('staff profiles, account linking and single-role assignment follow UC-11 to UC-18', async () => {
            const input = { staffCode: 'NV-PROFILE', name: 'Profile only', phone: '0912345678',
                email: 'staff-profile@example.com', address: '12 Test', position: 'Phục vụ',
                startDate: '2026-11-24', workStatus: 'working' };
            assert.equal((await request('/user/staff', input, 'manager')).status, 403);
            assert.equal((await request('/user/staff', { ...input, phone: '' }, 'admin')).status, 400);
            const before = await userModel.countDocuments();
            const created = await request('/user/staff', input, 'admin');
            assert.equal(created.status, 200);
            const id = created.data.data._id;
            assert.equal(await userModel.countDocuments(), before);
            assert.equal(created.data.data.userId, undefined);
            assert.equal((await request('/user/staff', input, 'admin')).status, 409);
            const path = '/user/staff/' + id;
            assert.equal((await request('/user/staff', { ...input, id, staffCode: 'CHANGED' }, 'admin')).status, 400);
            assert.equal((await request(path + '/role', { roleId: String(courierRole._id) }, 'admin')).status, 400);
            const links = await Promise.all([1, 2].map(() => request(path + '/account',
                { identifier: input.phone, password: 'password123' }, 'admin')));
            assert.deepEqual(links.map(item => item.status).sort(), [200, 409]);
            const account = await userModel.findOne({ phone: input.phone });
            assert.equal(account.role, 'staff');
            accounts.profileStaff = account;
            assert.equal((await request(path + '/role', { roleId: String(courierRole._id) }, 'profileStaff')).status, 403);
            assert.equal((await request(path + '/role', { roleId: String(courierRole._id) }, 'admin')).status, 200);
            const readerRole = await roleModel.create({ name: 'Staff reader', permissions: ['staff.view'] });
            assert.equal((await request(path + '/role', { roleId: String(readerRole._id) }, 'admin')).status, 200);
            const list = await request('/user/staff?search=091234&position=' + encodeURIComponent(input.position) + '&workStatus=working', undefined, 'profileStaff');
            assert.equal(list.status, 200);
            assert.equal(list.data.data.length, 1);
            assert.equal(list.data.data[0].userId.roleId.name, readerRole.name);
            assert.equal(JSON.stringify(list.data).includes(account.password), false);
            assert.equal((await request(path, undefined, 'profileStaff')).status, 200);
            readerRole.status = 'inactive';
            await readerRole.save();
            assert.equal((await request(path + '/role', { roleId: String(readerRole._id) }, 'admin')).status, 400);
            readerRole.status = 'active';
            await readerRole.save();
            const login = await request('/user/login', { identifier: input.phone, password: 'password123', portal: 'admin' }, null);
            assert.equal(login.status, 200);
            assert.equal((await request('/user/staff', { ...input, id, workStatus: 'resigned' }, 'admin')).status, 200);
            assert.equal((await userModel.findById(account._id)).status, 'deactive');
            assert.equal((await request('/user/login', { identifier: input.phone, password: 'password123' }, null)).status, 403);
            assert.equal((await request('/user/update-status', { userId: String(account._id), status: 'active' }, 'admin')).status, 400);
            assert.equal((await request('/user/staff', { ...input, id }, 'admin')).status, 200);
            await request('/user/update-status', { userId: String(account._id), status: 'active' }, 'admin');
            const oldSession = await fetch(url.replace('/order', '') + '/user/me', {
                headers: { Authorization: 'Bearer ' + login.data.token },
            });
            assert.equal(oldSession.status, 401);
            await userModel.deleteOne({ _id: account._id });
            await roleModel.deleteOne({ _id: readerRole._id });
        });
        test('unlinked accounts are linked once and legacy migration preserves account and audit references', async () => {
            await initializeStaff();
            const count = await Staff.countDocuments();
            const legacy = await Staff.findOne({ userId: accounts.courier._id });
            assert.equal(String(legacy._id), String(accounts.courier._id));
            assert.equal(legacy.position, undefined);
            await initializeStaff();
            assert.equal(await Staff.countDocuments(), count);
            const profile = await Staff.create({ staffCode: 'NV-LINK', name: 'Link existing',
                email: 'link-profile@example.com', phone: '0923456789' });
            const account = await userModel.create({ name: 'Unlinked', email: 'unlinked@example.com',
                password: 'unused-hash', role: 'staff' });
            const available = await request('/user/staff/available-accounts', undefined, 'admin');
            assert.ok(available.data.data.some(item => item._id === String(account._id)));
            const link = () => request('/user/staff/' + profile._id + '/account', { accountId: String(account._id) }, 'admin');
            assert.equal((await link()).status, 200);
            assert.equal((await link()).status, 409);
            assert.equal((await Staff.findById(profile._id)).userId.toString(), account._id.toString());
            assert.equal((await request('/user/staff/available-accounts', undefined, 'admin')).data.data.length, 0);
            await userModel.deleteOne({ _id: account._id });
        });
        test('staff activity filters pair the selected employee with the event time in Vietnam', async () => {
            const staff = await Staff.create({ staffCode: 'NV-AUDIT', name: 'Audit', email: 'audit@example.com', userId: accounts.manager._id });
            const from = '2026-11-24';
            const before = new Date('2026-11-23T16:59:59.999Z');
            const inside = new Date('2026-11-23T17:00:00.000Z');
            const after = new Date('2026-11-24T17:00:00.000Z');
            const order = await createOrder();
            order.confirmedBy = accounts.manager._id;
            order.confirmedByName = 'Manager';
            order.confirmedAt = inside;
            await order.save();
            const filter = '?type=orders&staffId=' + staff._id + '&from=' + from + '&to=' + from;
            const found = await request('/user/staff/activity' + filter, undefined, 'admin');
            assert.equal(found.data.data.length, 1);
            assert.equal((await request('/user/staff/activity' + filter, undefined, 'manager')).status, 403);
            const base = { supplierId: new mongoose.Types.ObjectId(), supplierName: 'Supplier', total: 50, currency: 'USD', createdBy: accounts.manager._id, createdByName: 'Manager' };
            const p1 = await Purchase.create({ ...base, code: 'PN-IN', createdAt: inside });
            await Purchase.create({ ...base, code: 'PN-OUT', createdAt: before, confirmedBy: accounts.other._id, confirmedAt: inside });
            await Purchase.create({ ...base, code: 'PN-END', createdAt: after });
            const purchases = await request('/user/staff/activity' + filter.replace('orders', 'purchases'), undefined, 'admin');
            assert.deepEqual(purchases.data.data.map(item => item._id), [String(p1._id)]);
            assert.equal((await request('/user/staff/activity?type=orders&from=2026-11-25&to=2026-11-24', undefined, 'admin')).status, 400);
            assert.equal((await request('/user/staff/activity?type=orders&from=2026-02-31', undefined, 'admin')).status, 400);
        });
        test('registration validates identity and confirmation, phone login works and logout revokes only that session', async () => {
            const body = { name: 'Profile customer', phone: '0901234567', email: 'profile@example.com',
                password: 'password123', confirmPassword: 'password123' };
            assert.equal((await request('/user/register', { ...body, confirmPassword: 'wrong' }, null)).status, 400);
            const registered = await request('/user/register', body, null);
            assert.equal(registered.status, 200);
            assert.equal((await request('/user/register', { ...body, email: 'duplicate@example.com' }, null)).status, 409);
            const login = await request('/user/login', { identifier: '+84901234567', password: body.password }, null);
            assert.equal(login.status, 200);
            const call = async (path, token, method = 'GET', data) => {
                const response = await fetch(url.replace('/order', '') + '/user/' + path, {
                    method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
                    ...(data && { body: JSON.stringify(data) }),
                });
                return { status: response.status, data: await response.json() };
            };
            const first = registered.data.token, second = login.data.token;
            assert.notEqual(first, second);
            assert.equal((await call('logout', first, 'POST', {})).status, 200);
            assert.equal((await call('me', first)).status, 401);
            assert.equal((await call('me', second)).status, 200);
            const profile = { name: 'Updated', phone: '0901234568', email: 'updated@example.com' };
            assert.equal((await call('profile', second, 'PUT', profile)).status, 200);
            assert.equal((await call('profile', second)).data.data.name, profile.name);
            const address = { name: 'Recipient', phone: profile.phone, address: '12 Test', ward: 'Ward', city: 'HCM', isDefault: true };
            const firstAddress = await call('addresses', second, 'POST', address);
            assert.equal(firstAddress.status, 200);
            const firstId = firstAddress.data.data[0]._id;
            const parallel = await Promise.all([1, 2].map(index => call('addresses', second, 'POST', { ...address, address: 'Street ' + index })));
            assert.ok(parallel.every(result => result.status === 200));
            const saved = (await call('profile', second)).data.data.addresses;
            assert.equal(saved.length, 3);
            assert.equal(saved.filter(item => item.isDefault).length, 1);
            assert.equal((await call('addresses/' + firstId, token('customer'), 'DELETE')).status, 404);
            assert.equal((await call('addresses/' + firstId, second, 'DELETE')).status, 200);
            const account = await userModel.findOne({ email: profile.email });
            const locked = await request('/user/update-status', { userId: String(account._id), status: 'deactive' }, 'admin');
            assert.equal(locked.status, 200);
            assert.equal((await call('me', second)).status, 403);
            await request('/user/update-status', { userId: String(account._id), status: 'active' }, 'admin');
            assert.equal((await call('me', second)).status, 401);
            const accountsList = await request('/user/list?scope=all&search=' + account._id, undefined, 'admin');
            assert.equal(accountsList.data.data.length, 1);
            assert.equal(accountsList.data.data[0].statusHistory.length, 2);
            assert.equal(accountsList.data.data[0].password, undefined);
            assert.equal((await request('/user/update-status', { userId: String(accounts.admin._id), status: 'deactive' }, 'admin')).status, 400);
            await userModel.deleteOne({ _id: account._id });
        });
        test('report permission grants reports without granting order operations', async () => {
            courierRole = await roleModel.findById(courierRole._id);
            courierRole.permissions = ['report.view'];
            courierRole.description = 'Reports only';
            await courierRole.save();
            assert.equal((await request('/reports', {}, 'courier')).status, 200);
            assert.equal((await request('/list', {}, 'courier')).status, 403);
            assert.equal((await request('/status', { status: 'CONFIRMED' }, 'courier')).status, 403);
            courierRole.permissions = ['order.deliver', 'invoice.view', 'invoice.markPaid'];
            await courierRole.save();
            assert.equal((await request('/reports', {}, 'courier')).status, 403);
        });
        test('checkout owns its saved address and snapshots notes, customer identity and status times', async () => {
            const address = { name: 'Different recipient', phone: '0901234567', address: '12 Test',
                ward: 'Ward', city: 'HCM', isDefault: true };
            const saved = await request('/user/addresses', address, 'customer');
            assert.equal(saved.status, 200);
            const addressId = saved.data.addressId;
            assert.ok(saved.data.data.some(item => item._id === addressId));
            const owner = await Customer.findOne({ userId: accounts.customer._id });
            const foreignUser = await userModel.create({ name: 'Foreign', email: 'foreign-checkout@example.com', password: 'unused' });
            const foreignProfile = await Customer.create({ userId: foreignUser._id, addresses: [address] });
            const cart = await Cart.findOneAndUpdate({ customerId: owner._id }, { $setOnInsert: { customerId: owner._id } }, { new: true, upsert: true });
            const product = await promoProduct();
            await CartDetail.create({ cartId: cart._id, productId: product._id, quantity: 1 });
            const input = { addressId, note: 'No plastic cutlery', expectedAmount: 15 };
            assert.equal((await request('/place', { ...input, addressId: String(foreignProfile.addresses[0]._id) }, 'customer')).status, 404);
            assert.equal(await CartDetail.countDocuments({ cartId: cart._id }), 1);
            assert.equal((await request('/place', { ...input, note: 'a'.repeat(1001) }, 'customer')).status, 400);
            const placed = await request('/place', input, 'customer');
            assert.equal(placed.status, 201);
            const orderId = placed.data.orderId;
            await request('/user/addresses/' + addressId, { ...address, address: 'Changed later' }, 'customer', 'PUT');
            const snapshot = await orderModel.findById(orderId);
            assert.equal(snapshot.address.name, address.name);
            assert.equal(snapshot.address.address, '12 Test, Ward, HCM');
            assert.equal(snapshot.note, input.note);
            const adminRows = await request('/list', {}, 'admin');
            const row = adminRows.data.data.find(item => item._id === orderId);
            assert.equal(row.customerId.userId.name, accounts.customer.name);
            assert.notEqual(row.customerId.userId.name, row.address.name);
            assert.equal((await request('/status', { orderId, status: 'CONFIRMED' })).status, 200);
            assert.equal((await request('/status', { orderId, status: 'CONFIRMED' })).status, 409);
            assert.equal(await invoiceModel.countDocuments({ orderId }), 1);
            assert.equal((await request('/status', { orderId, status: 'PREPARING' })).status, 200);
            assert.equal((await request('/assign', { orderId, staffId: String(accounts.courier._id) })).status, 200);
            assert.equal((await request('/status', { orderId, status: 'DELIVERING' })).status, 200);
            assert.equal((await request('/status', { orderId, status: 'COMPLETED' })).status, 200);
            assert.equal((await request('/status', { orderId, status: 'COMPLETED' })).status, 409);
            const history = await request('/userorders', {}, 'customer');
            const current = history.data.data.find(item => item._id === orderId);
            for (const key of ['date', 'confirmedAt', 'preparingAt', 'deliveringAt', 'completedAt']) assert.ok(current[key]);
            assert.equal(current.paymentStatus, 'UNPAID');
            await userModel.deleteOne({ _id: foreignUser._id });
            await Customer.deleteOne({ _id: foreignProfile._id });
            await CartDetail.deleteMany({ cartId: cart._id });
            await Cart.deleteOne({ _id: cart._id });
            await Customer.deleteOne({ _id: owner._id });
        });
        test('clear cart removes only the authenticated customer items and is safe to repeat', async () => {
            const customers = [], carts = [];
            try {
                for (const name of ['cartOwner', 'otherCartOwner']) {
                    accounts[name] = await userModel.create({ name, email: `${name}@example.com`, password: 'test-hash' });
                    const customer = await Customer.create({ userId: accounts[name]._id });
                    const cart = await Cart.create({ customerId: customer._id });
                    customers.push(customer);
                    carts.push(cart);
                    await CartDetail.insertMany([1, 2].map(quantity => ({
                        cartId: cart._id, productId: new mongoose.Types.ObjectId(), quantity,
                    })));
                }
                assert.equal((await request('/cart/clear', {}, null)).status, 401);
                assert.equal((await request('/cart/clear', {}, 'manager')).status, 403);
                assert.equal(await CartDetail.countDocuments({ cartId: carts[0]._id }), 2);
                const cleared = await request('/cart/clear', {
                    cartId: carts[1]._id, userId: accounts.otherCartOwner._id,
                }, 'cartOwner');
                assert.equal(cleared.status, 200);
                assert.deepEqual(cleared.data.cartItems, {});
                assert.equal(await CartDetail.countDocuments({ cartId: carts[0]._id }), 0);
                assert.equal(await CartDetail.countDocuments({ cartId: carts[1]._id }), 2);
                assert.ok(await Cart.exists({ _id: carts[0]._id }));
                assert.deepEqual((await request('/cart/clear', {}, 'cartOwner')).data.cartItems, {});
                assert.deepEqual((await request('/cart/get', {}, 'cartOwner')).data.cartItems, {});
                assert.equal(Object.keys((await request('/cart/get', {}, 'otherCartOwner')).data.cartItems).length, 2);
            } finally {
                await CartDetail.deleteMany({ cartId: { $in: carts.map(cart => cart._id) } });
                await Cart.deleteMany({ _id: { $in: carts.map(cart => cart._id) } });
                await Customer.deleteMany({ _id: { $in: customers.map(customer => customer._id) } });
                await userModel.deleteMany({ _id: { $in: ['cartOwner', 'otherCartOwner'].map(name => accounts[name]?._id).filter(Boolean) } });
            }
        });
        test('confirmation snapshots the order and creates one unpaid invoice', async () => {
            const order = await createOrder();
            assert.equal((await advance(order, 'CONFIRMED')).status, 200);
            const saved = await orderModel.findById(order._id);
            const invoice = await invoiceModel.findOne({ orderId: order._id });
            assert.equal(saved.status, 'CONFIRMED');
            assert.equal(String(saved.confirmedBy), String(accounts.manager._id));
            assert.equal(invoice.amount, 12.05);
            assert.equal(invoice.totalBeforeDiscount, 12.05);
            assert.equal(invoice.discountAmount, 0);
            assert.equal(invoice.items[0].price, 2.35);
            assert.equal(invoice.paymentStatus, 'UNPAID');
            assert.match(invoice.invoiceCode, /^HD-\d{4}$/);
            await orderModel.updateOne(
                { _id: order._id },
                { 'items.0.price': 99, 'address.address': 'Changed' },
            );
            const frozen = await invoiceModel.findById(invoice._id);
            assert.equal(frozen.items[0].price, 2.35);
            assert.equal(frozen.address.address, 'Original delivery address');
        });
        test('invoice codes are four digits, unique in parallel and stop at capacity without confirming an order', async () => {
            const orders = await Promise.all(Array.from({ length: 3 }, () => createOrder()));
            const results = await Promise.all(orders.map((order) => advance(order, 'CONFIRMED')));
            assert.ok(results.every((result) => result.status === 200));
            const invoices = await invoiceModel.find().sort({ invoiceCode: 1 }).lean();
            assert.deepEqual(invoices.map((invoice) => invoice.invoiceCode), ['HD-0001', 'HD-0002', 'HD-0003']);
            await mongoose.connection.collection('counters').updateOne({ _id: 'invoice-code' }, { $set: { sequence: 0 } });
            await invoiceModel.initializeCodeCounter();
            assert.equal((await mongoose.connection.collection('counters').findOne({ _id: 'invoice-code' })).sequence, 3);
            await mongoose.connection.collection('counters').updateOne({ _id: 'invoice-code' }, { $set: { sequence: 9999 } });
            const blocked = await createOrder();
            assert.equal((await advance(blocked, 'CONFIRMED')).status, 409);
            const unchanged = await orderModel.findById(blocked._id);
            assert.equal(unchanged.status, 'PENDING');
            assert.equal(unchanged.confirmedAt, null);
            assert.equal(await invoiceModel.countDocuments(), 3);
            assert.equal((await mongoose.connection.collection('counters').findOne({ _id: 'invoice-code' })).sequence, 9999);
        });
        test('legacy invoice codes migrate once while amounts, payment audit and IDs stay unchanged', async () => {
            const order = await readyToDeliver();
            await request('/payment', { orderId: order._id, amountReceived: 12.05 }, 'courier');
            const invoice = await invoiceModel.collection.findOne({ orderId: order._id });
            const legacyCode = 'HD-7E51E0B660DD';
            await invoiceModel.collection.updateOne({ _id: invoice._id }, { $set: { invoiceCode: legacyCode } });
            assert.equal(await invoiceModel.upgradeLegacyCodes(), 1);
            const updated = await invoiceModel.collection.findOne({ _id: invoice._id });
            assert.equal(updated.invoiceCode, 'HD-0002');
            assert.equal(updated.legacyInvoiceCode, legacyCode);
            const expected = { ...invoice, invoiceCode: updated.invoiceCode, legacyInvoiceCode: legacyCode };
            assert.deepEqual(updated, expected);
            assert.equal(await invoiceModel.upgradeLegacyCodes(), 0);
            assert.equal((await request('/invoices')).data.data[0].legacyInvoiceCode, undefined);
        });
        test('legacy invoice migration rolls back when four-digit capacity is exhausted', async () => {
            const order = await createOrder();
            await advance(order, 'CONFIRMED');
            await invoiceModel.collection.updateOne({ orderId: order._id }, { $set: { invoiceCode: 'HD-ABCDEFABCDEF' } });
            const original = await invoiceModel.collection.findOne({ orderId: order._id });
            await mongoose.connection.collection('counters').updateOne({ _id: 'invoice-code' }, { $set: { sequence: 9999 } });
            await assert.rejects(invoiceModel.upgradeLegacyCodes());
            assert.deepEqual(await invoiceModel.collection.findOne({ orderId: order._id }), original);
            assert.equal((await mongoose.connection.collection('counters').findOne({ _id: 'invoice-code' })).sequence, 9999);
        });
        test('invoice failure rolls back status, confirmer and confirmation time', async () => {
            const order = await createOrder();
            mock.method(console, 'error', () => {});
            mock.method(invoiceModel.prototype, 'save', async () => {
                throw new Error('Test invoice failure');
            });
            assert.equal((await advance(order, 'CONFIRMED')).status, 500);
            const saved = await orderModel.findById(order._id);
            assert.equal(saved.status, 'PENDING');
            assert.equal(saved.confirmedAt, null);
            assert.equal(saved.confirmedBy, undefined);
            assert.equal(await invoiceModel.countDocuments(), 0);
        });
        test('parallel confirmation and retries do not create duplicate invoices or reset progress', async () => {
            const order = await createOrder();
            const results = await Promise.all(Array.from({ length: 3 }, () => advance(order, 'CONFIRMED')));
            assert.deepEqual(results.map(result => result.status).sort(), [200, 409, 409]);
            assert.equal(await invoiceModel.countDocuments({ orderId: order._id }), 1);
            const first = await orderModel.findById(order._id);
            await advance(order, 'PREPARING');
            assert.equal((await advance(order, 'CONFIRMED')).status, 409);
            const latest = await orderModel.findById(order._id);
            assert.equal(latest.status, 'PREPARING');
            assert.equal(+latest.confirmedAt, +first.confirmedAt);
        });
        test('confirmation racing guest cancellation has exactly one winner', async () => {
            for (let attempt = 0; attempt < 3; attempt++) {
                const order = await createOrder();
                const results = await Promise.all([
                    advance(order, 'CONFIRMED'),
                    request('/guest/cancel', {
                        orderCode: order.orderCode,
                        trackingCode: secret,
                    }),
                ]);
                assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
                const saved = await orderModel.findById(order._id);
                assert.equal(
                    await invoiceModel.countDocuments({ orderId: order._id }),
                    saved.status === 'CONFIRMED' ? 1 : 0,
                );
            }
        });
        test('permissions and sequential transitions are enforced on the server', async () => {
            const order = await createOrder();
            assert.equal((await advance(order, 'CONFIRMED', 'viewer')).status, 403);
            assert.equal((await advance(order, 'CONFIRMED', 'customer')).status, 403);
            assert.equal((await advance(order, 'PREPARING')).status, 409);
            assert.equal((await advance(order, 'CONFIRMED')).status, 200);
            assert.equal((await advance(order, 'DELIVERING')).status, 409);
            await advance(order, 'PREPARING');
            assert.equal((await advance(order, 'DELIVERING')).status, 409);
            assert.equal(
                (
                    await request('/assign', {
                        orderId: order._id,
                        staffId: accounts.customer._id,
                    })
                ).status,
                400,
            );
            assert.equal(
                (await request('/payment', { orderId: order._id, amountReceived: 12.05 }, 'manager')).status,
                403,
            );
        });
        test('only active delivery staff can be assigned and the picker exposes minimal data', async () => {
            const order = await createOrder();
            await advance(order, 'CONFIRMED');
            const picker = await request('/delivery-staff');
            assert.equal(picker.status, 200);
            assert.equal(picker.data.data.length, 2);
            assert.ok(picker.data.data.every((staff) => !staff.email && !staff.password));
            await userModel.updateOne({ _id: accounts.other._id }, { status: 'deactive' });
            try {
                assert.equal(
                    (
                        await request('/assign', {
                            orderId: order._id,
                            staffId: accounts.other._id,
                        })
                    ).status,
                    400,
                );
            } finally {
                await userModel.updateOne({ _id: accounts.other._id }, { status: 'active' });
            }
            await roleModel.updateOne({ _id: courierRole._id }, { status: 'inactive' });
            try {
                assert.equal(
                    (
                        await request('/assign', {
                            orderId: order._id,
                            staffId: accounts.courier._id,
                        })
                    ).status,
                    400,
                );
            } finally {
                await roleModel.updateOne({ _id: courierRole._id }, { status: 'active' });
            }
        });
        test('couriers see only assigned orders and cannot act on another courier order', async () => {
            const order = await readyToDeliver();
            await createOrder();
            const listing = await request('/list', {}, 'courier');
            assert.equal(listing.data.data.length, 1);
            assert.equal(listing.data.data[0]._id, String(order._id));
            assert.ok(listing.data.data[0].invoice.invoiceCode);
            assert.equal(listing.data.data[0].trackingHash, undefined);
            assert.equal((await request('/list', {}, 'other')).data.data.length, 0);
            assert.equal((await advance(order, 'COMPLETED', 'other')).status, 404);
            assert.equal(
                (await request('/payment', { orderId: order._id, amountReceived: 12.05 }, 'other')).status,
                404,
            );
            const viewer = await request('/list', {}, 'viewer');
            assert.ok(viewer.data.data.every((row) => row.invoice === undefined));
            await roleModel.updateOne({ _id: courierRole._id }, { $pull: { permissions: 'order.deliver' } });
            try {
                assert.equal((await request('/list', {}, 'courier')).status, 403);
            } finally {
                await roleModel.updateOne(
                    { _id: courierRole._id },
                    { $addToSet: { permissions: 'order.deliver' } },
                );
            }
        });
        test('reassignment removes the previous courier access before payment', async () => {
            const order = await readyToDeliver();
            assert.equal(
                (
                    await request('/assign', {
                        orderId: order._id,
                        staffId: accounts.other._id,
                    })
                ).status,
                200,
            );
            assert.equal(
                (await request('/payment', { orderId: order._id, amountReceived: 12.05 }, 'courier')).status,
                404,
            );
            assert.equal(
                (
                    await request(
                        '/payment',
                        {
                            orderId: order._id,
                            amountReceived: 12.05,
                            completeDelivery: true,
                        },
                        'other',
                    )
                ).status,
                200,
            );
            assert.equal(
                (
                    await request('/assign', {
                        orderId: order._id,
                        staffId: accounts.courier._id,
                    })
                ).status,
                409,
            );
        });
        test('COD requires the exact net amount and can complete delivery atomically', async () => {
            const order = await readyToDeliver();
            for (const amountReceived of [0, 12, 13, -1, '12.05']) {
                assert.equal(
                    (await request('/payment', { orderId: order._id, amountReceived }, 'courier')).status,
                    400,
                );
            }
            const pay = () =>
                request(
                    '/payment',
                    {
                        orderId: order._id,
                        amountReceived: 12.05,
                        completeDelivery: true,
                    },
                    'courier',
                );
            assert.ok((await Promise.all([pay(), pay()])).every((result) => result.status === 200));
            const invoice = await invoiceModel.findOne({ orderId: order._id });
            const saved = await orderModel.findById(order._id);
            assert.equal(saved.status, 'COMPLETED');
            assert.equal(saved.paymentStatus, 'PAID');
            assert.equal(invoice.paidAmount, 12.05);
            assert.equal(invoice.paymentStatus, 'PAID');
            assert.equal(String(invoice.paidBy), String(accounts.courier._id));
            await pay();
            const retry = await invoiceModel.findById(invoice._id);
            assert.equal(+retry.paidAt, +invoice.paidAt);
            assert.equal(await invoiceModel.countDocuments(), 1);
            const lookup = await request('/lookup', {
                orderCode: order.orderCode,
                trackingCode: secret,
            });
            assert.equal(lookup.data.order.paymentStatus, 'PAID');
            assert.ok(lookup.data.order.completedAt);
        });
        test('invoice listing preserves snapshots and includes completed unpaid invoices', async () => {
            const pending = await createOrder();
            const order = await readyToDeliver();
            await advance(order, 'COMPLETED', 'courier');
            await orderModel.updateOne({ _id: order._id }, {
                'items.0.name': 'Changed item', 'address.name': 'Changed customer', amount: 99,
            });
            const listing = await request('/invoices');
            assert.equal(listing.status, 200);
            assert.equal(listing.data.data.length, 1);
            const invoice = listing.data.data[0];
            assert.equal(invoice.orderId, String(order._id));
            assert.notEqual(invoice.orderId, String(pending._id));
            assert.equal(invoice.items[0].name, 'Original item');
            assert.equal(invoice.address.name, 'Guest');
            assert.equal(invoice.amount, 12.05);
            assert.equal(invoice.totalBeforeDiscount, 12.05);
            assert.equal(invoice.discountAmount, 0);
            assert.equal(invoice.paymentStatus, 'UNPAID');
            assert.equal(invoice.order.status, 'COMPLETED');
            assert.equal(invoice.order.trackingHash, undefined);
            assert.equal(invoice.order.address, undefined);
            assert.equal((await request('/payment', { orderId: order._id, amountReceived: 12.05 }, 'cashier')).status, 200);
            const paid = (await request('/invoices')).data.data[0];
            assert.equal(paid.paymentStatus, 'PAID');
            assert.equal(paid.paidAmount, 12.05);
            assert.equal(paid.paidByName, 'cashier');
            assert.ok(paid.paidAt);
        });
        test('invoice listing enforces permissions and courier assignment without expanding on revocation', async () => {
            const order = await readyToDeliver();
            const second = await createOrder();
            await advance(second, 'CONFIRMED');
            assert.equal((await request('/invoices', undefined, 'admin')).data.data.length, 2);
            assert.equal((await request('/invoices', undefined, 'viewer')).status, 403);
            assert.equal((await request('/invoices', undefined, 'customer')).status, 403);
            assert.equal((await fetch(url + '/invoices')).status, 401);
            assert.equal((await request('/invoices', undefined, 'courier')).data.data.length, 1);
            assert.equal((await request('/invoices', undefined, 'other')).data.data.length, 0);
            await roleModel.updateOne({ _id: courierRole._id }, { $pull: { permissions: 'order.deliver' } });
            try {
                assert.equal((await request('/invoices', undefined, 'courier')).data.data.length, 1);
                assert.equal((await request('/invoices', undefined, 'other')).data.data.length, 0);
            } finally {
                await roleModel.updateOne({ _id: courierRole._id }, { $addToSet: { permissions: 'order.deliver' } });
            }
            await request('/assign', { orderId: order._id, staffId: accounts.other._id });
            assert.equal((await request('/invoices', undefined, 'courier')).data.data.length, 0);
            assert.equal((await request('/invoices', undefined, 'other')).data.data.length, 1);
            await roleModel.updateOne({ _id: courierRole._id }, { $pull: { permissions: 'invoice.view' } });
            try { assert.equal((await request('/invoices', undefined, 'other')).status, 403); }
            finally { await roleModel.updateOne({ _id: courierRole._id }, { $addToSet: { permissions: 'invoice.view' } }); }
        });
        test('legacy invoices remain readable without rewriting amounts or losing orphaned history', async () => {
            const order = await readyToDeliver();
            await invoiceModel.collection.updateOne({ orderId: order._id }, { $unset: { totalBeforeDiscount: '', discountAmount: '' } });
            const old = (await request('/invoices')).data.data[0];
            assert.equal(old.totalBeforeDiscount, 12.05);
            assert.equal(old.discountAmount, 0);
            assert.equal((await invoiceModel.collection.findOne({ orderId: order._id })).totalBeforeDiscount, undefined);
            await orderModel.deleteOne({ _id: order._id });
            const preserved = (await request('/invoices')).data.data[0];
            assert.equal(preserved.order, null);
            assert.equal(preserved.orderId, String(order._id));
            assert.equal(preserved.amount, 12.05);
            assert.equal((await request('/invoices', undefined, 'courier')).data.data.length, 0);
            assert.equal((await request('/payment', { orderId: order._id, amountReceived: 12.05 }, 'cashier')).status, 404);
        });
        test('payment failure rolls back invoice and order together', async () => {
            const order = await readyToDeliver();
            mock.method(console, 'error', () => {});
            mock.method(orderModel.prototype, 'save', async () => {
                throw new Error('Test order save failure');
            });
            assert.equal(
                (
                    await request(
                        '/payment',
                        {
                            orderId: order._id,
                            amountReceived: 12.05,
                            completeDelivery: true,
                        },
                        'courier',
                    )
                ).status,
                500,
            );
            assert.equal((await invoiceModel.findOne({ orderId: order._id })).paymentStatus, 'UNPAID');
            const saved = await orderModel.findById(order._id);
            assert.equal(saved.status, 'DELIVERING');
            assert.equal(saved.paymentStatus, 'UNPAID');
        });
        test('completed unpaid orders remain collectible without granting delivery permission to cashiers', async () => {
            const order = await readyToDeliver();
            assert.equal(
                (
                    await request(
                        '/payment',
                        {
                            orderId: order._id,
                            amountReceived: 12.05,
                            completeDelivery: true,
                        },
                        'cashier',
                    )
                ).status,
                403,
            );
            assert.equal((await advance(order, 'COMPLETED', 'courier')).status, 200);
            assert.equal((await invoiceModel.findOne({ orderId: order._id })).paymentStatus, 'UNPAID');
            assert.equal(
                (await request('/payment', { orderId: order._id, amountReceived: 12.05 }, 'cashier')).status,
                200,
            );
            assert.equal((await invoiceModel.findOne({ orderId: order._id })).paidByName, 'cashier');
        });
        const promoInput = () => ({
            code: 'TEST20', name: 'Test offer', type: 'percent', value: 20,
            minimum: 10, maximumDiscount: 2, usageLimit: 1, active: true,
            startsAt: new Date(Date.now() - 60000).toISOString(),
            endsAt: new Date(Date.now() + 3600000).toISOString(),
        });
        const promoProduct = () => productModel.create({
            name: 'Test product', price: 10, description: 'Test', image: 'test.png', category: 'Drinks',
        });
        test('promotion management enforces permissions, dates, codes and public visibility', async () => {
            const input = promoInput();
            assert.equal((await request('/promotions', input, 'viewer')).status, 403);
            assert.equal((await request('/promotions', { ...input, value: 101 }, 'admin')).status, 400);
            assert.equal((await request('/promotions', { ...input, endsAt: input.startsAt }, 'admin')).status, 400);
            const created = await request('/promotions', { ...input, code: ' test20 ' }, 'admin');
            assert.equal(created.status, 200);
            assert.equal(created.data.data.code, input.code);
            assert.equal((await request('/promotions', input, 'admin')).status, 409);
            const promoPath = '/promotions/' + created.data.data._id;
            assert.equal((await request('/promotions/available')).data.data.length, 1);
            await request('/promotions', { ...input, code: 'OTHER20', active: false }, 'admin');
            assert.equal((await request(promoPath, { ...input, code: 'OTHER20' }, 'admin', 'PUT')).status, 409);
            assert.equal((await request(promoPath, { ...input, code: ' ' }, 'admin', 'PUT')).status, 400);
            const renamed = await request(promoPath, { ...input, code: ' new-20 ' }, 'admin', 'PUT');
            assert.equal(renamed.status, 200);
            assert.equal(renamed.data.data._id, created.data.data._id);
            assert.equal((await request('/promotions/available')).data.data[0].code, 'NEW-20');
            await request(promoPath + '/status', { active: false }, 'admin', 'PATCH');
            assert.equal((await request('/promotions/available')).data.data.length, 0);
            await request(promoPath, { ...input, startsAt: new Date(0).toISOString(), endsAt: new Date(1000).toISOString() }, 'admin', 'PUT');
            assert.equal((await request(promoPath + '/status', { active: true }, 'admin', 'PATCH')).status, 409);
        });
        test('guests can view promotions and place COD orders but only customers can apply a code', async () => {
            const input = promoInput();
            const promo = (await request('/promotions', input, 'admin')).data.data;
            const item = { productId: (await promoProduct()).id, quantity: 2, price: 10 };
            const payload = {
                address: { name: 'Guest', phone: '0901234567', address: 'Address' }, items: [item],
                promotionCode: input.code, expectedAmount: 23, requestId: randomUUID(),
                trackingCode: createHash('sha256').update(randomUUID()).digest('hex'),
            };
            const offers = await request('/promotions/available', undefined, null);
            assert.equal(offers.status, 200);
            assert.equal(offers.data.data[0].code, input.code);
            assert.equal((await request('/quote', payload, null)).status, 401);
            assert.equal((await request('/quote', payload, 'admin')).status, 403);
            assert.equal((await request('/guest', payload, null)).status, 403);
            assert.equal(await orderModel.countDocuments(), 0);
            assert.equal((await Promotion.findById(promo._id)).usedCount, 0);
            const placed = await request('/guest', { ...payload, promotionCode: '', expectedAmount: 25 }, null);
            assert.equal(placed.status, 201);
            assert.equal(placed.data.order.amount, 25);
            assert.equal(placed.data.order.paymentMethod, 'COD');
            assert.equal(placed.data.order.promotionCode, undefined);
        });
        test('member promotion quote, concurrent checkout, cancellation and invoice agree', async () => {
            const input = promoInput();
            const promo = (await request('/promotions', input, 'admin')).data.data;
            const item = { productId: (await promoProduct()).id, quantity: 2 };
            const customers = ['firstMember', 'secondMember'];
            for (const actor of customers) {
                accounts[actor] = await userModel.create({
                    name: actor, email: `${actor}@example.com`, password: 'unused-test-hash',
                });
                const customer = await Customer.create({ userId: accounts[actor]._id });
                const cart = await Cart.create({ customerId: customer._id });
                await CartDetail.create({ cartId: cart._id, ...item });
            }
            const payload = {
                address: { name: 'Member', phone: '0901234567', address: 'Address' },
                promotionCode: input.code, expectedAmount: 23,
            };
            const quote = await request('/quote', { items: [{ ...item, price: 999 }], promotionCode: 'test20' }, customers[0]);
            assert.equal(quote.data.data.amount, 23);
            assert.equal(quote.data.data.discountAmount, 2);
            assert.equal((await request('/place', { ...payload, expectedAmount: 22 }, customers[0])).status, 409);
            assert.equal((await Promotion.findById(promo._id)).usedCount, 0);

            const results = await Promise.all(customers.map((actor) => request('/place', payload, actor)));
            assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
            const winner = results.findIndex((result) => result.status === 201);
            const { orderId } = results[winner].data;
            assert.equal((await request('/place', payload, customers[winner])).status, 400);
            assert.equal((await Promotion.findById(promo._id)).usedCount, 1);
            const cancel = () => request('/cancel', { orderId }, customers[winner]);
            assert.ok((await Promise.all([cancel(), cancel()])).every((result) => result.status === 200));
            assert.equal((await Promotion.findById(promo._id)).usedCount, 0);

            const next = await request('/place', payload, customers[1 - winner]);
            assert.equal(next.status, 201);
            const placed = next.data;
            assert.equal((await Promotion.findById(promo._id)).usedCount, 1);
            assert.equal(await orderModel.countDocuments({ promotionId: promo._id }), 2);
            const promoPath = '/promotions/' + promo._id;
            assert.equal((await request(promoPath, { ...input, value: 50 }, 'admin', 'PUT')).status, 400);
            assert.equal((await request(promoPath, { ...input, code: 'UPDATED20' }, 'admin', 'PUT')).status, 200);
            assert.equal((await request('/status', { orderId: placed.orderId, status: 'CONFIRMED' })).status, 200);
            const invoice = await invoiceModel.findOne({ orderId: placed.orderId });
            assert.equal(invoice.promotionCode, input.code);
            assert.equal(invoice.discountAmount, 2);
            assert.equal(invoice.amount, 23);
            const history = (await request(promoPath + '/history', undefined, 'admin')).data.data;
            assert.equal(history.usedCount, 1);
            assert.equal(history.orders.length, 2);
            assert.ok(history.orders.some((row) => row.status === 'CANCELLED'));
        });
        test('member checkout uses its saved cart and fixed discount cannot cut the delivery fee', async () => {
            const promo = (await request('/promotions', {
                ...promoInput(), type: 'fixed', value: 30, minimum: 15,
            }, 'admin')).data.data;
            const product = await promoProduct();
            const customer = await Customer.create({ userId: accounts.customer._id });
            const cart = await Cart.create({ customerId: customer._id });
            const line = await CartDetail.create({ cartId: cart._id, productId: product._id, quantity: 1 });
            const payload = {
                address: { name: 'Member', phone: '0901234567', address: 'Test' },
                promotionCode: promo.code, expectedAmount: 5,
            };
            assert.equal((await request('/place', payload, 'customer')).status, 409);
            await CartDetail.updateOne({ _id: line._id }, { quantity: 2 });
            const placed = await request('/place', payload, 'customer');
            assert.equal(placed.status, 201, JSON.stringify(placed));
            assert.equal(placed.data.amount, 5);
            assert.equal(placed.data.discountAmount, 20);
            assert.equal(await CartDetail.countDocuments({ cartId: cart._id }), 0);
        });
        test('guest order codes contain four digits, are unique in parallel and stay stable on retry', async () => {
            const product = await productModel.create({
                name: 'Food',
                description: 'Test',
                image: 'test.png',
                category: 'Drinks',
                price: 2.35,
            });
            const body = () => ({
                address: { name: 'Guest', phone: '0901234567', address: 'Address' },
                items: [{ productId: String(product._id), quantity: 3, price: 2.35 }],
                expectedAmount: 12.05,
                requestId: randomUUID(),
                trackingCode: createHash('sha256').update(randomUUID()).digest('hex'),
            });
            const firstBody = body();
            const results = await Promise.all([request('/guest', firstBody), request('/guest', body())]);
            assert.ok(
                results.every((result) => result.status === 201),
                JSON.stringify(results),
            );
            assert.ok(results.every((result) => /^FD-\d{4}$/.test(result.data.order.orderCode)));
            assert.notEqual(results[0].data.order.orderCode, results[1].data.order.orderCode);
            assert.equal(
                (await request('/guest', firstBody)).data.order.orderCode,
                results[0].data.order.orderCode,
            );
            const lookup = await request('/lookup', {
                orderCode: results[0].data.order.orderCode,
                trackingCode: firstBody.trackingCode,
            });
            assert.equal(lookup.status, 200);
            assert.equal(await orderModel.countDocuments(), 2);
        });
        test('the code counter resumes existing short codes and refuses to wrap after 9999', async () => {
            const order = await createOrder();
            await orderModel.updateOne({ _id: order._id }, { orderCode: 'FD-0042' });
            await orderModel.initializeCodeCounter();
            assert.equal(await orderModel.nextCode(), 'FD-0043');
            await mongoose.connection
                .collection('counters')
                .updateOne({ _id: 'order-code' }, { $set: { sequence: 9998 } });
            assert.equal(await orderModel.nextCode(), 'FD-9999');
            await assert.rejects(orderModel.nextCode(), (error) => error.status === 409);
        });
        test('category edits retain product links, hide public menu and survive initialization', async () => {
            const product = await promoProduct();
            await initializeCategories();
            const categories = (await request('/product/categories')).data.data;
            const category = categories.find(item => item.key === 'drinks');
            const input = { name: 'Beverages', description: 'Cold and hot drinks', status: 'inactive' };
            const path = '/product/categories/' + category._id;
            assert.equal((await request(path, input, 'admin', 'PUT')).status, 200);
            assert.equal((await productModel.findById(product._id)).category, input.name);
            assert.equal((await request('/product/all')).data.data.length, 0);
            assert.equal((await request('/product/get/' + product._id)).status, 404);
            assert.equal((await request('/quote', { items: [{ productId: product.id, quantity: 1 }], promotionCode: 'TEST', expectedAmount: 15 }, 'customer')).status, 409);
            assert.equal((await request('/product/categories/manage', undefined, 'admin')).data.data.find(item => item._id === category._id).description, input.description);
            await initializeCategories();
            assert.equal(await categoryModel.countDocuments({ key: 'drinks' }), 0);
            assert.equal((await categoryModel.findById(category._id)).status, 'inactive');
            assert.equal((await request(path, { ...input, status: 'active' }, 'admin', 'PUT')).status, 200);
            assert.equal((await request('/product/all')).data.data.length, 1);
            assert.equal((await request('/product/categories', { code: category.code, name: 'Other' }, 'admin')).status, 409);
        });
        test('menu permissions, image validation, attributes and positive prices work through upload routes', async () => {
            await initializeCategories();
            const role = await roleModel.create({ name: 'Menu editor', permissions: ['product.create', 'product.update', 'product.delete', 'category.manage'] });
            const actor = await userModel.create({ name: 'Editor', email: 'menu-editor@example.com', password: 'unused', role: 'staff', roleId: role._id });
            accounts.menuEditor = actor;
            const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1kAAAAASUVORK5CYII=', 'base64');
            const upload = async (values, buffer = png, mime = 'image/png') => {
                const body = new FormData();
                for (const [key, value] of Object.entries(values)) body.set(key, String(value));
                body.set('image', new Blob([buffer], { type: mime }), 'test.png');
                const response = await fetch(url.replace('/order', '') + '/product/add', {
                    method: 'POST', headers: { Authorization: 'Bearer ' + token('menuEditor') }, body,
                });
                return { status: response.status, data: await response.json() };
            };
            const input = { code: 'SP-TEST', name: 'Cacao', description: 'Cold drink', category: 'Drinks', price: 5,
                attributes: 'Size 350ml; served with ice', status: 'out_of_stock' };
            assert.equal((await upload({ ...input, price: 0 })).status, 400);
            assert.equal((await upload(input, Buffer.from('fake image'))).status, 400);
            assert.equal((await upload(input, Buffer.alloc(2 * 1024 * 1024 + 1))).status, 400);
            const created = await upload(input);
            assert.equal(created.status, 200);
            uploadedImages.push(created.data.data.image);
            const id = created.data.data._id;
            assert.equal((await upload(input)).status, 409);
            assert.equal((await request('/product/list', undefined, 'menuEditor')).status, 200);
            assert.equal((await request('/product/update', { id, price: 0 }, 'menuEditor')).status, 400);
            const detail = (await request('/product/get/' + id)).data.data;
            assert.equal(detail.attributes, input.attributes);
            assert.equal(detail.status, 'out_of_stock');
            assert.equal((await request('/product/update', { id, removeImage: true }, 'menuEditor')).status, 200);
            assert.equal((await productModel.findById(id)).image, '');
            assert.equal((await request('/product/remove', { id }, 'viewer')).status, 403);
            assert.equal((await request('/product/remove', { id }, 'menuEditor')).data.data.deleted, true);
            assert.equal(await productModel.findById(id), null);
            await userModel.deleteOne({ _id: actor._id });
            await roleModel.deleteOne({ _id: role._id });
        });
        test('price edits and deletion preserve order and invoice snapshots', async () => {
            const product = await promoProduct();
            await initializeCategories();
            const body = { address: { name: 'Guest', phone: '0901234567', address: 'Address' },
                items: [{ productId: product.id, quantity: 1, price: 10 }], expectedAmount: 15,
                requestId: randomUUID(), trackingCode: createHash('sha256').update(randomUUID()).digest('hex') };
            const placed = await request('/guest', body, null);
            assert.equal(placed.status, 201);
            const id = placed.data.order.orderId;
            assert.equal((await request('/status', { orderId: id, status: 'CONFIRMED' })).status, 200);
            assert.equal((await request('/product/update', { id: product.id, price: 20 }, 'admin')).status, 200);
            assert.equal((await productModel.findById(product.id)).price, 20);
            // Legacy zero-price records can still be retired without changing their history.
            await productModel.collection.updateOne({ _id: product._id }, { $set: { price: 0 } });
            assert.equal((await request('/product/remove', { id: product.id }, 'admin')).data.data.deleted, false);
            assert.equal((await productModel.findById(product.id)).status, 'inactive');
            assert.equal((await orderModel.findById(id)).items[0].price, 10);
            assert.equal((await invoiceModel.findOne({ orderId: id })).items[0].price, 10);
        });
        test('parallel guest checkout and deletion cannot leave an order pointing at a deleted product', async () => {
            const product = await promoProduct();
            const body = { address: { name: 'Guest', phone: '0901234567', address: 'Address' },
                items: [{ productId: product.id, quantity: 1, price: 10 }], expectedAmount: 15,
                requestId: randomUUID(), trackingCode: createHash('sha256').update(randomUUID()).digest('hex') };
            const [placed, removed] = await Promise.all([
                request('/guest', body, null), request('/product/remove', { id: product.id }, 'admin'),
            ]);
            assert.equal(removed.status, 200);
            if (placed.status === 201) {
                assert.ok(await productModel.exists({ _id: product.id }));
                assert.equal(removed.data.data.deleted, false);
            } else {
                assert.equal(placed.status, 409);
                assert.equal(await orderModel.countDocuments(), 0);
            }
        });
        test('categories import existing foods, reject duplicates and protect linked products', async () => {
            const product = await productModel.create({
                name: 'Food',
                description: 'Test',
                image: 'test.png',
                category: 'Drinks',
                price: 2.35,
            });
            await initializeCategories();
            await initializeCategories();
            assert.equal(await categoryModel.countDocuments(), 5);
            const defaults = await request('/product/categories');
            assert.deepEqual(defaults.data.data.map(item => item.label).sort(), ['Main course', 'Drinks', 'Dessert', 'Fast food', 'Bakery'].sort());
            assert.equal((await request('/product/categories', { name: 'DRINKS' }, 'admin')).status, 409);
            const created = await request('/product/categories', { name: 'Pizza' }, 'admin');
            assert.equal(created.status, 201);
            const id = created.data.data._id;
            assert.equal((await request('/product/categories', { name: 'pizza' }, 'admin')).status, 409);
            assert.equal((await request('/product/categories', { name: 'Unauthorized' })).status, 403);
            assert.equal(
                (await request('/product/update', { id: product._id, category: 'Pizza' }, 'admin')).status,
                200,
            );
            const categories = await request('/product/categories');
            assert.equal(categories.data.data.find((item) => item._id === id).productCount, 1);
            const remove = async () => {
                const response = await fetch(url.replace('/order', '') + '/product/categories/' + id, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token('admin')}` },
                });
                return response.status;
            };
            assert.equal(await remove(), 409);
            assert.equal(
                (await request('/product/update', { id: product._id, category: 'Drinks' }, 'admin')).status,
                200,
            );
            assert.equal(await remove(), 200);
            assert.equal(
                (await request('/product/update', { id: product._id, category: 'Pizza' }, 'admin')).status,
                400,
            );
        });
        test('menu availability and 30-day order counts use real product and order data', async () => {
            const product = await productModel.create({
                name: 'Food',
                description: 'Test',
                image: 'test.png',
                category: 'Drinks',
                price: 2.35,
            });
            for (const [status, age] of [
                ['PENDING', 0],
                ['COMPLETED', 0],
                ['CANCELLED', 0],
                ['COMPLETED', 40],
            ]) {
                const order = await createOrder();
                await orderModel.updateOne(
                    { _id: order._id },
                    { 'items.0.productId': product._id, status, date: new Date(Date.now() - age * 86400000) },
                );
            }
            const listed = await request('/product/list', undefined, 'admin');
            assert.equal(listed.data.data[0].orderCount30, 2);
            assert.equal(
                (await request('/product/update', { id: product._id, status: 'out_of_stock' }, 'admin'))
                    .status,
                200,
            );
            const saved = await productModel.findById(product._id);
            assert.equal(saved.status, 'out_of_stock');
            assert.equal(saved.name, 'Food');
            assert.equal(saved.category, 'Drinks');
        });
        test('legacy order codes migrate atomically with invoice references and remain valid for lookup', async () => {
            const confirmed = await createOrder();
            const pending = await createOrder();
            await advance(confirmed, 'CONFIRMED');
            const before = await orderModel.findById(confirmed._id);
            const invoiceBefore = await invoiceModel.findOne({ orderId: confirmed._id });
            assert.equal(await orderModel.upgradeLegacyCodes(), 2);
            const updated = await orderModel.findById(confirmed._id).select('+legacyOrderCode');
            assert.match(updated.orderCode, /^FD-\d{4}$/);
            assert.equal(updated.legacyOrderCode, confirmed.orderCode);
            assert.equal(+updated.updatedAt, +before.updatedAt);
            assert.equal(+updated.confirmedAt, +before.confirmedAt);
            const invoice = await invoiceModel.findById(invoiceBefore._id);
            assert.equal(invoice.orderCode, updated.orderCode);
            assert.equal(invoice.amount, invoiceBefore.amount);
            assert.equal(+invoice.updatedAt, +invoiceBefore.updatedAt);
            const lookup = await request('/lookup', { orderCode: confirmed.orderCode, trackingCode: secret });
            assert.equal(lookup.status, 200);
            assert.equal(lookup.data.order.orderCode, updated.orderCode);
            assert.equal(lookup.data.order.legacyOrderCode, undefined);
            assert.equal((await request('/guest/cancel', { orderCode: pending.orderCode, trackingCode: secret })).status, 200);
            assert.equal(await orderModel.upgradeLegacyCodes(), 0);
        });
        test('legacy migration rolls back if there are not enough four-digit codes', async () => {
            const order = await createOrder();
            await mongoose.connection.collection('counters').updateOne({ _id: 'order-code' }, { $set: { sequence: 9999 } });
            await assert.rejects(orderModel.upgradeLegacyCodes());
            assert.equal((await orderModel.findById(order._id)).orderCode, order.orderCode);
            assert.equal((await mongoose.connection.collection('counters').findOne({ _id: 'order-code' })).sequence, 9999);
        });
    },
);

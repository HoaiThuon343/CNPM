import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, mock, test } from 'node:test';
import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import userModel from '../models/userModel.js';
import Staff from '../models/staffModel.js';
import customerModel from '../models/customerModel.js';
import userRouter from '../routes/userRoute.js';
import cartRouter from '../routes/cartRoute.js';
import productRouter from '../routes/productRoute.js';
import roleModel, { initializeRoles } from '../models/roleModel.js';
import orderModel from '../models/orderModel.js';
import orderRouter from '../routes/orderRoute.js';

const accounts = new Map();
const profiles = [];
const password = 'test-password-123';
const passwordHash = await bcrypt.hash(password, 4);
const ids = { user: new mongoose.Types.ObjectId(), admin: new mongoose.Types.ObjectId() };
const originalSecret = process.env.JWT_SECRET;
let server, url;

before(async () => {
    process.env.JWT_SECRET = 'auth-tests-only-secret';
    const app = express();
    app.use(express.json());
    app.use('/api/user', userRouter);
    app.use('/api/cart', cartRouter);
    app.use('/api/product', productRouter);
    app.use('/api/order', orderRouter);
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    url = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
    mock.method(Staff, 'exists', async () => null);
    accounts.clear();
    profiles.length = 0;
    for (const role of ['user', 'admin']) {
        accounts.set(String(ids[role]), {
            _id: ids[role], name: role, email: `${role}@example.com`,
            password: passwordHash, role, status: 'active'
        });
    }
    // Replace database I/O only; requests run through the real routes, JWT and bcrypt.
    mock.method(userModel, 'findOne', async ({ email, phone }) =>
        [...accounts.values()].find(user => email ? user.email === email : user.phone === phone) || null);
    mock.method(userModel, 'findById', id => ({
        select: async () => accounts.get(String(id)) || null
    }));
    const matches = (user, filter) => (!filter.role || user.role === filter.role) &&
        (!filter.status || user.status === filter.status) &&
        (!filter.$or || filter.$or.some(condition => Object.entries(condition).some(([field, value]) =>
            new RegExp(value.$regex, value.$options).test(user[field]))));
    mock.method(userModel, 'find', (filter = {}) => {
        let skip = 0, limit = Infinity;
        return {
            select() { return this; }, sort() { return this; }, populate() { return this; },
            skip(value) { skip = value; return this; },
            limit(value) { limit = value; return this; },
            async lean() { return [...accounts.values()].filter(user => matches(user, filter)).slice(skip, skip + limit)
                .map(({ _id, name, email, role, status }) => ({ _id, name, email, role, status })); }
        };
    });
    mock.method(userModel, 'countDocuments', async filter => [...accounts.values()].filter(user => matches(user, filter)).length);
    mock.method(userModel, 'exists', async filter => [...accounts.values()].find(user =>
        filter.$or ? filter.$or.some(condition => Object.entries(condition).some(([key, value]) => user[key] === value)) :
            String(user._id) === String(filter._id) && (!filter.role || user.role === filter.role)) || null);
    mock.method(customerModel, 'exists', async filter => profiles.find(profile => profile.phone === filter.phone) || null);
    mock.method(userModel, 'updateOne', async (filter, update) => {
        const user = accounts.get(String(filter._id));
        if (!user || (filter.status?.$ne && user.status === filter.status.$ne)) return { matchedCount: 0 };
        Object.assign(user, update.$set);
        for (const [key, value] of Object.entries(update.$inc || {})) user[key] = (user[key] || 0) + value;
        for (const [key, value] of Object.entries(update.$push || {})) (user[key] ||= []).push(value);
        return { matchedCount: 1 };
    });
    mock.method(userModel, 'findOneAndUpdate', async (filter, values) => {
        const user = accounts.get(String(filter._id));
        if (!user || user.role !== filter.role) return null;
        Object.assign(user, values.$set || values);
        return user;
    });
    mock.method(userModel.prototype, 'save', async function () {
        await this.validate();
        accounts.set(String(this._id), this.toObject());
        return this;
    });
    mock.method(userModel, 'create', async values => new userModel(values).save());
    mock.method(userModel, 'findByIdAndDelete', async id => {
        const user = accounts.get(String(id));
        accounts.delete(String(id));
        return user;
    });
    mock.method(customerModel, 'create', async profile => { profiles.push(profile); });
    mock.method(customerModel, 'find', () => ({ select() { return this; }, async lean() { return []; } }));
    mock.method(mongoose, 'startSession', async () => ({
        async withTransaction(callback) { return callback(); },
        async endSession() {}
    }));
});

afterEach(() => mock.restoreAll());
after(async () => {
    await new Promise(resolve => server.close(resolve));
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
});

const tokenFor = (role, claims = {}, options = {}) => jwt.sign(
    { id: ids[role], role, ...claims }, process.env.JWT_SECRET, { expiresIn: '1d', ...options }
);

const request = async (path, { body, token, method = body ? 'POST' : 'GET' } = {}) => {
    const response = await fetch(`${url}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, data: await response.json() };
};

test('customer registration saves a hashed password and linked profile', async () => {
    const { data } = await request('/api/user/register', {
        body: { name: ' New Customer ', email: ' NEW@example.com ', password, confirmPassword: password, phone: ' 0901234567 ' }
    });
    assert.equal(data.success, true);
    assert.equal(data.role, 'user');
    const user = [...accounts.values()].find(user => user.email === 'new@example.com');
    assert.equal(user.name, 'New Customer');
    assert.notEqual(user.password, password);
    assert.equal(await bcrypt.compare(password, user.password), true);
    assert.equal(String(profiles[0].userId), String(user._id));
    assert.equal(profiles[0].phone, '0901234567');
    const claims = jwt.verify(data.token, process.env.JWT_SECRET);
    assert.equal(claims.exp - claims.iat, 86400);
});

test('public registration cannot create an admin or restaurant', async () => {
    for (const role of ['admin', 'restaurant']) {
        const { status, data } = await request('/api/user/register', {
            body: { name: 'New', email: 'new@example.com', password, role }
        });
        assert.equal(status, 400);
        assert.equal(data.success, false);
        assert.equal(data.token, undefined);
    }
    assert.equal(accounts.size, 2);
});

test('duplicate email and malformed registration do not create accounts', async () => {
    for (const body of [
        { name: 'New', email: ' USER@example.com ', password },
        { name: {}, email: 'new@example.com', password },
        { name: 'New', email: 'invalid', password },
        { name: 'New', email: 'new@example.com', password: 'short' }
    ]) {
        const { data } = await request('/api/user/register', { body });
        assert.equal(data.success, false);
    }
    assert.equal(accounts.size, 2);
});

test('customer and admin log in with their stored roles', async () => {
    for (const role of ['user', 'admin']) {
        const { status, data } = await request('/api/user/login', {
            body: { email: ` ${role.toUpperCase()}@example.com `, password, role }
        });
        assert.equal(status, 200);
        assert.equal(data.role, role);
        const current = await request('/api/user/me', { token: data.token });
        assert.equal(current.data.user.role, role);
        assert.equal(current.data.user.password, undefined);
    }
});

test('login rejects the wrong portal role without issuing a token', async () => {
    for (const [email, role] of [['user@example.com', 'admin'], ['admin@example.com', 'user']]) {
        const { status, data } = await request('/api/user/login', { body: { email, password, role } });
        assert.equal(status, 403);
        assert.equal(data.token, undefined);
    }
});

test('wrong credentials and malformed email inputs are rejected', async () => {
    for (const body of [
        { email: 'user@example.com', password: 'wrong' },
        { email: 'missing@example.com', password },
        { email: { $ne: null }, password },
        { email: 'user@example.com', password: {} }
    ]) {
        const { status, data } = await request('/api/user/login', { body });
        assert.ok([400, 401].includes(status));
        assert.equal(data.token, undefined);
    }
});

test('customer cannot access admin APIs, even with an admin claim in the token', async () => {
    const { status } = await request('/api/user/list', { token: tokenFor('user', { role: 'admin' }) });
    assert.equal(status, 403);
    const products = await request('/api/product/list', { token: tokenFor('user') });
    assert.equal(products.status, 403);
});

test('admin cannot access customer cart APIs', async () => {
    const { status } = await request('/api/cart/get', { body: {}, token: tokenFor('admin') });
    assert.equal(status, 403);
});

test('stored role overrides stale token claims', async () => {
    const token = tokenFor('admin');
    accounts.get(String(ids.admin)).role = 'user';
    assert.equal((await request('/api/user/list', { token })).status, 403);
    const { data } = await request('/api/user/me', { token });
    assert.equal(data.user.role, 'user');
});

test('deleted or deactivated accounts cannot reuse tokens', async () => {
    const token = tokenFor('admin');
    accounts.get(String(ids.admin)).status = 'deactive';
    assert.equal((await request('/api/user/list', { token })).status, 403);
    const login = await request('/api/user/login', {
        body: { email: 'admin@example.com', password, role: 'admin' }
    });
    assert.equal(login.status, 403);
    accounts.delete(String(ids.admin));
    assert.equal((await request('/api/user/me', { token })).status, 401);
});

test('missing, invalid, expired and malformed-id tokens are rejected', async () => {
    for (const token of [undefined, 'invalid', tokenFor('user', {}, { expiresIn: -1 }), tokenFor('user', { id: 'invalid' })]) {
        assert.equal((await request('/api/user/me', { token })).status, 401);
    }
});

test('admin can list accounts', async () => {
    const { status, data } = await request('/api/user/list', { token: tokenFor('admin') });
    assert.equal(status, 200);
    assert.equal(data.success, true);
    assert.equal(data.data.length, 1);
    assert.equal(data.data[0].role, 'user');
});

const staffFixture = () => {
    const role = { _id: new mongoose.Types.ObjectId(), name: 'Order staff', status: 'active', permissions: ['order.view'] };
    const staff = { _id: new mongoose.Types.ObjectId(), name: 'Staff', email: 'staff@example.com', password: passwordHash, role: 'staff', roleId: role._id, status: 'active' };
    accounts.set(String(staff._id), staff);
    mock.method(roleModel, 'findById', async () => role);
    mock.method(roleModel, 'findOneAndUpdate', async () => role.status === 'active' && !role.deletedAt ? role : null);
    const query = { populate() { return this; }, sort() { return this; }, async lean() { return []; } };
    mock.method(orderModel, 'find', () => query);
    const token = jwt.sign({ id: staff._id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1d' });
    return { staff, role, token };
};

test('staff can log in through the admin portal and receive current permissions', async () => {
    staffFixture();
    const login = await request('/api/user/login', { body: { email: 'staff@example.com', password, portal: 'admin' } });
    assert.equal(login.status, 200);
    assert.equal(login.data.role, 'staff');
    const current = await request('/api/user/me', { token: login.data.token });
    assert.deepEqual(current.data.user.permissions, ['order.view']);
    const customer = await request('/api/user/login', { body: { email: 'user@example.com', password, portal: 'admin' } });
    assert.equal(customer.status, 403);
});

test('staff can view orders but cannot manage accounts, roles, staff or products', async () => {
    const { token, role } = staffFixture();
    assert.equal((await request('/api/order/list', { token, body: {} })).status, 200);
    for (const path of ['/api/user/list', '/api/user/staff', '/api/user/roles', '/api/product/list']) {
        assert.equal((await request(path, { token })).status, 403);
    }
    assert.equal((await request('/api/user/roles', { token, body: { name: 'Escalate', permissions: ['order.view'] } })).status, 403);
    assert.equal((await request('/api/order/status', { token, body: { status: 'CONFIRMED' } })).status, 403);
    role.permissions.push('order.updateStatus');
    assert.equal((await request('/api/order/status', { token, body: { status: 'CANCELLED' } })).status, 403);
});

test('revoking a permission takes effect on the next API request with the same token', async () => {
    const { role, token } = staffFixture();
    assert.equal((await request('/api/order/list', { token, body: {} })).status, 200);
    role.permissions = [];
    const denied = await request('/api/order/list', { token, body: {} });
    assert.equal(denied.status, 403);
    assert.equal(denied.data.code, 'PERMISSION_DENIED');
    assert.deepEqual((await request('/api/user/me', { token })).data.user.permissions, []);
});

test('inactive roles and locked staff accounts lose order access immediately', async () => {
    const { role, staff, token } = staffFixture();
    role.status = 'inactive';
    assert.equal((await request('/api/order/list', { token, body: {} })).status, 403);
    role.status = 'active';
    role.deletedAt = new Date();
    assert.equal((await request('/api/order/list', { token, body: {} })).status, 403);
    delete role.deletedAt;
    staff.status = 'deactive';
    const denied = await request('/api/order/list', { token, body: {} });
    assert.equal(denied.data.code, 'ACCOUNT_DISABLED');
});

test('staff profile creation requires the documented profile fields', async () => {
    const result = await request('/api/user/staff', { token: tokenFor('admin'), body: {
        name: 'New Staff', email: 'newstaff@example.com', password, staffCode: 'NV001'
    } });
    assert.equal(result.status, 400);
    assert.equal([...accounts.values()].some(account => account.email === 'newstaff@example.com'), false);
});

test('legacy remove locks a customer and preserves identity and linked profile', async () => {
    const profile = { userId: ids.user, phone: '0900000000' };
    profiles.push(profile);
    const before = accounts.get(String(ids.user));
    const result = await request('/api/user/remove', { token: tokenFor('admin'), body: { id: String(ids.user) } });
    assert.equal(result.status, 200);
    assert.equal(accounts.get(String(ids.user)), before);
    assert.equal(before.status, 'deactive');
    assert.equal(profiles[0], profile);
    assert.equal((await request('/api/user/me', { token: tokenFor('user') })).status, 403);
    const unlock = await request('/api/user/update-status', { token: tokenFor('admin'), body: { userId: String(ids.user), status: 'active' } });
    assert.equal(unlock.status, 200);
    assert.equal(accounts.get(String(ids.user)).status, 'active');
});

test('admin cannot lock itself and can lock staff through account management', async () => {
    const { staff } = staffFixture();
    for (const id of [ids.admin, staff._id]) {
        assert.equal((await request('/api/user/remove', { token: tokenFor('admin'), body: { id: String(id) } })).status, 404);
        assert.equal((await request('/api/user/update-status', { token: tokenFor('admin'), body: { userId: String(id), status: 'deactive' } })).status, String(id) === String(ids.admin) ? 400 : 200);
        assert.equal(accounts.get(String(id)).status, String(id) === String(ids.admin) ? 'active' : 'deactive');
    }
});

test('customer listing paginates, filters and escapes search characters', async () => {
    for (let index = 0; index < 25; index++) {
        const id = new mongoose.Types.ObjectId();
        accounts.set(String(id), { _id: id, name: `Client ${index}`, email: `client${index}@example.com`, role: 'user', status: 'active', password: passwordHash });
    }
    const result = await request('/api/user/list?page=2&limit=20', { token: tokenFor('admin') });
    assert.equal(result.data.total, 26);
    assert.equal(result.data.data.length, 6);
    assert.equal(result.data.pages, 2);
    assert.ok(result.data.data.every(user => user.role === 'user' && user.password === undefined));
    const literal = await request('/api/user/list?search=%2E%2A', { token: tokenFor('admin') });
    assert.equal(literal.data.total, 0);
    assert.equal((await request('/api/user/list?page=-1', { token: tokenFor('admin') })).status, 400);
});

test('default role initializes an empty store once and preserves edited permissions', async () => {
    let saved = null;
    let writes = 0;
    mock.method(roleModel, 'exists', async () => saved);
    mock.method(roleModel, 'updateOne', async (filter, values) => {
        writes++;
        saved = { ...filter, ...values.$setOnInsert };
    });
    await initializeRoles();
    assert.deepEqual(saved.permissions, ['order.view', 'order.confirm', 'order.updateStatus', 'order.assignDelivery', 'invoice.view']);
    saved.permissions = [];
    await initializeRoles();
    assert.equal(writes, 1);
    assert.deepEqual(saved.permissions, []);
});

test('restaurant registration is unavailable in the single-restaurant application', async () => {
    const response = await fetch(`${url}/api/user/register-restaurant`, { method: 'POST', headers: { Authorization: `Bearer ${tokenFor('admin')}` } });
    assert.equal(response.status, 404);
});

const removableRole = () => {
    const role = { _id: new mongoose.Types.ObjectId(), name: 'Unused role', status: 'active', permissions: [] };
    mock.method(roleModel, 'findOne', () => ({ session: async () => role.deletedAt ? null : role }));
    mock.method(userModel, 'exists', filter => ({ session: async () =>
        [...accounts.values()].some(user => String(user.roleId) === String(filter.roleId)) }));
    mock.method(roleModel, 'updateOne', async (filter, values) => Object.assign(role, values.$set));
    return role;
};

test('admin can remove an unused role and repeated deletion returns not found', async () => {
    const role = removableRole();
    const path = `/api/user/roles/${role._id}`;
    assert.equal((await request(path, { token: tokenFor('admin'), method: 'DELETE' })).status, 200);
    assert.equal(role.status, 'inactive');
    assert.ok(role.deletedAt instanceof Date);
    assert.notEqual(role.name, 'Unused role');
    assert.equal((await request(path, { token: tokenFor('admin'), method: 'DELETE' })).status, 404);
});

test('assigned roles cannot be removed, including roles held by locked staff', async () => {
    const role = removableRole();
    const id = new mongoose.Types.ObjectId();
    accounts.set(String(id), { _id: id, role: 'staff', roleId: role._id, status: 'deactive' });
    const result = await request(`/api/user/roles/${role._id}`, { token: tokenFor('admin'), method: 'DELETE' });
    assert.equal(result.status, 409);
    assert.equal(role.deletedAt, undefined);
    assert.equal(role.status, 'active');
});

test('role deletion rejects invalid IDs and accounts without admin authority', async () => {
    const id = new mongoose.Types.ObjectId();
    assert.equal((await request(`/api/user/roles/${id}`, { token: tokenFor('user'), method: 'DELETE' })).status, 403);
    assert.equal((await request(`/api/user/roles/${id}`, { method: 'DELETE' })).status, 401);
    assert.equal((await request('/api/user/roles/invalid', { token: tokenFor('admin'), method: 'DELETE' })).status, 400);
});

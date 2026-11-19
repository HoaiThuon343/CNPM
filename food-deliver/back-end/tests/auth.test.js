import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, mock, test } from 'node:test';
import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import userModel from '../models/userModel.js';
import customerModel from '../models/customerModel.js';
import userRouter from '../routes/userRoute.js';
import cartRouter from '../routes/cartRoute.js';
import productRouter from '../routes/productRoute.js';

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
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    url = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
    accounts.clear();
    profiles.length = 0;
    for (const role of ['user', 'admin']) {
        accounts.set(String(ids[role]), {
            _id: ids[role], name: role, email: `${role}@example.com`,
            password: passwordHash, role, status: 'active'
        });
    }
    // Replace database I/O only; requests run through the real routes, JWT and bcrypt.
    mock.method(userModel, 'findOne', async ({ email }) =>
        [...accounts.values()].find(user => user.email === email) || null);
    mock.method(userModel, 'findById', id => ({
        select: async () => accounts.get(String(id)) || null
    }));
    mock.method(userModel, 'find', () => ({
        select: async () => [...accounts.values()].map(({ _id, name, email, role, status }) =>
            ({ _id, name, email, role, status }))
    }));
    mock.method(userModel.prototype, 'save', async function () {
        await this.validate();
        accounts.set(String(this._id), this.toObject());
        return this;
    });
    mock.method(userModel, 'findByIdAndDelete', async id => {
        const user = accounts.get(String(id));
        accounts.delete(String(id));
        return user;
    });
    mock.method(customerModel, 'create', async profile => { profiles.push(profile); });
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

const request = async (path, { body, token } = {}) => {
    const response = await fetch(`${url}${path}`, {
        method: body ? 'POST' : 'GET',
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
        body: { name: ' New Customer ', email: ' NEW@example.com ', password, phone: ' 123 ' }
    });
    assert.equal(data.success, true);
    assert.equal(data.role, 'user');
    const user = [...accounts.values()].find(user => user.email === 'new@example.com');
    assert.equal(user.name, 'New Customer');
    assert.notEqual(user.password, password);
    assert.equal(await bcrypt.compare(password, user.password), true);
    assert.equal(String(profiles[0].userId), String(user._id));
    assert.equal(profiles[0].phone, '123');
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
    assert.equal(data.data.length, 2);
});

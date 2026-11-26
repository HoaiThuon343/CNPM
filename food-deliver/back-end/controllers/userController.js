import customerModel from "../models/customerModel.js";
import userModel from "../models/userModel.js";
import Staff from "../models/staffModel.js";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import validator from "validator";
import { randomUUID } from "node:crypto";

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const handle = (action) => async (req, res) => {
    try {
        res.json({ success: true, ...await action(req) });
    } catch (error) {
        if (!error.status && error.code !== 11000) console.error(error);
        res.status(error.status || (error.code === 11000 ? 409 : 500)).json({
            success: false,
            message: error.status ? error.message : error.code === 11000
                ? "Email hoặc số điện thoại đã tồn tại." : "Không lưu được dữ liệu. Vui lòng thử lại.",
        });
    }
};
const text = (value) => typeof value === "string" ? value.trim() : "";
const phoneNumber = (value) => {
    const phone = text(value).replace(/\s/g, "");
    if (!/^(0\d{9}|\+84\d{9})$/.test(phone)) fail("Nhập số điện thoại Việt Nam hợp lệ.");
    return phone.startsWith("+84") ? "0" + phone.slice(3) : phone;
};
const identity = (body) => {
    const name = text(body.name);
    const email = text(body.email).toLowerCase();
    const phone = phoneNumber(body.phone);
    if (!name || name.length > 120 || !validator.isEmail(email)) fail("Nhập họ tên và email hợp lệ.");
    return { name, email, phone };
};
const ensureUnique = async ({ email, phone }, id) => {
    const other = { ...(id && { _id: { $ne: id } }), $or: [{ email }, { phone }] };
    if (await userModel.exists(other)) fail("Email hoặc số điện thoại đã tồn tại.", 409);
    // Older customer records store their phone in the linked profile.
    if (await customerModel.exists({ phone, ...(id && { userId: { $ne: id } }) })) {
        fail("Số điện thoại đã tồn tại.", 409);
    }
};
const createToken = (user) => jwt.sign(
    { id: user._id, role: user.role, sv: user.sessionVersion || 0 },
    process.env.JWT_SECRET, { expiresIn: "1d", jwtid: randomUUID() },
);
const loginUser = handle(async ({ body = {} }) => {
    const identifier = text(body.identifier ?? body.email).toLowerCase();
    if (!identifier || typeof body.password !== "string" || !body.password) fail("Nhập email hoặc số điện thoại và mật khẩu.");
    let user;
    if (validator.isEmail(identifier)) user = await userModel.findOne({ email: identifier });
    else {
        const phone = phoneNumber(identifier);
        user = await userModel.findOne({ phone });
        if (!user) {
            const customer = await customerModel.findOne({ phone });
            if (customer) user = await userModel.findById(customer.userId);
        }
    }
    if (!user || !await bcrypt.compare(body.password, user.password)) fail("Thông tin đăng nhập hoặc mật khẩu không đúng.", 401);
    if (user.status !== "active") fail("Tài khoản đã bị khóa.", 403);
    if (user.role === "staff" && await Staff.exists({ userId: user._id, workStatus: "resigned" })) fail("Nhân viên đã nghỉ việc.", 403);
    if ((body.role && body.role !== user.role) ||
        (body.portal === "admin" && !["admin", "staff"].includes(user.role))) fail("Tài khoản không có quyền truy cập trang này.", 403);
    return { token: createToken(user), role: user.role };
});
const registerUser = handle(async ({ body = {} }) => {
    if (body.role && body.role !== "user") fail("Chỉ cho phép đăng ký tài khoản khách hàng.");
    const values = identity(body);
    if (typeof body.password !== "string" || body.password.length < 8) fail("Mật khẩu phải có ít nhất 8 ký tự.");
    if (body.password !== body.confirmPassword) fail("Xác nhận mật khẩu không khớp.");
    await ensureUnique(values);
    const user = await new userModel({ ...values, role: "user", password: await bcrypt.hash(body.password, 10) }).save();
    try {
        await customerModel.create({ userId: user._id, phone: values.phone });
    } catch (error) {
        await userModel.findByIdAndDelete(user._id);
        throw error;
    }
    return { token: createToken(user), role: user.role };
});
const getCurrentUser = (req, res) => res.json({ success: true, user: req.user });
const logoutUser = handle(async (req) => {
    await userModel.updateOne({ _id: req.user.id }, { $pull: { revokedSessions: { expiresAt: { $lte: new Date() } } } });
    await userModel.updateOne({ _id: req.user.id }, { $push: { revokedSessions: req.session } });
    return { message: "Đã đăng xuất." };
});
const getProfile = handle(async ({ user }) => {
    const customer = await customerModel.findOne({ userId: user.id }).lean();
    return { data: { ...user, phone: user.phone || customer?.phone || "", addresses: customer?.addresses || [] } };
});
const saveProfile = handle(async ({ user, body = {} }) => {
    const values = identity(body);
    await ensureUnique(values, user.id);
    await mongoose.connection.transaction(async (session) => {
        await userModel.updateOne({ _id: user.id }, { $set: values }, { session, runValidators: true });
        await customerModel.updateOne({ userId: user.id }, { $set: { phone: values.phone } }, { session, upsert: true });
    });
    return { data: values };
});
const saveAddress = handle(async ({ user, body = {}, params, method }) => {
    if (params.id && !mongoose.isObjectIdOrHexString(params.id)) fail("Địa chỉ không hợp lệ.");
    const values = Object.fromEntries(["name", "address", "ward", "city", "note"].map(key => [key, text(body[key])]));
    if (method !== "DELETE") {
        values.phone = phoneNumber(body.phone);
        if (Object.entries(values).some(([key, value]) => key !== "note" && (!value || value.length > 250))) fail("Nhập đủ thông tin địa chỉ, tối đa 250 ký tự mỗi ô.");
    }
    const result = await mongoose.connection.transaction(async (session) => {
        let customer = await customerModel.findOne({ userId: user.id }).session(session);
        if (!customer) customer = new customerModel({ userId: user.id });
        const addresses = customer.addresses;
        const current = params.id ? addresses.id(params.id) : null;
        if (params.id && !current) fail("Không tìm thấy địa chỉ của bạn.", 404);
        if (method === "DELETE") current.deleteOne();
        else {
            if (body.isDefault === true) addresses.forEach(address => { address.isDefault = false; });
            if (current) Object.assign(current, values, { isDefault: body.isDefault === true });
            else {
                addresses.push({ ...values, isDefault: body.isDefault === true });
            }
        }
        await customer.save({ session });
        return { data: customer.addresses, ...(method !== "DELETE" && { addressId: (current || addresses.at(-1))._id }) };
    });
    return result;
});
const listUsers = handle(async ({ query }) => {
    const page = Number(query.page || 1), limit = Number(query.limit || 20);
    const search = query.search || "", status = query.status || "", role = query.role || (query.scope === "all" ? "" : "user");
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100 ||
        typeof search !== "string" || search.length > 100 || !["", "active", "deactive"].includes(status) ||
        !["", "user", "admin", "staff", "restaurant"].includes(role)) fail("Bộ lọc tài khoản không hợp lệ.");
    const filter = { ...(role && { role }), ...(status && { status }) };
    if (search.trim()) {
        const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        filter.$or = ["name", "email", "phone", "staffCode"].map(field => ({ [field]: { $regex: escaped, $options: "i" } }));
        const legacyPhones = await customerModel.find({ phone: { $regex: escaped, $options: "i" } }).select("userId").lean();
        if (legacyPhones.length) filter.$or.push({ _id: { $in: legacyPhones.map(item => item.userId) } });
        if (mongoose.isObjectIdOrHexString(search.trim())) filter.$or.push({ _id: search.trim() });
    }
    const [data, total] = await Promise.all([
        userModel.find(filter).select("name email phone role roleId staffCode status createdAt updatedAt statusHistory")
            .populate("roleId", "name").sort({ _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        userModel.countDocuments(filter),
    ]);
    const customers = await customerModel.find({ userId: { $in: data.map(item => item._id) } }).select("userId phone").lean();
    const phones = new Map(customers.map(item => [String(item.userId), item.phone]));
    return { data: data.map(item => ({ ...item, phone: item.phone || phones.get(String(item._id)) || "",
        createdAt: item.createdAt || item._id.getTimestamp() })),
        total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
});
const updateUserStatus = handle(async (req) => {
    const { userId, status } = req.body || {};
    if (!mongoose.isObjectIdOrHexString(userId) || !["active", "deactive"].includes(status)) fail("Trạng thái tài khoản không hợp lệ.");
    if (String(userId) === req.user.id && status === "deactive") fail("Bạn không được tự khóa tài khoản.");
    if (status === "active" && await Staff.exists({ userId, workStatus: "resigned" })) fail("Nhân viên đã nghỉ việc. Cập nhật trạng thái làm việc trước khi mở khóa.");
    const filter = { _id: userId, status: { $ne: status } };
    const update = { $set: { status }, $push: { statusHistory: { status, changedAt: new Date(), changedBy: req.user.id } },
        ...(status === "deactive" && { $inc: { sessionVersion: 1 } }) };
    await userModel.updateOne(filter, update);
    if (!await userModel.exists({ _id: userId })) fail("Không tìm thấy tài khoản.", 404);
    return { message: "Đã cập nhật trạng thái tài khoản." };
});
const removeUser = async (req, res) => {
    try {
        if (!mongoose.isObjectIdOrHexString(req.body.id)) return res.status(400).json({ success: false, message: "Tài khoản không hợp lệ." });
        if (!await userModel.exists({ _id: req.body.id, role: "user" })) return res.status(404).json({ success: false, message: "Không tìm thấy khách hàng." });
        req.body = { userId: req.body.id, status: "deactive" };
        return updateUserStatus(req, res);
    } catch {
        return res.status(500).json({ success: false, message: "Không khóa được khách hàng." });
    }
};
export { loginUser, registerUser, getCurrentUser, logoutUser, getProfile, saveProfile, saveAddress,
    removeUser, listUsers, updateUserStatus, phoneNumber, ensureUnique };

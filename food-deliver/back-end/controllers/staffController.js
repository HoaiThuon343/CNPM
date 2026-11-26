import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import validator from 'validator';
import userModel from '../models/userModel.js';
import Staff from '../models/staffModel.js';
import Order from '../models/orderModel.js';
import { Purchase } from '../models/inventoryModel.js';
import roleModel, { permissions } from '../models/roleModel.js';
import { phoneNumber, ensureUnique } from './userController.js';

const listRoles = async (req, res) => {
    try {
        const roles = await roleModel.find({ deletedAt: null }).sort({ name: 1 });
        res.json({ success: true, data: roles, permissions });
    } catch {
        res.status(500).json({ success: false, message: 'Không tải được vai trò.' });
    }
};

const saveRole = async (req, res) => {
    const { id, name, description = '', permissions: selected, status = 'active' } = req.body;
    if (
        typeof name !== 'string' ||
        !name.trim() ||
        typeof description !== 'string' || description.length > 500 ||
        !Array.isArray(selected) ||
        selected.some((code) => !permissions.some((item) => item.code === code)) ||
        !['active', 'inactive'].includes(status) ||
        (id && !mongoose.isObjectIdOrHexString(id))
    ) {
        return res.status(400).json({ success: false, message: 'Thông tin vai trò không hợp lệ.' });
    }
    try {
        const values = { name: name.trim(), description: description.trim(), permissions: [...new Set(selected)], status };
        const role = id
            ? await roleModel.findOneAndUpdate({ _id: id, deletedAt: null }, values, {
                  new: true,
                  runValidators: true,
              })
            : await roleModel.create(values);
        if (!role)
            return res.status(404).json({ success: false, message: 'Vai trò không tồn tại.' });
        res.json({ success: true, data: role });
    } catch (error) {
        res.status(error.code === 11000 ? 409 : 500).json({
            success: false,
            message: error.code === 11000 ? 'Tên vai trò đã tồn tại.' : 'Không lưu được vai trò.',
        });
    }
};

const removeRole = async (req, res) => {
    const { id } = req.params;
    if (!mongoose.isObjectIdOrHexString(id)) {
        return res.status(400).json({ success: false, message: 'Mã vai trò không hợp lệ.' });
    }
    let session;
    try {
        session = await mongoose.startSession();
        const result = await session.withTransaction(async () => {
            const role = await roleModel.findOne({ _id: id, deletedAt: null }).session(session);
            if (!role) return { status: 404, message: 'Vai trò không tồn tại.' };
            if (await userModel.exists({ roleId: id }).session(session)) {
                return {
                    status: 409,
                    message:
                        'Vai trò đang được gán cho nhân viên. Hãy chuyển nhân viên sang vai trò khác trước khi xóa.',
                };
            }
            // Retain the record and release its unique name for future roles.
            await roleModel.updateOne(
                { _id: id },
                {
                    $set: {
                        name: `${role.name} [deleted:${id}]`,
                        status: 'inactive',
                        deletedAt: new Date(),
                    },
                },
                { session },
            );
            return { status: 200, message: 'Đã xóa vai trò.' };
        });
        res.status(result.status).json({ success: result.status === 200, message: result.message });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Không xóa được vai trò. Vui lòng thử lại.',
        });
    } finally {
        await session?.endSession();
    }
};

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const operation = action => async (req, res) => {
    try {
        res.json({ success: true, data: await action(req) });
    } catch (error) {
        if (!error.status && error.code !== 11000) console.error(error);
        res.status(error.status || (error.code === 11000 ? 409 : 500)).json({
            success: false,
            message: error.status ? error.message : error.code === 11000
                ? 'Mã nhân viên, số điện thoại, email hoặc tài khoản đã được sử dụng.'
                : 'Không xử lý được hồ sơ nhân viên. Vui lòng thử lại.',
        });
    }
};
const transaction = async action => {
    const session = await mongoose.startSession();
    try { return await session.withTransaction(() => action(session)); }
    finally { await session.endSession(); }
};
const requireId = id => {
    if (!mongoose.isObjectIdOrHexString(id)) fail('Mã hồ sơ nhân viên không hợp lệ.');
    return id;
};
const profileQuery = query => query.populate({
    path: 'userId', select: 'name email phone staffCode status roleId',
    populate: { path: 'roleId', select: 'name status' },
});
const listStaff = operation(async ({ query }) => {
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const filter = {};
    if (query.workStatus) {
        if (!['working', 'resigned'].includes(query.workStatus)) fail('Trạng thái làm việc không hợp lệ.');
        filter.workStatus = query.workStatus;
    }
    if (typeof query.position === 'string' && query.position) filter.position = query.position;
    if (search) {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$or = ['staffCode', 'name', 'phone', 'email'].map(key => ({ [key]: { $regex: escaped, $options: 'i' } }));
    }
    return profileQuery(Staff.find(filter).sort({ name: 1 })).lean();
});
const getStaff = operation(async ({ params }) => {
    const staff = await profileQuery(Staff.findById(requireId(params.id))).lean();
    if (!staff) fail('Nhân viên không còn tồn tại.', 404);
    return staff;
});
const saveStaff = operation(async ({ body = {}, user }) => {
    const values = Object.fromEntries(['name', 'email', 'address', 'position', 'staffCode'].map(key =>
        [key, typeof body[key] === 'string' ? body[key].trim() : '']));
    if (Object.values(values).some(value => !value || value.length > 250) || !validator.isEmail(values.email)) {
        fail('Nhập đủ mã, họ tên, số điện thoại, email, địa chỉ và chức vụ.');
    }
    values.email = values.email.toLowerCase();
    values.phone = phoneNumber(body.phone);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.startDate || '')) fail('Nhập ngày bắt đầu làm việc hợp lệ.');
    values.startDate = new Date(body.startDate + 'T00:00:00+07:00');
    if (Number.isNaN(+values.startDate) || new Date(+values.startDate + 7 * 3600000).toISOString().slice(0, 10) !== body.startDate) {
        fail('Ngày bắt đầu làm việc không hợp lệ.');
    }
    values.workStatus = body.workStatus || 'working';
    if (!['working', 'resigned'].includes(values.workStatus)) fail('Chọn trạng thái làm việc hợp lệ.');
    return transaction(async session => {
        let staff = body.id ? await Staff.findById(requireId(body.id)).session(session) : new Staff(values);
        if (!staff) fail('Nhân viên không còn tồn tại.', 404);
        if (body.id && staff.staffCode !== values.staffCode) fail('Không được thay đổi mã nhân viên.');
        const wasResigned = staff.workStatus === 'resigned';
        Object.assign(staff, values);
        await staff.save({ session });
        if (staff.userId) {
            await userModel.updateOne({ _id: staff.userId, role: 'staff' }, {
                $set: { name: staff.name, staffCode: staff.staffCode },
                ...(staff.workStatus === 'resigned' && !wasResigned && {
                    $inc: { sessionVersion: 1 },
                    $push: { statusHistory: { status: 'deactive', changedAt: new Date(), changedBy: user.id } },
                }),
            }, { session });
            if (staff.workStatus === 'resigned') await userModel.updateOne(
                { _id: staff.userId }, { $set: { status: 'deactive' } }, { session });
        }
        return staff;
    });
});
const availableAccounts = operation(async () => {
    const linked = await Staff.distinct('userId');
    return userModel.find({ role: 'staff', _id: { $nin: linked } })
        .select('name email phone status').sort({ name: 1 }).lean();
});
const linkStaffAccount = operation(async ({ params, body = {} }) => {
    let accountValues;
    if (!body.accountId) {
        const identifier = typeof body.identifier === 'string' ? body.identifier.trim().toLowerCase() : '';
        if (!identifier || typeof body.password !== 'string' || body.password.length < 8) {
            fail('Nhập email hoặc số điện thoại đăng nhập và mật khẩu khởi tạo ít nhất 8 ký tự.');
        }
        accountValues = { password: await bcrypt.hash(body.password, 10) };
        if (validator.isEmail(identifier)) accountValues.email = identifier;
        else accountValues.phone = phoneNumber(identifier);
    }
    return transaction(async session => {
        const staff = await Staff.findById(requireId(params.id)).session(session);
        if (!staff) fail('Nhân viên không còn tồn tại.', 404);
        if (staff.userId) fail('Nhân viên đã có tài khoản liên kết.', 409);
        let account;
        if (body.accountId) {
            account = await userModel.findOne({ _id: requireId(body.accountId), role: 'staff' }).session(session);
            if (!account) fail('Chọn tài khoản nhân viên chưa được liên kết.');
            if (await Staff.exists({ userId: account._id }).session(session)) fail('Tài khoản đã liên kết với nhân viên khác.', 409);
        } else {
            const values = { name: staff.name, email: staff.email, phone: staff.phone, ...accountValues };
            await ensureUnique(values);
            account = new userModel({ ...values, role: 'staff' });
        }
        account.staffCode = staff.staffCode;
        account.name = staff.name;
        if (staff.workStatus === 'resigned') {
            account.status = 'deactive';
            account.sessionVersion = (account.sessionVersion || 0) + 1;
        }
        await account.save({ session });
        staff.userId = account._id;
        await staff.save({ session });
        return { staffId: staff._id, userId: account._id };
    });
});
const assignStaffRole = operation(async ({ params, body = {} }) => transaction(async session => {
    const staff = await Staff.findById(requireId(params.id)).session(session);
    if (!staff) fail('Nhân viên không còn tồn tại.', 404);
    if (!staff.userId) fail('Liên kết tài khoản trước khi gán vai trò.');
    const role = await roleModel.findOneAndUpdate(
        { _id: requireId(body.roleId), status: 'active', deletedAt: null },
        { $inc: { __v: 1 } }, { new: true, session },
    );
    if (!role) fail('Chọn vai trò đang sử dụng.');
    const account = await userModel.findOneAndUpdate(
        { _id: staff.userId, role: 'staff' }, { $set: { roleId: role._id } }, { new: true, session },
    );
    if (!account) fail('Tài khoản liên kết không còn tồn tại.', 409);
    // Serialize assignments with simultaneous employment/account updates.
    staff.markModified('userId');
    await staff.save({ session });
    return { roleId: role._id };
}));
const staffActivity = operation(async ({ query }) => {
    if (!['orders', 'purchases'].includes(query.type)) fail('Chọn hoạt động cần theo dõi.');
    let actor;
    if (query.staffId) {
        const staff = await Staff.findById(requireId(query.staffId)).lean();
        if (!staff) fail('Không tìm thấy nhân viên.', 404);
        if (!staff.userId) return [];
        actor = staff.userId;
    }
    const range = {};
    for (const key of ['from', 'to']) {
        if (!query[key]) continue;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(query[key])) fail('Khoảng ngày không hợp lệ.');
        const day = new Date(query[key] + 'T00:00:00+07:00');
        if (Number.isNaN(+day) || new Date(+day + 7 * 3600000).toISOString().slice(0, 10) !== query[key]) fail('Ngày không hợp lệ.');
        range[key === 'from' ? '$gte' : '$lt'] = new Date(+day + (key === 'to' ? 86400000 : 0));
    }
    if (range.$gte && range.$lt && range.$gte >= range.$lt) fail('Ngày kết thúc phải từ ngày bắt đầu trở đi.');
    const event = (who, when) => ({
        [who]: actor || { $ne: null },
        ...(Object.keys(range).length && { [when]: range }),
    });
    if (query.type === 'orders') return Order.find(event('confirmedBy', 'confirmedAt'))
        .select('orderCode confirmedBy confirmedByName confirmedAt').sort({ confirmedAt: -1 }).lean();
    return Purchase.find({ $or: [event('createdBy', 'createdAt'), event('confirmedBy', 'confirmedAt')] })
        .select('code createdByName confirmedByName createdAt confirmedAt total currency status')
        .sort({ createdAt: -1 }).lean();
});

export { listRoles, saveRole, listStaff, getStaff, saveStaff, removeRole, availableAccounts,
    linkStaffAccount, assignStaffRole, staffActivity };

import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import userModel from '../models/userModel.js';
import roleModel from '../models/roleModel.js';
import Staff from '../models/staffModel.js';
import { createHash } from 'node:crypto';

const authMiddleware = async (req, res, next) => {
    
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập để tiếp tục.' });
    }

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
        if (!mongoose.isObjectIdOrHexString(decoded.id)) {
            return res.status(401).json({ success: false, message: 'Tài khoản không hợp lệ.' });
        }

        const user = await userModel.findById(decoded.id).select('name email phone role roleId status sessionVersion revokedSessions');
        if (!user) {
            return res.status(401).json({ success: false, message: 'Tài khoản không còn tồn tại.' });
        }
        if (user.status !== 'active') {
            return res.status(403).json({ success: false, code: 'ACCOUNT_DISABLED', message: 'Tài khoản đã bị khóa.' });
        }
        const hash = createHash('sha256').update(token).digest('hex');
        if ((decoded.sv || 0) !== (user.sessionVersion || 0) ||
            user.revokedSessions?.some(session => session.hash === hash)) {
            return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.' });
        }
        req.session = { hash, expiresAt: new Date(decoded.exp * 1000) };

        req.user = { id: user._id.toString(), name: user.name, email: user.email, phone: user.phone, role: user.role };
        if (user.role === 'staff') {
            if (await Staff.exists({ userId: user._id, workStatus: 'resigned' })) {
                return res.status(403).json({ success: false, code: 'ACCOUNT_DISABLED', message: 'Nhân viên đã nghỉ việc.' });
            }
            const role = user.roleId ? await roleModel.findById(user.roleId) : null;
            req.user.roleName = role?.name || 'Chưa có vai trò';
            req.user.permissions = role?.status === 'active' && !role.deletedAt ? role.permissions : [];
        }
        next();
    } catch (error) {
        if (['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name)) {
            return res.status(401).json({ success: false, message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
        }
        console.error(error);
        return res.status(500).json({ success: false, message: 'Chưa xác thực được tài khoản. Vui lòng thử lại.' });
    }
}

export default authMiddleware;

import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import userModel from '../models/userModel.js';

const authMiddleware = async (req, res, next) => {
    
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Not Authorized. Login Again.' });
    }

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
        if (!mongoose.isObjectIdOrHexString(decoded.id)) {
            return res.status(401).json({ success: false, message: 'Invalid account.' });
        }

        const user = await userModel.findById(decoded.id).select('name email role status');
        if (!user) {
            return res.status(401).json({ success: false, message: 'Account no longer exists.' });
        }
        if (user.status !== 'active') {
            return res.status(403).json({ success: false, message: 'Account is deactivated.' });
        }

        req.user = { id: user._id.toString(), name: user.name, email: user.email, role: user.role };
        next();
    } catch (error) {
        if (['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name)) {
            return res.status(401).json({ success: false, message: 'Token is invalid or expired.' });
        }
        console.error(error);
        return res.status(500).json({ success: false, message: 'Unable to verify account.' });
    }
}

export default authMiddleware;

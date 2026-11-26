import mongoose from 'mongoose';
import User from './userModel.js';

const schema = new mongoose.Schema({
    staffCode: { type: String, required: true, trim: true, unique: true, immutable: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true, required: true, unique: true },
    address: { type: String, trim: true },
    position: { type: String, trim: true },
    startDate: Date,
    workStatus: { type: String, enum: ['working', 'resigned'], default: 'working' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', unique: true, sparse: true },
}, { timestamps: true });
schema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string', $gt: '' } } });

const Staff = mongoose.models.Staff || mongoose.model('Staff', schema);
export default Staff;

export async function initializeStaff() {
    await Staff.init();
    const accounts = await User.find({ role: 'staff' }).select('name email phone staffCode createdAt').lean();
    for (const account of accounts) {
        // Keep the login account and all existing order/purchase references.
        await Staff.updateOne({ userId: account._id }, { $setOnInsert: {
            _id: account._id, userId: account._id,
            staffCode: account.staffCode || String(account._id),
            name: account.name, email: account.email, phone: account.phone,
            workStatus: 'working', createdAt: account.createdAt || account._id.getTimestamp(),
        } }, { upsert: true, timestamps: false });
    }
}

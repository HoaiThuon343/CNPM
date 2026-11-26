import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: String,
    type: { type: String, enum: ['percent', 'fixed'], required: true },
    value: { type: Number, required: true },
    minimum: { type: Number, default: 0 },
    maximumDiscount: Number,
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    usageLimit: { type: Number, required: true },
    usedCount: { type: Number, default: 0 },
    hasBeenUsed: { type: Boolean, default: false },
    active: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model('Promotion', schema);

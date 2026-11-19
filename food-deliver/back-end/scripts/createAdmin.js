import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import validator from 'validator';
import { connectDB } from '../config/db.js';
import userModel from '../models/userModel.js';

try {
    const name = process.env.ADMIN_NAME?.trim() || 'Admin';
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase() || '';
    const password = process.env.ADMIN_PASSWORD || '';

    if (!validator.isEmail(email)) {
        throw new Error('Set a valid ADMIN_EMAIL in back-end/.env.');
    }
    if (password.length < 8) {
        throw new Error('Set ADMIN_PASSWORD with at least 8 characters in back-end/.env.');
    }

    await connectDB();
    const exists = await userModel.findOne({ email });
    if (exists) {
        throw new Error('Email already exists. No account was changed.');
    }

    await userModel.create({ name, email, password: await bcrypt.hash(password, 10), role: 'admin' });
    console.log('Admin account created.');
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}

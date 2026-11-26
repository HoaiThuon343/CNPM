import mongoose from "mongoose";
import { toCents } from '../../shared/money.js';

const productSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true, uppercase: true, unique: true, sparse: true },
    image: { type: String, default: '' },
    attributes: { type: String, trim: true, default: '' },
    description: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0.01, set: value => toCents(value) / 100 },
    status: {
        type: String,
        enum: ["active", "out_of_stock", "inactive"],
        default: "active"
    }
}, { timestamps: true });

const productModel = mongoose.models.Product ||
    mongoose.model("Product", productSchema, "foods");

export default productModel;

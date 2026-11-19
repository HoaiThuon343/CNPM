import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    image: { type: String, required: true },
    description: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    status: {
        type: String,
        enum: ["active", "out_of_stock", "inactive"],
        default: "active"
    }
}, { timestamps: true });

const productModel = mongoose.models.Product ||
    mongoose.model("Product", productSchema, "foods");

export default productModel;

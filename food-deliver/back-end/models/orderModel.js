import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    image: {
        type: String,
        default: ""
    }
}, { _id: false });

const deliveryAddressSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    address: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true }
}, { _id: false });

const orderSchema = new mongoose.Schema({
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Customer",
        required: true,
        index: true
    },
    items: {
        type: [orderItemSchema],
        required: true,
        validate: {
            validator: items => Array.isArray(items) && items.length > 0,
            message: "An order must contain at least one product."
        }
    },
    subtotal: {
        type: Number,
        required: true,
        min: 0
    },
    deliveryFee: {
        type: Number,
        required: true,
        min: 0
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    address: {
        type: deliveryAddressSchema,
        required: true
    },
    status: {
        type: String,
        enum: [
            "PENDING",
            "CONFIRMED",
            "PREPARING",
            "DELIVERING",
            "COMPLETED",
            "CANCELLED"
        ],
        default: "PENDING"
    },
    paymentMethod: {
        type: String,
        enum: ["COD"],
        default: "COD",
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ["UNPAID", "PAID"],
        default: "UNPAID",
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    },
    confirmedAt: {
        type: Date,
        default: null
    },
    paidAt: {
        type: Date,
        default: null
    },
    cancelledAt: {
        type: Date,
        default: null
    }
}, { timestamps: true });

const orderModel = mongoose.models.Order ||
    mongoose.model("Order", orderSchema, "orders");

export default orderModel;

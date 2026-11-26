
import mongoose from "mongoose";

const customerSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true,
        unique: true
    },
    addresses: [{
        name: { type: String, required: true },
        phone: { type: String, required: true },
        address: { type: String, required: true },
        ward: { type: String, required: true },
        city: { type: String, required: true },
        note: String,
        isDefault: { type: Boolean, default: false },
    }],
    phone: {
        type: String,
        trim: true,
        default: ""
    }
}, { timestamps: true });

const customerModel = mongoose.models.Customer ||
    mongoose.model("Customer", customerSchema, "customers");

export default customerModel;


import mongoose from "mongoose";

const customerSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true,
        unique: true
    },
    phone: {
        type: String,
        trim: true,
        default: ""
    }
}, { timestamps: true });

const customerModel = mongoose.models.Customer ||
    mongoose.model("Customer", customerSchema, "customers");

export default customerModel;

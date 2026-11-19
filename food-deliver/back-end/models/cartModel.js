
import mongoose from "mongoose";

const cartSchema = new mongoose.Schema({
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Customer",
        required: true,
        unique: true
    }
}, { timestamps: true });

const cartModel = mongoose.models.Cart ||
    mongoose.model("Cart", cartSchema, "carts");

export default cartModel;

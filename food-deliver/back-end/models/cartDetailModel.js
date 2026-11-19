
import mongoose from "mongoose";

const cartDetailSchema = new mongoose.Schema({
    cartId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Cart",
        required: true
    },
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
        default: 1
    }
}, { timestamps: true });

cartDetailSchema.index(
    { cartId: 1, productId: 1 },
    { unique: true }
);

const cartDetailModel = mongoose.models.CartDetail ||
    mongoose.model("CartDetail", cartDetailSchema, "cartdetails");

export default cartDetailModel;

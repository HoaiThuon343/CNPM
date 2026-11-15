// import mongoose from "mongoose";

// const foodSchema = new mongoose.Schema({
//     restaurantId: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'restaurantProfile', // Tham chiếu đến restaurantModel
//         required: true
//     },
//     // -------------------

//     name: {type: String, required: true},
//     image: {type: String, required: true},
//     description: {type: String, required: true},
//     category: {type: String, required: true},
//     price: {type: Number, required: true},    
// });

// const foodModel = mongoose.models.food || mongoose.model('foods', foodSchema);

// export default foodModel;

import mongoose from "mongoose";

const foodSchema = new mongoose.Schema({
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

const foodModel = mongoose.models.Food ||
    mongoose.model("Food", foodSchema, "foods");

export default foodModel;
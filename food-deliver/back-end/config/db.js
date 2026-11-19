import mongoose from "mongoose";

export const connectDB = async () => {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "FastFood" });
    console.log('DB connected: FastFood');
}

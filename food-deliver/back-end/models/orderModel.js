import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
    {
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        price: {
            type: Number,
            required: true,
            min: 0,
        },
        quantity: {
            type: Number,
            required: true,
            min: 1,
        },
        image: {
            type: String,
            default: "",
        },
    },
    { _id: false },
);

const deliveryAddressSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, trim: true, lowercase: true, default: "" },
        address: { type: String, required: true, trim: true },
        phone: { type: String, required: true, trim: true },
    },
    { _id: false },
);

const orderSchema = new mongoose.Schema(
    {
        orderCode: { type: String, unique: true, sparse: true },
        legacyOrderCode: { type: String, unique: true, sparse: true, select: false },
        trackingHash: { type: String, select: false },
        requestKey: { type: String, unique: true, sparse: true, select: false },
        requestHash: { type: String, select: false },
        customerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Customer",
            index: true,
        },
        items: {
            type: [orderItemSchema],
            required: true,
            validate: {
                validator: (items) => Array.isArray(items) && items.length > 0,
                message: "An order must contain at least one product.",
            },
        },
        promotionId: { type: mongoose.Schema.Types.ObjectId, ref: "Promotion", index: true },
        promotionCode: String,
        discountAmount: { type: Number, min: 0 },
        subtotal: {
            type: Number,
            required: true,
            min: 0,
        },
        deliveryFee: {
            type: Number,
            required: true,
            min: 0,
        },
        amount: {
            type: Number,
            required: true,
            min: 0,
        },
        address: {
            type: deliveryAddressSchema,
            required: true,
        },
        note: { type: String, trim: true, maxlength: 1000, default: "" },
        status: {
            type: String,
            enum: ["PENDING", "CONFIRMED", "PREPARING", "DELIVERING", "COMPLETED", "CANCELLED"],
            default: "PENDING",
        },
        paymentMethod: {
            type: String,
            enum: ["COD"],
            default: "COD",
            required: true,
        },
        paymentStatus: {
            type: String,
            enum: ["UNPAID", "PAID"],
            default: "UNPAID",
            required: true,
        },
        date: {
            type: Date,
            default: Date.now,
        },
        confirmedAt: {
            type: Date,
            default: null,
        },
        confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
        confirmedByName: String,
        deliveryStaffId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user",
            index: true,
        },
        deliveryStaffName: String,
        assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
        assignedAt: Date,
        preparingAt: Date,
        preparingBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
        deliveringAt: Date,
        deliveringBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
        completedAt: Date,
        completedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
        paidAt: {
            type: Date,
            default: null,
        },
        paidBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
        cancelledAt: {
            type: Date,
            default: null,
        },
        cancelledBy: { type: String, enum: ["customer", "guest"] },
    },
    { timestamps: true },
);

orderSchema.virtual("invoice", {
    ref: "Invoice",
    localField: "_id",
    foreignField: "orderId",
    justOne: true,
});

orderSchema.statics.initializeCodeCounter = async function () {
    const latest = await this.findOne({ orderCode: /^FD-\d{4}$/ })
        .sort({ orderCode: -1 })
        .select("orderCode")
        .lean();
    await this.db
        .collection("counters")
        .updateOne(
            { _id: "order-code" },
            { $max: { sequence: latest ? Number(latest.orderCode.slice(3)) : 0 } },
            { upsert: true },
        );
};

orderSchema.statics.nextCode = async function (session) {
    const counter = await this.db
        .collection("counters")
        .findOneAndUpdate(
            { _id: "order-code" },
            { $inc: { sequence: 1 } },
            { upsert: true, returnDocument: "after", session },
        );
    if (counter.sequence > 9999) {
        const error = new Error("Đã dùng hết dải mã đơn 4 số. Vui lòng liên hệ quản trị viên.");
        error.status = 409;
        throw error;
    }
    return `FD-${String(counter.sequence).padStart(4, "0")}`;
};

orderSchema.statics.upgradeLegacyCodes = async function () {
    return this.db.transaction(async (session) => {
        const orders = await this.find({ orderCode: { $not: /^FD-\d{4}$/ } })
            .select("orderCode")
            .sort({ date: 1, _id: 1 })
            .session(session)
            .lean();
        if (!orders.length) return 0;
        const counter = await this.db
            .collection("counters")
            .findOneAndUpdate(
                { _id: "order-code" },
                { $inc: { sequence: orders.length } },
                { upsert: true, returnDocument: "after", session },
            );
        if (counter.sequence > 9999)
            throw new Error("Không đủ mã bốn số để chuyển đổi đơn cũ. Dữ liệu chưa bị thay đổi.");
        const changes = orders.map((order, index) => ({
            order,
            code: `FD-${String(counter.sequence - orders.length + index + 1).padStart(4, "0")}`,
        }));
        await this.bulkWrite(
            changes.map(({ order, code }) => ({
                updateOne: {
                    filter: { _id: order._id },
                    update: {
                        $set: {
                            orderCode: code,
                            ...(order.orderCode && { legacyOrderCode: order.orderCode }),
                        },
                    },
                    timestamps: false,
                },
            })),
            { session },
        );
        await this.db.collection("invoices").bulkWrite(
            changes.map(({ order, code }) => ({
                updateMany: {
                    filter: { orderId: order._id },
                    update: { $set: { orderCode: code } },
                },
            })),
            { session },
        );
        return changes.length;
    });
};

const orderModel = mongoose.models.Order || mongoose.model("Order", orderSchema, "orders");

export default orderModel;
export { orderItemSchema, deliveryAddressSchema };

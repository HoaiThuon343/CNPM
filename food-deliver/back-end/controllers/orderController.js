import mongoose from "mongoose";
import orderModel from "../models/orderModel.js";
import customerModel from "../models/customerModel.js";
import cartModel from "../models/cartModel.js";
import cartDetailModel from "../models/cartDetailModel.js";

const DELIVERY_CHARGE = 5;

const roundMoney = value => Math.round((value + Number.EPSILON) * 100) / 100;

const createHttpError = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

// Create an order using the authenticated customer's current cart (COD).
const placeOrder = async (req, res) => {
    const { address } = req.body;

    if (
        !address ||
        !address.name?.trim() ||
        !address.email?.trim() ||
        !address.phone?.trim() ||
        !address.address?.trim()
    ) {
        return res.status(400).json({
            success: false,
            message: "Please provide complete delivery information."
        });
    }

    if (!mongoose.Types.ObjectId.isValid(req.user.id)) {
        return res.status(401).json({
            success: false,
            message: "Invalid user account. Please log in again."
        });
    }

    const session = await mongoose.startSession();
    let createdOrder = null;

    try {
        await session.withTransaction(async () => {
            const customer = await customerModel.findOne({
                userId: req.user.id
            }).session(session);

            if (!customer) {
                throw createHttpError(
                    "Customer profile not found. Please refresh your account and try again.",
                    404
                );
            }

            const cart = await cartModel.findOne({
                customerId: customer._id
            }).session(session);

            if (!cart) {
                throw createHttpError("Your cart is empty.", 400);
            }

            const cartDetails = await cartDetailModel.find({
                cartId: cart._id
            })
                .populate("productId", "name price image status")
                .session(session);

            if (cartDetails.length === 0) {
                throw createHttpError("Your cart is empty.", 400);
            }

            const orderItems = [];
            let subtotal = 0;

            for (const detail of cartDetails) {
                const product = detail.productId;
                const quantity = Number(detail.quantity);

                if (!product) {
                    throw createHttpError(
                        "A product in your cart no longer exists. Please update your cart.",
                        409
                    );
                }

                if (product.status !== "active") {
                    throw createHttpError(
                        `${product.name} is currently unavailable. Please update your cart.`,
                        409
                    );
                }

                if (!Number.isInteger(quantity) || quantity < 1) {
                    throw createHttpError("Invalid product quantity in cart.", 400);
                }

                const price = Number(product.price);
                const itemTotal = price * quantity;
                subtotal += itemTotal;

                orderItems.push({
                    productId: product._id,
                    name: product.name,
                    price,
                    quantity,
                    image: product.image
                });
            }

            subtotal = roundMoney(subtotal);
            const deliveryFee = DELIVERY_CHARGE;
            const amount = roundMoney(subtotal + deliveryFee);

            const newOrder = new orderModel({
                customerId: customer._id,
                items: orderItems,
                subtotal,
                deliveryFee,
                amount,
                address: {
                    name: address.name.trim(),
                    email: address.email.trim().toLowerCase(),
                    address: address.address.trim(),
                    phone: address.phone.trim()
                },
                status: "PENDING",
                paymentMethod: "COD",
                paymentStatus: "UNPAID"
            });

            await newOrder.save({ session });

            // Clear the cart only after the order has been saved successfully.
            await cartDetailModel.deleteMany(
                { cartId: cart._id },
                { session }
            );

            createdOrder = newOrder;
        });

        return res.status(201).json({
            success: true,
            message: "Order placed successfully. Payment method: Cash on Delivery.",
            orderId: createdOrder._id,
            amount: createdOrder.amount,
            status: createdOrder.status,
            paymentMethod: createdOrder.paymentMethod,
            paymentStatus: createdOrder.paymentStatus
        });

    } catch (error) {
        console.error("Place order error:", error);

        return res.status(error.status || 500).json({
            success: false,
            message: error.status
                ? error.message
                : "Unable to place order. Please try again."
        });
    } finally {
        await session.endSession();
    }
};

// Get orders belonging to the authenticated customer.
const userOrders = async (req, res) => {
    try {
        const customer = await customerModel.findOne({
            userId: req.user.id
        });

        if (!customer) {
            return res.json({ success: true, data: [] });
        }

        const orders = await orderModel.find({
            customerId: customer._id
        })
            .sort({ date: -1 })
            .lean();

        return res.json({ success: true, data: orders });

    } catch (error) {
        console.error("Fetch user orders error:", error);
        return res.status(500).json({
            success: false,
            message: "Error fetching user orders."
        });
    }
};

// List all orders for an authorized administrator.
const listOrders = async (req, res) => {
    try {
        const orders = await orderModel.find({})
            .populate({
                path: "customerId",
                select: "phone userId",
                populate: {
                    path: "userId",
                    select: "name email"
                }
            })
            .sort({ date: -1 })
            .lean();

        return res.json({ success: true, data: orders });

    } catch (error) {
        console.error("List orders error:", error);
        return res.status(500).json({
            success: false,
            message: "Error listing orders."
        });
    }
};

// Enforce the order status progression.
const updateStatus = async (req, res) => {
    const { orderId, status } = req.body;

    const allowedTransitions = {
        PENDING: ["CONFIRMED", "CANCELLED"],
        CONFIRMED: ["PREPARING"],
        PREPARING: ["DELIVERING"],
        DELIVERING: ["COMPLETED"],
        COMPLETED: [],
        CANCELLED: []
    };

    try {
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid order ID."
            });
        }

        const order = await orderModel.findById(orderId);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found."
            });
        }

        if (status === "CONFIRMED") {
            return res.status(409).json({
                success: false,
                message: "Order confirmation is not enabled until Invoice and InvoiceDetail creation is implemented."
            });
        }

        if (!allowedTransitions[order.status]?.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid order status transition: ${order.status} to ${status}.`
            });
        }

        order.status = status;

        if (status === "CONFIRMED") {
            order.confirmedAt = new Date();
        }

        if (status === "CANCELLED") {
            order.cancelledAt = new Date();
        }

        await order.save();

        return res.json({
            success: true,
            message: "Order status updated successfully.",
            data: order
        });

    } catch (error) {
        console.error("Update order status error:", error);
        return res.status(500).json({
            success: false,
            message: "Error updating order status."
        });
    }
};

// Customers can cancel only their own pending orders.
const cancelOrder = async (req, res) => {
    const { orderId } = req.body;

    try {
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid order ID."
            });
        }

        const customer = await customerModel.findOne({
            userId: req.user.id
        });

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer profile not found."
            });
        }

        const order = await orderModel.findOne({
            _id: orderId,
            customerId: customer._id
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found."
            });
        }

        if (order.status !== "PENDING") {
            return res.status(400).json({
                success: false,
                message: "Only pending orders can be cancelled."
            });
        }

        order.status = "CANCELLED";
        order.cancelledAt = new Date();
        await order.save();

        return res.json({
            success: true,
            message: "Order cancelled successfully."
        });

    } catch (error) {
        console.error("Cancel order error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to cancel order."
        });
    }
};

// Mark COD payment as received after order completion.
const updatePaymentStatus = async (req, res) => {
    const { orderId } = req.body;

    try {
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid order ID."
            });
        }

        const order = await orderModel.findById(orderId);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found."
            });
        }

        if (order.paymentMethod !== "COD" || order.status !== "COMPLETED") {
            return res.status(400).json({
                success: false,
                message: "COD payment can be marked as paid only after order completion."
            });
        }

        if (order.paymentStatus === "PAID") {
            return res.json({
                success: true,
                message: "Order has already been paid."
            });
        }

        order.paymentStatus = "PAID";
        order.paidAt = new Date();
        await order.save();

        return res.json({
            success: true,
            message: "Payment status updated successfully."
        });

    } catch (error) {
        console.error("Update payment status error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to update payment status."
        });
    }
};

export {
    placeOrder,
    userOrders,
    listOrders,
    updateStatus,
    cancelOrder,
    updatePaymentStatus
};

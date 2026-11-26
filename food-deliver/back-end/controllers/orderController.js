import { createHash } from "node:crypto";
import validator from "validator";
import productModel from "../models/productModel.js";
import { checkMenuProducts } from "../models/categoryModel.js";
import mongoose from "mongoose";
import orderModel from "../models/orderModel.js";
import invoiceModel from "../models/invoiceModel.js";
import userModel from "../models/userModel.js";
import roleModel from "../models/roleModel.js";
import customerModel from "../models/customerModel.js";
import cartModel from "../models/cartModel.js";
import cartDetailModel from "../models/cartDetailModel.js";
import { toCents } from "../../shared/money.js";
import { pricePromotion, promotionCode, releasePromotion } from "./promotionController.js";

const DELIVERY_CHARGE = 5;

const createHttpError = (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    return error;
};

const hash = (value) => createHash("sha256").update(value).digest("hex");
const orderNote = (value = "") => {
    if (typeof value !== "string" || value.length > 1000) throw createHttpError("Ghi chú tối đa 1000 ký tự.");
    return value.trim();
};

const validItems = (items) =>
    Array.isArray(items) && items.length > 0 && items.length <= 100 &&
    items.every((item) => item && typeof item.productId === "string" &&
        mongoose.isObjectIdOrHexString(item.productId) &&
        Number.isSafeInteger(item.quantity) && item.quantity > 0) &&
    new Set(items.map((item) => item.productId.toLowerCase())).size === items.length;

const priceItems = async (items, checkPrice = false, session) => {
    const query = productModel.find({ _id: { $in: items.map((item) => item.productId) } });
    if (session) query.session(session);
    const products = await query.lean();
    await checkMenuProducts(products, session);
    const byId = new Map(products.map((product) => [String(product._id), product]));
    let subtotalCents = 0;
    const orderItems = items.map((item) => {
        const product = byId.get(item.productId.toLowerCase());
        if (!product || product.status !== "active") {
            throw createHttpError("A product is unavailable. Please review your cart.", 409);
        }
        const price = toCents(product.price);
        if (checkPrice && price !== toCents(item.price)) {
            throw createHttpError("Prices have changed. Please review the updated total and place your order again.", 409);
        }
        subtotalCents += price * item.quantity;
        return { productId: product._id, name: product.name, price: price / 100,
            quantity: item.quantity, image: product.image };
    });
    if (!Number.isSafeInteger(subtotalCents + toCents(DELIVERY_CHARGE))) {
        throw createHttpError("Order amount is too large.");
    }
    return { subtotalCents, orderItems };
};

const priceOrder = async (subtotalCents, code, session) => {
    const promotion = await pricePromotion(code, subtotalCents, session);
    const beforeDiscount = subtotalCents + toCents(DELIVERY_CHARGE);
    if (!Number.isSafeInteger(beforeDiscount)) throw createHttpError("Order amount is too large.");
    const amount = (beforeDiscount - toCents(promotion.discountAmount ?? 0)) / 100;
    return { ...promotion, subtotal: subtotalCents / 100, deliveryFee: DELIVERY_CHARGE, amount };
};

const checkTotal = (amount, expectedAmount) => {
    if (toCents(amount) !== toCents(expectedAmount)) {
        throw createHttpError("Order total changed. Please review the updated total.", 409);
    }
};

const quoteOrder = async (req, res) => {
    try {
        const { items, promotionCode: rawCode } = req.body || {};
        const code = promotionCode(rawCode);
        if (!code || !validItems(items)) throw createHttpError("Nhập mã và kiểm tra giỏ hàng.");
        const { subtotalCents } = await priceItems(items);
        const { subtotal, deliveryFee, amount, discountAmount } = await priceOrder(subtotalCents, code);
        res.json({ success: true, data: { code, subtotal, deliveryFee, amount, discountAmount } });
    } catch (error) {
        const status = error.status || (error instanceof RangeError ? 400 : 500);
        res.status(status).json({ success: false, message: status === 500 ? "Không kiểm tra được mã khuyến mãi." : error.message });
    }
};

const orderView = (order) => ({
    orderId: order._id,
    orderCode: order.orderCode || String(order._id),
    items: order.items,
    address: order.address,
    note: order.note || "",
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    amount: order.amount,
    ...(order.promotionCode && { promotionCode: order.promotionCode, discountAmount: order.discountAmount }),
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    date: order.date,
    confirmedAt: order.confirmedAt,
    cancelledAt: order.cancelledAt,
    preparingAt: order.preparingAt,
    deliveringAt: order.deliveringAt,
    completedAt: order.completedAt,
    paidAt: order.paidAt,
});

const guestOrder = async (req, res) => {
    try {
        const { address, items, requestId, trackingCode, expectedAmount } = req.body;
        const note = orderNote(req.body.note);
        const code = promotionCode(req.body.promotionCode);
        if (
            !address ||
            !["name", "phone", "address"].every(
                (field) => typeof address[field] === "string" && address[field].trim(),
            ) ||
            address.name.length > 120 ||
            address.address.length > 500 ||
            !/^\+?[\d ().-]{8,25}$/.test(address.phone) ||
            address.phone.replace(/\D/g, "").length < 8 ||
            address.phone.replace(/\D/g, "").length > 15 ||
            (address.email && (typeof address.email !== "string" || !validator.isEmail(address.email))) ||
            typeof requestId !== "string" ||
            !/^[a-zA-Z0-9_-]{16,100}$/.test(requestId) ||
            typeof trackingCode !== "string" ||
            !/^[a-f0-9]{64}$/.test(trackingCode) ||
            !validItems(items)
        ) {
            throw createHttpError("Invalid order details. Please check the cart and delivery information.");
        }
        const deliveryAddress = {
            name: address.name.trim(),
            phone: address.phone.trim(),
            address: address.address.trim(),
            email: typeof address.email === "string" ? address.email.trim().toLowerCase() : "",
        };
        const requestedItems = items
            .map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                price: toCents(item.price) / 100,
            }))
            .sort((a, b) => a.productId.localeCompare(b.productId));
        const requestKey = hash(`${requestId}:${trackingCode}`);
        const requestHash = hash(
            JSON.stringify({
                address: deliveryAddress,
                items: requestedItems,
                amount: toCents(expectedAmount),
                ...(code && { promotionCode: code }),
                ...(note && { note }),
            }),
        );
        const existingOrder = async () => {
            const existing = await orderModel.findOne({ requestKey }).select("+requestHash");
            if (existing && existing.requestHash !== requestHash) {
                throw createHttpError("This request was already used with different order details.", 409);
            }
            return existing;
        };
        // Recover an already-saved receipt, including orders created under the previous policy.
        const existing = await existingOrder();
        if (existing) return res.json({ success: true, order: orderView(existing) });
        if (code) throw createHttpError("Sign in to use a promo code. Guest checkout is available at the regular COD total.", 403);

        let order;
        try {
            order = await mongoose.connection.transaction(async session => {
                const { subtotalCents, orderItems } = await priceItems(requestedItems, true, session);
                const pricing = await priceOrder(subtotalCents);
                checkTotal(pricing.amount, expectedAmount);
                const [created] = await orderModel.create([{
                    ...pricing, orderCode: await orderModel.nextCode(session),
                    items: orderItems, address: deliveryAddress, trackingHash: hash(trackingCode),
                    note,
                    requestKey, requestHash, status: "PENDING", paymentMethod: "COD", paymentStatus: "UNPAID",
                }], { session });
                return created;
            });
        } catch (error) {
            if (error.code !== 11000) throw error;
            order = await existingOrder();
            if (!order) throw error;
        }
        res.status(201).json({ success: true, order: orderView(order) });
    } catch (error) {
        const status = error.status || (error instanceof RangeError ? 400 : 500);
        res.status(status).json({
            success: false,
            message:
                status === 500 ? "Unable to place your order. Please retry the same request." : error.message,
        });
    }
};

const findGuestOrder = async (body) => {
    const { orderCode, trackingCode } = body;
    if (
        typeof orderCode !== "string" ||
        typeof trackingCode !== "string" ||
        !/^FD-(?:\d{4}|[A-F0-9]{12})$/i.test(orderCode.trim()) ||
        !/^[a-f0-9]{64}$/i.test(trackingCode.trim())
    ) {
        throw createHttpError("Order not found. Check your order code and tracking code.", 404);
    }
    const order = await orderModel.findOne({
        $or: [
            { orderCode: orderCode.trim().toUpperCase() },
            { legacyOrderCode: orderCode.trim().toUpperCase() },
        ],
        trackingHash: hash(trackingCode.trim().toLowerCase()),
    });
    if (!order) throw createHttpError("Order not found. Check your order code and tracking code.", 404);
    return order;
};

const cancelPendingOrder = async (order, actor) => {
    if (order.status === "CANCELLED") return order;
    const cancel = async (session) => {
        const cancelled = await orderModel.findOneAndUpdate(
            { _id: order._id, status: "PENDING" },
            { $set: { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: actor } },
            { new: true, ...(session && { session }) },
        );
        if (!cancelled) {
            if (session) {
                const current = await orderModel.findById(order._id).session(session);
                if (current?.status === "CANCELLED") return current;
            }
            throw createHttpError("This order has already been confirmed and cannot be cancelled.", 409);
        }
        if (cancelled.promotionId) await releasePromotion(cancelled.promotionId, session);
        return cancelled;
    };
    return order.promotionId ? mongoose.connection.transaction(cancel) : cancel();
};

const lookupGuestOrder = async (req, res) => {
    try {
        const order = await findGuestOrder(req.body);
        res.json({ success: true, order: orderView(order) });
    } catch (error) {
        res.status(error.status || 500).json({
            success: false,
            message: error.status ? error.message : "Unable to look up your order.",
        });
    }
};

const cancelGuestOrder = async (req, res) => {
    try {
        const order = await findGuestOrder(req.body);
        const cancelled = await cancelPendingOrder(order, "guest");
        res.json({ success: true, order: orderView(cancelled) });
    } catch (error) {
        res.status(error.status || 500).json({
            success: false,
            message: error.status ? error.message : "Unable to cancel this order.",
        });
    }
};

// Create an order using the authenticated customer's current cart (COD).
const placeOrder = async (req, res) => {
    const { address, addressId } = req.body || {};

    if (!addressId && (!address || !["name", "phone", "address"].every(key =>
        typeof address[key] === "string" && address[key].trim()))) {
        return res.status(400).json({
            success: false,
            message: "Please provide complete delivery information.",
        });
    }

    if (!mongoose.Types.ObjectId.isValid(req.user.id)) {
        return res.status(401).json({
            success: false,
            message: "Invalid user account. Please log in again.",
        });
    }

    const session = await mongoose.startSession();
    let createdOrder = null;

    try {
        const note = orderNote(req.body.note);
        await session.withTransaction(async () => {
            const customer = await customerModel
                .findOne({
                    userId: req.user.id,
                })
                .session(session);

            if (!customer) {
                throw createHttpError(
                    "Customer profile not found. Please refresh your account and try again.",
                    404,
                );
            }
            let deliveryAddress = address;
            if (addressId) {
                if (!mongoose.isObjectIdOrHexString(addressId)) throw createHttpError("Địa chỉ không hợp lệ.");
                const saved = customer.addresses?.id(addressId);
                if (!saved) throw createHttpError("Địa chỉ không thuộc tài khoản của bạn hoặc đã bị xóa.", 404);
                deliveryAddress = {
                    name: saved.name, phone: saved.phone, email: req.user.email || "",
                    address: [saved.address, saved.ward, saved.city].filter(Boolean).join(", "),
                };
            }
            if (deliveryAddress.name.length > 120 || deliveryAddress.address.length > 500 ||
                !/^\+?[\d ().-]{8,25}$/.test(deliveryAddress.phone) ||
                (deliveryAddress.email && (typeof deliveryAddress.email !== "string" || !validator.isEmail(deliveryAddress.email)))) {
                throw createHttpError("Kiểm tra lại thông tin người nhận và địa chỉ giao hàng.");
            }

            const cart = await cartModel
                .findOne({
                    customerId: customer._id,
                })
                .session(session);

            if (!cart) {
                throw createHttpError("Your cart is empty.", 400);
            }

            const cartDetails = await cartDetailModel
                .find({
                    cartId: cart._id,
                })
                .populate("productId", "name price image status category")
                .session(session);

            if (cartDetails.length === 0) {
                throw createHttpError("Your cart is empty.", 400);
            }

            const orderItems = [];
            let subtotalCents = 0;

            for (const detail of cartDetails) {
                const product = detail.productId;
                const quantity = Number(detail.quantity);

                if (!product) {
                    throw createHttpError(
                        "A product in your cart no longer exists. Please update your cart.",
                        409,
                    );
                }

                if (product.status !== "active") {
                    throw createHttpError(
                        `${product.name} is currently unavailable. Please update your cart.`,
                        409,
                    );
                }

                if (!Number.isInteger(quantity) || quantity < 1) {
                    throw createHttpError("Invalid product quantity in cart.", 400);
                }

                const priceCents = toCents(product.price);
                subtotalCents += priceCents * quantity;
                if (!Number.isSafeInteger(subtotalCents)) {
                    throw createHttpError("Order amount is too large.", 400);
                }

                orderItems.push({
                    productId: product._id,
                    name: product.name,
                    price: priceCents / 100,
                    quantity,
                    image: product.image,
                });
            }

            await checkMenuProducts(cartDetails.map(detail => detail.productId), session);
            const code = promotionCode(req.body.promotionCode);
            const pricing = await priceOrder(subtotalCents, code, session);
            if (code || req.body.expectedAmount !== undefined) checkTotal(pricing.amount, req.body.expectedAmount);

            const newOrder = new orderModel({
                orderCode: await orderModel.nextCode(session),
                customerId: customer._id,
                items: orderItems,
                ...pricing,
                address: {
                    name: deliveryAddress.name.trim(),
                    email: deliveryAddress.email?.trim().toLowerCase() || "",
                    address: deliveryAddress.address.trim(),
                    phone: deliveryAddress.phone.trim(),
                },
                note,
                status: "PENDING",
                paymentMethod: "COD",
                paymentStatus: "UNPAID",
            });

            await newOrder.save({ session });

            // Clear the cart only after the order has been saved successfully.
            await cartDetailModel.deleteMany({ cartId: cart._id }, { session });

            createdOrder = newOrder;
        });

        return res.status(201).json({
            success: true,
            message: "Order placed successfully. Payment method: Cash on Delivery.",
            orderId: createdOrder._id,
            orderCode: createdOrder.orderCode,
            amount: createdOrder.amount,
            ...(createdOrder.promotionCode && { promotionCode: createdOrder.promotionCode, discountAmount: createdOrder.discountAmount }),
            status: createdOrder.status,
            paymentMethod: createdOrder.paymentMethod,
            paymentStatus: createdOrder.paymentStatus,
        });
    } catch (error) {
        console.error("Place order error:", error);

        return res.status(error.status || (error instanceof RangeError ? 400 : 500)).json({
            success: false,
            message: error.status ? error.message : "Unable to place order. Please try again.",
        });
    } finally {
        await session.endSession();
    }
};

// Get orders belonging to the authenticated customer.
const userOrders = async (req, res) => {
    try {
        const customer = await customerModel.findOne({
            userId: req.user.id,
        });

        if (!customer) {
            return res.json({ success: true, data: [] });
        }

        const orders = await orderModel
            .find({
                customerId: customer._id,
            })
            .sort({ date: -1 })
            .lean();

        return res.json({ success: true, data: orders });
    } catch (error) {
        console.error("Fetch user orders error:", error);
        return res.status(500).json({
            success: false,
            message: "Error fetching user orders.",
        });
    }
};

const can = (user, permission) => user.role === "admin" || user.permissions?.includes(permission);
const orderScope = (user) => (can(user, "order.view") ? {} : { deliveryStaffId: user.id });
const listInvoices = async (req, res) => {
    try {
        const scope = orderScope(req.user);
        const filter = scope.deliveryStaffId
            ? { orderId: { $in: await orderModel.find(scope).distinct("_id") } }
            : {};
        const invoices = await invoiceModel.find(filter).sort({ createdAt: -1, _id: -1 }).lean();
        const orders = await orderModel
            .find({ _id: { $in: invoices.map((invoice) => invoice.orderId) } })
            .select("status deliveryStaffId deliveryStaffName completedAt")
            .lean();
        const byId = new Map(orders.map((order) => [String(order._id), order]));
        res.json({
            success: true,
            data: invoices.map((invoice) => ({
                ...invoice,
                totalBeforeDiscount:
                    invoice.totalBeforeDiscount ??
                    (toCents(invoice.subtotal) + toCents(invoice.deliveryFee)) / 100,
                discountAmount: invoice.discountAmount ?? 0,
                order: byId.get(String(invoice.orderId)) || null,
            })),
        });
    } catch (error) {
        console.error("List invoices error:", error);
        res.status(500).json({ success: false, message: "Không tải được danh sách hóa đơn." });
    }
};

// Delivery staff only receive the orders assigned to them, including on direct API requests.
const listOrders = async (req, res) => {
    try {
        let query = orderModel
            .find(req.report ? {} : orderScope(req.user))
            .populate({
                path: "customerId",
                select: "phone userId",
                populate: {
                    path: "userId",
                    select: "name email phone",
                },
            })
            .sort({ date: -1 });
        if (req.report || can(req.user, "invoice.view")) query = query.populate("invoice");
        const orders = await query.lean();

        return res.json({ success: true, data: orders });
    } catch (error) {
        console.error("List orders error:", error);
        return res.status(500).json({
            success: false,
            message: "Không tải được danh sách đơn hàng.",
        });
    }
};

const mutateOrder = async (req, res, operation) => {
    let session;
    try {
        if (!mongoose.isObjectIdOrHexString(req.body.orderId)) throw createHttpError("Mã đơn không hợp lệ.");
        session = await mongoose.startSession();
        const result = await session.withTransaction(async () => {
            const order = await orderModel
                .findOne({ _id: req.body.orderId, ...orderScope(req.user) })
                .session(session);
            if (!order)
                throw createHttpError("Không tìm thấy đơn hàng hoặc đơn chưa được giao cho bạn.", 404);
            const invoice = await operation(order, session);
            return { order, invoice };
        });
        res.json({
            success: true,
            data: result.order,
            ...(can(req.user, "invoice.view") && { invoice: result.invoice }),
        });
    } catch (error) {
        const status = error.status || (error instanceof RangeError ? 400 : error.code === 11000 ? 409 : 500);
        if (status === 500) console.error("Order operation failed:", error);
        res.status(status).json({
            success: false,
            message: error.status
                ? error.message
                : error instanceof RangeError
                  ? "Số tiền không hợp lệ. Vui lòng nhập số tiền USD hợp lệ."
                  : "Không lưu được thay đổi. Vui lòng tải lại và thử lại.",
        });
    } finally {
        await session?.endSession();
    }
};

const requireInvoice = async (order, session) => {
    const invoice = await invoiceModel.findOne({ orderId: order._id }).session(session);
    if (!invoice) throw createHttpError("Đơn chưa có hóa đơn hợp lệ, không thể xử lý tiếp.", 409);
    return invoice;
};

const updateStatus = (req, res) =>
    mutateOrder(req, res, async (order, session) => {
        const { status } = req.body;
        const transitions = {
            PENDING: "CONFIRMED",
            CONFIRMED: "PREPARING",
            PREPARING: "DELIVERING",
            DELIVERING: "COMPLETED",
        };
        if (!["CONFIRMED", "PREPARING", "DELIVERING", "COMPLETED"].includes(status))
            throw createHttpError("Trạng thái không hợp lệ.");
        if (status === "CONFIRMED") {
            if (order.status !== "PENDING") {
                throw createHttpError("Đơn không còn chờ xác nhận.", 409);
            }
            order.status = "CONFIRMED";
            order.confirmedAt = new Date();
            order.confirmedBy = req.user.id;
            order.confirmedByName = req.user.name;
            // Write the order first so concurrent confirmations serialize on the same document.
            await order.save({ session });
            return new invoiceModel({
                invoiceCode: await invoiceModel.nextCode(session),
                orderId: order._id,
                orderCode: order.orderCode || String(order._id),
                customerId: order.customerId,
                items: order.items.toObject(),
                address: order.address.toObject(),
                subtotal: order.subtotal,
                deliveryFee: order.deliveryFee,
                totalBeforeDiscount: (toCents(order.subtotal) + toCents(order.deliveryFee)) / 100,
                discountAmount: (toCents(order.subtotal) + toCents(order.deliveryFee) - toCents(order.amount)) / 100,
                promotionCode: order.promotionCode,
                amount: order.amount,
                createdBy: req.user.id,
                createdByName: req.user.name,
            }).save({ session });
        }
        const invoice = await requireInvoice(order, session);
        if (transitions[order.status] !== status)
            throw createHttpError("Phải chuyển đúng thứ tự chuẩn bị, giao hàng và hoàn thành.", 409);
        if (["DELIVERING", "COMPLETED"].includes(status) && !order.deliveryStaffId)
            throw createHttpError("Hãy phân công nhân viên giao hàng trước.", 409);
        order.status = status;
        const step = {
            PREPARING: "preparing",
            DELIVERING: "delivering",
            COMPLETED: "completed",
        }[status];
        order[`${step}At`] = new Date();
        order[`${step}By`] = req.user.id;
        await order.save({ session });
        return invoice;
    });

const listDeliveryStaff = async (req, res) => {
    try {
        const roles = await roleModel
            .find({
                status: "active",
                deletedAt: null,
                permissions: "order.deliver",
            })
            .select("_id");
        const staff = await userModel
            .find({
                role: "staff",
                status: "active",
                roleId: { $in: roles.map((role) => role._id) },
            })
            .select("name staffCode")
            .sort({ name: 1 })
            .lean();
        res.json({ success: true, data: staff });
    } catch {
        res.status(500).json({
            success: false,
            message: "Không tải được nhân viên giao hàng.",
        });
    }
};

const assignDelivery = (req, res) =>
    mutateOrder(req, res, async (order, session) => {
        if (
            !["CONFIRMED", "PREPARING", "DELIVERING"].includes(order.status) ||
            order.paymentStatus === "PAID"
        ) {
            throw createHttpError("Chỉ phân công đơn đã xác nhận, chưa hoàn thành và chưa thu tiền.", 409);
        }
        if (!mongoose.isObjectIdOrHexString(req.body.staffId))
            throw createHttpError("Chọn nhân viên giao hàng hợp lệ.");
        const staff = await userModel
            .findOne({ _id: req.body.staffId, role: "staff", status: "active" })
            .session(session);
        const role = staff?.roleId
            ? await roleModel
                  .findOne({
                      _id: staff.roleId,
                      status: "active",
                      deletedAt: null,
                      permissions: "order.deliver",
                  })
                  .session(session)
            : null;
        if (!role) throw createHttpError("Nhân viên phải đang hoạt động và có quyền giao hàng.");
        const invoice = await requireInvoice(order, session);
        if (String(order.deliveryStaffId) !== String(staff._id)) {
            order.deliveryStaffId = staff._id;
            order.deliveryStaffName = staff.name;
            order.assignedAt = new Date();
            order.assignedBy = req.user.id;
            await order.save({ session });
        }
        return invoice;
    });

// Customers can cancel only their own pending orders.
const cancelOrder = async (req, res) => {
    const { orderId } = req.body;

    try {
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid order ID.",
            });
        }

        const customer = await customerModel.findOne({
            userId: req.user.id,
        });

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer profile not found.",
            });
        }

        const order = await orderModel.findOne({
            _id: orderId,
            customerId: customer._id,
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found.",
            });
        }

        await cancelPendingOrder(order, "customer");

        return res.json({
            success: true,
            message: "Order cancelled successfully.",
        });
    } catch (error) {
        console.error("Cancel order error:", error);
        return res.status(error.status || 500).json({
            success: false,
            message: error.status ? error.message : "Unable to cancel order.",
        });
    }
};

// Invoice is the payment record; update the order's display fields in the same transaction.
const updatePaymentStatus = (req, res) =>
    mutateOrder(req, res, async (order, session) => {
        const { amountReceived, completeDelivery = false } = req.body;
        if (
            typeof completeDelivery !== "boolean" ||
            typeof amountReceived !== "number" ||
            !Number.isFinite(amountReceived)
        )
            throw createHttpError("Nhập số tiền COD đã thu hợp lệ.");
        if (completeDelivery && !can(req.user, "order.deliver") && !can(req.user, "order.updateStatus"))
            throw createHttpError("Bạn chưa có quyền xác nhận giao hàng.", 403);
        if (
            !["DELIVERING", "COMPLETED"].includes(order.status) ||
            !order.deliveryStaffId ||
            order.paymentMethod !== "COD"
        )
            throw createHttpError("Chỉ ghi nhận COD khi đơn đang giao hoặc đã hoàn thành.", 409);
        const invoice = await requireInvoice(order, session);
        if (toCents(amountReceived) !== toCents(invoice.amount))
            throw createHttpError("Số tiền COD thực thu phải bằng tổng tiền phải thanh toán.");
        if (invoice.paymentStatus !== "PAID") {
            invoice.paymentStatus = "PAID";
            invoice.paidAmount = toCents(amountReceived) / 100;
            invoice.paidAt = new Date();
            invoice.paidBy = req.user.id;
            invoice.paidByName = req.user.name;
            await invoice.save({ session });
        }
        order.paymentStatus = "PAID";
        order.paidAt = invoice.paidAt;
        order.paidBy = invoice.paidBy;
        if (completeDelivery && order.status === "DELIVERING") {
            order.status = "COMPLETED";
            order.completedAt = new Date();
            order.completedBy = req.user.id;
        }
        await order.save({ session });
        return invoice;
    });

export {
    quoteOrder,
    guestOrder,
    lookupGuestOrder,
    cancelGuestOrder,
    placeOrder,
    userOrders,
    listOrders,
    listInvoices,
    updateStatus,
    cancelOrder,
    updatePaymentStatus,
    listDeliveryStaff,
    assignDelivery,
};

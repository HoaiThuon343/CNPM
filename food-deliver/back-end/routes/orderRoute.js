import express from "express";
import checkAuth from "../middleware/checkAuth.js";
import checkRole from "../middleware/checkRole.js";
import checkPermission from "../middleware/checkPermission.js";
import { getReport } from "../controllers/reportController.js";
import {
    quoteOrder,
    placeOrder,
    userOrders,
    listOrders,
    listInvoices,
    updateStatus,
    cancelOrder,
    updatePaymentStatus,
    guestOrder,
    lookupGuestOrder,
    cancelGuestOrder,
    listDeliveryStaff,
    assignDelivery,
} from "../controllers/orderController.js";

const orderRouter = express.Router();

// Codes are checked by the controller before reading or cancelling a guest order.
orderRouter.post("/guest", guestOrder);
orderRouter.post("/lookup", lookupGuestOrder);
orderRouter.post("/guest/cancel", cancelGuestOrder);

// Customer order operations
orderRouter.post("/quote", checkAuth, checkRole(["user"]), quoteOrder);
orderRouter.post("/place", checkAuth, checkRole(["user"]), placeOrder);
orderRouter.post("/userorders", checkAuth, checkRole(["user"]), userOrders);
orderRouter.post("/cancel", checkAuth, checkRole(["user"]), cancelOrder);

// Management operations
orderRouter.get("/invoices", checkAuth, checkPermission("invoice.view"), listInvoices);
orderRouter.get("/reports/:section", checkAuth, checkPermission("report.view"), getReport);
orderRouter.post("/reports", checkAuth, checkPermission("report.view"), (req, res) => {
    req.report = true;
    return listOrders(req, res);
});
orderRouter.post(
    "/list",
    checkAuth,
    checkPermission(["order.view", "order.deliver"]),
    listOrders,
);
orderRouter.get(
    "/delivery-staff",
    checkAuth,
    checkPermission("order.assignDelivery"),
    listDeliveryStaff,
);
orderRouter.post(
    "/assign",
    checkAuth,
    checkPermission("order.assignDelivery"),
    assignDelivery,
);
orderRouter.post(
    "/status",
    checkAuth,
    (req, res, next) => {
        const permission = {
            CONFIRMED: "order.confirm",
            PREPARING: "order.updateStatus",
            DELIVERING: ["order.updateStatus", "order.deliver"],
            COMPLETED: ["order.updateStatus", "order.deliver"],
        }[req.body.status];
        return checkPermission(permission)(req, res, next);
    },
    updateStatus,
);
orderRouter.post(
    "/payment",
    checkAuth,
    checkPermission("invoice.markPaid"),
    updatePaymentStatus,
);

export default orderRouter;

import express from "express";
import checkAuth from "../middleware/checkAuth.js";
import checkRole from "../middleware/checkRole.js";
import {
    placeOrder,
    userOrders,
    listOrders,
    updateStatus,
    cancelOrder,
    updatePaymentStatus
} from "../controllers/orderController.js";

const orderRouter = express.Router();

// Customer order operations
orderRouter.post("/place", checkAuth, checkRole(["user"]), placeOrder);
orderRouter.post("/userorders", checkAuth, checkRole(["user"]), userOrders);
orderRouter.post("/cancel", checkAuth, checkRole(["user"]), cancelOrder);

// Administrator order operations
orderRouter.post("/list", checkAuth, checkRole(["admin"]), listOrders);
orderRouter.post("/status", checkAuth, checkRole(["admin"]), updateStatus);
orderRouter.post("/payment", checkAuth, checkRole(["admin"]), updatePaymentStatus);

export default orderRouter;


import mongoose from "mongoose";

import userModel from "../models/userModel.js";
import customerModel from "../models/customerModel.js";
import productModel from "../models/productModel.js";
import cartModel from "../models/cartModel.js";
import cartDetailModel from "../models/cartDetailModel.js";

// Get or create Customer and Cart for the authenticated user
const getCustomerCart = async (userId) => {
    const user = await userModel.findById(userId);

    if (!user) {
        const error = new Error("User not found");
        error.status = 404;
        throw error;
    }

    const customer = await customerModel.findOneAndUpdate(
        { userId: user._id },
        {
            $setOnInsert: {
                userId: user._id
            }
        },
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true
        }
    );

    const cart = await cartModel.findOneAndUpdate(
        { customerId: customer._id },
        {
            $setOnInsert: {
                customerId: customer._id
            }
        },
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true
        }
    );

    await migrateLegacyCartData(user, cart._id);

    return cart;
};


// Migrate old User.cartData into CartDetail
const migrateLegacyCartData = async (user, cartId) => {
    const legacyCart = user.cartData;

    if (
        !legacyCart ||
        typeof legacyCart !== "object" ||
        Object.keys(legacyCart).length === 0
    ) {
        return;
    }

    const quantities = {};

    const addLegacyItem = (productId, value) => {
        const quantity = Number(value);

        if (
            mongoose.Types.ObjectId.isValid(productId) &&
            Number.isInteger(quantity) &&
            quantity > 0
        ) {
            quantities[productId] =
                (quantities[productId] || 0) + quantity;
        }
    };

    for (const [key, value] of Object.entries(legacyCart)) {
        // Support an old flat cart structure
        if (typeof value === "number" || typeof value === "string") {
            addLegacyItem(key, value);
        }

        // Support the old restaurantId -> productId -> quantity structure
        else if (
            value &&
            typeof value === "object" &&
            !Array.isArray(value)
        ) {
            for (const [productId, quantity] of Object.entries(value)) {
                addLegacyItem(productId, quantity);
            }
        }
    }

    const productIds = Object.keys(quantities);

    if (productIds.length > 0) {
        const existingProducts = await productModel.find({
            _id: { $in: productIds }
        }).select("_id").lean();

        const validProductIds = new Set(
            existingProducts.map(product => product._id.toString())
        );

        const operations = productIds
            .filter(productId => validProductIds.has(productId))
            .map(productId => ({
                updateOne: {
                    filter: {
                        cartId,
                        productId
                    },
                    update: {
                        $set: {
                            quantity: quantities[productId]
                        }
                    },
                    upsert: true
                }
            }));

        if (operations.length > 0) {
            await cartDetailModel.bulkWrite(operations);
        }
    }

    // Clear legacy data only after migration succeeds
    user.cartData = {};
    user.markModified("cartData");
    await user.save();
};


//  Chuyển đổi danh sách các tài liệu cartDetail thành một đối tượng với productId làm key và quantity làm value
const getCartItems = async (cartId) => {
    const details = await cartDetailModel.find({ cartId })
        .select("productId quantity")
        .lean();

    const cartItems = {};

    details.forEach(detail => {
        cartItems[detail.productId.toString()] = detail.quantity;
    });

    return cartItems;
};


// Thêm sản phẩm vào giỏ hàng
const addToCart = async (req, res) => {
    try {
        const { itemId, quantity = 1 } = req.body;
        const addQuantity = Number(quantity);

        if (!mongoose.Types.ObjectId.isValid(itemId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid product ID"
            });
        }

        if (!Number.isInteger(addQuantity) || addQuantity < 1) {
            return res.status(400).json({
                success: false,
                message: "Quantity must be a positive integer"
            });
        }

        const product = await productModel.findById(itemId);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        if (product.status !== "active") {
            return res.status(400).json({
                success: false,
                message: "Product is currently unavailable"
            });
        }

        const cart = await getCustomerCart(req.user.id);

        await cartDetailModel.findOneAndUpdate(
            {
                cartId: cart._id,
                productId: itemId
            },
            {
                $inc: {
                    quantity: addQuantity
                }
            },
            {
                new: true,
                upsert: true,
                runValidators: true,
                setDefaultsOnInsert: true
            }
        );

        const cartItems = await getCartItems(cart._id);

        return res.json({
            success: true,
            message: "Product added to cart",
            cartItems
        });

    } catch (error) {
        console.error("Add to cart error:", error);

        return res.status(error.status || 500).json({
            success: false,
            message: error.status ? error.message : "Unable to add product to cart"
        });
    }
};


// giảm số lượng sản phẩm đi 1 đơn vị
const removeFromCart = async (req, res) => {
    try {
        const { itemId } = req.body;

        if (!mongoose.Types.ObjectId.isValid(itemId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid product ID"
            });
        }

        const cart = await getCustomerCart(req.user.id);

        const detail = await cartDetailModel.findOne({
            cartId: cart._id,
            productId: itemId
        });

        if (detail) {
            if (detail.quantity > 1) {
                detail.quantity -= 1;
                await detail.save();
            } else {
                await cartDetailModel.deleteOne({
                    _id: detail._id
                });
            }
        }

        const cartItems = await getCartItems(cart._id);

        return res.json({
            success: true,
            message: "Cart quantity updated",
            cartItems
        });

    } catch (error) {
        console.error("Remove from cart error:", error);

        return res.status(error.status || 500).json({
            success: false,
            message: error.status ? error.message : "Unable to update cart"
        });
    }
};


// Lấy dữ liệu giỏ hàng hiện tại
const getCart = async (req, res) => {
    try {
        const cart = await getCustomerCart(req.user.id);
        const cartItems = await getCartItems(cart._id);

        return res.json({
            success: true,
            cartItems
        });

    } catch (error) {
        console.error("Get cart error:", error);

        return res.status(error.status || 500).json({
            success: false,
            message: error.status ? error.message : "Unable to load cart"
        });
    }
};


// Xóa hoàn toàn sản phẩm khỏi giỏ hàng
const deleteItem = async (req, res) => {
    try {
        const { itemId } = req.body;

        if (!mongoose.Types.ObjectId.isValid(itemId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid product ID"
            });
        }

        const cart = await getCustomerCart(req.user.id);

        await cartDetailModel.deleteOne({
            cartId: cart._id,
            productId: itemId
        });

        const cartItems = await getCartItems(cart._id);

        return res.json({
            success: true,
            message: "Product removed from cart",
            cartItems
        });

    } catch (error) {
        console.error("Delete cart item error:", error);

        return res.status(error.status || 500).json({
            success: false,
            message: error.status ? error.message : "Unable to remove product from cart"
        });
    }
};

export {
    addToCart,
    removeFromCart,
    getCart,
    deleteItem
};

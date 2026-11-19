import productModel from "../models/productModel.js";

// 1. Add product (Admin)
const addProduct = async (req, res) => {
    try {
        const { name, description, category, price } = req.body;

        if (!name?.trim() || !description?.trim() || !category?.trim()
            || !req.file || !Number.isFinite(Number(price)) || Number(price) < 0) {
            return res.status(400).json({ success: false, message: "Invalid product information" });
        }

        const product = new productModel({
            name,
            description,
            category,
            price: Number(price),
            image: req.file.filename
        });

        await product.save();
        res.json({ success: true, message: "Product item added", data: product });

    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Error adding product" });
    }
}

// 2. Product list (Admin)
const listProducts = async (req, res) => {
    try {
        const products = await productModel.find({}).sort({ createdAt: -1 });
        res.json({ success: true, data: products });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Error listing products" });
    }
}

// 3. Deactivate product (Admin)
const removeProduct = async (req, res) => {
    try {
        const product = await productModel.findByIdAndUpdate(
            req.body.id,
            { status: "inactive" },
            { new: true, runValidators: true }
        );

        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        res.json({ success: true, message: "Product deactivated" });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Error removing product" });
    }
}

// 4. Update product (Admin)
const updateProduct = async (req, res) => {
    try {
        const { id, name, description, category, price, status } = req.body;

        const updateData = { name, description, category, status };

        if (price !== undefined) {
            updateData.price = Number(price);
        }

        if (req.file) {
            updateData.image = req.file.filename;
        }

        const product = await productModel.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        res.json({ success: true, message: "Product updated", data: product });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Error updating product" });
    }
}

// 5. Get product by ID (Public)
const getProductById = async (req, res) => {
    try {
        const product = await productModel.findOne({
            _id: req.params.id,
            status: { $ne: "inactive" }
        });

        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        res.json({ success: true, data: product });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Error" });
    }
}

// 6. Product list by category (Public)
const listProductsByMenu = async (req, res) => {
    try {
        const products = await productModel.find({
            category: req.params.menuName,
            status: { $ne: "inactive" }
        });

        res.json({ success: true, data: products });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Error" });
    }
}

// 7. Product list for customers (Public)
const listAllProductsPublic = async (req, res) => {
    try {
        const products = await productModel.find({
            status: { $ne: "inactive" }
        });

        res.json({ success: true, data: products });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
}

// Compatibility aliases
const addFood = addProduct;
const listFood = listProducts;
const removeFood = removeProduct;
const updateFood = updateProduct;
const getFoodById = getProductById;
const listFoodByMenu = listProductsByMenu;
const listAllFoodPublic = listAllProductsPublic;

export {
    addProduct,
    listProducts,
    removeProduct,
    updateProduct,
    getProductById,
    listProductsByMenu,
    listAllProductsPublic,
    // Legacy compatibility aliases
    addFood,
    listFood,
    removeFood,
    updateFood,
    getFoodById,
    listFoodByMenu,
    listAllFoodPublic
};

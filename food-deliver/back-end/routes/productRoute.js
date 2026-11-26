import express from 'express';
import {
    addProduct,
    listProducts,
    removeProduct,
    updateProduct,
    getProductById,
    listProductsByMenu,
    listAllProductsPublic,
    listCategories, manageCategories, addCategory, updateCategory, removeCategory
} from '../controllers/productController.js';

import checkAuth from '../middleware/checkAuth.js';
import checkPermission from '../middleware/checkPermission.js';
import multer from 'multer';

const productRouter = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },
}).single('image');
const uploadImage = (req, res, next) => upload(req, res, error => {
    if (error) return res.status(400).json({ success: false, message: error.code === 'LIMIT_FILE_SIZE'
        ? 'Ảnh tối đa 2 MB.' : 'Không tải được ảnh. Chỉ gửi một ảnh món ăn.' });
    next();
});

// Admin product management
productRouter.get('/categories', listCategories);
productRouter.get('/categories/manage', checkAuth, checkPermission(['category.manage', 'product.view', 'product.create', 'product.update', 'product.delete']), manageCategories);
productRouter.post('/categories', checkAuth, checkPermission('category.manage'), addCategory);
productRouter.put('/categories/:id', checkAuth, checkPermission('category.manage'), updateCategory);
productRouter.delete('/categories/:id', checkAuth, checkPermission('category.manage'), removeCategory);
productRouter.post('/add', checkAuth, checkPermission('product.create'), uploadImage, addProduct);
productRouter.post('/remove', checkAuth, checkPermission('product.delete'), removeProduct);
productRouter.post('/update', checkAuth, checkPermission('product.update'), uploadImage, updateProduct);
productRouter.get('/list', checkAuth, checkPermission(['product.view', 'product.create', 'product.update', 'product.delete']), listProducts);

// Public customer product routes
productRouter.get("/get/:id", getProductById);
productRouter.get("/list/menu/:menuName", listProductsByMenu);
productRouter.get("/all", listAllProductsPublic);

// Compatibility alias
const foodRouter = productRouter;

export { productRouter, foodRouter };
export default productRouter;

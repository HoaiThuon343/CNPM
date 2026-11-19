import express from 'express';
import {
    addProduct,
    listProducts,
    removeProduct,
    updateProduct,
    getProductById,
    listProductsByMenu,
    listAllProductsPublic
} from '../controllers/productController.js';

import checkAuth from '../middleware/checkAuth.js';
import checkRole from '../middleware/checkRole.js';
import multer from 'multer';

const productRouter = express.Router();

const storage = multer.diskStorage({
    destination: "uploads",
    filename: (req, file, cb) => cb(null, `${Date.now()}${file.originalname}`)
});

const upload = multer({ storage });

// Admin product management
productRouter.post('/add', checkAuth, checkRole(['admin']), upload.single("image"), addProduct);
productRouter.post('/remove', checkAuth, checkRole(['admin']), removeProduct);
productRouter.post('/update', checkAuth, checkRole(['admin']), upload.single("image"), updateProduct);
productRouter.get('/list', checkAuth, checkRole(['admin']), listProducts);

// Public customer product routes
productRouter.get("/get/:id", getProductById);
productRouter.get("/list/menu/:menuName", listProductsByMenu);
productRouter.get("/all", listAllProductsPublic);

// Compatibility alias
const foodRouter = productRouter;

export { productRouter, foodRouter };
export default productRouter;

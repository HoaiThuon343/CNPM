import express from 'express';
import checkAuth from '../middleware/checkAuth.js';
import checkPermission from '../middleware/checkPermission.js';
import { listInventory, saveIngredient, saveSupplier, savePurchase, cancelPurchase, confirmPurchase } from '../controllers/inventoryController.js';

const router = express.Router();
router.use(checkAuth, checkPermission('inventory.view'));
router.get('/', listInventory);
router.post('/ingredients', checkPermission('inventory.manage'), saveIngredient);
router.put('/ingredients/:id', checkPermission('inventory.manage'), saveIngredient);
router.post('/suppliers', checkPermission('inventory.manage'), saveSupplier);
router.put('/suppliers/:id', checkPermission('inventory.manage'), saveSupplier);
router.post('/purchases', checkPermission('purchase.edit'), savePurchase);
router.put('/purchases/:id', checkPermission('purchase.edit'), savePurchase);
router.post('/purchases/:id/cancel', checkPermission('purchase.edit'), cancelPurchase);
router.post('/purchases/:id/confirm', checkPermission('purchase.confirm'), confirmPurchase);

export default router;

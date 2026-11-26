import express from 'express';
import checkAuth from '../middleware/checkAuth.js';
import checkPermission from '../middleware/checkPermission.js';
import { listPromotions, publicPromotions, savePromotion, togglePromotion, promotionHistory } from '../controllers/promotionController.js';

const router = express.Router();
router.get('/available', publicPromotions);
router.use(checkAuth, checkPermission('promotion.manage'));
router.get('/', listPromotions);
router.post('/', savePromotion);
router.put('/:id', savePromotion);
router.patch('/:id/status', togglePromotion);
router.get('/:id/history', promotionHistory);

export default router;

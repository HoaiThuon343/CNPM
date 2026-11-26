import express from 'express';
import { loginUser, registerUser, getCurrentUser, removeUser, listUsers, updateUserStatus} from '../controllers/userController.js';
import checkAuth from '../middleware/checkAuth.js';
import checkRole from '../middleware/checkRole.js';
import checkPermission from '../middleware/checkPermission.js';
import { logoutUser, getProfile, saveProfile, saveAddress } from '../controllers/userController.js';
import { listRoles, saveRole, listStaff, getStaff, saveStaff, removeRole,
    availableAccounts, linkStaffAccount, assignStaffRole, staffActivity } from '../controllers/staffController.js';

const userRouter = express.Router();

userRouter.post('/login', loginUser);
userRouter.post('/register', registerUser); 
userRouter.get('/me', checkAuth, getCurrentUser);
userRouter.post('/logout', checkAuth, logoutUser);
userRouter.get('/profile', checkAuth, checkRole(['user']), getProfile);
userRouter.put('/profile', checkAuth, checkRole(['user']), saveProfile);
userRouter.post('/addresses', checkAuth, checkRole(['user']), saveAddress);
userRouter.put('/addresses/:id', checkAuth, checkRole(['user']), saveAddress);
userRouter.delete('/addresses/:id', checkAuth, checkRole(['user']), saveAddress);
userRouter.get('/roles', checkAuth, checkRole(['admin']), listRoles);
userRouter.post('/roles', checkAuth, checkRole(['admin']), saveRole);
userRouter.delete('/roles/:id', checkAuth, checkRole(['admin']), removeRole);
userRouter.get('/staff/activity', checkAuth, checkRole(['admin']), staffActivity);
userRouter.get('/staff/available-accounts', checkAuth, checkRole(['admin']), availableAccounts);
userRouter.get('/staff', checkAuth, checkPermission('staff.view'), listStaff);
userRouter.get('/staff/:id', checkAuth, checkPermission('staff.view'), getStaff);
userRouter.post('/staff', checkAuth, checkRole(['admin']), saveStaff);
userRouter.post('/staff/:id/account', checkAuth, checkRole(['admin']), linkStaffAccount);
userRouter.post('/staff/:id/role', checkAuth, checkRole(['admin']), assignStaffRole);

// Middleware chỉ cho phép admin truy cập
userRouter.post('/remove', checkAuth, checkRole(['admin']), removeUser); 
userRouter.get('/list', checkAuth, checkRole(['admin']), listUsers);
userRouter.post('/update-status', checkAuth, checkRole(['admin']), updateUserStatus);

export default userRouter;

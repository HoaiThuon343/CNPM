const checkRole = (allowedRoles) => (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập chức năng này.' });
    }
    next();
};

export default checkRole;

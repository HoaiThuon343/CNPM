const checkPermission = (permission) => (req, res, next) => {
    if (
        req.user?.role === 'admin' ||
        (req.user?.role === 'staff' &&
            [permission]
                .flat()
                .some((code) => code && req.user.permissions.includes(code)))
    ) {
        return next();
    }
    res.status(403).json({
        success: false,
        code: 'PERMISSION_DENIED',
        message: 'Bạn chưa được cấp quyền thực hiện thao tác này.',
    });
};

export default checkPermission;

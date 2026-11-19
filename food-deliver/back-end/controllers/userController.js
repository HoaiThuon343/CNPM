import customerModel from "../models/customerModel.js";
import userModel from "../models/userModel.js";
import restaurantProfileModel from "../models/restaurantProfile.js";
import jwt from "jsonwebtoken"
import bcrypt from "bcrypt"
import validator from "validator"

const createToken = (id, role) => {
    return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '1d' })
}

// login user
const loginUser = async (req,res) => {
    const {password, role} = req.body;
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    try {
        if (!validator.isEmail(email) || typeof password !== 'string' || !password) {
            return res.status(400).json({success:false,message:"Please enter a valid email and password"});
        }

        const user = await userModel.findOne({email});

        if (!user) {
            return res.status(401).json({success:false,message:"Invalid email or password"});
        }
        
        if (user.status === 'deactive') {
            return res.status(403).json({ success: false, message: "Account is deactivated." });
        }

        const isMatch = await bcrypt.compare(password,user.password);

        if(!isMatch) {
            return res.status(401).json({success:false,message:"Invalid email or password"});
        }

        if (role && user.role !== role) {
            return res.status(403).json({success:false,message:"This account cannot access this page"});
        }

        const token = createToken(user._id, user.role); 
        res.json({success:true, token, role: user.role }) 
    } catch (error) {
        console.log(error);
        res.status(500).json({success:false,message:"Unable to log in"});
    }
}

const getCurrentUser = (req, res) => {
    res.json({success:true, user:req.user});
}

// register customer

const registerUser = async (req, res) => {
    const { name, password, phone = "" } = req.body;
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    try {
        if (req.body.role && req.body.role !== 'user') {
            return res.status(400).json({success:false,message:"Only customer registration is allowed"});
        }

        const exists = await userModel.findOne({ email });

        if (exists) {
            return res.json({
                success: false,
                message: "User already exists"
            });
        }

        if (!email || !validator.isEmail(email)) {
            return res.json({
                success: false,
                message: "Please enter a valid email"
            });
        }

        if (typeof password !== "string" || password.length < 8) {
            return res.json({
                success: false,
                message: "Please enter a strong password"
            });
        }

        if (typeof name !== "string" || !name.trim()) {
            return res.json({
                success: false,
                message: "Please enter your name"
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new userModel({
            name: name.trim(),
            email,
            password: hashedPassword,
            role: "user"
        });

        const user = await newUser.save();

        try {
            await customerModel.create({
                userId: user._id,
                phone: typeof phone === "string" ? phone.trim() : ""
            });
        } catch (profileError) {
            await userModel.findByIdAndDelete(user._id);
            throw profileError;
        }

        const token = createToken(user._id, user.role);

        return res.json({
            success: true,
            token,
            role: user.role
        });

    } catch (error) {
        console.error("Register user error:", error);

        return res.json({
            success: false,
            message: "Error registering user"
        });
    }
}


// remove user (admin)
const removeUser = async (req, res) => {
    const { id } = req.body;
    try {
        const deletedUser = await userModel.findByIdAndDelete(id);
        if (deletedUser) {
            res.json({ success: true, message: "User deleted successfully" });
        } else {
            res.json({ success: false, message: "User not found" });
        }
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: "Error deleting user" });
    }
}

// list users (admin)
const listUsers = async (req, res) => {
    try {
        const users = await userModel.find({}).select('-password -cartData');
        res.json({ success: true, data: users });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: "Error fetching users" });
    }   
}

// update user status (admin)
const updateUserStatus = async (req, res) => {
    const { userId, status } = req.body;
    try {
        if (!['active', 'deactive'].includes(status)) {
            return res.status(400).json({success:false,message:"Invalid account status"});
        }

        const user = await userModel.findById(userId);
        if (!user) {
            return res.json({ success: false, message: "User not found" });
        }
        user.status = status;
        await user.save();
        res.json({ success: true, message: "User status updated" });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: "Error updating user status" });
    }
}

//admin register restaurant
const registerRestaurant = async (req, res) => {
    try {
        // Lấy dữ liệu từ FormData gửi lên
        const { 
            ownerName, email, password, // Thông tin User
            name, address, phone, description // Thông tin Profile quán
        } = req.body;

        const image_filename = req.file ? req.file.filename : "default.png";

        // 1. Kiểm tra xem email đã tồn tại chưa
        const exists = await userModel.findOne({ email });
        if (exists) {
            return res.json({ success: false, message: "Email đã tồn tại" });
        }

        // 2. Validate định dạng
        if (!validator.isEmail(email)) {
            return res.json({ success: false, message: "Email không hợp lệ" });
        }
        if (password.length < 6) {
            return res.json({ success: false, message: "Mật khẩu phải trên 6 ký tự" });
        }

        // 3. Mã hóa mật khẩu
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 4. TẠO USER (Role = 'restaurant')
        const newUser = new userModel({
            name: ownerName, // Tên chủ quán
            email: email,
            password: hashedPassword,
            role: "restaurant", // <-- Quan trọng
            status: "active"
        });

        const savedUser = await newUser.save();

        // 5. TẠO PROFILE NHÀ HÀNG (Liên kết với User vừa tạo)
        const newProfile = new restaurantProfileModel({
            restaurant: savedUser._id, // Lấy ID của user trên
            name: name, // Tên quán ăn
            address: address,
            phone: phone,
            description: description,
            image: image_filename
        });

        await newProfile.save();

        // Tạo token để tự động đăng nhập luôn nếu muốn (hoặc chỉ trả về success)
        const token = createToken(savedUser._id, savedUser.role);

        res.json({ success: true, token, message: "Đăng ký nhà hàng thành công!" });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: "Lỗi server" });
    }
}

export {loginUser,registerUser, getCurrentUser, removeUser, listUsers, updateUserStatus, registerRestaurant}

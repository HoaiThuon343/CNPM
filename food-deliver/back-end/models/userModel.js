import mongoose from "mongoose"

const userSchema = new mongoose.Schema({
    name:{type:String,required:true,trim:true},
    email:{type:String,required:true,unique:true,trim:true,lowercase:true},
    password:{type:String,required:true},
    status:{type:String,enum:['active','deactive'],default:"active"},
    role: {type: String, enum: ['user', 'restaurant', 'admin', 'staff'], default: 'user'},
    roleId: {type: mongoose.Schema.Types.ObjectId, ref: 'Role'},
    staffCode: {type: String, trim: true, unique: true, sparse: true},
    phone: {type: String, trim: true},
    sessionVersion: { type: Number, default: 0 },
    revokedSessions: [{ _id: false, hash: String, expiresAt: Date }],
    statusHistory: [{
        _id: false, status: String, changedAt: Date,
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    }],
    
    cartData: {
        type: Object, 
        default: {}
    }
},{minimize:false, timestamps:true})

userSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string', $gt: '' } } })

const userModel = mongoose.models.user || mongoose.model("user",userSchema);
export default userModel;

import mongoose from "mongoose"

const userSchema = new mongoose.Schema({
    name:{type:String,required:true,trim:true},
    email:{type:String,required:true,unique:true,trim:true,lowercase:true},
    password:{type:String,required:true},
    status:{type:String,enum:['active','deactive'],default:"active"},
    role: {type: String, enum: ['user', 'restaurant', 'admin'], default: 'user'},
    
    cartData: {
        type: Object, 
        default: {}
    }
},{minimize:false})

const userModel = mongoose.models.user || mongoose.model("user",userSchema);
export default userModel;

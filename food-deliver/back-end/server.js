import 'dotenv/config'
import express from "express"
import cors from "cors"
import { connectDB } from "./config/db.js"
import productRouter from "./routes/productRoute.js"
import userRouter from "./routes/userRoute.js"
import cartRouter from "./routes/cartRoute.js"
import orderRouter from "./routes/orderRoute.js"
import { initializeRoles } from "./models/roleModel.js"
import { initializeStaff } from './models/staffModel.js'
import orderModel from './models/orderModel.js'
import invoiceModel from './models/invoiceModel.js'
import categoryModel, { initializeCategories } from './models/categoryModel.js'
import droneRouter from "./routes/droneRoute.js"
import inventoryRouter from './routes/inventoryRoute.js'
import promotionRouter from './routes/promotionRoute.js'
import Promotion from './models/promotionModel.js'
import productModel from './models/productModel.js'
import { Ingredient, Purchase, Supplier } from './models/inventoryModel.js'

// app config
const app = express()
const port = 4000

// middleware
app.use(express.json())
app.use(cors())

// db connection
await connectDB()
await initializeRoles()
await initializeStaff()
await orderModel.init()
await orderModel.initializeCodeCounter()
await invoiceModel.init()
await invoiceModel.initializeCodeCounter()
await orderModel.upgradeLegacyCodes()
await invoiceModel.upgradeLegacyCodes()
await categoryModel.init()
await productModel.init()
await initializeCategories()
await Promise.all([Ingredient.init(), Supplier.init(), Purchase.init(), Promotion.init()])

// api endpoints
app.use("/api/product", productRouter)
app.use("/api/food", productRouter) // Temporary backward compatibility alias
app.use('/images', express.static('uploads'))
app.use("/api/user", userRouter)
app.use("/api/cart", cartRouter)
app.use("/api/order", orderRouter)
app.use("/api/drone", droneRouter)
app.use('/api/inventory', inventoryRouter)
app.use('/api/promotions', promotionRouter)

app.get("/", (req, res) => {
    res.send("API Working")
})

app.listen(port, () => {
    console.log(`Server Started on http://localhost:${port}`)
})

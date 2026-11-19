
import { useContext, useState } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import { StoreContext } from './context/storeContext.js'

import Navbar from './component/Navbar/Navbar.jsx'
import Footer from './component/Footer/Footer'
import LoginPopup from './component/LoginPopup/LoginPopup'

import Home from './pages/Home/Home'
import Menu from './pages/Menu/Menu.jsx'
import Cart from './pages/Cart/Cart'
import YourCart from './pages/YourCart/YourCart.jsx'
import PlaceOrder from './pages/PlaceOrder/PlaceOrder'
import Verify from './pages/Verify/Verify'
import MyOrders from './pages/MyOrders/MyOrders'

// Keep this import if ProductDetail.jsx exists at this path
import ProductDetail from './component/ProductDetail/ProductDetail'

const CustomerRoute = () => {
    const { token, role } = useContext(StoreContext)
    if (token && !role) return <p>Loading...</p>
    return token && role === 'user' ? <Outlet /> : <Navigate to="/home" replace />
}

const App = () => {
    const [showLogin, setShowLogin] = useState(false)

    return (
        <>
            {showLogin && (
                <LoginPopup setShowLogin={setShowLogin} />
            )}

            <ToastContainer />

            <div className="app">
                <Navbar setShowLogin={setShowLogin} />

                <Routes>
                    <Route path="/" element={<Navigate to="/home" replace />} />
                    <Route path="/home" element={<Home setShowLogin={setShowLogin} />} />
                    <Route path="/menu" element={<Menu setShowLogin={setShowLogin} />} />
                    <Route path="/product/:id" element={<ProductDetail />} />
                    <Route element={<CustomerRoute />}>
                        <Route path="/cart" element={<Cart />} />
                        <Route path="/yourcart" element={<YourCart />} />
                        <Route path="/order" element={<PlaceOrder />} />
                        <Route path="/verify" element={<Verify />} />
                        <Route path="/myorders" element={<MyOrders />} />
                    </Route>
                    <Route path="*" element={<Navigate to="/home" replace />} />
                </Routes>
            </div>

            <Footer />
        </>
    )
}

export default App

import { useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'

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
import Offers from './pages/Offers/Offers'
import Profile from './pages/Profile/Profile'

// Keep this import if ProductDetail.jsx exists at this path
import ProductDetail from './component/ProductDetail/ProductDetail'

const App = () => {
    const [showLogin, setShowLogin] = useState(false)
    const location = useLocation()

    return (
        <>
            {showLogin && <LoginPopup setShowLogin={setShowLogin} />}

            <ToastContainer />

            <div className="app">
                <Navbar setShowLogin={setShowLogin} />

                <Routes>
                    <Route path="/" element={<Navigate to="/home" replace />} />
                    <Route
                        path="/home"
                        element={<Home setShowLogin={setShowLogin} />}
                    />
                    <Route
                        path="/menu"
                        element={<Menu key={location.key} setShowLogin={setShowLogin} />}
                    />
                    <Route path="/product/:id" element={<ProductDetail />} />
                    <Route path="/cart" element={<Cart />} />
                    <Route path="/yourcart" element={<YourCart />} />
                    <Route path="/order" element={<PlaceOrder />} />
                    <Route path="/verify" element={<Verify />} />
                    <Route path="/myorders" element={<MyOrders />} />
                    <Route path="/offers" element={<Offers />} />
                    <Route path="/profile" element={<Profile />} />
                    <Route path="*" element={<Navigate to="/home" replace />} />
                </Routes>
            </div>

            <Footer />
        </>
    )
}

export default App

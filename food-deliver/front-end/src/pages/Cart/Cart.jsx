
import { useContext } from 'react'
import './Cart.css'
import { StoreContext } from '../../context/storeContext.js'
import { Navigate, useNavigate } from 'react-router-dom'

const Cart = () => {
    const {
        cartItems,
        product_list,
        loadingProductList,
        loadingCart,
        url,
        currency,
        deliveryCharge
    } = useContext(StoreContext)

    const navigate = useNavigate()

    const cartProducts = (product_list || []).filter(
        item => Number(cartItems?.[item._id]) > 0
    )

    const subtotal = cartProducts.reduce(
        (total, item) =>
            total + Number(item.price) * Number(cartItems[item._id]),
        0
    )

    const deliveryFee = cartProducts.length > 0 ? deliveryCharge : 0
    const total = subtotal + deliveryFee

    const formatPrice = price =>
        `${currency}${Number(price || 0).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`

    if (loadingProductList || loadingCart) {
        return <p className="cart-loading">Loading cart...</p>
    }

    if (cartProducts.length === 0) {
        return <Navigate to="/yourcart" replace />
    }

    return (
        <div className="cart">
            <div className="cart-items">
                <div className="cart-items-title">
                    <p>Image</p>
                    <p>Product</p>
                    <p>Price</p>
                    <p>Quantity</p>
                    <p>Total</p>
                </div>

                <hr />

                {cartProducts.map(item => {
                    const quantity = Number(cartItems[item._id])
                    const itemTotal = Number(item.price) * quantity

                    return (
                        <div key={item._id}>
                            <div className="cart-items-title cart-items-item">
                                <img
                                    src={`${url}/images/${item.image}`}
                                    alt={item.name}
                                />

                                <p>{item.name}</p>
                                <p>{formatPrice(item.price)}</p>
                                <p>{quantity}</p>
                                <p>{formatPrice(itemTotal)}</p>
                            </div>

                            <hr />
                        </div>
                    )
                })}
            </div>

            <div className="cart-bottom">
                <div className="cart-total">
                    <h2>Cart Total</h2>

                    <div>
                        <div className="cart-total-details">
                            <p>Subtotal</p>
                            <p>{formatPrice(subtotal)}</p>
                        </div>

                        <hr />

                        <div className="cart-total-details">
                            <p>Delivery Fee</p>
                            <p>{formatPrice(deliveryFee)}</p>
                        </div>

                        <hr />

                        <div className="cart-total-details">
                            <b>Total</b>
                            <b>{formatPrice(total)}</b>
                        </div>
                    </div>

                    <button onClick={() => navigate('/order')}>
                        PROCEED TO CHECKOUT
                    </button>
                </div>
            </div>
        </div>
    )
}

export default Cart

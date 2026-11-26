import { formatMoney as formatPrice, toCents } from '../../../../shared/money.js'

import { useContext, useState } from 'react'
import { toast } from 'react-toastify'
import './YourCart.css'
import { StoreContext } from '../../context/storeContext.js'
import { useNavigate } from 'react-router-dom'

const YourCart = () => {
    const {
        getTotalCartAmount,
        cartItems,
        product_list,
        loadingProductList,
        loadingCart,
        url,
        addToCart,
        removeFromCart,
        deleteItemFromCart,
        clearCart
    } = useContext(StoreContext)

    const navigate = useNavigate()
    const [updating, setUpdating] = useState(false)
    const hasItems = Object.values(cartItems).some(quantity => quantity > 0)

    const cartProducts = (product_list || []).filter(
        item => Number(cartItems?.[item._id]) > 0
    )

    const subtotal = getTotalCartAmount()

    const handleUpdate = async (action, itemId) => {
        if (updating) return
        setUpdating(true)
        try {
            await action(itemId)
        } catch (error) {
            toast.error(error.response?.data?.message || error.message || 'Failed to update cart.')
        } finally {
            setUpdating(false)
        }
    }

    const handleClear = () => {
        if (updating || !window.confirm('Remove all items from your cart?')) return
        handleUpdate(clearCart)
    }

    const handleCheckout = () => {
        if (cartProducts.length > 0) {
            navigate('/cart')
        }
    }

    if (loadingProductList || loadingCart) {
        return <p className="your-cart-loading">Loading cart...</p>
    }

    return (
        <div className="your-cart">
            <div className="cart-container">
                <div className="cart-heading">
                    <h2 className="cart-title">Your Cart</h2>
                    {hasItems && <button type="button" className="cart-clear" disabled={updating}
                        onClick={handleClear}>Clear cart</button>}
                </div>
                {cartProducts.length === 0 ? (
                    <div className="your-cart-empty">
                        <h2>Your cart is empty.</h2>
                        <p>Looks like you haven't added any products yet.</p>
                    </div>
                ) : (
                    <>
                        <p className="cart-subtitle">
                            Review your selected products before checkout.
                        </p>

                        <div className="cart-summary">
                            <div className="cart-items-list">
                                {cartProducts.map(item => {
                                    const quantity = Number(cartItems[item._id])
                                    const itemTotal = toCents(item.price) * quantity / 100
                                    const isAvailable = item.status === 'active'

                                    return (
                                        <div
                                            key={item._id}
                                            className="cart-item-row"
                                        >
                                            <img
                                                src={`${url}/images/${item.image}`}
                                                alt={item.name}
                                                className="cart-item-image"
                                            />

                                            <p className="cart-item-name">
                                                {item.name}
                                            </p>

                                            <p className="cart-item-price">
                                                {formatPrice(item.price)}
                                            </p>

                                            <div className="quantity-control">
                                                <button
                                                    onClick={() => handleUpdate(removeFromCart, item._id)}
                                                    disabled={updating}
                                                    aria-label={`Decrease ${item.name} quantity`}
                                                >
                                                    -
                                                </button>

                                                <span>{quantity}</span>

                                                <button
                                                    onClick={() => handleUpdate(addToCart, item._id)}
                                                    disabled={updating || !isAvailable}
                                                    aria-label={`Increase ${item.name} quantity`}
                                                >
                                                    +
                                                </button>
                                            </div>

                                            <p className="cart-item-total">
                                                {formatPrice(itemTotal)}
                                            </p>

                                            <button
                                                className="cart-item-remove"
                                                onClick={() => handleUpdate(deleteItemFromCart, item._id)}
                                                disabled={updating}
                                                aria-label={`Remove ${item.name}`}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>

                            <div className="cart-footer">
                                <div className="cart-subtotal">
                                    <p>Subtotal</p>
                                    <p>{formatPrice(subtotal)}</p>
                                </div>

                                <button onClick={handleCheckout} disabled={updating}>
                                    PROCEED TO CHECKOUT
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

export default YourCart


import { useContext } from 'react'
import { toast } from 'react-toastify'
import './YourCart.css'
import { StoreContext } from '../../context/storeContext.js'
import { useNavigate } from 'react-router-dom'

const YourCart = () => {
    const {
        cartItems,
        product_list,
        loadingProductList,
        loadingCart,
        url,
        currency,
        addToCart,
        removeFromCart,
        deleteItemFromCart
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

    const formatPrice = price =>
        `${currency}${Number(price || 0).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`

    const handleIncrease = async (itemId) => {
        try {
            await addToCart(itemId)
        } catch (error) {
            toast.error(error.message || 'Failed to update cart.')
        }
    }

    const handleDecrease = async (itemId) => {
        try {
            await removeFromCart(itemId)
        } catch (error) {
            toast.error(error.message || 'Failed to update cart.')
        }
    }

    const handleRemove = async (itemId) => {
        try {
            await deleteItemFromCart(itemId)
        } catch (error) {
            toast.error(error.message || 'Failed to remove product.')
        }
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
                {cartProducts.length === 0 ? (
                    <div className="your-cart-empty">
                        <h2>Your cart is empty.</h2>
                        <p>Looks like you haven't added any products yet.</p>
                    </div>
                ) : (
                    <>
                        <h2 className="cart-title">Your Cart</h2>

                        <p className="cart-subtitle">
                            Review your selected products before checkout.
                        </p>

                        <div className="cart-summary">
                            <div className="cart-items-list">
                                {cartProducts.map(item => {
                                    const quantity = Number(cartItems[item._id])
                                    const itemTotal = Number(item.price) * quantity
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
                                                    onClick={() => handleDecrease(item._id)}
                                                    aria-label={`Decrease ${item.name} quantity`}
                                                >
                                                    -
                                                </button>

                                                <span>{quantity}</span>

                                                <button
                                                    onClick={() => handleIncrease(item._id)}
                                                    disabled={!isAvailable}
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
                                                onClick={() => handleRemove(item._id)}
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

                                <button onClick={handleCheckout}>
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

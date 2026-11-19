
import { useContext, useState } from 'react'
import { StoreContext } from '../../context/storeContext'
import { assets } from '../../assets/assets'
import { toast } from 'react-toastify'
import './ProductDetail.css'

const ProductDetail = ({ product, onClose }) => {
    const { url, addToCart, token, setShowLogin } = useContext(StoreContext)
    const [localQuantity, setLocalQuantity] = useState(1)

    const isAvailable =
        product?.status !== 'out_of_stock' &&
        product?.status !== 'inactive'

    const handleAddToCart = async () => {
        if (!token) {
            toast.info('Please log in to add items to your cart.')
            setShowLogin(true)
            return
        }

        if (!isAvailable) return

        try {
            await addToCart(product._id, localQuantity)
            toast.success(`Added ${localQuantity} ${product.name} to cart!`)
            onClose()
        } catch (error) {
            console.error('Failed to add item to cart:', error)
            toast.error('Failed to add item to cart.')
        }
    }

    if (!product) return null

    return (
        <div
            className="food-item-detail-overlay"
            onClick={onClose}
        >
            <div
                className="food-item-detail-content animate-fade-in"
                onClick={e => e.stopPropagation()}
            >
                <button
                    type="button"
                    className="food-item-detail-close-icon"
                    onClick={onClose}
                    aria-label="Close product details"
                >
                    <img src={assets.cross_icon} alt="" />
                </button>

                <div className="food-item-detail-body">
                    <div className="food-item-detail-image-wrapper">
                        <img
                            className="food-item-detail-image"
                            src={`${url}/images/${product.image}`}
                            alt={product.name}
                            onError={e => {
                                e.currentTarget.src =
                                    'https://placehold.co/400x400/eeeeee/cccccc?text=Image+Not+Found'
                            }}
                        />
                    </div>

                    <div className="food-item-detail-info">
                        <h2 className="food-item-detail-name">
                            {product.name}
                        </h2>

                        <p className="food-item-detail-price">
                            {Number(product.price).toLocaleString('en-US')} VND
                        </p>

                        <p className="food-item-detail-desc">
                            {product.description}
                        </p>

                        <div className="food-item-detail-quantity-section">
                            <div className="food-item-detail-counter">
                                <img
                                    src={assets.remove_icon_red}
                                    alt="Decrease quantity"
                                    onClick={() =>
                                        setLocalQuantity(prev => Math.max(1, prev - 1))
                                    }
                                    className="counter-icon"
                                />

                                <span className="counter-quantity">
                                    {localQuantity}
                                </span>

                                <img
                                    src={assets.add_icon_green}
                                    alt="Increase quantity"
                                    onClick={() =>
                                        setLocalQuantity(prev => prev + 1)
                                    }
                                    className="counter-icon"
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleAddToCart}
                            className="food-item-detail-button"
                            disabled={!isAvailable}
                        >
                            {isAvailable ? 'Add to Cart' : 'Out of Stock'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default ProductDetail

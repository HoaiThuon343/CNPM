import { useContext, useEffect, useState } from 'react'
import { StoreContext } from '../../context/storeContext'
import { assets } from '../../assets/assets'
import { toast } from 'react-toastify'
import './ProductDetail.css'
import { formatMoney } from '../../../../shared/money.js'
import axios from 'axios'
import { useNavigate, useParams } from 'react-router-dom'

const ProductDetail = ({ product: selectedProduct, onClose }) => {
    const { url, addToCart } = useContext(StoreContext)
    const { id } = useParams()
    const navigate = useNavigate()
    const [loadedProduct, setLoadedProduct] = useState(null)
    const [error, setError] = useState('')
    const product = selectedProduct || loadedProduct
    const close = onClose || (() => navigate('/menu'))
    useEffect(() => {
        if (!id || selectedProduct) return
        const controller = new AbortController()
        axios.get(`${url}/api/product/get/${id}`, { signal: controller.signal })
            .then(({ data }) => setLoadedProduct(data.data))
            .catch(error => { if (!axios.isCancel(error)) setError(error.response?.data?.message || 'Could not load product.') })
        return () => controller.abort()
    }, [url, id, selectedProduct])
    const [localQuantity, setLocalQuantity] = useState(1)
    useEffect(() => {
        if (!product) return
        const previous = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = previous
        }
    }, [product])

    const isAvailable = product?.status !== 'out_of_stock' && product?.status !== 'inactive'

    const handleAddToCart = async () => {
        if (!isAvailable) return

        try {
            await addToCart(product._id, localQuantity)
            toast.success(`Added ${localQuantity} ${product.name} to cart!`)
            close()
        } catch (error) {
            console.error('Failed to add item to cart:', error)
            toast.error('Failed to add item to cart.')
        }
    }

    if (!product) return id ? <section><p role={error ? 'alert' : 'status'}>{error || 'Loading product…'}</p>
        <button onClick={close}>Back to menu</button></section> : null

    return (
        <div
            className="food-item-detail-overlay"
            onClick={close}
            onKeyDown={(event) => {
                if (event.key === 'Escape') close()
            }}
        >
            <div
                className="food-item-detail-content animate-fade-in"
                role="dialog"
                aria-modal="true"
                aria-labelledby="product-detail-title"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    autoFocus
                    className="food-item-detail-close-icon"
                    onClick={close}
                    aria-label="Close product details"
                >
                    <img src={assets.cross_icon} alt="" />
                </button>

                <div className="food-item-detail-body">
                    <div className="food-item-detail-image-wrapper">
                        {product.image ? <img
                            className="food-item-detail-image"
                            src={`${url}/images/${product.image}`}
                            alt={product.name}
                            onError={(e) => {
                                e.currentTarget.src =
                                    'https://placehold.co/400x400/eeeeee/cccccc?text=Image+Not+Found'
                            }}
                        /> : <p>No image available</p>}
                    </div>

                    <div className="food-item-detail-info">
                        <h2 className="food-item-detail-name" id="product-detail-title">
                            {product.name}
                        </h2>

                        <p className="food-item-detail-price">{formatMoney(product.price)}</p>

                        <p className="food-item-detail-desc">{product.description}</p>
                        <p>{product.category} · {isAvailable ? 'Available' : 'Out of stock'}</p>
                        {product.attributes && <p className="food-item-detail-desc" style={{ whiteSpace: 'pre-line' }}>{product.attributes}</p>}

                        <div className="food-item-detail-quantity-section">
                            <div className="food-item-detail-counter">
                                <img
                                    src={assets.remove_icon_red}
                                    alt="Decrease quantity"
                                    onClick={() => setLocalQuantity((prev) => Math.max(1, prev - 1))}
                                    className="counter-icon"
                                />

                                <span className="counter-quantity">{localQuantity}</span>

                                <img
                                    src={assets.add_icon_green}
                                    alt="Increase quantity"
                                    onClick={() => setLocalQuantity((prev) => prev + 1)}
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

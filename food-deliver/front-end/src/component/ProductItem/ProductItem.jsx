import { useContext, useState } from 'react'
import './ProductItem.css'
import { assets } from '../../assets/assets'
import { StoreContext } from '../../context/storeContext'
import { toast } from 'react-toastify'
import { formatMoney } from '../../../../shared/money.js'

const ProductItem = ({ id, name, price, description, image, setSelectedProduct, item }) => {
    const { addToCart, url } = useContext(StoreContext)
    const [localQuantity, setLocalQuantity] = useState(1)

    const isAvailable = item?.status !== 'out_of_stock' && item?.status !== 'inactive'

    const handleSelectProduct = () => {
        if (setSelectedProduct) {
            setSelectedProduct(item)
        }
    }

    const handleUpdateCart = async () => {
        if (!isAvailable) {
            toast.info('This product is currently unavailable.')
            return
        }

        try {
            await addToCart(id, localQuantity)
            toast.success(`Added ${localQuantity} ${name} to cart!`)
            setLocalQuantity(1)
        } catch (error) {
            console.error('Failed to add item to cart:', error)
            toast.error('Failed to add item to cart.')
        }
    }

    return (
        <article className="food-item">
            <button
                type="button"
                className="food-item-preview"
                onClick={handleSelectProduct}
                aria-label={`View details: ${name}`}
            >
                <span className="food-item-img-container">
                    {image ? <img className="food-item-image" src={`${url}/images/${image}`} alt={name} /> :
                        <span className="food-item-image" style={{ display: 'grid', placeItems: 'center' }}>No image available</span>}
                </span>
                <span className="food-item-summary">
                    <strong className="food-item-name">{name}</strong>
                    <span className="food-item-desc">{description}</span>
                    <span>{item.category}{isAvailable ? '' : ' · Out of stock'}</span>
                </span>
            </button>
            <div className="food-item-info">
                <div className="food-item-counter">
                    <button
                        type="button"
                        aria-label={`Decrease quantity: ${name}`}
                        disabled={!isAvailable || localQuantity <= 1}
                        onClick={() => setLocalQuantity((previous) => Math.max(1, previous - 1))}
                    >
                        <img src={assets.remove_icon_red} alt="" />
                    </button>
                    <span>{localQuantity}</span>
                    <button
                        type="button"
                        aria-label={`Increase quantity: ${name}`}
                        disabled={!isAvailable}
                        onClick={() => setLocalQuantity((previous) => previous + 1)}
                    >
                        <img src={assets.add_icon_green} alt="" />
                    </button>
                </div>
                <div className="food-item-price-counter">
                    <p className="food-item-price">{formatMoney(price)}</p>
                    <button
                        type="button"
                        className="add-cart-btn"
                        onClick={handleUpdateCart}
                        disabled={!isAvailable}
                    >
                        {isAvailable ? 'Add to Cart' : 'Out of Stock'}
                    </button>
                </div>
            </div>
        </article>
    )
}

export default ProductItem

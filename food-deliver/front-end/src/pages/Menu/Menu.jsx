import React, { useState } from 'react'
import './Menu.css'
import ExploreMenu from '../../component/ExploreMenu/ExploreMenu'
import ProductDisplay from '../../component/ProductDisplay/ProductDisplay'
import ProductDetail from '../../component/ProductDetail/ProductDetail'

const Menu = ({ setShowLogin }) => {

  const [category, setCategory] = useState('All')
  const [keyword, setKeyword] = useState('')
  const [sortBy, setSortBy] = useState('default')
  const [selectedProduct, setSelectedProduct] = useState(null)

  return (
    <div className="menu-page">

      <div className="menu-toolbar">
        <input
          type="text"
          placeholder="Search dishes..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="default">Default</option>
          <option value="name">Name A - Z</option>
          <option value="priceAsc">Price: Low to High</option>
          <option value="priceDesc">Price: High to Low</option>
        </select>
      </div>

      <ExploreMenu
        category={category}
        setCategory={setCategory}
      />

      <ProductDisplay
        category={category}
        keyword={keyword}
        sortBy={sortBy}
        setShowLogin={setShowLogin}
        setSelectedProduct={setSelectedProduct}
      />

      <ProductDetail
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />

    </div>
  )
}

export default Menu

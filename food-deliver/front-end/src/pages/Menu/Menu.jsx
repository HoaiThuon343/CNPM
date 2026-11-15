// import React , {useState} from 'react'
// import './Menu.css'
// import ExploreMenu from '../../component/ExploreMenu/ExploreMenu'
// import FoodDisplay from '../../component/FoodDisplay/FoodDisplay'
// import FoodItemDetail from '../../component/FoodItemDetail/FoodItemDetail'

// const Menu = ({setShowLogin}) => {

//   const [category,setCategory] = useState('All')
//   const [selectedFoodItem, setSelectedFoodItem] = useState(null);

//   return (
//     <div>
//       <ExploreMenu category={category} setCategory={setCategory} />
//       <FoodDisplay category={category} setShowLogin={setShowLogin} setSelectedFoodItem={setSelectedFoodItem}/>

//       <FoodItemDetail 
//         foodItem={selectedFoodItem} 
//         onClose={() => setSelectedFoodItem(null)} 
//       />
//     </div>
//   )
// }

// export default Menu

import React, { useState } from 'react'
import './Menu.css'
import ExploreMenu from '../../component/ExploreMenu/ExploreMenu'
import FoodDisplay from '../../component/FoodDisplay/FoodDisplay'
import FoodItemDetail from '../../component/FoodItemDetail/FoodItemDetail'

const Menu = ({ setShowLogin }) => {

  const [category, setCategory] = useState('All')
  const [keyword, setKeyword] = useState('')
  const [sortBy, setSortBy] = useState('default')
  const [selectedFoodItem, setSelectedFoodItem] = useState(null)

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

      <FoodDisplay
        category={category}
        keyword={keyword}
        sortBy={sortBy}
        setShowLogin={setShowLogin}
        setSelectedFoodItem={setSelectedFoodItem}
      />

      <FoodItemDetail
        foodItem={selectedFoodItem}
        onClose={() => setSelectedFoodItem(null)}
      />

    </div>
  )
}

export default Menu
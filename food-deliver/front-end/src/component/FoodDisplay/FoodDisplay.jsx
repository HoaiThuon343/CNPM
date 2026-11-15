// import React, { useContext } from 'react'
// import './FoodDisplay.css'
// import FoodItem from '../FoodItem/FoodItem'
// import { StoreContext } from '../../context/StoreContext'

// const FoodDisplay = ({category, setShowLogin, setSelectedFoodItem}) => { 
//     const {food_list} = useContext(StoreContext)
//   return (
//     <div className='food-display'>
//         <div className="food-display-list">
//             {food_list.map((item,index)=>{
//               if (category==='All'|| item.category===category) {

//                 return <FoodItem 
//                           key={index} 
//                           id={item._id} 
//                           name={item.name} 
//                           price={item.price} 
//                           description={item.description} 
//                           image={item.image}
//                           setShowLogin={setShowLogin}
//                           setSelectedFoodItem={setSelectedFoodItem}
//                           item={item}
//                           restaurantName={item.restaurantName}
//                        /> 
//               }

//             })}
//         </div>
//     </div>
//   )
// }

// export default FoodDisplay

import React, { useContext } from 'react'
import './FoodDisplay.css'
import FoodItem from '../FoodItem/FoodItem'
import { StoreContext } from '../../context/StoreContext'

const FoodDisplay = ({
  category,
  keyword,
  sortBy,
  setShowLogin,
  setSelectedFoodItem
}) => {

  const { food_list, loadingFoodList } = useContext(StoreContext)

  const filteredFoods = food_list
    .filter(item => {
      const matchCategory =
        category === 'All' || item.category === category

      const searchText =
        `${item.name || ''} ${item.description || ''}`.toLowerCase()

      const matchKeyword =
        searchText.includes(keyword.trim().toLowerCase())

      const isVisible = item.status !== 'inactive'

      return matchCategory && matchKeyword && isVisible
    })
    .sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name, 'en')
      }

      if (sortBy === 'priceAsc') {
        return a.price - b.price
      }

      if (sortBy === 'priceDesc') {
        return b.price - a.price
      }

      return 0
    })

  if (loadingFoodList) {
    return <p>Loading menu...</p>
  }

  return (
    <div className="food-display">
      <h2>Our Menu</h2>

      <div className="food-display-list">
        {filteredFoods.length > 0 ? (
          filteredFoods.map(item => (
            <FoodItem
              key={item._id}
              id={item._id}
              name={item.name}
              price={item.price}
              description={item.description}
              image={item.image}
              setShowLogin={setShowLogin}
              setSelectedFoodItem={setSelectedFoodItem}
              item={item}
              restaurantName={item.restaurantName}
            />
          ))
        ) : (
          <p>No matching dishes found.</p>
        )}
      </div>
    </div>
  )
}

export default FoodDisplay
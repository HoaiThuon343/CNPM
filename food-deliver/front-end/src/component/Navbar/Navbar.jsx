import { useContext } from 'react'
import './Navbar.css'
import { assets } from '../../assets/assets'
import brandIcon from '../../../../shared/Icon.svg'
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { StoreContext } from '../../context/storeContext';
import { toast } from 'react-toastify';
import axios from 'axios';

const Navbar = ({setShowLogin}) => {

    const {getTotalCartAmount,token,url,logout:clearLogin} = useContext(StoreContext);

    const navigate = useNavigate();
    const logout = async () => {
      try {
        await axios.post(`${url}/api/user/logout`, {}, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 });
      } catch (error) {
        if (error.response?.status !== 401 && error.response?.data?.code !== 'ACCOUNT_DISABLED') {
          toast.error('Could not sign out. Please try again.');
          return;
        }
      }
      toast.success("Logged out successfully!");
      clearLogin();
      navigate("/");
    }

  return (
    <div className='navbar'>
     <Link to='/home' aria-label='FB - Home'><img src={brandIcon} alt="FB" className='logo'/></Link>
     <ul className="navbar-menu">
        <NavLink to='/home'>Home</NavLink>
        <NavLink to='/menu'>Menu</NavLink>
        <NavLink to='/myorders'>Track an order</NavLink>
        <NavLink to='/offers'>Offers</NavLink>
     </ul>
     <div className="navbar-right">
        <NavLink to='/offers' className='mobile-order-link'>Offers</NavLink>
        <NavLink to='/myorders' className='mobile-order-link'>Track an order</NavLink>
        <img src={assets.search_icon} alt="" className='search-icon' />
        
        <div className="navbar-search-icon">
            <img 
              onClick={() => navigate('/yourcart')}
              src={assets.basket_icon} 
              alt="" 
            />
            <div className={getTotalCartAmount()===0?"":"dot"} ></div>
         </div>
        {!token?<button onClick={()=>setShowLogin(true)}>Sign In</button>
        :<div className='navbar-profile'>
            <img src={assets.profile_icon} alt="" />
            <ul className="nav-profile-dropdown">
               <li onClick={()=>navigate('/profile')}><img src={assets.profile_icon} alt="" /><p>Profile & addresses</p></li>
               <li onClick={()=>navigate('/myorders')}><img src={assets.order} alt="" /><p>Orders</p></li>
               <hr />
               <li onClick={logout}><img src={assets.logout} alt="" /><p>Logout</p></li>
            </ul>
         </div>}
        
     </div>
        </div>
  )
}

export default Navbar

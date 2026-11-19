
import './Navbar.css'
import { assets } from '../../assets/assets'

const Navbar = ({ onLogout }) => {
    return (
        <div className="navbar">
            <img
                className="logo"
                src={assets.logo}
                alt="Restaurant Logo"
            />

            <div className="navbar-right">
                <p>Admin Panel</p>

                <button
                    className="navbar-logout"
                    onClick={onLogout}
                >
                    Logout
                </button>
            </div>
        </div>
    )
}

export default Navbar

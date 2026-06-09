import { Link, useNavigate } from "react-router-dom";
import { ShoppingBag, Receipt, LogOut, UtensilsCrossed } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";

export default function Navbar() {
  const { isAuthed, username, logout } = useAuth();
  const { count } = useCart();
  const nav = useNavigate();

  return (
    <nav className="nav">
      <div className="container nav-inner">
        <Link to="/" className="brand">
          <UtensilsCrossed size={22} /> Food<span className="dot">Express</span>
        </Link>
        <div className="nav-links">
          <Link to="/cart" className="nav-btn">
            <ShoppingBag size={18} />
            <span className="label">Cart</span>
            {count > 0 && <span className="cart-badge">{count}</span>}
          </Link>
          {isAuthed ? (
            <>
              <Link to="/orders" className="nav-btn">
                <Receipt size={18} /> <span className="label">Orders</span>
              </Link>
              <button className="nav-btn" onClick={() => { logout(); nav("/"); }}>
                <LogOut size={18} /> <span className="label">{username}</span>
              </button>
            </>
          ) : (
            <Link to="/login" className="nav-btn primary">Sign in</Link>
          )}
        </div>
      </div>
    </nav>
  );
}

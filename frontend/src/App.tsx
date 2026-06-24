import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import RestaurantDetail from "./pages/RestaurantDetail";
import Cart from "./pages/Cart";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Orders from "./pages/Orders";
import ChatBot from "./components/ChatBot";

// Route table — each path maps to a backend resource:
//   /                -> GET /restaurants/
//   /restaurant/:id  -> GET /restaurants/:id/
//   /cart            -> POST /orders/
//   /orders          -> GET /orders/
//   /login,/register -> POST /auth/login|register/
export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/restaurant/:id" element={<RestaurantDetail />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Routes>
      <footer className="footer">
        <div className="container">FoodExpress — a full-stack demo. Django + DRF · React + TypeScript.</div>
      </footer>
      <ChatBot />
    </>
  );
}

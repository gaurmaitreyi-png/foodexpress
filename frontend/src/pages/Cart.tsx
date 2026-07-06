import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import toast from "react-hot-toast";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import api from "../api/client";
import { payForOrder } from "../lib/payment";

export default function Cart() {
  const { lines, restaurantId, add, remove, clear, total } = useCart();
  const { isAuthed, username } = useAuth();
  const [address, setAddress] = useState("");
  const [placing, setPlacing] = useState(false);
  const nav = useNavigate();

  async function placeOrder() {
    if (!isAuthed) { toast.error("Please sign in to order"); nav("/login"); return; }
    if (!address.trim()) { toast.error("Add a delivery address"); return; }
    setPlacing(true);
    try {
      // 1) Create the order (PENDING / UNPAID)
      const { data: order } = await api.post("/orders/", {
        restaurant: restaurantId,
        delivery_address: address,
        items: lines.map((l) => ({ menu_item: l.item.id, quantity: l.quantity })),
      });
      // 2) Pay for it via Razorpay (or test-mode simulate when no keys)
      toast.loading("Opening payment…", { id: "pay" });
      await payForOrder(order.id, { name: username ?? undefined });
      toast.success("Payment successful — order confirmed!", { id: "pay" });
      clear();
      nav("/orders");
    } catch (err: any) {
      const msg = err?.message === "Payment cancelled"
        ? "Payment cancelled — your order is saved as unpaid."
        : "Could not complete the order";
      toast.error(msg, { id: "pay" });
      // If the order was created but payment failed/cancelled, still show it.
      if (err?.message === "Payment cancelled") { clear(); nav("/orders"); }
    } finally {
      setPlacing(false);
    }
  }

  if (lines.length === 0)
    return (
      <div className="empty-cart">
        <div className="empty-cart-icon">
          <ShoppingBag size={56} strokeWidth={1.5} />
        </div>
        <h2>Your cart is empty</h2>
        <p>Find something delicious to get started — browse the kitchens near you.</p>
        <button className="btn dark" onClick={() => nav("/")} style={{ marginTop: 20 }}>
          Browse restaurants
        </button>
      </div>
    );

  return (
    <main className="container" style={{ maxWidth: 640, marginTop: 40 }}>
      <h1 style={{ fontSize: "2rem", marginBottom: 20 }}>Your order</h1>
      <div className="panel">
        {lines.map((l) => (
          <div className="cart-line" key={l.item.id}>
            <div>
              <strong>{l.item.name}</strong>
              <div style={{ color: "var(--ink-soft)", fontSize: "0.9rem" }}>₹{l.item.price} each</div>
            </div>
            <div className="qty">
              <button onClick={() => remove(l.item.id)}><Minus size={14} /></button>
              <span>{l.quantity}</span>
              <button onClick={() => add(l.item)}><Plus size={14} /></button>
            </div>
          </div>
        ))}
        <div className="cart-total"><span>Total</span><span>₹{total.toFixed(2)}</span></div>
        <label htmlFor="addr">Delivery address</label>
        <textarea id="addr" rows={3} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Flat, street, area, city" />
        <button className="btn block dark" style={{ marginTop: 16 }} onClick={placeOrder} disabled={placing}>
          {placing ? "Processing…" : `Pay & place order · ₹${total.toFixed(2)}`}
        </button>
        <p style={{ textAlign: "center", color: "var(--ink-soft)", fontSize: "0.8rem", marginTop: 10 }}>
          Secure checkout via Razorpay
        </p>
      </div>
    </main>
  );
}

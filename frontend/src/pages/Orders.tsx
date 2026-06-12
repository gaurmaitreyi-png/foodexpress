import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import api from "../api/client";
import { Order } from "../types";
import { useAuth } from "../context/AuthContext";
import OrderProgress from "../components/OrderProgress";

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const { isAuthed } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (!isAuthed) { nav("/login"); return; }
    api.get<Order[]>("/orders/")
      .then((res) => setOrders(res.data))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [isAuthed]);

  async function cancel(id: number) {
    try {
      const res = await api.post<Order>(`/orders/${id}/cancel/`);
      setOrders((prev) => prev.map((o) => (o.id === id ? res.data : o)));
      toast.success("Order cancelled");
    } catch {
      toast.error("Cannot cancel this order");
    }
  }

  if (loading) return <div className="center-load">Loading your orders…</div>;
  if (orders.length === 0)
    return <div className="empty"><h2>No orders yet</h2><p>Your past orders will show up here.</p></div>;

  return (
    <main className="container" style={{ maxWidth: 700, marginTop: 40 }}>
      <h1 style={{ fontSize: "2rem", marginBottom: 24 }}>Your orders</h1>
      {orders.map((o) => (
        <div className="order-card" key={o.id}>
          <div className="order-top">
            <strong>{o.restaurant_name}</strong>
            <span className={`status ${o.status}`}>{o.status.replace(/_/g, " ")}</span>
          </div>
          <div style={{ color: "var(--ink-soft)", fontSize: "0.9rem", margin: "8px 0 16px" }}>
            {o.items.map((i) => `${i.quantity}× ${i.menu_item_name}`).join(", ")}
          </div>

          <OrderProgress status={o.status} />

          <div className="order-top" style={{ marginTop: 16 }}>
            <span style={{ fontWeight: 700 }}>₹{o.total_price}</span>
            {!["DELIVERED", "CANCELLED"].includes(o.status) && (
              <button className="nav-btn" style={{ color: "var(--chili)" }} onClick={() => cancel(o.id)}>Cancel</button>
            )}
          </div>
        </div>
      ))}
    </main>
  );
}

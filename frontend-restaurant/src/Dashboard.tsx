import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import api from "./api";

interface OrderItem { id: number; menu_item_name: string; quantity: number; line_total: number; }
interface Order {
  id: number;
  restaurant_name: string;
  customer_name: string;
  status: string;
  payment_status: string;
  delivery_address: string;
  total_price: string;
  items: OrderItem[];
  created_at: string;
}
interface Restaurant { id: number; name: string; is_open: boolean; }

const POLL_MS = 4000;

// What the owner can do next, per status.
const NEXT: Record<string, { label: string; to: string; cls: string }[]> = {
  PENDING: [
    { label: "Accept", to: "CONFIRMED", cls: "accept" },
    { label: "Reject", to: "CANCELLED", cls: "reject" },
  ],
  CONFIRMED: [
    { label: "Start preparing", to: "PREPARING", cls: "accept" },
    { label: "Reject", to: "CANCELLED", cls: "reject" },
  ],
  PREPARING: [{ label: "Out for delivery", to: "OUT_FOR_DELIVERY", cls: "" }],
  OUT_FOR_DELIVERY: [{ label: "Mark delivered", to: "DELIVERED", cls: "accept" }],
};

const ACTIVE = ["PENDING", "CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY"];
const prettyStatus = (s: string) => s.replace(/_/g, " ").toLowerCase();

export default function Dashboard({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loaded, setLoaded] = useState(false);
  const knownIds = useRef<Set<number>>(new Set());
  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    try {
      const [ordRes, restRes] = await Promise.all([
        api.get<Order[]>("/restaurant-orders/"),
        api.get<Restaurant[]>("/my-restaurants/"),
      ]);
      // Notify on genuinely new incoming orders (skip the very first load).
      if (!firstLoad.current) {
        for (const o of ordRes.data) {
          if (!knownIds.current.has(o.id) && ACTIVE.includes(o.status)) {
            toast.success(`New order #${o.id} — ₹${o.total_price}`);
          }
        }
      }
      knownIds.current = new Set(ordRes.data.map((o) => o.id));
      firstLoad.current = false;
      setOrders(ordRes.data);
      setRestaurants(restRes.data);
      setLoaded(true);
    } catch (e: any) {
      if (e?.response?.status === 401) {
        toast.error("Session expired, please sign in again.");
        onLogout();
      }
    }
  }, [onLogout]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  async function setStatus(id: number, to: string) {
    try {
      await api.post(`/restaurant-orders/${id}/set_status/`, { status: to });
      toast.success(`Order #${id} → ${prettyStatus(to)}`);
      load();
    } catch {
      toast.error("Could not update order");
    }
  }

  async function toggleOpen(r: Restaurant) {
    try {
      await api.patch(`/my-restaurants/${r.id}/`, { is_open: !r.is_open });
      load();
    } catch {
      toast.error("Could not update restaurant");
    }
  }

  const active = orders.filter((o) => ACTIVE.includes(o.status));
  const done = orders.filter((o) => !ACTIVE.includes(o.status));

  return (
    <>
      <div className="topbar">
        <div className="brand">FoodExpress <span>Restaurant</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span className="muted" style={{ color: "#fbf7f0aa" }}>Hi, {username}</span>
          <button className="btn ghost small" onClick={onLogout}>Log out</button>
        </div>
      </div>

      <div className="wrap">
        {restaurants.length > 0 && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
            {restaurants.map((r) => (
              <label key={r.id} className="toggle-open card" style={{ padding: "8px 14px" }}>
                <input type="checkbox" style={{ width: "auto" }} checked={r.is_open}
                  onChange={() => toggleOpen(r)} />
                <b>{r.name}</b>
                <span className="muted">{r.is_open ? "open" : "closed"}</span>
              </label>
            ))}
          </div>
        )}

        <div className="section-title">
          <h2>Incoming &amp; active orders {active.length > 0 && <span className="muted">({active.length})</span>}</h2>
          <span className="muted" style={{ fontSize: "0.8rem" }}>auto-refreshing every {POLL_MS / 1000}s</span>
        </div>

        {!loaded ? (
          <p className="empty">Loading…</p>
        ) : active.length === 0 ? (
          <p className="empty">No active orders right now. New orders will appear here automatically.</p>
        ) : (
          <div className="columns">
            {active.map((o) => (
              <div className="order" key={o.id}>
                <div className="head">
                  <span className="oid">#{o.id}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <span className={`badge ${o.payment_status === "PAID" ? "pay-paid" : "pay-unpaid"}`}>
                      {o.payment_status}
                    </span>
                    <span className="badge st">{prettyStatus(o.status)}</span>
                  </div>
                </div>
                <div className="addr">{o.restaurant_name} · {o.customer_name}</div>
                <ul>
                  {o.items.map((it) => (
                    <li key={it.id}>{it.quantity}× {it.menu_item_name}</li>
                  ))}
                </ul>
                <div className="addr">📍 {o.delivery_address}</div>
                <div className="total">Total ₹{o.total_price}</div>
                <div className="actions">
                  {(NEXT[o.status] || []).map((a) => (
                    <button key={a.to} className={`btn small ${a.cls}`} onClick={() => setStatus(o.id, a.to)}>
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {done.length > 0 && (
          <>
            <div className="section-title"><h2 className="muted">Completed &amp; cancelled ({done.length})</h2></div>
            <div className="columns">
              {done.map((o) => (
                <div className="order" key={o.id} style={{ opacity: 0.7 }}>
                  <div className="head">
                    <span className="oid">#{o.id}</span>
                    <span className="badge st">{prettyStatus(o.status)}</span>
                  </div>
                  <div className="addr">{o.customer_name} · ₹{o.total_price}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

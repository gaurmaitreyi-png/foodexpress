import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Star, Clock, Plus } from "lucide-react";
import toast from "react-hot-toast";
import api from "../api/client";
import { Restaurant, MenuItem } from "../types";
import { useCart } from "../context/CartContext";

export default function RestaurantDetail() {
  const { id } = useParams();
  const [r, setR] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const { add } = useCart();

  useEffect(() => {
    api.get<Restaurant>(`/restaurants/${id}/`)
      .then((res) => setR(res.data))
      .catch(() => setR(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="center-load">Loading menu…</div>;
  if (!r) return <div className="empty"><h2>Restaurant not found</h2></div>;

  // Group menu items by category for sectioned display.
  const byCategory: Record<string, MenuItem[]> = {};
  (r.menu_items || []).forEach((m) => {
    (byCategory[m.category] ||= []).push(m);
  });

  function addToCart(m: MenuItem) {
    add(m);
    toast.success(`${m.name} added`);
  }

  return (
    <main className="container">
      <img className="detail-hero" src={r.image_url} alt={r.name} />
      <div className="detail-head">
        <h1>{r.name}</h1>
        <div className="card-meta">
          <span className="rating"><Star size={15} fill="currentColor" /> {r.rating}</span>
          <span className="pill">{r.cuisine}</span>
          <span><Clock size={14} /> {r.delivery_time_mins} min</span>
        </div>
        <p style={{ color: "var(--ink-soft)", marginTop: 12, maxWidth: "60ch" }}>{r.description}</p>
      </div>

      {Object.entries(byCategory).map(([cat, items]) => (
        <section key={cat}>
          <h2 className="menu-cat">{cat}</h2>
          {items.map((m, i) => (
            <motion.div className="menu-row" key={m.id}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}>
              <div className="menu-info">
                <h4>{m.is_vegetarian && <span className="veg-dot" title="Vegetarian" />}{m.name}</h4>
                <p>{m.description}</p>
              </div>
              <div className="price-add">
                <span className="price">₹{m.price}</span>
                <button className="btn" onClick={() => addToCart(m)} disabled={!m.is_available}>
                  <Plus size={15} style={{ verticalAlign: "-2px" }} /> {m.is_available ? "Add" : "Sold out"}
                </button>
              </div>
            </motion.div>
          ))}
        </section>
      ))}
    </main>
  );
}

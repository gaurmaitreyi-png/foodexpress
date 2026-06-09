import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Star, Clock } from "lucide-react";
import api from "../api/client";
import { Restaurant } from "../types";

export default function Home() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    api.get<Restaurant[]>("/restaurants/")
      .then((res) => setRestaurants(res.data))
      .catch(() => setRestaurants([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <header className="hero">
        <div className="container">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <p className="hero-eyebrow">Delivering in your city</p>
            <h1>Good food, <em>fast</em> — from places worth knowing.</h1>
            <p>Browse local kitchens, build your order, and track it to your door. No fuss, just dinner.</p>
          </motion.div>
        </div>
      </header>

      <main className="container">
        <div className="section-head">
          <h2>Restaurants near you</h2>
          <span>{restaurants.length} open now</span>
        </div>

        {loading ? (
          <div className="center-load">Loading the kitchens…</div>
        ) : restaurants.length === 0 ? (
          <div className="empty">
            <h2>Nothing here yet</h2>
            <p>The backend returned no restaurants. Make sure the API is running and seeded.</p>
          </div>
        ) : (
          <div className="grid">
            {restaurants.map((r, i) => (
              <motion.div
                key={r.id}
                className="card"
                onClick={() => nav(`/restaurant/${r.id}`)}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                whileHover={{ y: -4 }}
              >
                <img className="card-img" src={r.image_url} alt={r.name} loading="lazy" />
                <div className="card-body">
                  <h3>{r.name}</h3>
                  <div className="card-meta">
                    <span className="rating"><Star size={14} fill="currentColor" /> {r.rating}</span>
                    <span className="pill">{r.cuisine}</span>
                    <span><Clock size={13} /> {r.delivery_time_mins} min</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

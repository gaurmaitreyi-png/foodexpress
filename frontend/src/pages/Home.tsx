import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Clock, Search } from "lucide-react";
import api from "../api/client";
import { Restaurant } from "../types";
import StarRating from "../components/StarRating";
import RestaurantSkeleton from "../components/RestaurantSkeleton";

export default function Home() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const nav = useNavigate();

  useEffect(() => {
    api.get<Restaurant[]>("/restaurants/")
      .then((res) => setRestaurants(res.data))
      .catch(() => setRestaurants([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return restaurants;
    const q = query.toLowerCase();
    return restaurants.filter(
      (r) => r.name.toLowerCase().includes(q) || r.cuisine.toLowerCase().includes(q)
    );
  }, [query, restaurants]);

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
        <div className="search-wrap">
          <Search size={18} className="search-icon" />
          <input
            className="search-input"
            placeholder="Search restaurants or cuisines…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="section-head">
          <h2>Restaurants near you</h2>
          <span>{loading ? "" : `${filtered.length} ${filtered.length === 1 ? "result" : "results"}`}</span>
        </div>

        {loading ? (
          <div className="grid">
            {Array.from({ length: 6 }).map((_, i) => <RestaurantSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <h2>{query ? "No matches" : "Nothing here yet"}</h2>
            <p>{query ? `Nothing matches "${query}". Try a different search.` : "The backend returned no restaurants. Make sure the API is running and seeded."}</p>
          </div>
        ) : (
          <div className="grid">
            {filtered.map((r, i) => (
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
                    <StarRating value={r.rating} />
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

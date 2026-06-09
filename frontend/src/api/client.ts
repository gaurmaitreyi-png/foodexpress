import axios from "axios";

// Endpoint map (matches Django backend 1:1):
//   POST /auth/register/   -> create account
//   POST /auth/login/      -> { access, refresh } JWT
//   GET  /restaurants/     -> list restaurants
//   GET  /restaurants/:id/ -> restaurant + nested menu_items
//   GET  /orders/          -> current user's orders (auth)
//   POST /orders/          -> place order (auth)
//   POST /orders/:id/cancel/ -> cancel order (auth)
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000/api",
});

// Attach JWT from localStorage to every request if present.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;

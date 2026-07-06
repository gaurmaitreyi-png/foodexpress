import axios from "axios";

// Same Django backend as the customer app. The restaurant app uses the
// owner-scoped endpoints: /restaurant-orders/ and /my-restaurants/.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("r_access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;

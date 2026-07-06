import { useState } from "react";
import toast from "react-hot-toast";
import api from "./api";

export default function Login({ onLogin }: { onLogin: (username: string) => void }) {
  const [username, setU] = useState("");
  const [password, setP] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!username || !password) return;
    setBusy(true);
    try {
      const { data } = await api.post("/auth/login/", { username, password });
      if (!data.is_restaurant_owner) {
        toast.error("This account is not a restaurant owner.");
        return;
      }
      localStorage.setItem("r_access_token", data.access);
      localStorage.setItem("r_username", data.username);
      toast.success("Welcome back");
      onLogin(data.username);
    } catch {
      toast.error("Invalid username or password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="card">
        <h1>FoodExpress <span style={{ color: "var(--accent)" }}>for Restaurants</span></h1>
        <p className="sub">Sign in to manage your incoming orders.</p>
        <label>Username</label>
        <input value={username} onChange={(e) => setU(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()} />
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setP(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()} />
        <button className="btn" style={{ width: "100%", marginTop: 20 }} onClick={submit} disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="muted" style={{ fontSize: "0.82rem", marginTop: 16 }}>
          Demo owner: <b>demo_owner</b> / <b>ownerpass123</b>
        </p>
      </div>
    </div>
  );
}

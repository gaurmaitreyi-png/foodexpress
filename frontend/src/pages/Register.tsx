import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const { register } = useAuth();
  const [f, setF] = useState({ username: "", email: "", password: "", phone: "", address: "" });
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit() {
    setBusy(true);
    try {
      await register(f);
      toast.success("Account created");
      nav("/");
    } catch {
      toast.error("Could not register — try a different username");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="form-page">
      <div className="panel">
        <h1>Create account</h1>
        <p className="sub">Order in under a minute.</p>
        <label>Username</label>
        <input value={f.username} onChange={set("username")} />
        <label>Email</label>
        <input type="email" value={f.email} onChange={set("email")} />
        <label>Password</label>
        <input type="password" value={f.password} onChange={set("password")} />
        <label>Phone</label>
        <input value={f.phone} onChange={set("phone")} />
        <button className="btn block dark" style={{ marginTop: 20 }} onClick={submit} disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>
        <p className="muted-link">Already have one? <Link to="/login">Sign in</Link></p>
      </div>
    </main>
  );
}

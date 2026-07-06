import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import GoogleLoginButton from "../components/GoogleLoginButton";

export default function Login() {
  const { login, loginWithGoogle } = useAuth();
  const [username, setU] = useState("");
  const [password, setP] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function submit() {
    setBusy(true);
    try {
      await login(username, password);
      toast.success("Welcome back");
      nav("/");
    } catch {
      toast.error("Invalid username or password");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle(credential: string) {
    try {
      await loginWithGoogle(credential);
      toast.success("Signed in with Google");
      nav("/");
    } catch {
      toast.error("Google sign-in failed");
    }
  }

  return (
    <main className="form-page">
      <div className="panel">
        <h1>Sign in</h1>
        <p className="sub">Good to see you again.</p>
        <label>Username</label>
        <input value={username} onChange={(e) => setU(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setP(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        <button className="btn block dark" style={{ marginTop: 20 }} onClick={submit} disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <GoogleLoginButton onCredential={onGoogle} />
        <p className="muted-link">New here? <Link to="/register">Create an account</Link></p>
      </div>
    </main>
  );
}

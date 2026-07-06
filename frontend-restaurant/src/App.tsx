import { useState } from "react";
import Login from "./Login";
import Dashboard from "./Dashboard";

export default function App() {
  const [authed, setAuthed] = useState(!!localStorage.getItem("r_access_token"));
  const [username, setUsername] = useState(localStorage.getItem("r_username") || "");

  function onLogin(name: string) {
    setUsername(name);
    setAuthed(true);
  }
  function logout() {
    localStorage.removeItem("r_access_token");
    localStorage.removeItem("r_username");
    setAuthed(false);
  }

  return authed ? (
    <Dashboard username={username} onLogout={logout} />
  ) : (
    <Login onLogin={onLogin} />
  );
}

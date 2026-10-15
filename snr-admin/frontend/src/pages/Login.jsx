import { useState } from "react";
import { apiPostJson } from "../utils/api.js";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setError(null);
    setLoading(true);
    try {
      const { token, role } = await apiPostJson("/api/auth/login", { username, password });
      localStorage.setItem("auth_token", token);
      localStorage.setItem("auth_role", role || "admin");
      onLogin();
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm animate-pop-in">
        <div className="mb-7 text-center">
          <div className="ui-kicker mb-2">S&amp;R Rentals</div>
          <h1 className="ui-title font-display text-5xl">
            SnR<span className="text-[color:var(--color-dark-gray)]"> Admin</span>
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="ui-panel p-6">
          <div className="ui-kicker mb-5">Sign in</div>

          <div className="space-y-4">
            <div>
              <label className="ui-label" htmlFor="login-username">
                Username
              </label>
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                className="ui-input"
              />
            </div>
            <div>
              <label className="ui-label" htmlFor="login-password">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="ui-input"
              />
            </div>
            {error && (
              <p className="text-xs font-bold text-[color:var(--color-danger)]">
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="ui-btn ui-btn--solid mt-6 w-full"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <p className="ui-kicker mt-4 text-center text-[0.6rem]">
            Session is saved automatically
          </p>
        </form>
      </div>
    </div>
  );
}

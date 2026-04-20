import { useState } from "react";
import { supabase } from "../supabase";

export default function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const redirectBase = import.meta.env.VITE_REDIRECT_URL || window.location.origin;

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
    } else {
      onAuthenticated();
    }
    setLoading(false);
  }

  async function handleSignup(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${redirectBase}?type=signup`,
      },
    });
    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Account created. Check your email to confirm.");
      setMode("login");
    }
    setLoading(false);
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    if (!email.trim()) {
      setMessage("Enter your email first.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${redirectBase}?type=recovery`,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Password reset email sent. Open the email link to continue.");
    }

    setLoading(false);
  }

  return (
    <div className="page page-auth">
      <div className="card auth-card">
        <h1>Contracts Portal</h1>
        <p className="sub">Use the same account/auth flow as your existing systems.</p>

        <form onSubmit={mode === "signup" ? handleSignup : handleLogin}>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          <label>Password</label>
          <div className="password-row">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
            <button
              type="button"
              className="ghost"
              onClick={() => setShowPassword((prev) => !prev)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          <button type="submit" disabled={loading}>
            {loading ? "Please wait..." : mode === "signup" ? "Sign Up" : "Sign In"}
          </button>
        </form>

        <div className="auth-links">
          <button className="link" onClick={() => setMode(mode === "signup" ? "login" : "signup")}> 
            {mode === "signup" ? "Already have an account? Login" : "Need an account? Sign up"}
          </button>
          <button className="link" onClick={handleForgotPassword}>
            Forgot password?
          </button>
        </div>

        {message && <p className="msg">{message}</p>}
      </div>
    </div>
  );
}

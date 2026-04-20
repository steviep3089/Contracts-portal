import { useState } from "react";
import { supabase } from "../supabase";

export default function ResetPasswordScreen({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleReset(e) {
    e.preventDefault();
    if (!password || !confirmPassword) {
      setMessage("Please fill in both password fields.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({
      password,
      data: { password_set: true, invited: false },
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Password updated successfully.");
      setTimeout(() => {
        onDone();
      }, 600);
    }
    setLoading(false);
  }

  return (
    <div className="page page-auth">
      <div className="card auth-card">
        <h1>Reset Password</h1>
        <p className="sub">Create a new password to continue.</p>
        <form onSubmit={handleReset}>
          <label>New Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <label>Confirm Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          <button type="submit" disabled={loading}>
            {loading ? "Updating..." : "Reset Password"}
          </button>
        </form>

        {message && <p className="msg">{message}</p>}
      </div>
    </div>
  );
}

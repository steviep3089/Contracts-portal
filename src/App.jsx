import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import AuthScreen from "./components/AuthScreen";
import ResetPasswordScreen from "./components/ResetPasswordScreen";
import Dashboard from "./components/Dashboard";

function extractHashParams() {
  const hash = window.location.hash?.startsWith("#") ? window.location.hash.slice(1) : "";
  return new URLSearchParams(hash);
}

function needsPasswordSetup(user) {
  if (!user) {
    return false;
  }

  const hasRecovery = !!user.recovery_sent_at;
  const isInvitePending = !!user.invited_at && user.user_metadata?.password_set !== true;
  return hasRecovery || isInvitePending;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [mode, setMode] = useState("loading");

  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      const hashParams = extractHashParams();
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const type = hashParams.get("type") || new URLSearchParams(window.location.search).get("type");

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!error) {
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        }
      }

      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      const { data: userData } = await supabase.auth.getUser();
      const currentUser = userData?.user || currentSession?.user || null;

      if (!mounted) {
        return;
      }

      setSession(currentSession);

      if (type === "recovery" || type === "invite" || needsPasswordSetup(currentUser)) {
        setMode("reset");
      } else {
        setMode(currentSession ? "dashboard" : "auth");
      }
    }

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") {
        setMode("reset");
      } else if (event === "SIGNED_IN") {
        supabase.auth.getUser().then(({ data: userData }) => {
          const signedInUser = userData?.user || nextSession?.user || null;
          setMode(needsPasswordSetup(signedInUser) ? "reset" : "dashboard");
        });
      } else if (event === "SIGNED_OUT") {
        setMode("auth");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (mode === "loading") {
    return (
      <div className="page page-auth">
        <div className="card auth-card">
          <h1>Loading...</h1>
        </div>
      </div>
    );
  }

  if (mode === "reset") {
    return <ResetPasswordScreen onDone={() => setMode(session ? "dashboard" : "auth")} />;
  }

  if (!session) {
    return <AuthScreen onAuthenticated={() => setMode("dashboard")} />;
  }

  return <Dashboard user={session.user} onSignOut={() => setMode("auth")} />;
}

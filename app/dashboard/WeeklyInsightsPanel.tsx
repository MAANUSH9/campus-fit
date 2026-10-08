"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getBrowserClient } from "../../lib/supabase/client";

type Track = "beginner" | "intermediate" | "advanced";
type TrackType = "strength" | "cardio";
type FlagType = "plateau" | "overtraining_risk" | "dropout_risk" | "track_promotion" | "nutrition_drift";

interface Insight {
  id: string;
  flag_type: FlagType;
  track_type: TrackType | null;
  promoted_track: Track | null;
  reason: string;
  suggested_action: string;
}

const labels: Record<FlagType, string> = {
  plateau: "Plateau detected",
  overtraining_risk: "Recovery check",
  dropout_risk: "Momentum slipping",
  track_promotion: "Track upgrade available",
  nutrition_drift: "Nutrition drift",
};

export default function WeeklyInsightsPanel() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [email, setEmail] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    let client: ReturnType<typeof getBrowserClient>;

    try {
      client = getBrowserClient();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to initialize sign-in.");
      setAuthReady(true);
      return () => {
        active = false;
      };
    }

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setUser(session?.user ?? null);
        setAuthMessage("");
        setAuthError("");
        setInsights([]);
      }
    });

    void client.auth.getSession().then(({ data, error }) => {
      if (error) throw error;
      if (active) setUser(data.session?.user ?? null);
    }).catch((error: unknown) => {
      if (active) setAuthError(error instanceof Error ? error.message : "Unable to check your sign-in.");
    }).finally(() => {
      if (active) setAuthReady(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;
    let active = true;
    setStatus("Loading your weekly signals...");

    const loadInsights = async () => {
      try {
        const { data, error } = await getBrowserClient()
          .from("weekly_insights")
          .select("id, flag_type, track_type, promoted_track, reason, suggested_action")
          .eq("user_id", user.id)
          .eq("resolved", false)
          .order("week_start", { ascending: false });
        if (error) throw error;
        if (active) {
          setInsights((data ?? []) as Insight[]);
          setStatus(data?.length ? "" : "No new signals this week.");
        }
      } catch (error) {
        if (active) setStatus(error instanceof Error ? error.message : "Unable to load weekly signals.");
      }
    };
    void loadInsights();

    return () => {
      active = false;
    };
  }, [authReady, user]);

  const sendSignInLink = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthMessage("");
    setAuthError("");
    try {
      const { error } = await getBrowserClient().auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          shouldCreateUser: true,
        },
      });
      if (error) throw error;
      setAuthMessage(`Check ${email.trim()} for your secure sign-in link.`);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to send a sign-in link.");
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = async () => {
    setAuthBusy(true);
    setAuthError("");
    try {
      const { error } = await getBrowserClient().auth.signOut();
      if (error) throw error;
      setAuthMessage("You have been signed out.");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to sign out.");
    } finally {
      setAuthBusy(false);
    }
  };

  const resolveInsight = async (insight: Insight, confirm = false) => {
    setBusyId(insight.id);
    try {
      const client = getBrowserClient();
      const { data: authData, error: authError } = await client.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error("Sign in to confirm this suggestion.");

      if (confirm && insight.flag_type === "track_promotion" && insight.track_type && insight.promoted_track) {
        const field = `${insight.track_type}_track` as "strength_track" | "cardio_track";
        const { error: profileError } = await client
          .from("profiles")
          .update({ [field]: insight.promoted_track })
          .eq("id", authData.user.id);
        if (profileError) throw profileError;
      }

      const { error } = await client.from("weekly_insights").update({ resolved: true }).eq("id", insight.id);
      if (error) throw error;
      setInsights((current) => current.filter((item) => item.id !== insight.id));
      setStatus("Suggestion resolved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to resolve suggestion.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-live="polite" className="insights-section">
      {!authReady ? (
        <p className="status-message">Checking your sign-in...</p>
      ) : !user ? (
        <div className="auth-gate">
          <p className="card-kicker">Your training, in focus</p>
          <h2>Sign in to see your signals</h2>
          <p className="auth-description">We’ll email you a secure link. No password needed.</p>
          <form className="auth-form" onSubmit={(event) => void sendSignInLink(event)}>
            <label htmlFor="signin-email">Email address</label>
            <input
              autoComplete="email"
              className="auth-input"
              id="signin-email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
            <button className="auth-submit" disabled={authBusy} type="submit">
              {authBusy ? "Sending link..." : "Email me a sign-in link"}
            </button>
          </form>
          {authMessage && <p className="auth-feedback" role="status">{authMessage}</p>}
          {authError && <p className="auth-feedback auth-error" role="alert">{authError}</p>}
        </div>
      ) : (
        <>
          <div className="account-bar">
            <p className="account-email">Signed in as <strong>{user.email}</strong></p>
            <button className="quiet-button" disabled={authBusy} onClick={() => void signOut()} type="button">
              {authBusy ? "Signing out..." : "Sign out"}
            </button>
          </div>
          {authError && <p className="auth-feedback auth-error" role="alert">{authError}</p>}
          {status && <p className="status-message">{status}</p>}
          <div className="insights-list">
            {insights.map((insight) => (
              <article className="insight-card" key={insight.id}>
                <div>
                  <p className="card-kicker">{labels[insight.flag_type]}</p>
                  <h2>{insight.reason}</h2>
                  <p>{insight.suggested_action}</p>
                </div>
                <div className="card-actions">
                  <button disabled={busyId === insight.id} onClick={() => void resolveInsight(insight, true)}>
                    {insight.flag_type === "track_promotion" ? "Confirm" : "Done"}
                  </button>
                  <button className="quiet-button" disabled={busyId === insight.id} onClick={() => void resolveInsight(insight)}>
                    Dismiss
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
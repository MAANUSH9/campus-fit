"use client";

import { useEffect, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

function getBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required");
  return createClient(url, key);
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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading your weekly signals...");

  useEffect(() => {
    let active = true;
    const loadInsights = async () => {
      try {
        const client = getBrowserClient();
        const { data: authData, error: authError } = await client.auth.getUser();
        if (authError) throw authError;
        if (!authData.user) {
          setStatus("Sign in to see your weekly signals.");
          return;
        }
        const { data, error } = await client
          .from("weekly_insights")
          .select("id, flag_type, track_type, promoted_track, reason, suggested_action")
          .eq("user_id", authData.user.id)
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
  }, []);

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
    </section>
  );
}
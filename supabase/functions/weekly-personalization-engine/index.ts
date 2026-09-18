import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  buildWeeklyWindows,
  generatePersonalizationInsights,
  type ActivityRecord,
  type ProfileForPersonalization,
  type WeightCheckIn,
} from "../../../lib/personalization.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface ProfileRow extends ProfileForPersonalization {
  id: string;
}

interface InsightRow {
  user_id: string;
  week_start: string;
  flag_type: string;
  track_type: "strength" | "cardio" | null;
  promoted_track: "beginner" | "intermediate" | "advanced" | null;
  reason: string;
  suggested_action: string;
}

async function personalizeUser(profile: ProfileRow, start: Date, end: Date, weekStart: string): Promise<number> {
  const [{ data: activityRows, error: activityError }, { data: checkInRows, error: checkInError }] = await Promise.all([
    supabase
      .from("log_entries")
      .select("*, strength_details(*), cardio_details(*)")
      .eq("user_id", profile.id)
      .gte("logged_at", start.toISOString())
      .lt("logged_at", end.toISOString()),
    supabase
      .from("weight_check_ins")
      .select("measured_at, weight_kg")
      .eq("user_id", profile.id)
      .gte("measured_at", start.toISOString())
      .lt("measured_at", end.toISOString())
      .order("measured_at", { ascending: true }),
  ]);

  if (activityError) throw activityError;
  if (checkInError) throw checkInError;

  const insights = generatePersonalizationInsights(
    (activityRows ?? []) as ActivityRecord[],
    (checkInRows ?? []) as WeightCheckIn[],
    profile,
    end,
  );
  if (insights.length === 0) return 0;

  const rows: InsightRow[] = insights.map((insight) => ({
    user_id: profile.id,
    week_start: weekStart,
    flag_type: insight.flagType,
    track_type: insight.track ?? null,
    promoted_track: insight.promotedTrack ?? null,
    reason: insight.reason,
    suggested_action: insight.suggestedAction,
  }));
  const { error: insertError } = await supabase
    .from("weekly_insights")
    .upsert(rows, {
      onConflict: "user_id,week_start,flag_type,suggested_action",
      ignoreDuplicates: true,
    });
  if (insertError) throw insertError;
  return rows.length;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const now = new Date();
  const { priorStart, end } = buildWeeklyWindows(now);
  const weekStart = end.toISOString().slice(0, 10);
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, goal, weight_kg, strength_track, cardio_track");

  if (profileError) {
    return Response.json({ error: profileError.message }, { status: 500 });
  }

  let insightCount = 0;
  const failures: { userId: string; error: string }[] = [];
  for (const profile of (profiles ?? []) as ProfileRow[]) {
    try {
      insightCount += await personalizeUser(profile, priorStart, end, weekStart);
    } catch (error) {
      failures.push({
        userId: profile.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return Response.json({
    processedUsers: profiles?.length ?? 0,
    insightCount,
    failures,
    window: { start: priorStart.toISOString(), end: end.toISOString() },
  });
});
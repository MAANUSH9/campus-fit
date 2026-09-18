import { generatePersonalizationInsights, type ActivityRecord } from "../lib/personalization";

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

const now = new Date("2026-09-20T12:00:00.000Z");

function activity(loggedAt: string, overrides: Partial<ActivityRecord> = {}): ActivityRecord {
  return {
    logged_at: loggedAt,
    activity_family: "cardio",
    activity_type: "running",
    duration_min: 30,
    perceived_effort: 6,
    activity_points: 18,
    ...overrides,
  };
}

const profile = {
  goal: "maintenance" as const,
  weight_kg: 70,
  strength_track: "beginner" as const,
  cardio_track: "beginner" as const,
};

assertEqual(
  generatePersonalizationInsights([activity("2026-09-13T10:00:00.000Z")], [], profile, now).length,
  0,
  "users with less than two logging weeks are skipped",
);

const dropoutInsights = generatePersonalizationInsights(
  [
    activity("2026-08-09T10:00:00.000Z"),
    activity("2026-08-16T10:00:00.000Z"),
    activity("2026-08-23T10:00:00.000Z"),
    activity("2026-09-13T10:00:00.000Z"),
  ],
  [],
  profile,
  now,
);
assertEqual(dropoutInsights.some((insight) => insight.flagType === "dropout_risk"), true, "dropout risk is flagged");

const promotionInsights = generatePersonalizationInsights(
  [
    activity("2026-08-16T10:00:00.000Z"),
    activity("2026-09-13T10:00:00.000Z", {
      activity_family: "strength",
      activity_type: "calisthenics",
      strength_details: [
        { exercise_name: "pull-ups", sets: 3, reps: 6, weight_kg: 0, rpe_per_set: 7 },
        { exercise_name: "push-ups", sets: 3, reps: 20, weight_kg: 0, rpe_per_set: 7 },
      ],
    }),
  ],
  [],
  profile,
  now,
);
const promotion = promotionInsights.find((insight) => insight.flagType === "track_promotion");
assertEqual(promotion?.track, "strength", "strength promotion includes its track");
assertEqual(promotion?.promotedTrack, "intermediate", "strength promotion includes target level");

const nutritionInsights = generatePersonalizationInsights(
  [activity("2026-08-16T10:00:00.000Z"), activity("2026-09-13T10:00:00.000Z")],
  [
    { measured_at: "2026-08-10T10:00:00.000Z", weight_kg: 70 },
    { measured_at: "2026-09-17T10:00:00.000Z", weight_kg: 74 },
  ],
  { ...profile, goal: "lean_bulk" },
  now,
);
assertEqual(nutritionInsights.some((insight) => insight.flagType === "nutrition_drift"), true, "nutrition drift is flagged");

console.log("Personalization tests passed.");
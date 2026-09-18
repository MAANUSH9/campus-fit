import { assignCardioTrack, assignStrengthTrack, type TrackLevel } from "./calculations";

export const PERSONALIZATION_THRESHOLDS = {
  minimumLoggingWeeks: 2,
  windowWeeks: 3,
  frequencyDropRatio: 0.4,
  plateauChangeRatio: 0.1,
  overtrainingFrequencyIncreaseRatio: 0.4,
  overtrainingHighEffort: 8,
  overtrainingOutputDropRatio: 0.1,
  fatLossMinPercentPerWeek: 0.25,
  fatLossMaxPercentPerWeek: 1,
  leanBulkMinPercentPerWeek: 0.1,
  leanBulkMaxPercentPerWeek: 0.5,
} as const;

export type InsightFlagType =
  | "plateau"
  | "overtraining_risk"
  | "dropout_risk"
  | "track_promotion"
  | "nutrition_drift";

export interface Insight {
  flagType: InsightFlagType;
  reason: string;
  suggestedAction: string;
  track?: "strength" | "cardio";
  promotedTrack?: TrackLevel;
}

export interface StrengthDetailRecord {
  exercise_name: string;
  sets: number;
  reps: number;
  weight_kg: number | null;
  rpe_per_set: number | null;
}

export interface CardioDetailRecord {
  distance_km: number | null;
  avg_pace_min_per_km: number | null;
  elevation_gain_m: number | null;
}

export interface ActivityRecord {
  logged_at: string;
  activity_family: "strength" | "cardio";
  activity_type: string;
  duration_min: number;
  perceived_effort: number;
  activity_points: number;
  strength_details?: StrengthDetailRecord[];
  cardio_details?: CardioDetailRecord[];
}

export interface WeightCheckIn {
  measured_at: string;
  weight_kg: number;
}

export interface ProfileForPersonalization {
  goal: "fat_loss" | "lean_bulk" | "recomposition" | "maintenance";
  weight_kg: number;
  strength_track: TrackLevel | null;
  cardio_track: TrackLevel | null;
}

export interface WeeklyMetrics {
  activityPoints: number;
  sessions: number;
  activeWeeks: number;
  averageEffort: number;
  totalDurationMin: number;
  outputPerEffort: number;
  strengthVolumeLoad: number;
  cardioPaceMinPerKm: number | null;
  maxStrengthPullUps: number;
  maxStrengthPushUps: number;
  maxCardioDurationMin: number;
}

function ratioChange(current: number, prior: number): number {
  if (prior === 0) return current === 0 ? 0 : 1;
  return (current - prior) / prior;
}

function isWithin(date: Date, start: Date, end: Date): boolean {
  return date >= start && date < end;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function startOfSundayWeek(date: Date): Date {
  const result = new Date(date);
  result.setUTCHours(0, 0, 0, 0);
  result.setUTCDate(result.getUTCDate() - result.getUTCDay());
  return result;
}

function isNamedExercise(name: string, target: "pull" | "push"): boolean {
  const normalized = name.toLowerCase();
  return target === "pull"
    ? normalized.includes("pull") || normalized.includes("chin")
    : normalized.includes("push") || normalized.includes("press");
}

export function buildWeeklyWindows(now: Date): { currentStart: Date; priorStart: Date; end: Date } {
  const end = startOfSundayWeek(now);
  const currentStart = addDays(end, -PERSONALIZATION_THRESHOLDS.windowWeeks * 7);
  const priorStart = addDays(currentStart, -PERSONALIZATION_THRESHOLDS.windowWeeks * 7);
  return { currentStart, priorStart, end };
}

export function countLoggingWeeks(records: ActivityRecord[], now: Date): number {
  const { priorStart, end } = buildWeeklyWindows(now);
  const weeks = new Set<string>();
  for (const record of records) {
    const date = new Date(record.logged_at);
    if (isWithin(date, priorStart, end)) {
      weeks.add(startOfSundayWeek(date).toISOString());
    }
  }
  return weeks.size;
}

export function summarizeWindow(records: ActivityRecord[], start: Date, end: Date): WeeklyMetrics {
  const windowRecords = records.filter((record) => isWithin(new Date(record.logged_at), start, end));
  const activeWeeks = new Set(
    windowRecords.map((record) => startOfSundayWeek(new Date(record.logged_at)).toISOString()),
  ).size;
  const totalEffort = windowRecords.reduce((total, record) => total + record.perceived_effort, 0);
  const totalDuration = windowRecords.reduce((total, record) => total + record.duration_min, 0);
  const strengthVolumeLoad = windowRecords.reduce(
    (total, record) =>
      total +
      (record.strength_details ?? []).reduce(
        (detailTotal, detail) => detailTotal + detail.sets * detail.reps * (detail.weight_kg ?? 0),
        0,
      ),
    0,
  );
  const cardioDetails = windowRecords.flatMap((record) => record.cardio_details ?? []);
  const cardioPaceValues = cardioDetails
    .filter((detail) => detail.avg_pace_min_per_km !== null)
    .map((detail) => detail.avg_pace_min_per_km as number);
  const output = windowRecords.reduce(
    (total, record) => total + (record.activity_family === "strength" ? record.duration_min : record.activity_points),
    0,
  );
  const maxStrengthPullUps = Math.max(
    0,
    ...windowRecords.flatMap((record) =>
      (record.strength_details ?? [])
        .filter((detail) => isNamedExercise(detail.exercise_name, "pull"))
        .map((detail) => detail.reps),
    ),
  );
  const maxStrengthPushUps = Math.max(
    0,
    ...windowRecords.flatMap((record) =>
      (record.strength_details ?? [])
        .filter((detail) => isNamedExercise(detail.exercise_name, "push"))
        .map((detail) => detail.reps),
    ),
  );

  return {
    activityPoints: windowRecords.reduce((total, record) => total + record.activity_points, 0),
    sessions: windowRecords.length,
    activeWeeks,
    averageEffort: windowRecords.length === 0 ? 0 : totalEffort / windowRecords.length,
    totalDurationMin: totalDuration,
    outputPerEffort: totalEffort === 0 ? 0 : output / totalEffort,
    strengthVolumeLoad,
    cardioPaceMinPerKm:
      cardioPaceValues.length === 0
        ? null
        : cardioPaceValues.reduce((total, pace) => total + pace, 0) / cardioPaceValues.length,
    maxStrengthPullUps,
    maxStrengthPushUps,
    maxCardioDurationMin: Math.max(
      0,
      ...windowRecords
        .filter((record) => record.activity_family === "cardio")
        .map((record) => record.duration_min),
    ),
  };
}

function buildTrendInsights(current: WeeklyMetrics, prior: WeeklyMetrics): Insight[] {
  const insights: Insight[] = [];
  const activityChange = ratioChange(current.activityPoints, prior.activityPoints);
  const outputChange = ratioChange(current.outputPerEffort, prior.outputPerEffort);
  const frequencyChange = ratioChange(current.sessions, prior.sessions);

  if (
    current.activeWeeks >= 2 &&
    prior.activeWeeks >= 2 &&
    Math.abs(activityChange) <= PERSONALIZATION_THRESHOLDS.plateauChangeRatio &&
    Math.abs(outputChange) <= PERSONALIZATION_THRESHOLDS.plateauChangeRatio
  ) {
    insights.push({
      flagType: "plateau",
      reason: "Activity points and output per unit of effort have stayed within 10% across both three-week windows.",
      suggestedAction: "Change one training variable for the next two weeks, such as exercise selection, progression, route, or interval structure.",
    });
  }

  if (
    frequencyChange >= PERSONALIZATION_THRESHOLDS.overtrainingFrequencyIncreaseRatio &&
    current.averageEffort >= PERSONALIZATION_THRESHOLDS.overtrainingHighEffort &&
    outputChange <= -PERSONALIZATION_THRESHOLDS.overtrainingOutputDropRatio
  ) {
    insights.push({
      flagType: "overtraining_risk",
      reason: "Training frequency rose at least 40%, average effort is 8 or higher, and output per effort fell at least 10%.",
      suggestedAction: "Schedule a lighter week and keep the next sessions below RPE 8 while recovery catches up.",
    });
  }

  if (
    prior.sessions > 0 &&
    (prior.sessions - current.sessions) / prior.sessions >= PERSONALIZATION_THRESHOLDS.frequencyDropRatio
  ) {
    insights.push({
      flagType: "dropout_risk",
      reason: "Logging frequency dropped by at least 40% compared with the prior three-week window.",
      suggestedAction: "Log one manageable session this week and choose a reminder time that fits your class schedule.",
    });
  }

  return insights;
}

function buildTrackPromotionInsights(
  current: WeeklyMetrics,
  profile: ProfileForPersonalization,
): Insight[] {
  const insights: Insight[] = [];
  const suggestedStrengthTrack = assignStrengthTrack({
    pullUps: current.maxStrengthPullUps,
    pushUps: current.maxStrengthPushUps,
  });
  const suggestedCardioTrack = assignCardioTrack(current.maxCardioDurationMin);
  const levels: TrackLevel[] = ["beginner", "intermediate", "advanced"];
  const isPromotion = (currentTrack: TrackLevel | null, suggested: TrackLevel) =>
    currentTrack !== null && levels.indexOf(suggested) > levels.indexOf(currentTrack);

  if (isPromotion(profile.strength_track, suggestedStrengthTrack)) {
    insights.push({
      flagType: "track_promotion",
      track: "strength",
      promotedTrack: suggestedStrengthTrack,
      reason: `Recent strength logs support promotion from ${profile.strength_track} to ${suggestedStrengthTrack}.`,
      suggestedAction: `Confirm the ${suggestedStrengthTrack} strength track in your profile.`,
    });
  }
  if (isPromotion(profile.cardio_track, suggestedCardioTrack)) {
    insights.push({
      flagType: "track_promotion",
      track: "cardio",
      promotedTrack: suggestedCardioTrack,
      reason: `Recent cardio logs support promotion from ${profile.cardio_track} to ${suggestedCardioTrack}.`,
      suggestedAction: `Confirm the ${suggestedCardioTrack} cardio track in your profile.`,
    });
  }
  return insights;
}

function buildNutritionInsight(profile: ProfileForPersonalization, checkIns: WeightCheckIn[], now: Date): Insight | null {
  if (profile.goal !== "fat_loss" && profile.goal !== "lean_bulk") return null;
  const { priorStart, end } = buildWeeklyWindows(now);
  const weights = checkIns
    .filter((checkIn) => isWithin(new Date(checkIn.measured_at), priorStart, end))
    .sort((a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime());
  if (weights.length < 2) return null;
  const first = weights[0];
  const last = weights[weights.length - 1];
  if (!first || !last || profile.weight_kg <= 0) return null;
  const weeklyPercentChange = ((last.weight_kg - first.weight_kg) / first.weight_kg) / 6 * 100;
  const expectedMin = profile.goal === "fat_loss"
    ? -PERSONALIZATION_THRESHOLDS.fatLossMaxPercentPerWeek
    : PERSONALIZATION_THRESHOLDS.leanBulkMinPercentPerWeek;
  const expectedMax = profile.goal === "fat_loss"
    ? -PERSONALIZATION_THRESHOLDS.fatLossMinPercentPerWeek
    : PERSONALIZATION_THRESHOLDS.leanBulkMaxPercentPerWeek;
  if (weeklyPercentChange >= expectedMin && weeklyPercentChange <= expectedMax) return null;

  return {
    flagType: "nutrition_drift",
    reason: `Weight is changing at ${weeklyPercentChange.toFixed(2)}% per week, outside the ${expectedMin.toFixed(2)}% to ${expectedMax.toFixed(2)}% goal range.`,
    suggestedAction: "Review calories and macros, then confirm any adjustment in the nutrition UI; no automatic change was applied.",
  };
}

export function generatePersonalizationInsights(
  records: ActivityRecord[],
  checkIns: WeightCheckIn[],
  profile: ProfileForPersonalization,
  now = new Date(),
): Insight[] {
  if (countLoggingWeeks(records, now) < PERSONALIZATION_THRESHOLDS.minimumLoggingWeeks) return [];
  const { currentStart, priorStart, end } = buildWeeklyWindows(now);
  const current = summarizeWindow(records, currentStart, end);
  const prior = summarizeWindow(records, priorStart, currentStart);
  const insights = [
    ...buildTrendInsights(current, prior),
    ...buildTrackPromotionInsights(current, profile),
  ];
  const nutritionInsight = buildNutritionInsight(profile, checkIns, now);
  if (nutritionInsight) insights.push(nutritionInsight);
  return insights;
}
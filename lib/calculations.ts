export type Sex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "very_active";
export type Goal = "fat_loss" | "lean_bulk" | "recomposition" | "maintenance";
export type TrackLevel = "beginner" | "intermediate" | "advanced";

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very_active: 1.725,
};

export interface BiometricsInput {
  heightCm: number;
  weightKg: number;
  age: number;
  sex: Sex;
  activityLevel: ActivityLevel;
  bodyFatPercent: number; // from direct entry, visual estimate, or Navy method
}

export interface DerivedMetrics {
  lbmKg: number;
  bmr: number;
  tdee: number;
}

/** Step 3: LBM + Katch-McArdle BMR + TDEE */
export function computeDerivedMetrics(input: BiometricsInput): DerivedMetrics {
  const { weightKg, bodyFatPercent, activityLevel } = input;
  if (bodyFatPercent <= 0 || bodyFatPercent >= 70) {
    throw new Error("bodyFatPercent out of plausible range (0-70)");
  }
  const lbmKg = weightKg * (1 - bodyFatPercent / 100);
  const bmr = 370 + 21.6 * lbmKg;
  const tdee = bmr * ACTIVITY_MULTIPLIERS[activityLevel];
  return { lbmKg, bmr, tdee };
}

/** Navy Method fallback body fat estimate (Step 2, Path B sharpening) */
export function estimateBodyFatNavy(params: {
  sex: Sex;
  heightCm: number;
  neckCm: number;
  waistCm: number;
  hipCm?: number; // required for female
}): number {
  const { sex, heightCm, neckCm, waistCm, hipCm } = params;
  const log10 = Math.log10;
  if (sex === "male") {
    return (
      495 / (1.0324 - 0.19077 * log10(waistCm - neckCm) + 0.15456 * log10(heightCm)) - 450
    );
  }
  if (!hipCm) throw new Error("hipCm is required for female Navy method estimate");
  return (
    495 /
      (1.29579 - 0.35004 * log10(waistCm + hipCm - neckCm) + 0.221 * log10(heightCm)) -
    450
  );
}

export interface NutritionTargets {
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
}

/** Step 5: calorie target + Step 5 macro split, LBM-scaled protein */
export function computeNutritionTargets(
  derived: DerivedMetrics,
  goal: Goal
): NutritionTargets {
  const goalMultiplier: Record<Goal, number> = {
    fat_loss: 0.825, // midpoint of 0.80-0.85
    lean_bulk: 1.125, // midpoint of 1.10-1.15
    recomposition: 0.975, // midpoint of 0.95-1.00
    maintenance: 1.0,
  };
  const proteinPerKgLBM: Record<Goal, number> = {
    fat_loss: 1.8,
    lean_bulk: 2.2,
    recomposition: 2.0,
    maintenance: 1.9,
  };

  const calories = derived.tdee * goalMultiplier[goal];
  const proteinG = derived.lbmKg * proteinPerKgLBM[goal];
  const fatG = (calories * 0.25) / 9;
  const proteinCals = proteinG * 4;
  const fatCals = fatG * 9;
  const carbsG = Math.max(0, (calories - proteinCals - fatCals) / 4);

  return {
    calories: Math.round(calories),
    proteinG: Math.round(proteinG),
    fatG: Math.round(fatG),
    carbsG: Math.round(carbsG),
  };
}

/** Step 6: recomposition eligibility check */
export function isRecompRecommended(params: {
  sex: Sex;
  bodyFatPercent: number;
  trainingAgeYears: number;
}): { recommended: boolean; reason: string } {
  const { sex, bodyFatPercent, trainingAgeYears } = params;
  const highBfThreshold = sex === "male" ? 20 : 28;
  const lowBfThreshold = sex === "male" ? 12 : 20;

  if (bodyFatPercent > highBfThreshold) {
    return { recommended: true, reason: "Higher body fat % makes recomposition efficient." };
  }
  if (trainingAgeYears < 1) {
    return { recommended: true, reason: "Novice training status — recomp works well regardless of BF%." };
  }
  if (bodyFatPercent < lowBfThreshold && trainingAgeYears > 2) {
    return {
      recommended: false,
      reason: "Already lean and experienced — a clear bulk/cut cycle will be faster than recomp.",
    };
  }
  return { recommended: true, reason: "Reasonable default given inputs; monitor progress and adjust." };
}

/** Step 7: strength track assignment */
export function assignStrengthTrack(params: {
  pullUps: number;
  pushUps: number;
}): TrackLevel {
  const { pullUps, pushUps } = params;
  if (pullUps >= 10) return "advanced";
  if (pullUps >= 4 && pushUps >= 15) return "intermediate";
  return "beginner";
}

/** Step 7: cardio track assignment */
export function assignCardioTrack(sustainedMinutes: number): TrackLevel {
  if (sustainedMinutes >= 40) return "advanced";
  if (sustainedMinutes >= 15) return "intermediate";
  return "beginner";
}

/** Step 7B: Activity Points — RPE-based backbone, HR zone as optional multiplier */
export type HrZone = 1 | 2 | 3 | 4 | 5;

const HR_ZONE_MULTIPLIER: Record<HrZone, number> = {
  1: 0.8,
  2: 1.0,
  3: 1.2,
  4: 1.4,
  5: 1.6,
};

export function computeActivityPoints(params: {
  activityFamily: "strength" | "cardio";
  durationMin: number;
  perceivedEffort: number; // 1-10 RPE
  hrZone?: HrZone; // optional, only if wearable data present
}): number {
  const { activityFamily, durationMin, perceivedEffort, hrZone } = params;
  if (perceivedEffort < 1 || perceivedEffort > 10) {
    throw new Error("perceivedEffort must be between 1 and 10");
  }
  const modalityWeight = activityFamily === "strength" ? 1.2 : 1.0;
  let points = durationMin * (perceivedEffort / 10) * modalityWeight;
  if (hrZone) {
    points *= HR_ZONE_MULTIPLIER[hrZone];
  }
  return Math.round(points * 10) / 10;
}

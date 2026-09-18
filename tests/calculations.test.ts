import {
  computeDerivedMetrics,
  computeNutritionTargets,
  isRecompRecommended,
  assignStrengthTrack,
  assignCardioTrack,
  computeActivityPoints,
  estimateBodyFatNavy,
} from "../lib/calculations";

function assertClose(actual: number, expected: number, tolerance: number, label: string) {
  const diff = Math.abs(actual - expected);
  const status = diff <= tolerance ? "PASS" : "FAIL";
  console.log(`[${status}] ${label}: got ${actual.toFixed(1)}, expected ~${expected} (±${tolerance})`);
}

// Sanity check using a real InBody baseline: 66.6kg, ~11.8% BF, BMR ~1639 kcal (known real values)
const derived = computeDerivedMetrics({
  heightCm: 175,
  weightKg: 66.6,
  age: 20,
  sex: "male",
  activityLevel: "moderate",
  bodyFatPercent: 11.8,
});
console.log("\n--- Derived Metrics (InBody baseline sanity check) ---");
console.log(derived);
assertClose(derived.bmr, 1639, 60, "BMR vs InBody-reported value");

console.log("\n--- Nutrition Targets (lean bulk goal) ---");
const nutrition = computeNutritionTargets(derived, "lean_bulk");
console.log(nutrition);
assertClose(nutrition.calories, 3350, 200, "Calories vs known lean bulk target (~3300-3400)");
assertClose(nutrition.proteinG, 150, 20, "Protein vs known target range (140-160g)");

console.log("\n--- Recomposition Eligibility ---");
console.log(
  isRecompRecommended({ sex: "male", bodyFatPercent: 11.8, trainingAgeYears: 2.5 })
);
console.log(
  isRecompRecommended({ sex: "male", bodyFatPercent: 25, trainingAgeYears: 0.5 })
);

console.log("\n--- Track Assignment ---");
console.log("Strength (2 pull-ups, 12 push-ups):", assignStrengthTrack({ pullUps: 2, pushUps: 12 }));
console.log("Strength (6 pull-ups, 20 push-ups):", assignStrengthTrack({ pullUps: 6, pushUps: 20 }));
console.log("Strength (12 pull-ups, 40 push-ups):", assignStrengthTrack({ pullUps: 12, pushUps: 40 }));
console.log("Cardio (10 min sustained):", assignCardioTrack(10));
console.log("Cardio (25 min sustained):", assignCardioTrack(25));
console.log("Cardio (50 min sustained):", assignCardioTrack(50));

console.log("\n--- Activity Points ---");
console.log(
  "45min strength, RPE 7, no HR:",
  computeActivityPoints({ activityFamily: "strength", durationMin: 45, perceivedEffort: 7 })
);
console.log(
  "45min cycling, RPE 7, no HR:",
  computeActivityPoints({ activityFamily: "cardio", durationMin: 45, perceivedEffort: 7 })
);
console.log(
  "45min cycling, RPE 7, HR zone 3:",
  computeActivityPoints({ activityFamily: "cardio", durationMin: 45, perceivedEffort: 7, hrZone: 3 })
);

console.log("\n--- Navy Method BF% Estimate ---");
console.log(
  "Male, height 175cm, neck 38cm, waist 80cm:",
  estimateBodyFatNavy({ sex: "male", heightCm: 175, neckCm: 38, waistCm: 80 }).toFixed(1) + "%"
);

# Weekly Personalization Thresholds

The original Step 9 document was not present when this engine was implemented, so these values are explicit proposed defaults rather than hidden assumptions. Replace them in `lib/personalization.ts` when the canonical document is available.

- Trend windows: two consecutive three-week windows across the trailing six weeks.
- Minimum history: skip the user unless activity exists in at least two distinct weeks.
- Plateau: activity points and output per effort both remain within 10% across the windows, with at least two active weeks in each window.
- Overtraining risk: frequency increases at least 40%, current average RPE is at least 8, and output per effort falls at least 10%.
- Dropout risk: session frequency falls at least 40% from the prior window.
- Strength promotion: reuse the existing `assignStrengthTrack` thresholds from `lib/calculations.ts`.
- Cardio promotion: reuse the existing `assignCardioTrack` thresholds from `lib/calculations.ts`.
- Fat loss trajectory: 0.25% to 1% bodyweight loss per week.
- Lean bulk trajectory: 0.1% to 0.5% bodyweight gain per week.

The engine writes suggestions only. It never mutates profile tracks or nutrition targets. Track changes occur only after a user confirms the promotion card in the dashboard.
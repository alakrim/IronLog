# Progression rules (plain language)

All code lives in `src/domain/`. Every rule below has tests in `src/domain/engine.test.ts`.
Only ticked, non-warm-up sets count. Deload sessions are ignored for progression; heavy-day
sessions feed the e1RM but don't change normal progression.

## Per exercise, each session (`progression.ts → recommend`)
Evaluated in this order against the most recent comparable session:

1. **No history** → `start`: no weight suggested; pick a load for ~top-of-range reps at RIR 2–3.
2. **Rep range changed** (new block, edited template) → `transition`: load = Epley inverse of best e1RM for
   `repMax` reps at target RIR, capped at +15 % of last working weight, rounded **down** to an achievable load.
3. **Method "none"** → keep weight.
4. **Not all prescribed sets completed** at the working weight → keep weight.
5. **Every set ≥ repMax** and (if `minRirToProgress` set) average *recorded* RIR ≥ minimum →
   `increase` to the achievable load nearest `current + preferred increment`, never above `maxJumpPct`
   unless the smallest available step is bigger (flagged). Rep target resets to `repMin`.
   Missing RIR never blocks an increase.
6. **Top of range reached but RIR too low** → keep weight.
7. **Any set < repMin** → keep weight; after `failuresBeforeReduce` consecutive such sessions at the same
   weight and range → `reduce` by `reducePct` (default 10 %), rounded down.
8. **Otherwise** → keep weight; per-set rep goal = last reps + 1 (clamped to range).

Top-set + back-off: steps above apply to the top set only; back-offs = `backoffPct` (85 %) of top, rounded down.

## Session modifiers
* **Heavy day** (compounds only): 4 × 4–6 @ RIR 2, load from best e1RM of last 3 sessions, capped +15 %, rounded down.
* **Deload**: sets × 0.5 (rounded up, min 1), load × 0.9 of the last weight actually lifted, target RIR 4.

## Training blocks (`periodization.ts`)
Default cycle: Hypertrophy I 4 wk 8–12 → Hypertrophy II 4 wk 6–10 → Strength I 3 wk 3–6 → Strength II 3 wk 3–5 → Deload 1 wk.
Blocks override rep range / sets / RIR / method for **compound** exercises only. Week = floor(days since block start / 7) + 1.
A block never advances by itself; the app shows "block complete" and the user confirms.

## Deload recommendation
Any one signal (suppressed for 7 days after a deload or dismissal):
* ≥ `deloadEveryWeeks` since last deload (only when no cycle is active);
* e1RM fell in each of the last 3 sessions on ≥ 2 exercises;
* 6 consecutive sessions where every recorded set was RIR 0.

## Heavy day reminder
Due when `heavyEveryWeeks` > 0, not in a strength/deload block, and that many weeks have passed since the last heavy session.

## Estimated 1RM
Epley: `w × (1 + reps/30)`; reps = 1 → w. Only for ≤ 12 reps (reps + RIR when RIR is known, for transitions).
Tested 1RM = heaviest logged single. The UI always labels estimates as estimates.

## Personal records (`prs.ts`)
Only once an exercise has prior history. Types: heaviest weight; rep PR (more reps than ever at this load **or heavier**);
best e1RM; best single-session volume. Bodyweight sets with no added load: rep PR only. Rebuilt from scratch whenever
history changes, so edits and deletions are always consistent.

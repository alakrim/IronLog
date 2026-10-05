# IronLog — Development Plan & Architecture

Working name: **IronLog**. Android-first, offline-first gym tracker. No AI at runtime: every
recommendation comes from explicit, unit-tested rules in `src/domain/`.

---

## 1. Specification analysis

### Gaps & contradictions found (and the decision taken)

| # | Issue | Decision |
|---|-------|----------|
| 1 | "Synchronize/persist reliably" vs "offline-first, sync later" | v1 is local-only. Every record has a UUID, `createdAt`, `updatedAt`, soft-delete flag so sync can be added without migration pain. JSON export/import provides backup today. |
| 2 | User model asks for age/name; Security section says collect nothing unnecessary | Only name (optional), units, experience. No age, no email, no account. |
| 3 | RIR and RPE both listed | Store RIR only (RPE = 10 − RIR shown where useful). One input, optional. |
| 4 | "Increase weight if RIR sufficient" — sufficient in which direction? | Config `minRirToProgress` (default `null` = ignore). If set, sets that recorded RIR must have RIR ≥ value; sets without RIR are ignored, so missing RIR never blocks progress. |
| 5 | Plate list is per-side for barbells but total for dumbbells/machines | Equipment profiles: barbell (bar + plate pairs), dumbbell (list of available dumbbells), machine & cable (stack step), bodyweight (added plates). |
| 6 | Programme blocks vs per-template rep ranges | Templates hold defaults. If a programme is active, the current block overrides rep range, sets and target RIR. User can turn programme off. |
| 7 | How to pick a weight when a block changes rep range | Inverse Epley from the best recent e1RM at the new target reps + target RIR, rounded *down* to an achievable load and never more than +10 % over last working weight. |
| 8 | Exercise videos/GIFs | Cannot ship licensed third-party media. v1 ships written cues, common mistakes and an optional "Watch demo" link (opens a YouTube search; online only). Data model has a `mediaUrl` slot for licensed/own media later. |
| 9 | Estimated vs actual 1RM | e1RM = Epley, only computed for 1–12 reps. A logged single is shown as a *tested* 1RM; everything else is labelled "est." |
| 10 | First session would make every set a "PR" | PRs are only announced when prior history for that exercise exists. |

### Technical risks
1. **Native build environment** — this build workspace cannot reach Google Maven/Gradle, so the APK must be compiled on a machine with Android Studio (or CI). Mitigation: Capacitor project is generated and documented; web build is testable on any phone now.
2. **Web storage eviction** — browsers can clear IndexedDB. Mitigation: `navigator.storage.persist()`, JSON backup export, and Capacitor (in the APK, app storage is not evicted).
3. **Data loss mid-workout** (app killed, phone restarts) — active workout is written to storage on every change; rest timer stores an absolute end time.
4. **Floating-point loads** (e.g. lb plates converted to kg) — all comparisons use a tolerance; loads are generated from plate combinations, never by naive arithmetic.
5. **Logging speed** — the whole product fails if logging is slow. Mitigation: prefilled values, ±steppers, one-tap complete, auto-start timer.

---

## 2. Technology stack

| Layer | Choice | Why |
|---|---|---|
| UI | React 18 + TypeScript (strict) | Mature, fast to iterate, strongly typed models. |
| Native shell | Capacitor (Android now, iOS later) | Same code becomes an Android APK; iOS later without rewrite. Native Kotlin would be marginally faster but doubles the work for iOS. A tracker's UI is light, so web rendering is fast enough. |
| State | Zustand | Tiny, explicit, no boilerplate. |
| Storage | IndexedDB behind a small repository interface | Works offline in browser and in the Capacitor WebView. Interface lets us swap to SQLite (`@capacitor-community/sqlite`) without touching UI. |
| Charts | Hand-written SVG | Small, fully controlled, readable on phones. |
| Tests | Vitest (+ fake-indexeddb), headless Chromium for UI smoke tests | Fast, deterministic. |
| Build | Vite | Also produces a single-file build for quick phone testing. |

No AI/LLM dependency anywhere in `package.json`.

---

## 3. Architecture

```
UI (screens/components)  ──reads/writes──▶  store (Zustand)  ──▶  repository (IndexedDB)
         │                                        │
         └────────────── calls pure functions ────┴──▶  domain/ (no I/O, no React)
```

* `domain/` is pure TypeScript: given history + settings → recommendation with human-readable reasons. 100 % unit-testable, no clocks (dates are passed in).
* `data/` owns persistence and seed data. Workouts are stored as documents (workout → exercise entries → sets) so a save is atomic and an in-progress workout restores in one read.
* `store/` holds loaded data in memory, exposes actions, persists after each mutation.
* Navigation: a small typed stack navigator (tabs + pushed screens). No router dependency.

### Folder structure
```
src/
  domain/        types.ts, units.ts, loads.ts, e1rm.ts, progression.ts,
                 periodization.ts, deload.ts, prs.ts, analytics.ts  (+ *.test.ts)
  data/          db.ts (repository), seedExercises.ts, seedTemplates.ts, backup.ts
  store/         store.ts
  ui/            App.tsx, nav.ts, theme.css, components/, screens/
docs/            PLAN.md, RULES.md
android/         generated by Capacitor
```

---

## 4. Data model (all entities: `id` UUID, `createdAt`, `updatedAt`)

* **Profile** — name?, experience (beginner/intermediate/advanced), unit (kg/lb), settings (rest default, autoStartTimer, askRir, minRirToProgress, deloadEveryWeeks, equipment profile).
* **EquipmentProfile** — barKg, plates[] (per side), dumbbells[], machineStepKg, cableStepKg, maxJumpPct.
* **Exercise** — name, primary muscle, secondary muscles[], equipment, movement pattern, type (compound/isolation), default rep range, default sets, progression method, increment preference, cues[], mistakes[], notes, mediaUrl?, isCustom, active.
* **WorkoutTemplate** — name, items[] {exerciseId, sets, repMin, repMax, targetRir, restSec, method}.
* **Workout** — startedAt, finishedAt?, templateId?, blockId?, isDeload, isHeavy, notes, status (active/completed), entries[] {exerciseId, order, notes, substitutedFrom?, target, sets[] {weightKg, reps, rir?, done, completedAt?, kind: warmup/working/top/backoff}}.
* **Program** — name, startDate, blocks[] {name, type (hypertrophy/strength/mixed/deload), weeks, repMin, repMax, sets, targetRir, method, setFactor, loadFactor}, currentBlockIndex, blockStartedAt.
* **PersonalRecord** — exerciseId, type (maxWeight / repsAtWeight / e1rm / volume / tested1rm), value, weightKg, reps, workoutId, date.

Weights are stored in **kg**; converted at the display edge.

---

## 5. UX flows

1. **Onboarding** (3 steps, skippable): units → experience → equipment (gym plates). Creates starter Push/Pull/Legs templates.
2. **Home**: "Next workout" card (one tap to start), programme status, deload/heavy-day nudges, recent PRs.
3. **Start workout**: from template, empty, or repeat last.
4. **Logging** (the key screen): one exercise card in focus. Each set row shows *previous* and a prefilled *suggested* weight/reps. Tap ✓ → set saved, rest timer starts, next row focused. Steppers ± use the exercise's real increment. RIR is a one-tap chip row (optional).
5. **Rest timer**: sticky bar at bottom, ±15 s, skip; vibrates at zero; survives restart.
6. **Finish**: summary (duration, volume, PRs), notes.
7. **History** → workout detail (editable, deletable).
8. **Exercise detail**: recommendation + reasons, charts (e1RM, top weight), PR history, form cues.
9. **Progress**: weekly volume, sets per muscle group, consistency, PRs.
10. **Templates**: create/edit/reorder.
11. **Settings**: units, plates, rules, programme, backup.

---

## 6. Milestones

| M | Scope | Exit criterion |
|---|---|---|
| M1 | Plan (this doc) | Reviewed |
| M2 | Domain engine + tests | All rule tests pass |
| M3 | Data layer, seed DB, MVP UI (onboarding → log → history) | Log a full workout in headless browser; restore after reload |
| M4 | Progression in UI, PRs, increments | Suggestions visible & explained |
| M5 | Periodization, deloads, heavy days | Block tests pass; UI switches blocks |
| M6 | Analytics | Charts render with seeded history |
| M7 | Polish, QA pass, packaging | Published test build + Capacitor project |
| M8 | APK build & device test | Needs Android Studio / CI (see README) |

## 7. Development roles

Single lead engineer coordinating focused passes: Architect (this doc), Training-design (RULES.md + domain), UI/UX + visual design, QA (tests + adversarial browser run), Performance (bundle size, render cost), Data/Security (local-only, no PII, backups).

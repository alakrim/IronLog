// Generates an IronLog backup with ~8 weeks of plausible Push/Pull/Legs history.
// Used for UI testing and demo screenshots. Usage: node scripts/demo-backup.mjs > demo.json
const DAY = 86400000;
const now = Date.now();
let n = 0;
const id = (p) => `${p}_demo_${(n++).toString(36)}`;

const T = (sets, repMin, repMax) => ({ sets, repMin, repMax, targetRir: 2, method: 'double', restSec: null });
const plan = {
  Push: [['bench_press', 60, 6, 10, 2.5], ['incline_db_press', 22, 8, 12, 2], ['lateral_raise', 8, 12, 20, 1], ['db_shoulder_press', 20, 8, 12, 2], ['triceps_pushdown', 25, 10, 15, 2.5]],
  Pull: [['pull_up', 0, 5, 10, 2.5], ['barbell_row', 60, 6, 10, 2.5], ['lat_pulldown', 55, 8, 12, 2.5], ['rear_delt_fly', 6, 12, 20, 1], ['db_curl', 12, 8, 12, 2]],
  Legs: [['squat', 80, 5, 8, 5], ['rdl', 80, 6, 10, 5], ['leg_press', 140, 8, 12, 10], ['leg_curl', 40, 10, 15, 5], ['calf_raise', 60, 10, 15, 5]],
};
const state = {};
const templates = Object.entries(plan).map(([name, items], i) => ({
  id: `tpl_demo_${name}`, name, createdAt: now - 60 * DAY + i, updatedAt: now - 60 * DAY + i,
  items: items.map(([exerciseId, , repMin, repMax]) => ({ exerciseId, sets: 3, repMin, repMax, targetRir: 2, restSec: null, method: 'double' })),
}));

const workouts = [];
const names = ['Push', 'Pull', 'Legs'];
let k = 0;
for (let d = 56; d >= 2; d -= d % 7 === 0 ? 3 : 2) {
  const name = names[k++ % 3];
  const start = now - d * DAY + 18 * 3600e3 - ((now - d * DAY) % DAY);
  const entries = plan[name].map(([exerciseId, base, repMin, repMax, inc]) => {
    const s = (state[exerciseId] ??= { w: base, reps: repMin });
    const sets = [];
    for (let i = 0; i < 3; i++) {
      const reps = Math.max(repMin - 1, Math.min(repMax, s.reps - (i === 2 ? 1 : 0) + (i === 0 ? 0 : 0)));
      sets.push({ id: id('set'), kind: 'working', weightKg: s.w, reps, rir: i === 2 ? 1 : 2, done: true, completedAt: start + (i + 1) * 150000 });
    }
    // progress for next time
    if (sets.every((x) => x.reps >= repMax)) { s.w += inc; s.reps = repMin; } else s.reps += 1;
    return { id: id('ent'), exerciseId, notes: '', substitutedFrom: null, skipped: false, target: T(3, repMin, repMax), sets };
  });
  workouts.push({
    id: id('wo'), name, status: 'completed', startedAt: start, finishedAt: start + (55 + (k % 4) * 6) * 60000,
    templateId: `tpl_demo_${name}`, blockName: null, isDeload: false, isHeavy: false, notes: '', entries,
    createdAt: start, updatedAt: start,
  });
}

process.stdout.write(JSON.stringify({
  app: 'ironlog', version: 1, exportedAt: now,
  profile: { id: 'profile', name: 'Bruno', experience: 'intermediate', unit: 'kg', onboarded: true, settings: {}, createdAt: now - 60 * DAY, updatedAt: now },
  exercises: [], templates, workouts, program: null,
}));

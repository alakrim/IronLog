# IronLog

Offline-first gym log for Android. Fast set logging, automatic progression, training blocks, deloads,
PRs and progress charts. All logic is plain, tested TypeScript — no AI or network at runtime.

## Run it

```bash
npm install
npm test             # 60 unit/integration tests
npm run dev          # local dev server
npm run build:single # dist-single/index.html — whole app in one file, for quick phone testing
```

## Build the Android app (APK)

**Option A — GitHub (no Android Studio needed):** push this folder to a GitHub repo. The included
workflow `.github/workflows/android.yml` runs the tests, builds `app-debug.apk` and attaches it to the run
(Actions tab → latest run → Artifacts). Download it on your phone and install (allow "install unknown apps").

**Option B — Android Studio:**
```bash
npm run build && npx cap sync android && npx cap open android
```
Then *Run* on a connected phone, or *Build → Build APK(s)*. For a Play Store release use
*Build → Generate Signed Bundle* with your own keystore.

## Project layout
```
src/domain/   pure rules: progression, loads/plates, e1RM, PRs, periodization, analytics (+ tests)
src/data/     IndexedDB repository, seed exercises (with cues & mistakes), seed templates
src/store/    app state; every change is persisted immediately (+ integration tests)
src/ui/       React screens, components, theme
scripts/      demo data generator, headless phone-size browser tests
docs/         PLAN.md (architecture & decisions), RULES.md (every progression rule)
android/      Capacitor Android project
```

## Known limitations (v0.1)
* Rest timer vibrates when the app is open; a background notification needs the Capacitor
  Local Notifications plugin (planned).
* Exercise demos link to a YouTube search (online only); no licensed videos are bundled.
  `Exercise.mediaUrl` exists for adding your own.
* In the browser test build, data lives in browser storage — use Settings → Backup before clearing site data.
  The installed Android app keeps data in app storage.

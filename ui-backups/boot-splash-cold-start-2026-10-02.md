# Boot splash: cold start vs F5 (2026-10-02)

**Problem:** After killing Chrome on Android, tab restore kept `sessionStorage`, so splash was skipped and user saw blank / «Загрузка…».

**Fix:** Skip splash only when `navigation.type === 'reload'` (F5). Cold start / tab restore (`navigate`) always shows branded splash. `boot-gate.js` matches.

**Also:** `initPromise` uses `softRefreshCurrentTab()` instead of full `render()` so HW data update doesn't wipe cached Пары/Преп.

**Rollback:** restore sessionStorage `rasp_splash_seen_v1` logic; SW v69.

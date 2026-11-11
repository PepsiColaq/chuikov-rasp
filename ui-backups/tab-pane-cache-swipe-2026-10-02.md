# Tab pane cache + swipe shield (2026-10-02)

**Problem:** After swiping from ДЗ to Преп/Пары, tab felt like a full reload (~1s cascade).

**Fix (main.js):**
- `tabPaneCache` + `borrowTabPane` / `returnTabPane` on swipe commit/abort
- `tabSwitchShieldActive()` — skip full `render()` for ~2.5s after swipe (was broken: `force` defaulted true)
- `warmTabPaneNeighbors()` after commit and initial render
- `initPromise`: invalidate hw/schedule cache only; full render only if on those tabs
- sync/ptr: respect shield + swipe flags

**Rollback:** revert tab cache block near `TAB_ORDER`, restore plain `render()` without shield; SW v68.

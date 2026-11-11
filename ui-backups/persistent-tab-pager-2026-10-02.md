# Persistent tab pager (2026-10-02)

**Problem:** Cache/borrow still rebuilt Пары/Преп when leaving ДЗ (heavy tabs), while Замены/Ещё felt instant.

**Fix:** All 5 tabs stay mounted in one `.tab-track.tab-pager`. Swipe only changes `transform`. Sync updates panes in place via `refreshTabPanes`.

**Rollback:** restore previous swipeEnsureTrack + tabPaneCache approach; SW v71.

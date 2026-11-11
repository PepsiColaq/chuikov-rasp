# Бэкап UI: ДЗ empty + вкладка ДЗ (до 01.10.2026)

Откат:
1. В `src/main.js` поставь:
   - `const HW_EMPTY_QUIET = false`
   - `const HW_TAB_BY_DAY = false`
2. Задеплой.

При `HW_EMPTY_QUIET = false`:
- на «Парах» снова строка «ДЗ не задано» у каждой пары.

При `HW_TAB_BY_DAY = false`:
- вкладка «ДЗ» снова плоский список без группировки по дням;
- дни на «ДЗ» снова без скролла (см. также ui-backups/hw-day-jump-before-2026-10-01.md).


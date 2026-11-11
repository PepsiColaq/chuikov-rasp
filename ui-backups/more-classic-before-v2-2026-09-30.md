# Бэкап вкладки «Ещё» (классический UI до more-v2, 30.09.2026)

Откат: в `src/main.js` поставь `const MORE_UI_V2 = false` и задеплой.

Классическая реализация остаётся в функции `renderMoreClassic()`.
Новый UI — `renderMoreV2()` (вызывается из `renderMore()` при `MORE_UI_V2 === true`).

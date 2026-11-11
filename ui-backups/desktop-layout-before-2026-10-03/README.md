# Бэкап до ПК-версии (2026-10-03)

Состояние: только mobile-first, `#app` max-width 480px.

## Откат

Из папки `rasp`:

```powershell
Copy-Item ui-backups\desktop-layout-before-2026-10-03\styles.css src\styles.css -Force
Copy-Item ui-backups\desktop-layout-before-2026-10-03\main.js src\main.js -Force
Copy-Item ui-backups\desktop-layout-before-2026-10-03\index.html index.html -Force
Copy-Item ui-backups\desktop-layout-before-2026-10-03\sw.js public\sw.js -Force
npm run build
node scripts/deploy-gh-pages-api.mjs
```

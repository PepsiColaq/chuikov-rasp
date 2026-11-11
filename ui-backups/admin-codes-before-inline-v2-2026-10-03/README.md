# Бэкап до inline-форм админки v2 (2026-10-03)

Состояние: кнопки «Имя» / «Роль» через `prompt()`, код в строке слева.

## Откат

В PowerShell из папки `rasp`:

```powershell
Copy-Item ui-backups\admin-codes-before-inline-v2-2026-10-03\main.js src\main.js -Force
Copy-Item ui-backups\admin-codes-before-inline-v2-2026-10-03\styles.css src\styles.css -Force
Copy-Item ui-backups\admin-codes-before-inline-v2-2026-10-03\index.html index.html -Force
Copy-Item ui-backups\admin-codes-before-inline-v2-2026-10-03\sw.js public\sw.js -Force
npm run build
node scripts/deploy-gh-pages-api.mjs
```

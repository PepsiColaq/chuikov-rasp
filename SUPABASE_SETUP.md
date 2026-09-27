# Подключение общей базы (Supabase) — 5 минут

Чтобы ДЗ и замены видели **все** студенты, нужна бесплатная база.

## 1. Создай проект

1. Открой https://supabase.com/dashboard и войди (GitHub можно).
2. **New project** → любое имя, например `chuikov-rasp`.
3. Задай пароль БД (сохрани), регион ближе к Европе (Frankfurt).
4. Дождись, пока проект станет Ready.

## 2. SQL

1. В меню слева: **SQL** → **New query**.
2. Вставь весь файл [`supabase/schema.sql`](supabase/schema.sql) → **Run**.

## 3. Ключи

1. **Project Settings** → **API**.
2. Скопируй:
   - **Project URL**
   - **anon public** key
   - **service_role** key (секрет! только для заливки с компа)

## 4. Пришли мне в чат

```
URL: https://xxxx.supabase.co
ANON: eyJ...
SERVICE: eyJ...
```

Я пропишу ключи, залью расписание и обновлю сайт на GitHub Pages.

Либо сам создай файл `.env.local` в папке `rasp`:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

и напиши «ключи готовы».

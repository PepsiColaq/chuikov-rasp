-- Состояние бота поддержки для GitHub Actions.
--
-- Зачем: раньше опрос хранил своё состояние (offset, кто ждёт ввода,
-- очередь обращений) в файле scripts/.tg-support-store.json. Файл лежит
-- в .gitignore, а GitHub Actions каждый раз запускает чистую машину.
-- Итог: offset каждый запуск начинался с нуля — Telegram заново отдавал
-- те же сообщения, а «жду ответа студента» терялось между запусками.
-- Внешне: бот молчит или отвечает не на то.
--
-- Теперь состояние лежит в этой таблице. Ключ — строка, значение — jsonb.
-- Таблица доступна только через service_role (RLS включён, политик нет).

create table if not exists public.tg_bot_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.tg_bot_state enable row level security;

-- Читать и писать может только service_role (обходит RLS).
-- Никаких политик не создаём: anon и authenticated доступа не получат.

grant all on table public.tg_bot_state to service_role;

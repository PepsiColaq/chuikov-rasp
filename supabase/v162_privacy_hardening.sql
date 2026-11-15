-- ============================================================
-- v162_privacy_hardening.sql
-- Закрываем то, что сейчас реально открыто посторонним.
--
-- КУДА: Supabase → SQL Editor → New query → вставить ВСЁ → Run.
-- Можно запускать повторно: ничего не дублируется и не ломается.
--
-- ЧАСТЬ 1 — хеш кода старосты перестаёт быть публичным (0 риска).
-- ЧАСТЬ 2 — посторонний не может перебрать список файлов,
--           но загрузка фото продолжает работать.
-- ЧАСТЬ 3 — гасим один старый «живой» хеш кода.
-- ============================================================


-- ============================================================
-- ЧАСТЬ 1. ГРУППЫ: скрыть хеш кода старосты
-- ============================================================
-- Сейчас любой, кто открыл сайт, может запросить таблицу groups
-- и увидеть starosta_code_hash каждой группы.
--
-- Почему именно так, а не "revoke select (starosta_code_hash)":
-- в Postgres право на таблицу ПЕРЕКРЫВАЕТ право на колонку.
-- Поэтому сначала забираем право на таблицу целиком, а потом
-- выдаём обратно только безопасные колонки.
--
-- Сайт читает из groups ровно: id, name, faculty, active.
-- created_at оставляем — оно не секретное.
-- Все функции (вход, создание группы, сброс кода) — security definer,
-- они работают от владельца таблицы и продолжают работать как раньше.

revoke select on public.groups from anon, authenticated;

grant select (id, name, faculty, active, created_at)
  on public.groups to anon, authenticated;


-- ============================================================
-- ЧАСТЬ 2. ХРАНИЛИЩЕ: убрать перечисление файлов
-- ============================================================
-- Сейчас можно запросить список папок в бакетах и увидеть имена
-- всех файлов (аватары, фото ДЗ). Имена случайные, но список
-- позволял собрать их все и скачать.
--
-- Как закрываем: оставляем чтение ТОЛЬКО для файла, который
-- человек сам только что загрузил (по билету загрузки, 1 час).
-- Перечисление старых файлов становится пустым.
--
-- Почему не просто "drop policy":
-- сервер хранилища после вставки файла перечитывает эту же строку,
-- и без права чтения загрузка может отвалиться с ошибкой
-- "The resource was not found". Этот вариант оставляет загрузку
-- рабочей в любом случае.
--
-- Прямые ссылки на фото (/storage/v1/object/public/...) работают
-- отдельно от политик (бакет публичный), поэтому уже загруженные
-- фото в ДЗ и аватарки не пропадут.

create or replace function public._hw_recent_upload(p_bucket text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.hw_upload_tickets t
    where t.bucket_id = p_bucket
      and t.object_path = p_name
      and t.created_at > now() - interval '1 hour'
  );
$$;

revoke all on function public._hw_recent_upload(text, text) from public;
grant execute on function public._hw_recent_upload(text, text) to anon, authenticated;

drop policy if exists "hw storage public read" on storage.objects;
drop policy if exists "hw photos public read" on storage.objects;
drop policy if exists "hw files public read" on storage.objects;
drop policy if exists "hw storage read own uploads" on storage.objects;

create policy "hw storage read own uploads"
  on storage.objects for select
  using (
    bucket_id in ('hw-photos', 'hw-files')
    and public._hw_recent_upload(bucket_id, name)
  );


-- ============================================================
-- ЧАСТЬ 3. Убрать старый «живой» хеш кода
-- ============================================================
-- В одной группе остался хеш старого формата (32 символа вместо 64).
-- Войти по нему всё равно нельзя: проверка идёт по sha256 длиной 64,
-- а рабочие коды лежат в group_codes. Просто гасим его.

update public.groups
set starosta_code_hash = 'revoked_' || id
where coalesce(starosta_code_hash, '') <> ''
  and starosta_code_hash not like 'revoked_%'
  and length(starosta_code_hash) < 64;


-- ============================================================
-- Применить изменения сразу, не ожидая перезагрузки схемы
-- ============================================================

notify pgrst, 'reload schema';


-- ============================================================
-- ПРОВЕРКА (запусти отдельно, чтобы увидеть результат)
-- ============================================================
-- 1) у постороннего должны остаться только безопасные колонки:
--    select grantee, column_name
--    from information_schema.column_privileges
--    where table_schema = 'public' and table_name = 'groups'
--      and grantee in ('anon','authenticated')
--    order by grantee, column_name;
--
-- 2) какая политика теперь на файлах:
--    select policyname, cmd from pg_policies
--    where schemaname = 'storage' and tablename = 'objects';
--
-- 3) бакеты должны остаться public = true (иначе фото не откроются):
--    select id, public from storage.buckets where id in ('hw-photos','hw-files');
--
-- 4) старых хешей быть не должно (запрос вернёт 0 строк):
--    select id from public.groups where length(starosta_code_hash) < 64;


-- ============================================================
-- ОТКАТ (если что-то пошло не так — по одной строке)
-- ============================================================
-- Вернуть чтение групп целиком:
--   grant select on public.groups to anon, authenticated;
--
-- Вернуть список файлов (если перестала работать загрузка фото):
--   drop policy if exists "hw storage read own uploads" on storage.objects;
--   create policy "hw storage public read"
--     on storage.objects for select
--     using (bucket_id in ('hw-photos', 'hw-files'));

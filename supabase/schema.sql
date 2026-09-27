-- Schema for future Supabase sync (optional).
-- Local MVP stores data in the browser; run this when connecting Supabase.

create extension if not exists pgcrypto;

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  faculty text default '',
  active boolean not null default true,
  starosta_code_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists app_secrets (
  id text primary key,
  admin_code_hash text not null,
  semester_label text not null default ''
);

create table if not exists lessons (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  day smallint not null check (day between 1 and 5),
  start_time time not null,
  end_time time not null,
  subject text not null,
  room text default '',
  remote boolean not null default false,
  week_type text not null default 'every' check (week_type in ('every','num','den'))
);

create table if not exists overrides (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,
  on_date date not null,
  type text not null check (type in ('room_only','subject','subject_and_room','cancelled')),
  new_room text default '',
  new_subject text default '',
  note text default '',
  unique (group_id, lesson_id, on_date)
);

create table if not exists homework (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  subject text not null,
  body text not null,
  due_date date,
  lesson_id uuid references lessons(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  action text not null,
  group_id uuid,
  detail text default '',
  by_role text default ''
);

alter table groups enable row level security;
alter table lessons enable row level security;
alter table overrides enable row level security;
alter table homework enable row level security;
alter table audit_log enable row level security;
alter table app_secrets enable row level security;

-- Public read of schedule data
create policy "public read groups" on groups for select using (active = true);
create policy "public read lessons" on lessons for select using (true);
create policy "public read overrides" on overrides for select using (true);
create policy "public read homework" on homework for select using (true);

-- Writes only via SECURITY DEFINER RPCs (starosta/admin code check) — add in Edge Functions.
-- Do not expose service_role key in the frontend.

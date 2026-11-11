-- Optional: offset storage if using GitHub Action poller instead of CF Worker.
create table if not exists public.tg_support_meta (
  id text primary key default 'main',
  update_offset bigint not null default 0,
  admin_chat_id text
);

alter table public.tg_support_meta enable row level security;

insert into public.tg_support_meta (id, update_offset)
values ('main', 0)
on conflict (id) do nothing;

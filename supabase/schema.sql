create extension if not exists pgcrypto;

create table if not exists lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('grocery', 'todo', 'shopping')),
  created_at timestamptz not null default now()
);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references lists(id) on delete cascade,
  text text not null,
  done boolean not null default false,
  quantity numeric,
  unit text,
  created_at timestamptz not null default now()
);

alter table lists enable row level security;
alter table items enable row level security;

-- No auth in this app yet: anyone with the anon key can read/write.
-- Fine for a small shared list between two people, but revisit if that changes.
create policy "anon full access" on lists for all using (true) with check (true);
create policy "anon full access" on items for all using (true) with check (true);

alter publication supabase_realtime add table lists;
alter publication supabase_realtime add table items;

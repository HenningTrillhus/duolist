create extension if not exists pgcrypto;

create table if not exists lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('grocery', 'todo', 'shopping')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references lists(id) on delete cascade,
  text text not null,
  done boolean not null default false,
  quantity numeric,
  unit text,
  store text,
  image_url text,
  link_url text,
  added_by text check (added_by in ('Nora', 'Henning')),
  completed_at timestamptz,
  archived boolean not null default false,
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

-- Keep lists.updated_at current whenever its items change, so the UI can
-- show "last changed" per list without any client-side bookkeeping.
create or replace function touch_list_updated_at()
returns trigger
language plpgsql
as $$
begin
  update lists set updated_at = now() where id = coalesce(new.list_id, old.list_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists items_touch_list on items;
create trigger items_touch_list
after insert or update or delete on items
for each row execute function touch_list_updated_at();

-- Storage bucket for item photos, publicly readable so image URLs work
-- directly in <img> tags without signed URLs.
insert into storage.buckets (id, name, public)
values ('item-files', 'item-files', true)
on conflict (id) do nothing;

create policy "anon read item-files" on storage.objects
  for select using (bucket_id = 'item-files');

create policy "anon insert item-files" on storage.objects
  for insert with check (bucket_id = 'item-files');

create policy "anon delete item-files" on storage.objects
  for delete using (bucket_id = 'item-files');

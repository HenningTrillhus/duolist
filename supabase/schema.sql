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
  created_at timestamptz not null default now(),
  -- Manual sort order (todo-list drag reorder). New rows default to "now" in
  -- epoch seconds so they land at the end without the app having to compute it.
  position double precision not null default extract(epoch from clock_timestamp())
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

-- One planned dinner per calendar day. image_url mirrors the linked main
-- recipe's image (if any) so the day card can show a thumbnail.
-- recipe_links maps course ('main'/'side'/'starter'/'dessert') to a cached
-- {recipe_id, image_url, love_rating, difficulty, prep_time_minutes} object
-- from the separate Min Munch recipe book — no cross-database FK is
-- possible, so this is a denormalized snapshot taken at pick time.
create table if not exists dinners (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  name text not null,
  side text,
  starter text,
  dessert text,
  image_url text,
  recipe_links jsonb not null default '{}'::jsonb,
  added_by text check (added_by in ('Nora', 'Henning')),
  created_at timestamptz not null default now()
);

alter table dinners enable row level security;
create policy "anon full access" on dinners for all using (true) with check (true);
alter publication supabase_realtime add table dinners;

-- One row per browser/device that has enabled push notifications. A user can
-- have several (phone + laptop); we push to all of them and prune ones the
-- push service reports as gone (410/404) from the send-push edge function.
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_name text not null check (user_name in ('Nora', 'Henning')),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;
create policy "anon full access" on push_subscriptions for all using (true) with check (true);

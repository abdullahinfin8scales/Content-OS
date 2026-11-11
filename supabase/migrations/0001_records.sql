-- Infin8 Content OS: cloud copy of the workspace.
--
-- Every record the app stores (space, folder, doc, content, platform) is one
-- row here, as the same JSON the app keeps on the laptop. Rows belong to the
-- signed-in user and row-level security keeps every user to their own rows.
--
-- Sync rules (see src/sync/engine.ts):
--   * updated_at   = when the change was made on a device (ms since 1970).
--                    The newer change wins (last write wins).
--   * deleted      = the record was permanently deleted (data is cleared).
--   * server_updated_at = when the server stored the row; devices pull rows
--                    changed after the last time they looked.

create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('space', 'folder', 'doc', 'content', 'platform')),
  id text not null check (char_length(id) between 1 and 128),
  data jsonb,
  deleted boolean not null default false,
  updated_at bigint not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, kind, id),
  constraint deleted_rows_have_no_data check (not deleted or data is null)
);

create index if not exists records_pull_idx on public.records (user_id, server_updated_at, kind, id);

-- The server, not the device, stamps when a row was stored.
create or replace function public.records_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_updated_at := now();
  return new;
end;
$$;

drop trigger if exists records_stamp on public.records;
create trigger records_stamp
  before insert or update on public.records
  for each row execute function public.records_stamp();

-- Row-level security: a user only ever sees and changes their own rows.
alter table public.records enable row level security;

drop policy if exists "Own records: read" on public.records;
drop policy if exists "Own records: add" on public.records;
drop policy if exists "Own records: change" on public.records;
drop policy if exists "Own records: remove" on public.records;

create policy "Own records: read" on public.records
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Own records: add" on public.records
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Own records: change" on public.records
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Own records: remove" on public.records
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on table public.records from anon, public;
grant select, insert, update, delete on table public.records to authenticated;

-- Upload a batch of changes. A change only replaces the stored row when it is
-- at least as new. Rows the server kept because they were newer are returned,
-- so the device can take them instead of keeping a stale copy.
create or replace function public.push_records(changes jsonb)
returns setof public.records
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if jsonb_typeof(changes) is distinct from 'array' then
    raise exception 'changes must be a JSON array' using errcode = '22023';
  end if;

  return query
  with incoming as (
    select distinct on (c.kind, c.id)
      c.kind, c.id, case when coalesce(c.deleted, false) then null else c.data end as data,
      coalesce(c.deleted, false) as deleted, c.updated_at
    from jsonb_to_recordset(changes) as c(kind text, id text, data jsonb, deleted boolean, updated_at bigint)
    order by c.kind, c.id, c.updated_at desc
  ),
  written as (
    insert into public.records as r (user_id, kind, id, data, deleted, updated_at)
    select uid, i.kind, i.id, i.data, i.deleted, i.updated_at from incoming i
    on conflict (user_id, kind, id) do update
      set data = excluded.data, deleted = excluded.deleted, updated_at = excluded.updated_at
      where r.updated_at <= excluded.updated_at
    returning r.kind, r.id
  )
  select r.* from public.records r
  join incoming i on r.user_id = uid and r.kind = i.kind and r.id = i.id
  where not exists (select 1 from written w where w.kind = i.kind and w.id = i.id);
end;
$$;

-- Download rows changed after a point, oldest first, a page at a time.
create or replace function public.pull_records(
  since timestamptz,
  after_kind text default '',
  after_id text default '',
  page_size integer default 500
)
returns setof public.records
language sql
stable
security invoker
set search_path = ''
as $$
  select * from public.records
  where user_id = (select auth.uid())
    and (server_updated_at, kind, id) > (since, after_kind, after_id)
  order by server_updated_at, kind, id
  limit least(greatest(page_size, 1), 1000);
$$;

revoke all on function public.push_records(jsonb) from anon, public;
revoke all on function public.pull_records(timestamptz, text, text, integer) from anon, public;
grant execute on function public.push_records(jsonb) to authenticated;
grant execute on function public.pull_records(timestamptz, text, text, integer) to authenticated;

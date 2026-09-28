-- The worldwide turn count: one row, changed only through add_turns().
create table if not exists public.turns (
    id    smallint primary key default 1 check (id = 1),
    total bigint   not null default 0
);
insert into public.turns (id, total) values (1, 0) on conflict (id) do nothing;

-- No policies: the public (anon) key can neither read nor write the table.
alter table public.turns enable row level security;

-- Adds a small batch of turns atomically and returns the new total. Only
-- the server (service role) may call it; the cap limits any one request.
create or replace function public.add_turns(n integer)
returns bigint
language sql
security definer
set search_path = public
as $$
    update public.turns
    set total = total + least(greatest(n, 0), 40)
    where id = 1
    returning total;
$$;

revoke all on function public.add_turns(integer) from public, anon, authenticated;
grant execute on function public.add_turns(integer) to service_role;

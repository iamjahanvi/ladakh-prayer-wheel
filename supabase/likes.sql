-- Likes on gallery photos: one row per photo per visitor (a random id kept
-- in the visitor's browser). Changed only through like_photo().
create table if not exists public.photo_likes (
    photo      text        not null check (photo ~ '^[a-z0-9-]{1,64}$'),
    visitor    uuid        not null,
    ip_hash    text        not null,
    created_at timestamptz not null default now(),
    primary key (photo, visitor)
);
create index if not exists photo_likes_ip on public.photo_likes (photo, ip_hash);

-- No policies: the public (anon) key can neither read nor write the table.
alter table public.photo_likes enable row level security;
revoke all on public.photo_likes from anon, authenticated;

-- Like or unlike, then return the photo's count. A network (hashed IP) can
-- add at most 20 likes to one photo (enough for a family or a guesthouse
-- on shared wifi), so new private windows can't pile up.
create or replace function public.like_photo(p text, v uuid, liked boolean, h text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
    if liked then
        if (select count(*) from photo_likes where photo = p and ip_hash = h) < 20 then
            insert into photo_likes (photo, visitor, ip_hash) values (p, v, h)
            on conflict (photo, visitor) do nothing;
        end if;
    else
        delete from photo_likes where photo = p and visitor = v;
    end if;
    return (select count(*) from photo_likes where photo = p);
end;
$$;

create or replace function public.like_counts()
returns table (photo text, n bigint)
language sql
security definer
set search_path = public
as $$
    select photo, count(*) from photo_likes group by photo;
$$;

revoke all on function public.like_photo(text, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.like_counts() from public, anon, authenticated;
grant execute on function public.like_photo(text, uuid, boolean, text) to service_role;
grant execute on function public.like_counts() to service_role;

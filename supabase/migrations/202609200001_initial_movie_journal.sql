create extension if not exists pgcrypto;

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_name text not null,
  status text not null default 'parsed' check (status in ('parsed', 'committed', 'failed')),
  parsed_count integer not null default 0,
  committed_count integer not null default 0,
  warning_count integer not null default 0,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  committed_at timestamptz
);

create table public.movies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_title text not null,
  normalized_title text not null,
  original_title text,
  english_title text,
  tmdb_id bigint,
  tmdb_poster_path text,
  tmdb_backdrop_path text,
  overview text,
  release_date date,
  runtime_minutes integer,
  original_language text,
  genres jsonb not null default '[]'::jsonb,
  directors jsonb not null default '[]'::jsonb,
  cast_members jsonb not null default '[]'::jsonb,
  match_status text not null default 'unmatched' check (match_status in ('unmatched', 'suggested', 'accepted', 'rejected', 'manual')),
  match_confidence numeric(5, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, normalized_title),
  unique (user_id, tmdb_id)
);

create table public.watch_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  movie_id uuid not null references public.movies(id) on delete cascade,
  watched_on date,
  source_title text not null,
  source_sheet text,
  source_row integer,
  source_slot text,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  rating integer check (rating between 1 and 10),
  platform text,
  notes text,
  is_rewatch boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.movie_match_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  movie_id uuid not null references public.movies(id) on delete cascade,
  tmdb_id bigint not null,
  title text not null,
  original_title text,
  release_date date,
  poster_path text,
  original_language text,
  score numeric(5, 2) not null,
  payload jsonb not null default '{}'::jsonb,
  accepted boolean not null default false,
  created_at timestamptz not null default now(),
  unique (movie_id, tmdb_id)
);

create index movies_user_title_idx on public.movies (user_id, normalized_title);
create index movies_user_match_status_idx on public.movies (user_id, match_status);
create index movies_user_tmdb_idx on public.movies (user_id, tmdb_id);
create index watch_entries_user_watched_on_idx on public.watch_entries (user_id, watched_on desc);
create index watch_entries_user_movie_idx on public.watch_entries (user_id, movie_id);
create index match_candidates_movie_score_idx on public.movie_match_candidates (movie_id, score desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;

create trigger set_movies_updated_at
before update on public.movies
for each row execute function public.set_updated_at();

create trigger set_watch_entries_updated_at
before update on public.watch_entries
for each row execute function public.set_updated_at();

alter table public.import_batches enable row level security;
alter table public.movies enable row level security;
alter table public.watch_entries enable row level security;
alter table public.movie_match_candidates enable row level security;

create policy "Users can read their import batches"
on public.import_batches for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their import batches"
on public.import_batches for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their import batches"
on public.import_batches for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can read their movies"
on public.movies for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their movies"
on public.movies for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their movies"
on public.movies for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their movies"
on public.movies for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their watch entries"
on public.watch_entries for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their watch entries"
on public.watch_entries for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their watch entries"
on public.watch_entries for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their watch entries"
on public.watch_entries for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their match candidates"
on public.movie_match_candidates for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their match candidates"
on public.movie_match_candidates for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their match candidates"
on public.movie_match_candidates for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their match candidates"
on public.movie_match_candidates for delete
to authenticated
using ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, insert, update on public.import_batches to authenticated;
grant select, insert, update, delete on public.movies to authenticated;
grant select, insert, update, delete on public.watch_entries to authenticated;
grant select, insert, update, delete on public.movie_match_candidates to authenticated;

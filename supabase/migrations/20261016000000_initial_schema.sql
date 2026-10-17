-- DIONER Keyboardist — initial cloud schema.
-- Every table holds private, user-owned data and has Row Level Security
-- with explicit owner checks. IDs are UUIDs generated on the device, so
-- records keep the same ID locally and in the cloud.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create a profile row for each new user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- songs
-- ---------------------------------------------------------------------------
create table if not exists public.songs (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  artist text check (char_length(artist) <= 200),
  song_number text check (char_length(song_number) <= 20),
  original_key text not null check (original_key ~ '^([0-9]|1[01]):(major|minor)$'),
  tags jsonb not null default '[]'::jsonb check (jsonb_typeof(tags) = 'array'),
  notes text check (char_length(notes) <= 5000),
  lyrics text check (char_length(lyrics) <= 20000),
  source_attribution text check (char_length(source_attribution) <= 500),
  is_saved boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);
create index if not exists songs_owner_updated_idx on public.songs (owner_id, updated_at);

create table if not exists public.song_sections (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  song_id uuid not null references public.songs (id) on delete cascade,
  position integer not null check (position >= 0),
  label text not null check (char_length(label) <= 40),
  chords text not null check (char_length(chords) <= 500),
  unique (song_id, position)
);
create index if not exists song_sections_song_idx on public.song_sections (song_id);
create index if not exists song_sections_owner_idx on public.song_sections (owner_id);

-- ---------------------------------------------------------------------------
-- rehearsals and recordings
-- ---------------------------------------------------------------------------
create table if not exists public.rehearsals (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  song_id uuid references public.songs (id) on delete set null,
  original_key text check (original_key ~ '^([0-9]|1[01]):(major|minor)$'),
  played_key text check (played_key ~ '^([0-9]|1[01]):(major|minor)$'),
  transposition_semitones integer not null default 0 check (transposition_semitones between -11 and 11),
  notes text check (char_length(notes) <= 5000),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);
create index if not exists rehearsals_owner_updated_idx on public.rehearsals (owner_id, updated_at);

create table if not exists public.recordings (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rehearsal_id uuid not null references public.rehearsals (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  -- Path inside the private "recordings" bucket: <owner_id>/<recording id>.m4a.
  -- Null when only the metadata is backed up (audio upload is opt-in).
  storage_path text check (storage_path is null or storage_path like owner_id::text || '/%'),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);
create index if not exists recordings_owner_updated_idx on public.recordings (owner_id, updated_at);
create index if not exists recordings_rehearsal_idx on public.recordings (rehearsal_id);

-- ---------------------------------------------------------------------------
-- learning progress
-- ---------------------------------------------------------------------------
create table if not exists public.learning_progress (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lesson_id text not null check (char_length(lesson_id) <= 100),
  attempts integer not null default 0 check (attempts >= 0),
  best_score integer check (best_score >= 0),
  last_score integer check (last_score >= 0),
  question_count integer check (question_count > 0),
  completed_at timestamptz,
  updated_at timestamptz not null,
  primary key (owner_id, lesson_id)
);

-- ---------------------------------------------------------------------------
-- Row Level Security: a user can only see and change their own rows.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.songs enable row level security;
alter table public.song_sections enable row level security;
alter table public.rehearsals enable row level security;
alter table public.recordings enable row level security;
alter table public.learning_progress enable row level security;

-- profiles (rows are created by the trigger; users may read/update their own)
create policy "profiles_select_own" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- songs
create policy "songs_select_own" on public.songs for select to authenticated using (owner_id = (select auth.uid()));
create policy "songs_insert_own" on public.songs for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "songs_update_own" on public.songs for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "songs_delete_own" on public.songs for delete to authenticated using (owner_id = (select auth.uid()));

-- song_sections: owner must also own the parent song
create policy "sections_select_own" on public.song_sections for select to authenticated using (owner_id = (select auth.uid()));
create policy "sections_insert_own" on public.song_sections for insert to authenticated with check (
  owner_id = (select auth.uid())
  and exists (select 1 from public.songs s where s.id = song_id and s.owner_id = (select auth.uid()))
);
create policy "sections_update_own" on public.song_sections for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.songs s where s.id = song_id and s.owner_id = (select auth.uid()))
  );
create policy "sections_delete_own" on public.song_sections for delete to authenticated using (owner_id = (select auth.uid()));

-- rehearsals: a linked song must belong to the same user
create policy "rehearsals_select_own" on public.rehearsals for select to authenticated using (owner_id = (select auth.uid()));
create policy "rehearsals_insert_own" on public.rehearsals for insert to authenticated with check (
  owner_id = (select auth.uid())
  and (song_id is null or exists (select 1 from public.songs s where s.id = song_id and s.owner_id = (select auth.uid())))
);
create policy "rehearsals_update_own" on public.rehearsals for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (song_id is null or exists (select 1 from public.songs s where s.id = song_id and s.owner_id = (select auth.uid())))
  );
create policy "rehearsals_delete_own" on public.rehearsals for delete to authenticated using (owner_id = (select auth.uid()));

-- recordings: parent rehearsal must belong to the same user
create policy "recordings_select_own" on public.recordings for select to authenticated using (owner_id = (select auth.uid()));
create policy "recordings_insert_own" on public.recordings for insert to authenticated with check (
  owner_id = (select auth.uid())
  and exists (select 1 from public.rehearsals r where r.id = rehearsal_id and r.owner_id = (select auth.uid()))
);
create policy "recordings_update_own" on public.recordings for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.rehearsals r where r.id = rehearsal_id and r.owner_id = (select auth.uid()))
  );
create policy "recordings_delete_own" on public.recordings for delete to authenticated using (owner_id = (select auth.uid()));

-- learning_progress
create policy "progress_select_own" on public.learning_progress for select to authenticated using (owner_id = (select auth.uid()));
create policy "progress_insert_own" on public.learning_progress for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "progress_update_own" on public.learning_progress for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "progress_delete_own" on public.learning_progress for delete to authenticated using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Private Storage bucket for rehearsal audio.
-- Files live at <user id>/<recording id>.m4a; only that user can access them,
-- and only through authenticated requests or short-lived signed URLs.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recordings', 'recordings', false, 104857600, array['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/wav'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "recordings_files_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "recordings_files_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "recordings_files_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "recordings_files_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Phase 1 bootstrap for anonymous identities + notes RLS
-- Idempotent: safe to run multiple times in Supabase SQL editor or CLI.

create extension if not exists "pgcrypto" with schema public;

-- Reads the x-device-id HTTP header (as text)
create or replace function public.request_device_id()
returns text
language sql
stable
as $$
select nullif(current_setting('request.headers.x-device-id', true), '');
$$;

-- Generic updated_at trigger
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- Anonymous identities keyed by anon_id (uuid)
create table if not exists public.anon_identities (
  anon_id uuid primary key default gen_random_uuid(),
  recovery_code_hash text,
  last_active timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  user_id uuid references auth.users(id)
);

-- Per-device link to an anon identity
create table if not exists public.anon_device_links (
  device_id text primary key,
  anon_id uuid not null references public.anon_identities(anon_id) on delete cascade,
  last_active timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- updated_at triggers (create if missing)
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'set_updated_at_anon_identities'
  ) then
    create trigger set_updated_at_anon_identities
      before update on public.anon_identities
      for each row execute procedure public.touch_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'set_updated_at_anon_device_links'
  ) then
    create trigger set_updated_at_anon_device_links
      before update on public.anon_device_links
      for each row execute procedure public.touch_updated_at();
  end if;
end;
$$;

-- Notes table: add anon_id, device_id (text), last_active
alter table public.notes
  add column if not exists anon_id uuid references public.anon_identities(anon_id) on delete cascade;

alter table public.notes
  add column if not exists device_id text;

-- SAFETY: if device_id exists but is not text (e.g., uuid), coerce it to text
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'notes'
      and column_name  = 'device_id'
      and data_type   <> 'text'
  ) then
    alter table public.notes
      alter column device_id type text
      using device_id::text;
  end if;
end;
$$;

alter table public.notes
  add column if not exists last_active timestamptz not null default timezone('utc', now());

-- SAFETY: ensure track_id is text so non-uuid provider IDs are allowed
alter table public.notes drop constraint if exists notes_track_id_fkey;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'notes'
      and column_name  = 'track_id'
      and data_type   <> 'text'
  ) then
    alter table public.notes
      alter column track_id type text
      using track_id::text;
  end if;
end;
$$;

-- Identity fingerprint for fast recovery lookups
alter table public.anon_identities
  add column if not exists recovery_code_fingerprint text;

create index if not exists anon_identities_recovery_fingerprint_idx
  on public.anon_identities (recovery_code_fingerprint);

-- Helpful indexes
create index if not exists notes_anon_track_idx on public.notes (anon_id, track_id);
create index if not exists anon_device_links_anon_idx on public.anon_device_links (anon_id);

-- Enable RLS
alter table public.anon_identities enable row level security;
alter table public.anon_device_links enable row level security;
alter table public.notes enable row level security;

-- anon_identities policies (user-linked read/write and service_role bypass)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'anon_identities'
      and policyname = 'anon identities linked user read'
  ) then
    create policy "anon identities linked user read"
      on public.anon_identities
      for select
      using (
        auth.role() = 'service_role'
        or (
          auth.uid() is not null
          and user_id = auth.uid()
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'anon_identities'
      and policyname = 'anon identities linked user write'
  ) then
    create policy "anon identities linked user write"
      on public.anon_identities
      for all
      using (
        auth.role() = 'service_role'
        or (
          auth.uid() is not null
          and user_id = auth.uid()
        )
      )
      with check (
        auth.role() = 'service_role'
        or (
          auth.uid() is not null
          and user_id = auth.uid()
        )
      );
  end if;
end;
$$;

-- anon_device_links policies (device self + user-linked + service_role)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'anon_device_links'
      and policyname = 'device self access'
  ) then
    create policy "device self access"
      on public.anon_device_links
      for select
      using (
        auth.role() = 'service_role'
        or (
          request_device_id() is not null
          and request_device_id() = device_id
        )
        or (
          auth.uid() is not null
          and exists (
            select 1
            from public.anon_identities ai
            where ai.anon_id = anon_device_links.anon_id
              and ai.user_id = auth.uid()
          )
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'anon_device_links'
      and policyname = 'device self write'
  ) then
    create policy "device self write"
      on public.anon_device_links
      for insert
      with check (
        auth.role() = 'service_role'
        or (
          request_device_id() is not null
          and request_device_id() = device_id
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'anon_device_links'
      and policyname = 'device self update'
  ) then
    create policy "device self update"
      on public.anon_device_links
      for update
      using (
        auth.role() = 'service_role'
        or (
          request_device_id() is not null
          and request_device_id() = device_id
        )
      )
      with check (
        auth.role() = 'service_role'
        or (
          request_device_id() is not null
          and request_device_id() = device_id
        )
      );
  end if;
end;
$$;

-- notes policies (device-scoped access + service_role bypass + user-linked via anon_id)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'notes'
      and policyname = 'notes device select'
  ) then
    create policy "notes device select"
      on public.notes
      for select
      using (
        auth.role() = 'service_role'
        or (
          request_device_id() is not null
          and request_device_id() = device_id
        )
        or (
          auth.uid() is not null
          and exists (
            select 1
            from public.anon_device_links dl
            where dl.anon_id = public.notes.anon_id
              and dl.device_id = request_device_id()
          )
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'notes'
      and policyname = 'notes device insert'
  ) then
    create policy "notes device insert"
      on public.notes
      for insert
      with check (
        auth.role() = 'service_role'
        or (
          request_device_id() is not null
          and request_device_id() = device_id
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'notes'
      and policyname = 'notes device update'
  ) then
    create policy "notes device update"
      on public.notes
      for update
      using (
        auth.role() = 'service_role'
        or (
          request_device_id() is not null
          and request_device_id() = device_id
        )
      )
      with check (
        auth.role() = 'service_role'
        or (
          request_device_id() is not null
          and request_device_id() = device_id
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'notes'
      and policyname = 'notes device delete'
  ) then
    create policy "notes device delete"
      on public.notes
      for delete
      using (
        auth.role() = 'service_role'
        or (
          request_device_id() is not null
          and request_device_id() = device_id
        )
      );
  end if;
end;
$$;

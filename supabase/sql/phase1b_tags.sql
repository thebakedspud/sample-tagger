-- Phase 1B - track-level tags storage
-- Adds a jsonb column on public.notes to persist track tags alongside notes.

alter table public.notes
  add column if not exists tags jsonb not null default '[]'::jsonb;

create index if not exists notes_tags_gin_idx
  on public.notes
  using gin (tags jsonb_path_ops);


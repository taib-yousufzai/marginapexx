-- Kite Connect session storage
-- Run this in: supabase.com → your project → SQL Editor

create table if not exists public.kite_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  kite_user_id    text not null,
  access_token    text not null,
  -- Kite tokens expire at 06:00 IST (00:30 UTC) the next day
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- One active session per Supabase user
  unique (user_id)
);

-- Only the authenticated user can read/write their own row
alter table public.kite_sessions enable row level security;

create policy "Users can manage their own kite session"
  on public.kite_sessions
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger kite_sessions_updated_at
  before update on public.kite_sessions
  for each row execute procedure public.set_updated_at();

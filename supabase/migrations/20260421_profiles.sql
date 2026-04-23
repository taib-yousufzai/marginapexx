-- Extended user profile data
-- Mirrors the pattern in 20260419_kite_sessions.sql

create table if not exists public.profiles (
  id                uuid        primary key references auth.users(id) on delete cascade,
  email             text        not null,
  full_name         text,
  phone             text,
  role              text        not null,
  parent_id         text,
  segments          text[],
  active            boolean     not null default true,
  read_only         boolean     not null default false,
  demo_user         boolean     not null default false,
  intraday_sq_off   boolean     not null default false,
  auto_sqoff        integer     not null default 90,
  sqoff_method      text        not null default 'Credit',
  scheduled_delete_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Service role only for writes; authenticated users can read their own row
alter table public.profiles enable row level security;

create policy "Service role manages all profiles"
  on public.profiles
  for all
  using  (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Users can read their own profile"
  on public.profiles
  for select
  using (auth.uid() = id);

-- Auto-update updated_at (reuses the function from kite_sessions migration)
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

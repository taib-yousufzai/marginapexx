create table if not exists public.script_settings (
  id         uuid        primary key default gen_random_uuid(),
  symbol     text        not null unique,
  lot_size   numeric     not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.script_settings enable row level security;

create policy "Service role manages all script_settings"
  on public.script_settings for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

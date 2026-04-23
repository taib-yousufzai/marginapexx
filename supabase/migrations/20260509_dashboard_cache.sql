create table if not exists public.dashboard_cache (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  date_from   date,
  date_to     date,
  metrics     jsonb       not null,
  computed_at timestamptz not null default now(),
  unique (user_id, date_from, date_to)
);

alter table public.dashboard_cache enable row level security;

create policy "Service role manages all dashboard_cache"
  on public.dashboard_cache for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

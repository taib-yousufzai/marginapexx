create table if not exists public.watchlists (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  tab        text        not null,
  symbol     text        not null,
  created_at timestamptz not null default now(),
  unique (user_id, tab, symbol)
);

create index if not exists watchlists_user_tab_idx on public.watchlists(user_id, tab);

alter table public.watchlists enable row level security;

create policy "Service role manages all watchlists"
  on public.watchlists for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

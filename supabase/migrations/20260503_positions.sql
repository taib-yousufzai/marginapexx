create table if not exists public.positions (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references public.profiles(id) on delete cascade,
  symbol           text        not null,
  side             text        not null check (side in ('BUY','SELL')),
  status           text        not null check (status in ('open','active','closed')),
  pnl              numeric     not null default 0,
  qty_open         numeric     not null default 0,
  qty_total        numeric     not null default 0,
  avg_price        numeric     not null default 0,
  entry_price      numeric     not null default 0,
  ltp              numeric,
  exit_price       numeric,
  duration_seconds integer     not null default 0,
  brokerage        numeric     not null default 0,
  sl               numeric,
  tp               numeric,
  entry_time       timestamptz not null default now(),
  exit_time        timestamptz,
  settlement       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists positions_user_id_idx on public.positions(user_id);
create index if not exists positions_status_idx  on public.positions(status);

alter table public.positions enable row level security;

create policy "Service role manages all positions"
  on public.positions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

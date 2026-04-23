create table if not exists public.segment_settings (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references public.profiles(id) on delete cascade,
  segment             text        not null,
  side                text        not null check (side in ('BUY','SELL')),
  commission_type     text        not null default 'Per Crore',
  commission_value    numeric     not null default 4500,
  profit_hold_sec     integer     not null default 120,
  loss_hold_sec       integer     not null default 0,
  strike_range        numeric     not null default 0,
  max_lot             numeric     not null default 50,
  max_order_lot       numeric     not null default 50,
  intraday_leverage   numeric     not null default 50,
  intraday_type       text        not null default 'Multiplier',
  holding_leverage    numeric     not null default 5,
  entry_buffer        numeric     not null default 0.003,
  holding_type        text        not null default 'Multiplier',
  exit_buffer         numeric     not null default 0.0017,
  trade_allowed       boolean     not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, segment, side)
);

create index if not exists segment_settings_user_id_idx on public.segment_settings(user_id);

alter table public.segment_settings enable row level security;

create policy "Service role manages all segment_settings"
  on public.segment_settings for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

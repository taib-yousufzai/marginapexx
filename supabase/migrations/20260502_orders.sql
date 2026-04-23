create table if not exists public.orders (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  symbol      text        not null,
  side        text        not null check (side in ('BUY','SELL')),
  status      text        not null check (status in ('EXECUTED','CANCELLED','REJECTED')),
  qty         numeric     not null,
  price       numeric     not null,
  order_type  text        not null check (order_type in ('MARKET','LIMIT')),
  info        text,
  created_at  timestamptz not null default now()
);

create index if not exists orders_user_id_idx on public.orders(user_id);
create index if not exists orders_status_idx  on public.orders(status);

alter table public.orders enable row level security;

create policy "Service role manages all orders"
  on public.orders for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

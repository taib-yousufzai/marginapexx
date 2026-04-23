create table if not exists public.transactions (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.profiles(id) on delete cascade,
  type         text        not null check (type in ('DEPOSIT','WITHDRAWAL')),
  amount       numeric     not null,
  status       text        not null default 'PENDING' check (status in ('APPROVED','PENDING','REJECTED')),
  ref_id       text,
  broker_id    text,
  account_name text,
  account_no   text,
  ifsc         text,
  upi          text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists transactions_user_id_idx on public.transactions(user_id);
create index if not exists transactions_type_idx    on public.transactions(type);
create index if not exists transactions_status_idx  on public.transactions(status);

alter table public.transactions enable row level security;

create policy "Service role manages all transactions"
  on public.transactions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

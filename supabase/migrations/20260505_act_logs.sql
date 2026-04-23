create table if not exists public.act_logs (
  id             uuid        primary key default gen_random_uuid(),
  type           text        not null check (type in ('ORDER_EXECUTION','AUTO_SQUARE_OFF','ORDER_CANCEL','LOGIN','LOGOUT')),
  user_id        uuid        references public.profiles(id) on delete set null,
  target_user_id uuid        references public.profiles(id) on delete set null,
  symbol         text,
  qty            numeric,
  price          numeric,
  reason         text,
  ip             text,
  created_at     timestamptz not null default now()
);

create index if not exists act_logs_created_at_idx on public.act_logs(created_at desc);
create index if not exists act_logs_user_id_idx    on public.act_logs(user_id);

alter table public.act_logs enable row level security;

create policy "Service role manages all act_logs"
  on public.act_logs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

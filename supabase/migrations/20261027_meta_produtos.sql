-- C7: Meta mensal de produtos com comissão extra.
-- Rodar no Supabase (SQL Editor) depois de 20261027_comissao_produtos_reabrir.sql. Pode ser executado de novo.
--
-- Conta só produtos com comissão (% maior que zero) vendidos/atendidos pelo barbeiro no mês.
-- Ao bater a meta, o barbeiro ganha a comissão extra:
--   'month' = sobre tudo o que vendeu no mês (inclusive antes de bater a meta)
--   'above' = só sobre o valor que passar da meta

create table if not exists public.commission_goals (
  id bigint generated always as identity primary key,
  professional_id uuid unique references public.professionals(id) on delete cascade,
  monthly_target numeric(12,2) not null check (monthly_target > 0),
  bonus_percent numeric(5,2) not null check (bonus_percent > 0 and bonus_percent <= 100),
  bonus_mode text not null default 'month' check (bonus_mode in ('month','above')),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
-- Uma única meta "para todos" (professional_id vazio).
create unique index if not exists commission_goals_all_idx on public.commission_goals ((professional_id is null)) where professional_id is null;

alter table public.commission_entries add column if not exists goal_month date;

alter table public.commission_goals enable row level security;
drop policy if exists "c7 ver metas" on public.commission_goals;
create policy "c7 ver metas" on public.commission_goals for select to authenticated using (true);
drop policy if exists "c7 gerir metas" on public.commission_goals;
create policy "c7 gerir metas" on public.commission_goals for all to authenticated
  using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
grant select, insert, update, delete on public.commission_goals to authenticated;

-- Vendas de produtos com comissão do barbeiro no mês (fuso de São Paulo).
create or replace function private.c7_month_product_sales(p_professional_id uuid, p_month date)
returns numeric
language sql
stable
security definer
set search_path to 'public', 'private'
as $function$
  select coalesce(sum(e.base_amount), 0)
    from public.commission_entries e
    join public.cash_transactions t on t.id = e.transaction_id
   where e.professional_id = p_professional_id
     and e.product_id is not null
     and t.status = 'posted'
     and date_trunc('month', t.created_at at time zone 'America/Sao_Paulo')::date = p_month
$function$;

grant execute on function private.c7_month_product_sales(uuid, date) to authenticated;

-- Para a tela: andamento da meta do mês de cada barbeiro.
create or replace function public.c7_product_goal_progress(p_month date default null)
returns table(professional_id uuid, monthly_target numeric, bonus_percent numeric, bonus_mode text, sold numeric, bonus_earned numeric)
language sql
stable
security definer
set search_path to 'public', 'private'
as $function$
  with m as (select coalesce(p_month, date_trunc('month', now() at time zone 'America/Sao_Paulo')::date) as month)
  select p.id,
         g.monthly_target, g.bonus_percent, g.bonus_mode,
         private.c7_month_product_sales(p.id, m.month),
         coalesce((select sum(e.commission_amount) from public.commission_entries e
                    where e.professional_id = p.id and e.goal_month = m.month), 0)
    from public.professionals p
    cross join m
    join lateral (
      select * from public.commission_goals cg
       where cg.active and (cg.professional_id = p.id or cg.professional_id is null)
       order by cg.professional_id nulls last
       limit 1
    ) g on true
   where p.active
     and (public.current_user_role() in ('admin','reception') or p.id = public.current_professional_id())
$function$;

grant execute on function public.c7_product_goal_progress(date) to authenticated;

-- Comissão dos produtos de um recebimento + extra da meta do mês.
create or replace function private.c7_product_commissions(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth', 'private'
as $function$
declare
  v_tx public.cash_transactions%rowtype;
  v_goal public.commission_goals%rowtype;
  v_month date;
  v_sold numeric;
  v_bonus_base numeric;
  v_paid numeric;
  v_due numeric;
begin
  select * into v_tx from public.cash_transactions where id = p_transaction_id;
  if not found or v_tx.created_by is distinct from auth.uid()
     or v_tx.status <> 'posted' or v_tx.direction <> 'in' or v_tx.professional_id is null then
    return;
  end if;

  if not exists (select 1 from public.commission_entries where transaction_id = v_tx.id and product_id is not null) then
    insert into public.commission_entries(
      transaction_id, professional_id, product_id, base_amount, commission_percent, commission_amount, status
    )
    select v_tx.id, v_tx.professional_id, i.product_id, b.base, p.commission_percent,
           round(b.base * p.commission_percent / 100, 2), 'pending'
      from public.cash_transaction_items i
      join public.products p on p.id = i.product_id
      cross join lateral (
        select round(greatest(i.total_amount - case when coalesce(v_tx.gross_amount, 0) > 0
               then coalesce(v_tx.discount_amount, 0) * i.total_amount / v_tx.gross_amount else 0 end, 0), 2) as base
      ) b
     where i.transaction_id = v_tx.id
       and i.item_type = 'product'
       and coalesce(p.commission_percent, 0) > 0
       and b.base > 0;
  end if;

  -- Meta do mês: a do barbeiro, ou a geral.
  select * into v_goal from public.commission_goals
   where active and (professional_id = v_tx.professional_id or professional_id is null)
   order by professional_id nulls last
   limit 1;
  if not found then return; end if;

  v_month := date_trunc('month', v_tx.created_at at time zone 'America/Sao_Paulo')::date;
  v_sold := private.c7_month_product_sales(v_tx.professional_id, v_month);
  if v_sold < v_goal.monthly_target then return; end if;

  v_bonus_base := case when v_goal.bonus_mode = 'above' then v_sold - v_goal.monthly_target else v_sold end;
  select coalesce(sum(commission_amount), 0) into v_paid
    from public.commission_entries
   where professional_id = v_tx.professional_id and goal_month = v_month;
  v_due := round(v_bonus_base * v_goal.bonus_percent / 100, 2) - v_paid;

  if v_due > 0 then
    insert into public.commission_entries(
      transaction_id, professional_id, product_id, base_amount, commission_percent, commission_amount, status, goal_month
    ) values (
      v_tx.id, v_tx.professional_id, null, v_bonus_base, v_goal.bonus_percent, v_due, 'pending', v_month
    );
  end if;
end $function$;

-- C7: Níveis de cliente (C7 → C7 Prata → C7 Ouro → VIP C7) com benefícios em serviços.
-- Rodar uma vez no Supabase (SQL Editor). Pode ser executado de novo sem duplicar nada.

do $$
declare
  v_customer text;
  v_service text;
  v_appointment text;
begin
  select format_type(atttypid, atttypmod) into v_customer
    from pg_attribute where attrelid = 'public.customers'::regclass and attname = 'id';
  select format_type(atttypid, atttypmod) into v_service
    from pg_attribute where attrelid = 'public.services'::regclass and attname = 'id';
  select format_type(atttypid, atttypmod) into v_appointment
    from pg_attribute where attrelid = 'public.appointments'::regclass and attname = 'id';

  create table if not exists public.customer_levels (
    id bigint generated always as identity primary key,
    name text not null,
    color text not null default '#8a817a',
    sort_order int not null default 0,
    min_visits_90d int not null default 0 check (min_visits_90d >= 0),
    min_spent_90d numeric(12,2) not null default 0 check (min_spent_90d >= 0),
    manual_only boolean not null default false,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  -- Benefício: serviço grátis com limite por mês, ou cortesia sem contagem (quantity_per_month vazio).
  execute format($sql$
    create table if not exists public.customer_level_benefits (
      id bigint generated always as identity primary key,
      level_id bigint not null references public.customer_levels(id) on delete cascade,
      description text not null,
      service_id %s references public.services(id) on delete set null,
      quantity_per_month int check (quantity_per_month is null or quantity_per_month > 0),
      sort_order int not null default 0
    )
  $sql$, v_service);

  execute format($sql$
    create table if not exists public.customer_level_benefit_uses (
      id bigint generated always as identity primary key,
      customer_id %s not null references public.customers(id) on delete cascade,
      benefit_id bigint references public.customer_level_benefits(id) on delete set null,
      service_id %s,
      appointment_id %s references public.appointments(id) on delete set null,
      used_month date not null default (date_trunc('month', now()))::date,
      created_by uuid default auth.uid(),
      created_at timestamptz not null default now()
    )
  $sql$, v_customer, v_service, v_appointment);
end $$;

alter table public.customers add column if not exists level_id bigint references public.customer_levels(id) on delete set null;
alter table public.customers add column if not exists level_locked boolean not null default false;

create index if not exists customer_level_benefit_uses_customer_month_idx
  on public.customer_level_benefit_uses(customer_id, used_month);

-- Quem pode configurar níveis: administrador ou quem tem permissão de promoções.
create or replace function public.c7_can_manage_levels()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'admin')
      or exists (
        select 1 from staff_permissions sp
         where lower(sp.email) = lower(auth.jwt()->>'email')
           and coalesce((sp.permissions->>'promotions.manage')::boolean, false)
      );
$$;

alter table public.customer_levels enable row level security;
alter table public.customer_level_benefits enable row level security;
alter table public.customer_level_benefit_uses enable row level security;

drop policy if exists "c7 ver niveis" on public.customer_levels;
create policy "c7 ver niveis" on public.customer_levels for select to authenticated using (true);
drop policy if exists "c7 gerir niveis" on public.customer_levels;
create policy "c7 gerir niveis" on public.customer_levels for all to authenticated
  using (public.c7_can_manage_levels()) with check (public.c7_can_manage_levels());

drop policy if exists "c7 ver beneficios" on public.customer_level_benefits;
create policy "c7 ver beneficios" on public.customer_level_benefits for select to authenticated using (true);
drop policy if exists "c7 gerir beneficios" on public.customer_level_benefits;
create policy "c7 gerir beneficios" on public.customer_level_benefits for all to authenticated
  using (public.c7_can_manage_levels()) with check (public.c7_can_manage_levels());

-- Usos: quem recebe no caixa registra; só quem gere níveis desfaz.
drop policy if exists "c7 ver usos de beneficio" on public.customer_level_benefit_uses;
create policy "c7 ver usos de beneficio" on public.customer_level_benefit_uses for select to authenticated using (true);
drop policy if exists "c7 registrar uso de beneficio" on public.customer_level_benefit_uses;
create policy "c7 registrar uso de beneficio" on public.customer_level_benefit_uses for insert to authenticated with check (true);
drop policy if exists "c7 desfazer uso de beneficio" on public.customer_level_benefit_uses;
create policy "c7 desfazer uso de beneficio" on public.customer_level_benefit_uses for delete to authenticated
  using (public.c7_can_manage_levels());

grant select, insert, update, delete on public.customer_levels, public.customer_level_benefits to authenticated;
grant select, insert, delete on public.customer_level_benefit_uses to authenticated;

-- Nível de cada cliente: o escolhido à mão (travado) ou o maior nível automático que ele alcança
-- pelas visitas finalizadas e pelo valor gasto nos últimos 90 dias.
create or replace view public.customer_level_status
with (security_invoker = on) as
with stats as (
  select a.customer_id,
         count(*) as visits_90d,
         coalesce(sum(a.total_amount), 0) as spent_90d
    from public.appointments a
   where a.status = 'completed'
     and a.starts_at >= now() - interval '90 days'
   group by a.customer_id
)
select c.id as customer_id,
       coalesce(s.visits_90d, 0) as visits_90d,
       coalesce(s.spent_90d, 0) as spent_90d,
       c.level_locked,
       case when c.level_locked and c.level_id is not null then c.level_id
            else (
              select l.id from public.customer_levels l
               where l.active and not l.manual_only
                 and (coalesce(s.visits_90d, 0) >= l.min_visits_90d
                      or (l.min_spent_90d > 0 and coalesce(s.spent_90d, 0) >= l.min_spent_90d))
               order by l.sort_order desc
               limit 1)
       end as level_id
  from public.customers c
  left join stats s on s.customer_id = c.id;

grant select on public.customer_level_status to authenticated;

-- Sugestão inicial (só entra se ainda não houver nenhum nível cadastrado).
do $$
declare
  v_prata bigint;
  v_ouro bigint;
  v_vip bigint;
begin
  if exists (select 1 from public.customer_levels) then
    return;
  end if;

  insert into public.customer_levels (name, color, sort_order, min_visits_90d, min_spent_90d, manual_only)
  values ('C7', '#8a817a', 1, 0, 0, false);
  insert into public.customer_levels (name, color, sort_order, min_visits_90d, min_spent_90d, manual_only)
  values ('C7 Prata', '#8e99a6', 2, 3, 0, false) returning id into v_prata;
  insert into public.customer_levels (name, color, sort_order, min_visits_90d, min_spent_90d, manual_only)
  values ('C7 Ouro', '#b8892f', 3, 6, 500, false) returning id into v_ouro;
  insert into public.customer_levels (name, color, sort_order, min_visits_90d, min_spent_90d, manual_only)
  values ('VIP C7', '#1f1b17', 4, 0, 0, true) returning id into v_vip;

  insert into public.customer_level_benefits (level_id, description, service_id, quantity_per_month, sort_order)
  values
    (v_prata, 'Bebida cortesia em toda visita', null, null, 1),
    (v_ouro,  'Bebida cortesia em toda visita', null, null, 1),
    (v_vip,   'Bebida cortesia em toda visita', null, null, 1),
    (v_vip,   'Prioridade em encaixes e horários de pico', null, null, 4);

  -- Serviços grátis: liga ao serviço do catálogo pelo nome; se não achar, fica só a descrição.
  insert into public.customer_level_benefits (level_id, description, service_id, quantity_per_month, sort_order)
  select b.level_id, b.description, s.id, case when s.id is null then null else b.qty end, b.sort_order
    from (values (v_ouro, 'Sobrancelha grátis', 1, 2, 'sobrancelha'),
                 (v_vip,  'Sobrancelha grátis', 2, 2, 'sobrancelha'),
                 (v_vip,  'Barba grátis',       1, 3, 'barba'))
         as b(level_id, description, qty, sort_order, term)
    left join lateral (
      select sv.id from public.services sv
       where sv.active and sv.name ilike b.term || '%' and sv.name not ilike '%+%'
       order by length(sv.name)
       limit 1
    ) s on true;
end $$;

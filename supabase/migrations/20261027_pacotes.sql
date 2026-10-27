-- C7: Pacotes (como no Booksy): pacote com serviços e quantidades, validade em dias e visibilidade
--   'online'   = cliente vê (site de agendamento / Área C7)
--   'internal' = só a equipe vende no caixa
--   'off'      = desligado (não aparece nem é vendido)
-- Venda no caixa, saldo por cliente e uso automático no recebimento.
-- Comissão: quem vende o pacote ganha a % do pacote no dia da venda (0% = sem comissão).
-- O atendimento feito pelo pacote não gera comissão.
-- Rodar no Supabase (SQL Editor) depois de 20261027_comissao_produtos_reabrir.sql. Pode ser executado de novo.

do $$
declare
  v_customer text; v_service text; v_appointment text; v_tx text;
begin
  select format_type(atttypid, atttypmod) into v_customer from pg_attribute where attrelid='public.customers'::regclass and attname='id';
  select format_type(atttypid, atttypmod) into v_service from pg_attribute where attrelid='public.services'::regclass and attname='id';
  select format_type(atttypid, atttypmod) into v_appointment from pg_attribute where attrelid='public.appointments'::regclass and attname='id';
  select format_type(atttypid, atttypmod) into v_tx from pg_attribute where attrelid='public.cash_transactions'::regclass and attname='id';

  create table if not exists public.packages (
    id bigint generated always as identity primary key,
    name text not null,
    price numeric(12,2) not null check (price >= 0),
    expires_days int check (expires_days is null or expires_days > 0),
    note text,
    visibility text not null default 'internal' check (visibility in ('online','internal','off')),
    sort_order int not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  execute format($sql$
    create table if not exists public.package_items (
      id bigint generated always as identity primary key,
      package_id bigint not null references public.packages(id) on delete cascade,
      service_id %s not null references public.services(id),
      quantity int not null check (quantity > 0),
      unit_price numeric(12,2) not null default 0 check (unit_price >= 0)
    )
  $sql$, v_service);

  execute format($sql$
    create table if not exists public.customer_packages (
      id uuid primary key default gen_random_uuid(),
      package_id bigint not null references public.packages(id),
      customer_id %s not null references public.customers(id) on delete cascade,
      transaction_id %s references public.cash_transactions(id) on delete set null,
      package_name text not null,
      price_paid numeric(12,2) not null default 0,
      purchased_at timestamptz not null default now(),
      expires_at timestamptz,
      status text not null default 'active' check (status in ('active','cancelled')),
      sold_by uuid references public.professionals(id) on delete set null,
      created_by uuid default auth.uid()
    )
  $sql$, v_customer, v_tx);

  execute format($sql$
    create table if not exists public.customer_package_items (
      id bigint generated always as identity primary key,
      customer_package_id uuid not null references public.customer_packages(id) on delete cascade,
      service_id %s not null,
      service_name text not null,
      quantity int not null check (quantity > 0),
      unit_price numeric(12,2) not null default 0
    )
  $sql$, v_service);

  execute format($sql$
    create table if not exists public.customer_package_uses (
      id bigint generated always as identity primary key,
      customer_package_id uuid not null references public.customer_packages(id) on delete cascade,
      service_id %s not null,
      appointment_id %s references public.appointments(id) on delete set null,
      used_at timestamptz not null default now(),
      created_by uuid default auth.uid()
    )
  $sql$, v_service, v_appointment);
end $$;

alter table public.packages add column if not exists commission_percent numeric(5,2) not null default 0
  check (commission_percent >= 0 and commission_percent <= 100);

create index if not exists customer_packages_customer_idx on public.customer_packages(customer_id);
create index if not exists customer_package_uses_package_idx on public.customer_package_uses(customer_package_id);

-- Venda de pacote vira um tipo próprio de lançamento no caixa.
do $$
declare r record; v_enum regtype;
begin
  select a.atttypid::regtype into v_enum from pg_attribute a join pg_type t on t.oid=a.atttypid
   where a.attrelid='public.cash_transactions'::regclass and a.attname='transaction_type' and t.typtype='e';
  if v_enum is not null then
    execute format('alter type %s add value if not exists %L', v_enum, 'package');
  end if;
  for r in
    select conname, pg_get_constraintdef(oid) as def from pg_constraint
     where conrelid='public.cash_transactions'::regclass and contype='c'
       and pg_get_constraintdef(oid) like '%transaction_type%'
       and pg_get_constraintdef(oid) not like '%''package''%'
       and pg_get_constraintdef(oid) like '%ARRAY[%'
  loop
    execute format('alter table public.cash_transactions drop constraint %I', r.conname);
    execute format('alter table public.cash_transactions add constraint %I %s', r.conname,
                   replace(r.def, 'ARRAY[', 'ARRAY[''package''::text, '));
  end loop;
end $$;

alter table public.packages enable row level security;
alter table public.package_items enable row level security;
alter table public.customer_packages enable row level security;
alter table public.customer_package_items enable row level security;
alter table public.customer_package_uses enable row level security;

drop policy if exists "c7 ver pacotes" on public.packages;
create policy "c7 ver pacotes" on public.packages for select to authenticated using (true);
drop policy if exists "c7 gerir pacotes" on public.packages;
create policy "c7 gerir pacotes" on public.packages for all to authenticated
  using (public.staff_can('promotions.manage')) with check (public.staff_can('promotions.manage'));
drop policy if exists "c7 ver itens de pacote" on public.package_items;
create policy "c7 ver itens de pacote" on public.package_items for select to authenticated using (true);
drop policy if exists "c7 gerir itens de pacote" on public.package_items;
create policy "c7 gerir itens de pacote" on public.package_items for all to authenticated
  using (public.staff_can('promotions.manage')) with check (public.staff_can('promotions.manage'));

drop policy if exists "c7 equipe ve pacotes de clientes" on public.customer_packages;
create policy "c7 equipe ve pacotes de clientes" on public.customer_packages for select to authenticated
  using (public.staff_can('cash.view') or public.staff_can('clients.read'));
drop policy if exists "c7 equipe ve itens adquiridos" on public.customer_package_items;
create policy "c7 equipe ve itens adquiridos" on public.customer_package_items for select to authenticated
  using (public.staff_can('cash.view') or public.staff_can('clients.read'));
drop policy if exists "c7 equipe ve usos" on public.customer_package_uses;
create policy "c7 equipe ve usos" on public.customer_package_uses for select to authenticated
  using (public.staff_can('cash.view') or public.staff_can('clients.read'));
drop policy if exists "c7 caixa registra uso" on public.customer_package_uses;
create policy "c7 caixa registra uso" on public.customer_package_uses for insert to authenticated
  with check (public.staff_can('cash.view'));
drop policy if exists "c7 admin cancela pacote" on public.customer_packages;
create policy "c7 admin cancela pacote" on public.customer_packages for update to authenticated
  using (public.current_user_role()='admin') with check (public.current_user_role()='admin');

grant select, insert, update, delete on public.packages, public.package_items to authenticated;
grant select, update on public.customer_packages to authenticated;
grant select on public.customer_package_items to authenticated;
grant select, insert on public.customer_package_uses to authenticated;

-- Vender pacote no caixa: lança a entrada, a taxa da maquininha e cria o pacote do cliente.
create or replace function public.c7_sell_package(
  p_package_id bigint, p_customer_id uuid, p_payment_method text,
  p_card_fee_percent numeric default 0, p_professional_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth', 'private'
as $function$
declare
  v_pkg public.packages%rowtype;
  v_session uuid;
  v_tx uuid;
  v_cp uuid;
begin
  if auth.uid() is null or not public.staff_can('cash.view') then
    raise exception 'Acesso não autorizado' using errcode='42501';
  end if;
  if p_payment_method not in ('cash','pix','credit','debit','other') then
    raise exception 'Forma de pagamento inválida';
  end if;
  select * into v_pkg from public.packages where id=p_package_id;
  if not found or v_pkg.visibility='off' then raise exception 'Pacote indisponível'; end if;
  if not exists (select 1 from public.package_items where package_id=p_package_id) then
    raise exception 'Pacote sem serviços';
  end if;
  if p_customer_id is null or not exists (select 1 from public.customers where id=p_customer_id) then
    raise exception 'Escolha o cliente do pacote';
  end if;
  select id into v_session from public.cash_sessions where status='open' order by opened_at desc limit 1;
  if v_session is null then raise exception 'Caixa fechado'; end if;

  insert into public.cash_transactions(
    session_id,customer_id,professional_id,transaction_type,direction,payment_method,
    description,gross_amount,discount_amount,net_amount,status,created_by
  ) values(
    v_session,p_customer_id,p_professional_id,'package','in',p_payment_method,
    'Pacote - '||v_pkg.name,v_pkg.price,0,v_pkg.price,'posted',auth.uid()
  ) returning id into v_tx;

  insert into public.customer_packages(package_id,customer_id,transaction_id,package_name,price_paid,expires_at,sold_by)
  values(p_package_id,p_customer_id,v_tx,v_pkg.name,v_pkg.price,
         case when v_pkg.expires_days is null then null else now()+make_interval(days=>v_pkg.expires_days) end,
         p_professional_id)
  returning id into v_cp;

  insert into public.customer_package_items(customer_package_id,service_id,service_name,quantity,unit_price)
  select v_cp, i.service_id, s.name, i.quantity, i.unit_price
    from public.package_items i join public.services s on s.id=i.service_id
   where i.package_id=p_package_id;

  -- Comissão de quem vendeu, sobre o preço do pacote.
  if p_professional_id is not null and v_pkg.commission_percent > 0 and v_pkg.price > 0 then
    insert into public.commission_entries(
      transaction_id, professional_id, base_amount, commission_percent, commission_amount, status
    ) values (
      v_tx, p_professional_id, v_pkg.price, v_pkg.commission_percent,
      round(v_pkg.price * v_pkg.commission_percent / 100, 2), 'pending'
    );
  end if;

  perform private.c7_record_card_fee(v_tx,p_card_fee_percent);
  return v_cp;
end $function$;

grant execute on function public.c7_sell_package(bigint, uuid, text, numeric, uuid) to authenticated;

-- Saldo dos pacotes de um cliente (ou de todos, para a lista de adquiridos).
create or replace function public.c7_customer_package_balance(p_customer_id uuid default null)
returns table(customer_package_id uuid, customer_id uuid, customer_name text, package_name text,
              purchased_at timestamptz, expires_at timestamptz, status text,
              service_id bigint, service_name text, quantity int, used int, remaining int)
language sql
stable
security definer
set search_path to 'public', 'private'
as $function$
  select cp.id, cp.customer_id, c.full_name, cp.package_name, cp.purchased_at, cp.expires_at,
         case when cp.status='cancelled' then 'cancelled'
              when cp.expires_at is not null and cp.expires_at < now() then 'expired' else 'active' end,
         ci.service_id::bigint, ci.service_name, ci.quantity,
         coalesce(u.used,0)::int, greatest(ci.quantity-coalesce(u.used,0),0)::int
    from public.customer_packages cp
    join public.customers c on c.id=cp.customer_id
    join public.customer_package_items ci on ci.customer_package_id=cp.id
    left join lateral (
      select count(*) as used from public.customer_package_uses x
       where x.customer_package_id=cp.id and x.service_id=ci.service_id
    ) u on true
   where (p_customer_id is null or cp.customer_id=p_customer_id)
     and (public.staff_can('cash.view') or public.staff_can('clients.read'))
   order by cp.purchased_at desc, ci.service_name
$function$;

grant execute on function public.c7_customer_package_balance(uuid) to authenticated;

-- Para o site de agendamento: pacotes marcados como online.
create or replace function public.get_booking_packages()
returns table(id bigint, name text, price numeric, expires_days int, services jsonb)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p.id, p.name, p.price, p.expires_days,
         coalesce(jsonb_agg(jsonb_build_object('service',s.name,'quantity',i.quantity) order by s.name)
                  filter (where i.id is not null),'[]'::jsonb)
    from public.packages p
    left join public.package_items i on i.package_id=p.id
    left join public.services s on s.id=i.service_id
   where p.visibility='online'
   group by p.id
   order by p.sort_order, p.name
$function$;

grant execute on function public.get_booking_packages() to anon, authenticated;

-- Reabrir atendimento também devolve o uso do pacote.
create or replace function public.c7_reopen_appointment(p_appointment_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth', 'private'
as $function$
declare
  v_tx public.cash_transactions%rowtype;
  v_fee_ids uuid[];
begin
  if auth.uid() is null or public.current_user_role() <> 'admin' then
    raise exception 'Somente o administrador pode reabrir um atendimento finalizado' using errcode='42501';
  end if;

  select * into v_tx from public.cash_transactions
   where appointment_id=p_appointment_id and transaction_type='service' and status='posted'
   order by created_at desc limit 1
   for update;
  if not found then raise exception 'Este atendimento não tem recebimento para desfazer'; end if;

  if (select status from public.cash_sessions where id=v_tx.session_id) is distinct from 'open' then
    raise exception 'O caixa desse recebimento já foi fechado; não é possível reabrir';
  end if;
  if exists (select 1 from public.commission_entries where transaction_id=v_tx.id and status<>'pending') then
    raise exception 'A comissão deste atendimento já foi paga no acerto';
  end if;

  delete from public.commission_entries where transaction_id=v_tx.id;

  select array_agg(id) into v_fee_ids from public.cash_transactions
   where status='posted' and transaction_type='expense'
     and notes='Taxa vinculada à transação '||v_tx.id::text;
  if v_fee_ids is not null then
    delete from public.financial_expenses where cash_transaction_id=any(v_fee_ids);
    update public.cash_transactions set status='cancelled' where id=any(v_fee_ids);
  end if;

  if v_tx.coupon_id is not null then
    delete from public.coupon_redemptions where transaction_id=v_tx.id;
    update public.coupons set used_count=greatest(used_count-1,0),updated_at=now() where id=v_tx.coupon_id;
  end if;

  if to_regclass('public.customer_level_benefit_uses') is not null then
    execute 'delete from public.customer_level_benefit_uses where appointment_id=$1' using p_appointment_id;
  end if;
  delete from public.customer_package_uses where appointment_id=p_appointment_id;

  update public.cash_transactions set status='cancelled' where id=v_tx.id;
  update public.appointments set status='confirmed',completed_at=null,updated_at=now() where id=p_appointment_id;
  return v_tx.id;
end $function$;

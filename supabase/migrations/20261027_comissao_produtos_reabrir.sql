-- C7: comissão por produto, serviço repetido, reabrir atendimento finalizado e promoção online/interna.
-- Rodar uma vez no Supabase (SQL Editor). Pode ser executado de novo sem duplicar nada.
-- O checkout e a venda continuam os mesmos; os passos novos rodam logo depois deles.

------------------------------------------------------------------------------
-- 1. Comissão por produto (0 ou vazio = barbeiro não ganha comissão no produto)
------------------------------------------------------------------------------
alter table public.products add column if not exists commission_percent numeric(5,2)
  check (commission_percent is null or commission_percent between 0 and 100);
alter table public.commission_entries add column if not exists product_id bigint
  references public.products(id) on delete set null;

-- Se existir regra de "uma comissão por recebimento", ela impediria a comissão dos produtos.
do $$
declare r record;
begin
  for r in
    select c.conname from pg_constraint c
     where c.conrelid = 'public.commission_entries'::regclass and c.contype = 'u'
       and (select array_agg(a.attname::text) from unnest(c.conkey) k
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k) = array['transaction_id']
  loop
    execute format('alter table public.commission_entries drop constraint %I', r.conname);
  end loop;
  for r in
    select i.indexrelid::regclass::text as idx from pg_index i
     where i.indrelid = 'public.commission_entries'::regclass and i.indisunique and not i.indisprimary
       and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid)
       and (select array_agg(a.attname::text) from unnest(i.indkey) k
              join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k) = array['transaction_id']
  loop
    execute format('drop index %s', r.idx);
  end loop;
end $$;

create or replace function private.c7_product_commissions(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth', 'private'
as $function$
declare v_tx public.cash_transactions%rowtype;
begin
  select * into v_tx from public.cash_transactions where id = p_transaction_id;
  if not found or v_tx.created_by is distinct from auth.uid()
     or v_tx.status <> 'posted' or v_tx.direction <> 'in' or v_tx.professional_id is null then
    return;
  end if;
  if exists (select 1 from public.commission_entries where transaction_id = v_tx.id and product_id is not null) then
    return;
  end if;
  -- Base do produto = valor do item menos a parte proporcional do desconto do recebimento.
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
end $function$;

-- Checkout do atendimento: igual ao atual + comissão dos produtos do atendimento.
create or replace function public.checkout_appointment_card(
  p_appointment_id uuid, p_payment_method text, p_discount_amount numeric default 0,
  p_benefit_source text default null::text, p_benefit_label text default null::text,
  p_coupon_id uuid default null::uuid, p_card_fee_percent numeric default 0)
returns uuid
language plpgsql
set search_path to 'public', 'private'
as $function$
declare v_transaction_id uuid;
begin
 v_transaction_id:=public.checkout_appointment(p_appointment_id,p_payment_method,p_discount_amount,p_benefit_source,p_benefit_label,p_coupon_id);
 perform private.c7_record_card_fee(v_transaction_id,p_card_fee_percent);
 perform private.c7_product_commissions(v_transaction_id);
 return v_transaction_id;
end $function$;

-- Venda de produto no caixa: igual à atual + "vendido por" (ou o barbeiro do atendimento) e comissão.
drop function if exists public.sell_product_card(bigint, numeric, text, uuid, uuid, numeric);
create or replace function public.sell_product_card(
  p_product_id bigint, p_quantity numeric, p_payment_method text,
  p_customer_id uuid default null::uuid, p_appointment_id uuid default null::uuid,
  p_card_fee_percent numeric default 0, p_professional_id uuid default null::uuid)
returns uuid
language plpgsql
set search_path to 'public', 'private'
as $function$
declare v_transaction_id uuid; v_professional uuid;
begin
 v_transaction_id:=public.sell_product(p_product_id,p_quantity,p_payment_method,p_customer_id,p_appointment_id);
 v_professional:=coalesce(p_professional_id,(select professional_id from public.appointments where id=p_appointment_id));
 if v_professional is not null then
   if not exists (select 1 from public.professionals where id=v_professional) then
     raise exception 'Colaborador inválido';
   end if;
   update public.cash_transactions set professional_id=v_professional
    where id=v_transaction_id and created_by=auth.uid();
 end if;
 perform private.c7_record_card_fee(v_transaction_id,p_card_fee_percent);
 perform private.c7_product_commissions(v_transaction_id);
 return v_transaction_id;
end $function$;

grant execute on function public.sell_product_card(bigint, numeric, text, uuid, uuid, numeric, uuid) to authenticated;

------------------------------------------------------------------------------
-- 2. Repetir serviço no mesmo atendimento (ex.: pai e filho)
------------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select c.conname from pg_constraint c
     where c.conrelid = 'public.appointment_services'::regclass and c.contype = 'u'
       and (select array_agg(a.attname::text order by a.attname) from unnest(c.conkey) k
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k) = array['appointment_id','service_id']
  loop
    execute format('alter table public.appointment_services drop constraint %I', r.conname);
  end loop;
  for r in
    select i.indexrelid::regclass::text as idx from pg_index i
     where i.indrelid = 'public.appointment_services'::regclass and i.indisunique and not i.indisprimary
       and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid)
       and (select array_agg(a.attname::text order by a.attname) from unnest(i.indkey) k
              join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k) = array['appointment_id','service_id']
  loop
    execute format('drop index %s', r.idx);
  end loop;
end $$;

create or replace function private.add_appointment_service_impl(p_appointment_id uuid, p_service_id bigint)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth', 'private'
as $function$
declare
  v_service public.services%rowtype;
  v_id uuid;
  v_duration integer;
begin
  if not private.staff_can_manage_appointment(p_appointment_id) then
    raise exception 'Acesso não autorizado';
  end if;

  if exists(
    select 1 from public.cash_transactions
    where appointment_id=p_appointment_id
      and transaction_type='service'
      and status='posted'
  ) then
    raise exception 'Atendimento já finalizado';
  end if;

  select * into v_service
  from public.services
  where id=p_service_id and active=true;

  if not found then raise exception 'Serviço inválido'; end if;

  v_duration:=private.service_duration_minutes(v_service.duration);

  insert into public.appointment_services(
    appointment_id,service_id,service_name,duration_minutes,price,sort_order
  )
  values(
    p_appointment_id,v_service.id,v_service.name,v_duration,v_service.price,
    coalesce((select max(sort_order)+1 from public.appointment_services where appointment_id=p_appointment_id),v_service.sort_order)
  )
  returning id into v_id;

  update public.appointments a
  set
    ends_at=a.starts_at + make_interval(mins=>(
      select coalesce(sum(aps.duration_minutes),0)::integer
      from public.appointment_services aps
      where aps.appointment_id=a.id
    )+coalesce(a.extra_minutes,0)),
    total_amount=(
      select coalesce(sum(aps.price),0)
      from public.appointment_services aps
      where aps.appointment_id=a.id
    ),
    updated_at=now()
  where a.id=p_appointment_id;

  return v_id;
end;
$function$;

------------------------------------------------------------------------------
-- 3. Reabrir atendimento finalizado para corrigir (só administrador, caixa do dia aberto)
------------------------------------------------------------------------------
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

  -- Taxa da maquininha lançada junto com o recebimento.
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

  update public.cash_transactions set status='cancelled' where id=v_tx.id;
  update public.appointments set status='confirmed',completed_at=null,updated_at=now() where id=p_appointment_id;
  return v_tx.id;
end $function$;

grant execute on function public.c7_reopen_appointment(uuid) to authenticated;

------------------------------------------------------------------------------
-- 4. Promoção online (aparece na Área C7 do cliente) ou só interna (só no caixa)
------------------------------------------------------------------------------
alter table public.promotions add column if not exists show_online boolean not null default false;

create or replace function private.get_my_benefits_impl()
returns table(benefit_type text, title text, description text, discount_type text, discount_value numeric, valid_until date)
language sql
security definer
set search_path to 'public', 'auth', 'private'
as $function$
  with me as (
    select c.id,c.birth_date
    from public.customer_accounts ca
    join public.customers c on c.id=ca.customer_id
    where ca.auth_user_id=auth.uid()
    limit 1
  ),
  membership as (
    select
      'membership'::text as benefit_type,
      mp.name::text as title,
      mp.description::text as description,
      'percent'::text as discount_type,
      mp.discount_percent::numeric as discount_value,
      cm.ends_at as valid_until
    from me
    join public.customer_memberships cm on cm.customer_id=me.id
    join public.membership_plans mp on mp.id=cm.plan_id
    where cm.status='active'
      and cm.starts_at<=current_date
      and (cm.ends_at is null or cm.ends_at>=current_date)
      and mp.active=true
  ),
  birthday_candidates as (
    select
      bc.*,
      make_date(y,extract(month from me.birth_date)::integer,
        least(
          extract(day from me.birth_date)::integer,
          extract(day from (date_trunc('month',make_date(y,extract(month from me.birth_date)::integer,1))
            + interval '1 month - 1 day'))::integer
        )
      ) as birthday_date
    from me
    join public.birthday_campaigns bc on bc.active=true
    cross join lateral (
      values
        (extract(year from current_date)::integer-1),
        (extract(year from current_date)::integer),
        (extract(year from current_date)::integer+1)
    ) years(y)
    where me.birth_date is not null
  ),
  birthday as (
    select distinct on (bc.id)
      'birthday'::text as benefit_type,
      bc.name::text as title,
      bc.description::text as description,
      bc.discount_type::text as discount_type,
      bc.discount_value::numeric as discount_value,
      (bc.birthday_date + bc.valid_days_after)::date as valid_until
    from birthday_candidates bc
    where current_date between
      (bc.birthday_date-bc.valid_days_before)
      and
      (bc.birthday_date+bc.valid_days_after)
    order by bc.id,abs(current_date-bc.birthday_date)
  ),
  online_promotion as (
    select
      'promotion'::text as benefit_type,
      p.name::text as title,
      p.description::text as description,
      p.discount_type::text as discount_type,
      p.discount_value::numeric as discount_value,
      p.ends_at::date as valid_until
    from public.promotions p
    where exists (select 1 from me)
      and p.active=true
      and p.show_online=true
      and (p.starts_at is null or p.starts_at<=now())
      and (p.ends_at is null or p.ends_at>=now())
  )
  select * from membership
  union all
  select * from birthday
  union all
  select * from online_promotion
$function$;

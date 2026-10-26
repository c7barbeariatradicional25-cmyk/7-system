-- C7: Dividir pagamento — um recebimento pago com mais de uma forma de pagamento.
-- Rodar uma vez no Supabase (SQL Editor). Pode ser executado de novo sem efeito colateral.
--
-- O checkout continua sendo feito por checkout_appointment_card (forma principal = a de maior valor).
-- Em seguida o sistema chama register_transaction_payments para gravar as partes.

do $$
declare
  v_id_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
    into v_id_type
    from pg_attribute a
   where a.attrelid = 'public.cash_transactions'::regclass
     and a.attname = 'id';

  execute format($sql$
    create table if not exists public.cash_transaction_payments (
      id bigint generated always as identity primary key,
      transaction_id %s not null references public.cash_transactions(id) on delete cascade,
      payment_method text not null check (payment_method in ('cash','pix','credit','debit','other')),
      amount numeric(12,2) not null check (amount > 0),
      card_fee_percent numeric(9,4) not null default 0 check (card_fee_percent between 0 and 100),
      card_fee_amount numeric(12,2) not null default 0 check (card_fee_amount >= 0),
      created_by uuid default auth.uid(),
      created_at timestamptz not null default now()
    )
  $sql$, v_id_type);
end $$;

create index if not exists cash_transaction_payments_transaction_idx
  on public.cash_transaction_payments(transaction_id);

alter table public.cash_transaction_payments enable row level security;

-- Quem enxerga a movimentação enxerga a divisão dela.
drop policy if exists "c7 ver divisao de pagamento" on public.cash_transaction_payments;
create policy "c7 ver divisao de pagamento" on public.cash_transaction_payments
  for select to authenticated
  using (exists (select 1 from public.cash_transactions t where t.id = cash_transaction_payments.transaction_id));

-- Só pode dividir um recebimento recém-lançado, visível para quem lança e ainda sem divisão.
drop policy if exists "c7 registrar divisao de pagamento" on public.cash_transaction_payments;
create policy "c7 registrar divisao de pagamento" on public.cash_transaction_payments
  for insert to authenticated
  with check (
    exists (
      select 1 from public.cash_transactions t
       where t.id = cash_transaction_payments.transaction_id
         and t.status = 'posted'
         and t.direction = 'in'
         and t.created_at > now() - interval '15 minutes'
    )
    and not exists (
      select 1 from public.cash_transaction_payments p where p.transaction_id = cash_transaction_payments.transaction_id
    )
  );

grant select, insert on public.cash_transaction_payments to authenticated;

create or replace function public.register_transaction_payments(p_transaction_id text, p_payments jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tx record;
  v_item jsonb;
  v_method text;
  v_amount numeric;
  v_total numeric := 0;
  v_due numeric;
begin
  select id, gross_amount, discount_amount, status
    into v_tx
    from cash_transactions
   where id::text = p_transaction_id;

  if not found then
    raise exception 'Movimentação não encontrada.';
  end if;
  if v_tx.status <> 'posted' then
    raise exception 'Movimentação cancelada não pode ser dividida.';
  end if;
  if exists (select 1 from cash_transaction_payments where transaction_id = v_tx.id) then
    raise exception 'Pagamento já dividido.';
  end if;
  if jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) < 2 then
    raise exception 'Informe ao menos duas formas de pagamento.';
  end if;

  for v_item in select * from jsonb_array_elements(p_payments) loop
    v_method := v_item->>'payment_method';
    v_amount := round((v_item->>'amount')::numeric, 2);
    if v_method not in ('cash','pix','credit','debit','other') then
      raise exception 'Forma de pagamento inválida: %', v_method;
    end if;
    if v_amount is null or v_amount <= 0 then
      raise exception 'Informe a quantia de cada forma de pagamento.';
    end if;
    v_total := v_total + v_amount;
  end loop;

  v_due := round(coalesce(v_tx.gross_amount, 0) - coalesce(v_tx.discount_amount, 0), 2);
  if v_total <> v_due then
    raise exception 'A soma das formas de pagamento (%) não confere com o total devido (%).', v_total, v_due;
  end if;

  insert into cash_transaction_payments (transaction_id, payment_method, amount, card_fee_percent, card_fee_amount)
  select v_tx.id,
         e->>'payment_method',
         round((e->>'amount')::numeric, 2),
         case when e->>'payment_method' in ('credit','debit')
              then least(100, greatest(0, coalesce((e->>'card_fee_percent')::numeric, 0))) else 0 end,
         case when e->>'payment_method' in ('credit','debit')
              then round(round((e->>'amount')::numeric, 2)
                         * least(100, greatest(0, coalesce((e->>'card_fee_percent')::numeric, 0))) / 100, 2)
              else 0 end
    from jsonb_array_elements(p_payments) e;
end;
$$;

grant execute on function public.register_transaction_payments(text, jsonb) to authenticated;

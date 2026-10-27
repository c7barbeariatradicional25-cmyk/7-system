-- C7: Encaixe — admin e recepção podem sobrepor um atendimento a outro ao mover/remarcar
-- e ao dar tempo extra (cliente atrasado). Barbeiros e o site continuam bloqueados.
-- Rodar uma vez no Supabase (SQL Editor). Pode ser executado de novo.

drop function if exists public.c7_staff_move_appointment(uuid, timestamptz, integer);

create or replace function public.c7_staff_move_appointment(
  p_appointment_id uuid,
  p_starts_at timestamptz,
  p_extra_minutes integer default null,
  p_allow_overlap boolean default false
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare a public.appointments%rowtype; v_base int; v_extra int; v_end timestamptz;
v_day date; v_local_start time;v_local_end time;v_role text;
begin
 if auth.uid() is null or not public.staff_can('appointments.edit') then
  raise exception 'Sem permissão para reagendar' using errcode='42501';
 end if;
 v_role:=public.current_user_role();
 select * into a from public.appointments where id=p_appointment_id for update;
 if not found or a.status not in ('scheduled','confirmed','waiting') then
  raise exception 'Este atendimento não pode ser movimentado';
 end if;
 if v_role='barber' and a.professional_id is distinct from public.current_professional_id() then
  raise exception 'Somente atendimentos próprios podem ser movimentados' using errcode='42501';
 end if;
 if p_starts_at<=now() then raise exception 'Novo horário precisa estar no futuro';end if;
 v_extra:=coalesce(p_extra_minutes,a.extra_minutes,0);
 if v_extra not between 0 and 120 then raise exception 'Minutos extras inválidos';end if;
 select coalesce(sum(duration_minutes),0)::int into v_base
 from public.appointment_services where appointment_id=a.id;
 if v_base<=0 then raise exception 'Atendimento sem serviços válidos';end if;
 v_end:=p_starts_at+make_interval(mins=>v_base+v_extra);
 v_day:=(p_starts_at at time zone 'America/Sao_Paulo')::date;
 v_local_start:=(p_starts_at at time zone 'America/Sao_Paulo')::time;
 v_local_end:=(v_end at time zone 'America/Sao_Paulo')::time;
 if v_day<>(v_end at time zone 'America/Sao_Paulo')::date then
  raise exception 'O atendimento não pode atravessar a meia-noite';end if;
 perform pg_advisory_xact_lock(hashtextextended(a.professional_id::text||':'||v_day::text,0));
 -- Encaixe: só admin e recepção podem sobrepor outro atendimento, e só quando pedirem.
 if not (p_allow_overlap and v_role in ('admin','reception'))
 and exists(select 1 from public.appointments b where b.id<>a.id and b.professional_id=a.professional_id
 and b.status in ('scheduled','confirmed','waiting','in_service')
 and b.starts_at<v_end and b.ends_at>p_starts_at) then
  raise exception 'Já existe atendimento nesse horário';
 end if;
 if exists(select 1 from public.schedule_blocks b where (b.professional_id is null or b.professional_id=a.professional_id)
 and b.starts_at<v_end and b.ends_at>p_starts_at) then
  raise exception 'Horário bloqueado';
 end if;
 if v_local_start<time '13:00' and v_local_end>time '12:00'
  and public.c7_lunch_enabled(a.professional_id,v_day) then
   raise exception 'Horário de almoço bloqueado';
 end if;
 update public.appointments set starts_at=p_starts_at,ends_at=v_end,extra_minutes=v_extra,updated_at=now()
 where id=a.id;
 return a.id;
end $function$;

grant execute on function public.c7_staff_move_appointment(uuid, timestamptz, integer, boolean) to authenticated;

drop function if exists public.c7_staff_set_extra_minutes(uuid, integer);

create or replace function public.c7_staff_set_extra_minutes(
  p_appointment_id uuid,
  p_extra_minutes integer,
  p_allow_overlap boolean default false
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare v_a public.appointments%rowtype; v_base integer; v_finish timestamptz; v_role text;
begin
 if auth.uid() is null or not public.staff_can('appointments.edit') then
   raise exception 'Sem permissão para alterar duração' using errcode='42501';
 end if;
 if p_extra_minutes is null or p_extra_minutes < 0 or p_extra_minutes > 120 then
   raise exception 'Tempo adicional inválido';
 end if;
 v_role:=public.current_user_role();
 select * into v_a from public.appointments where id=p_appointment_id for update;
 if not found or v_a.status in ('cancelled','no_show') then
   raise exception 'Atendimento não permite alteração de duração';
 end if;
 if v_role='barber'
    and v_a.professional_id is distinct from public.current_professional_id() then
   raise exception 'Somente atendimentos próprios podem ser alterados' using errcode='42501';
 end if;
 select coalesce(sum(duration_minutes),0)::int into v_base
 from public.appointment_services where appointment_id=p_appointment_id;
 if v_base <= 0 then raise exception 'Atendimento sem serviços cadastrados';end if;
 v_finish := v_a.starts_at + make_interval(mins => v_base+p_extra_minutes);
 if (v_a.starts_at at time zone 'America/Sao_Paulo')::date
    <> (v_finish at time zone 'America/Sao_Paulo')::date then
   raise exception 'A duração não pode ultrapassar a meia-noite';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(v_a.professional_id::text||':'||
    (v_a.starts_at at time zone 'America/Sao_Paulo')::date::text,0));
 if v_a.status in ('scheduled','confirmed','waiting','in_service') then
   if not (p_allow_overlap and v_role in ('admin','reception'))
      and exists(select 1 from public.appointments x
      where x.id<>p_appointment_id and x.professional_id=v_a.professional_id
       and x.status in ('scheduled','confirmed','waiting','in_service')
       and x.starts_at < v_finish and x.ends_at > v_a.starts_at) then
     raise exception 'O acréscimo se sobrepõe a outro atendimento';
   end if;
   if exists(select 1 from public.schedule_blocks b
      where (b.professional_id is null or b.professional_id=v_a.professional_id)
       and b.starts_at < v_finish and b.ends_at > v_a.starts_at) then
     raise exception 'O acréscimo se sobrepõe a um bloqueio na agenda';
   end if;
 end if;
 update public.appointments
    set ends_at=v_finish,extra_minutes=p_extra_minutes,updated_at=now()
    where id=p_appointment_id;
 return p_appointment_id;
end $function$;

grant execute on function public.c7_staff_set_extra_minutes(uuid, integer, boolean) to authenticated;

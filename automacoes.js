import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase=createClient(
  "https://cjtgjqxkyvgjlhylrvas.supabase.co",
  "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE"
);

const $=id=>document.getElementById(id);
let tab="pending";
let whatsappRows=[];
let emailRows=[];
let settings=null;

function localDate(value){
  if(!value) return "—";
  return new Date(value).toLocaleString("pt-BR",{
    day:"2-digit",month:"2-digit",year:"numeric",
    hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"
  });
}

function phoneForWa(raw){
  const digits=String(raw||"").replace(/\D/g,"");
  return digits.startsWith("55")?digits:"55"+digits;
}

function kindLabel(type){
  return {
    booking_confirmation:"CONFIRMAÇÃO",
    booking_reminder:"LEMBRETE",
    reactivation:"REATIVAÇÃO",
    post_service:"PÓS-ATENDIMENTO",
    birthday:"ANIVERSÁRIO"
  }[type]||type;
}

function kindIcon(type){
  return {
    booking_confirmation:"✓",
    booking_reminder:"⏰",
    reactivation:"↻",
    post_service:"★",
    birthday:"🎉"
  }[type]||"•";
}

function appointmentText(p){
  if(!p.starts_at) return "";
  const d=new Date(p.starts_at);
  const date=d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"America/Sao_Paulo"});
  const time=d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"});
  return date+" às "+time;
}

function messageText(item){
  const p=item.payload||{};
  const name=(p.customer_name||"Cliente").split(" ")[0];
  const professional=p.professional_name||"nossa equipe";

  if(item.automation_type==="booking_reminder"){
    return `Olá, ${name}! Passando para lembrar do seu horário na C7 Barbearia Tradicional em ${appointmentText(p)}, com ${professional}. Se precisar reagendar ou cancelar, fale com a gente por aqui. ✂️`;
  }
  if(item.automation_type==="post_service"){
    return `Olá, ${name}! Obrigado por vir à C7 hoje! Esperamos que tenha curtido o atendimento com ${professional}. Se quiser contar pra gente como foi sua experiência, é só responder por aqui. ✂️`;
  }
  if(item.automation_type==="reactivation"){
    return `Fala, ${name}! Já faz um tempinho desde sua última visita à C7 👀 Quando quiser dar aquele trato no visual de novo, estamos por aqui. Quer que eu te ajude a marcar um horário?`;
  }
  if(item.automation_type==="birthday"){
    const discount=Number(p.discount_value||0);
    const benefit=discount>0
      ? (p.discount_type==="percent"?` E tem ${discount}% de desconto de aniversário pra você!`:` E tem R$ ${discount.toFixed(2).replace(".",",")} de desconto de aniversário pra você!`)
      :"";
    return `Parabéns, ${name}! 🎉 A C7 Barbearia Tradicional deseja um aniversário incrível pra você!${benefit} Quando quiser, chama a gente pra marcar seu horário. ✂️`;
  }
  return `Olá, ${name}! Seu horário na C7 Barbearia Tradicional está confirmado para ${appointmentText(p)}, com ${professional}. Se precisar reagendar ou cancelar, fale com a gente por aqui. ✂️`;
}

function filterRows(rows){
  const now=new Date();
  if(tab==="sent") return rows.filter(r=>r.status==="sent");
  if(tab==="scheduled") return rows.filter(r=>r.status==="pending"&&new Date(r.scheduled_at)>now);
  return rows.filter(r=>r.status==="pending"&&new Date(r.scheduled_at)<=now);
}

function detailLine(item){
  const p=item.payload||{};
  if(item.automation_type==="booking_confirmation"||item.automation_type==="booking_reminder"){
    return `${appointmentText(p)} • ${p.professional_name||"C7"}`;
  }
  if(item.automation_type==="post_service") return `Pós-atendimento • ${p.professional_name||"C7"}`;
  if(item.automation_type==="reactivation") return `Cliente sem retorno há ${p.days_inactive||30} dias`;
  if(item.automation_type==="birthday") return "Aniversário do cliente";
  return "C7 Barbearia Tradicional";
}

function renderCard(item,channel){
  const p=item.payload||{};
  const isSent=item.status==="sent";
  const isScheduled=item.status==="pending"&&new Date(item.scheduled_at)>new Date();
  const status=isSent?"ENVIADA":isScheduled?"PROGRAMADA":"PENDENTE";
  let action="";

  if(channel==="whatsapp"&&!isSent&&!isScheduled){
    const url=`https://wa.me/${phoneForWa(item.phone)}?text=${encodeURIComponent(messageText(item))}`;
    action=`
      <a class="automation-action whatsapp" href="${url}" target="_blank" rel="noopener">ABRIR WHATSAPP</a>
      <button type="button" data-mark-channel="whatsapp" data-mark-sent="${item.id}">MARCAR COMO ENVIADA</button>
    `;
  }

  return `
    <article class="automation-card ${!isSent&&!isScheduled?"needs-action":""}">
      <div class="automation-card-top">
        <span class="automation-kind"><b>${kindIcon(item.automation_type)}</b>${kindLabel(item.automation_type)}</span>
        <em class="automation-status ${status.toLowerCase()}">${status}</em>
      </div>
      <strong>${p.customer_name||"Cliente"}</strong>
      <small>${channel==="whatsapp"?(item.phone||"Sem telefone"):(item.email||"Sem e-mail")}</small>
      <p>${detailLine(item)}</p>
      <div class="automation-due">${isSent?"Enviada "+localDate(item.sent_at):isScheduled?"Programada para "+localDate(item.scheduled_at):"Ação necessária agora"}</div>
      <div class="automation-card-actions">${action}</div>
    </article>
  `;
}

function render(){
  const w=filterRows(whatsappRows);
  const e=filterRows(emailRows);

  $("automationWhatsappList").innerHTML=w.length
    ?w.map(x=>renderCard(x,"whatsapp")).join("")
    :'<div class="agenda-empty">Nenhuma mensagem nesta categoria.</div>';

  $("automationEmailList").innerHTML=e.length
    ?e.map(x=>renderCard(x,"email")).join("")
    :'<div class="agenda-empty">Nenhum e-mail nesta categoria.</div>';

  document.querySelectorAll("[data-mark-sent]").forEach(btn=>{
    btn.addEventListener("click",()=>markSent(btn.dataset.markChannel,btn.dataset.markSent));
  });

  const now=new Date();
  $("automationWhatsappPending").textContent=whatsappRows.filter(r=>r.status==="pending"&&new Date(r.scheduled_at)<=now).length;
  $("automationEmailPending").textContent=emailRows.filter(r=>r.status==="pending"&&new Date(r.scheduled_at)<=now).length;

  const today=new Date();
  const sameDay=value=>{
    if(!value) return false;
    return new Date(value).toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo"})===
      today.toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo"});
  };
  $("automationSentToday").textContent=[
    ...whatsappRows.filter(r=>r.status==="sent"&&sameDay(r.sent_at)),
    ...emailRows.filter(r=>r.status==="sent"&&sameDay(r.sent_at))
  ].length;

  $("automationUpcoming").textContent=[
    ...whatsappRows.filter(r=>r.status==="pending"&&new Date(r.scheduled_at)>now),
    ...emailRows.filter(r=>r.status==="pending"&&new Date(r.scheduled_at)>now)
  ].length;
}

function renderSettings(){
  if(!settings) return;
  $("autoBookingConfirmation").checked=settings.booking_confirmation_active;
  $("autoBookingReminder").checked=settings.booking_reminder_active;
  $("autoReminderHours").value=settings.booking_reminder_hours;
  $("autoPostService").checked=settings.post_service_active;
  $("autoPostServiceHours").value=settings.post_service_delay_hours;
  $("autoReactivation").checked=settings.reactivation_active;
  $("autoReactivationDays").value=settings.reactivation_days;
  $("autoBirthday").checked=settings.birthday_active;
  $("autoEmailActive").checked=settings.email_active;
  $("autoWhatsappActive").checked=settings.whatsapp_manual_active;
}

async function load(){
  const [{data:w},{data:e},{data:s}]=await Promise.all([
    supabase.from("whatsapp_automation_queue")
      .select("id,automation_type,appointment_id,customer_id,phone,status,scheduled_at,sent_at,payload,created_at")
      .order("scheduled_at",{ascending:false}).limit(300),
    supabase.from("email_automation_queue")
      .select("id,automation_type,appointment_id,customer_id,email,status,scheduled_at,sent_at,payload,created_at")
      .order("scheduled_at",{ascending:false}).limit(300),
    supabase.from("automation_settings").select("*").eq("singleton",true).maybeSingle()
  ]);

  whatsappRows=w||[];
  emailRows=e||[];
  settings=s||null;
  renderSettings();
  render();
}

async function markSent(channel,id){
  const table=channel==="email"?"email_automation_queue":"whatsapp_automation_queue";
  const now=new Date().toISOString();
  const {error}=await supabase.from(table)
    .update({status:"sent",sent_at:now,updated_at:now})
    .eq("id",id);
  if(!error) await load();
}

async function saveSettings(){
  if(!settings) return;
  const btn=$("saveAutomationSettingsBtn");
  const msg=$("automationSettingsMessage");
  btn.disabled=true;
  msg.textContent="Salvando...";

  const payload={
    booking_confirmation_active:$("autoBookingConfirmation").checked,
    booking_reminder_active:$("autoBookingReminder").checked,
    booking_reminder_hours:Number($("autoReminderHours").value||24),
    post_service_active:$("autoPostService").checked,
    post_service_delay_hours:Number($("autoPostServiceHours").value||2),
    reactivation_active:$("autoReactivation").checked,
    reactivation_days:Number($("autoReactivationDays").value||30),
    birthday_active:$("autoBirthday").checked,
    email_active:$("autoEmailActive").checked,
    whatsapp_manual_active:$("autoWhatsappActive").checked,
    updated_at:new Date().toISOString()
  };

  const {data,error}=await supabase.from("automation_settings")
    .update(payload).eq("id",settings.id).select("*").single();

  btn.disabled=false;
  if(error){
    msg.textContent="Não foi possível salvar as regras.";
    return;
  }
  settings=data;
  msg.textContent="Regras atualizadas.";
  setTimeout(()=>{if(msg.textContent==="Regras atualizadas.") msg.textContent=""},2500);
}

document.querySelectorAll("[data-automation-tab]").forEach(btn=>{
  btn.addEventListener("click",()=>{
    tab=btn.dataset.automationTab;
    document.querySelectorAll("[data-automation-tab]").forEach(x=>x.classList.toggle("active",x===btn));
    render();
  });
});

$("refreshAutomationsBtn")?.addEventListener("click",load);
$("saveAutomationSettingsBtn")?.addEventListener("click",saveSettings);
document.querySelector('.nav-item[data-section="automacoes"]')?.addEventListener("click",load);

(async()=>{
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return;
  await load();

  const channel=supabase.channel("c7-automations-live")
    .on("postgres_changes",{event:"*",schema:"public",table:"whatsapp_automation_queue"},load)
    .on("postgres_changes",{event:"*",schema:"public",table:"email_automation_queue"},load)
    .subscribe();

  window.addEventListener("beforeunload",()=>supabase.removeChannel(channel));
})();

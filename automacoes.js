import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase=createClient(
  "https://cjtgjqxkyvgjlhylrvas.supabase.co",
  "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE"
);

const $=id=>document.getElementById(id);
let tab="pending";
let whatsappRows=[];
let emailRows=[];

function localDate(value){
  if(!value) return "—";
  return new Date(value).toLocaleString("pt-BR",{
    day:"2-digit",month:"2-digit",year:"numeric",
    hour:"2-digit",minute:"2-digit",
    timeZone:"America/Sao_Paulo"
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

function messageText(item){
  const p=item.payload||{};
  const name=(p.customer_name||"Cliente").split(" ")[0];
  const date=new Date(p.starts_at);
  const dateLabel=date.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"America/Sao_Paulo"});
  const timeLabel=date.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"});
  const professional=p.professional_name||"nossa equipe";

  if(item.automation_type==="booking_reminder"){
    return `Olá, ${name}! Passando para lembrar do seu horário na C7 Barbearia Tradicional em ${dateLabel}, às ${timeLabel}, com ${professional}. Se precisar reagendar ou cancelar, fale com a gente por aqui. ✂️`;
  }

  return `Olá, ${name}! Seu horário na C7 Barbearia Tradicional está confirmado para ${dateLabel}, às ${timeLabel}, com ${professional}. Se precisar reagendar ou cancelar, fale com a gente por aqui. ✂️`;
}

function emailSubject(item){
  return item.automation_type==="booking_reminder"
    ?"Lembrete do seu horário na C7"
    :"Seu agendamento na C7 está confirmado";
}

function emailBody(item){
  const p=item.payload||{};
  const name=(p.customer_name||"Cliente").split(" ")[0];
  const date=new Date(p.starts_at);
  const dateLabel=date.toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric",timeZone:"America/Sao_Paulo"});
  const timeLabel=date.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"});
  const professional=p.professional_name||"nossa equipe";

  if(item.automation_type==="booking_reminder"){
    return `Olá, ${name}!\n\nEste é um lembrete do seu horário na C7 Barbearia Tradicional.\n\nData: ${dateLabel}\nHorário: ${timeLabel}\nProfissional: ${professional}\n\nSe precisar reagendar ou cancelar, entre em contato com a C7.\n\nC7 Barbearia Tradicional`;
  }

  return `Olá, ${name}!\n\nSeu agendamento na C7 Barbearia Tradicional está confirmado.\n\nData: ${dateLabel}\nHorário: ${timeLabel}\nProfissional: ${professional}\n\nSe precisar reagendar ou cancelar, entre em contato com a C7.\n\nC7 Barbearia Tradicional`;
}

function filterRows(rows){
  const now=new Date();
  if(tab==="sent") return rows.filter(r=>r.status==="sent");
  if(tab==="scheduled") return rows.filter(r=>r.status==="pending"&&new Date(r.scheduled_at)>now);
  return rows.filter(r=>r.status==="pending"&&new Date(r.scheduled_at)<=now);
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

  if(channel==="email"&&!isSent&&!isScheduled){
    const url=`mailto:${encodeURIComponent(item.email)}?subject=${encodeURIComponent(emailSubject(item))}&body=${encodeURIComponent(emailBody(item))}`;
    action=`
      <a class="automation-action email" href="${url}">ABRIR E-MAIL</a>
      <button type="button" data-mark-channel="email" data-mark-sent="${item.id}">MARCAR COMO ENVIADO</button>
    `;
  }

  return `
    <article class="automation-card">
      <div class="automation-card-top">
        <span>${kindLabel(item.automation_type)}</span>
        <em class="automation-status ${status.toLowerCase()}">${status}</em>
      </div>
      <strong>${p.customer_name||"Cliente"}</strong>
      <small>${channel==="whatsapp"?(item.phone||"Sem telefone"):(item.email||"Sem e-mail")}</small>
      <p>${localDate(p.starts_at)} • ${p.professional_name||"C7"}</p>
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
    const d=new Date(value);
    return d.toDateString()===today.toDateString();
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

async function load(){
  const [{data:w},{data:e}]=await Promise.all([
    supabase.from("whatsapp_automation_queue")
      .select("id,automation_type,appointment_id,customer_id,phone,status,scheduled_at,sent_at,payload,created_at")
      .order("scheduled_at",{ascending:false}).limit(250),
    supabase.from("email_automation_queue")
      .select("id,automation_type,appointment_id,customer_id,email,status,scheduled_at,sent_at,payload,created_at")
      .order("scheduled_at",{ascending:false}).limit(250)
  ]);

  whatsappRows=w||[];
  emailRows=e||[];
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

document.querySelectorAll("[data-automation-tab]").forEach(btn=>{
  btn.addEventListener("click",()=>{
    tab=btn.dataset.automationTab;
    document.querySelectorAll("[data-automation-tab]").forEach(x=>x.classList.toggle("active",x===btn));
    render();
  });
});

$("refreshAutomationsBtn")?.addEventListener("click",load);

document.querySelector('.nav-item[data-section="automacoes"]')?.addEventListener("click",load);

(async()=>{
  const {data:{session}}=await supabase.auth.getSession();
  if(session) await load();
})();

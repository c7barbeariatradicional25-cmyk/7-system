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
let customAutomations=[];

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

function kindLabel(type,item){
  if(type==="custom") return item?.payload?.custom_automation_name||"PERSONALIZADA";
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
    birthday:"🎉",
    custom:"⚙"
  }[type]||"•";
}

function appointmentText(p){
  if(!p?.starts_at) return "";
  const d=new Date(p.starts_at);
  const date=d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"America/Sao_Paulo"});
  const time=d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"});
  return date+" às "+time;
}

function expandTemplate(template,item){
  const p=item.payload||{};
  const fullName=p.customer_name||"Cliente";
  const firstName=fullName.split(" ")[0];
  let date="";
  let time="";
  if(p.starts_at){
    const d=new Date(p.starts_at);
    date=d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"America/Sao_Paulo"});
    time=d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"});
  }
  return String(template||"")
    .replaceAll("{nome}",fullName)
    .replaceAll("{primeiro_nome}",firstName)
    .replaceAll("{profissional}",p.professional_name||"Equipe C7")
    .replaceAll("{data}",date)
    .replaceAll("{hora}",time);
}

function messageText(item){
  const p=item.payload||{};
  if(item.automation_type==="custom"&&p.message_template){
    return expandTemplate(p.message_template,item);
  }

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
  if(item.automation_type==="custom"){
    return p.custom_automation_name||"Automação personalizada";
  }
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
        <span class="automation-kind"><b>${kindIcon(item.automation_type)}</b>${kindLabel(item.automation_type,item)}</span>
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

function triggerLabel(value){
  return {
    after_booking:"Depois que agenda",
    before_appointment:"Antes do horário",
    after_service:"Depois do atendimento",
    inactive_customer:"Cliente sem voltar",
    birthday:"No aniversário"
  }[value]||value;
}

function channelLabel(value){
  return {whatsapp:"WhatsApp",email:"E-mail",both:"WhatsApp + E-mail"}[value]||value;
}

function ruleText(item){
  if(item.trigger_type==="birthday") return "No dia do aniversário";
  const unit={minutes:"min",hours:"h",days:"dias"}[item.offset_unit]||item.offset_unit;
  const value=item.offset_value;
  if(item.trigger_type==="before_appointment") return value+" "+unit+" antes";
  if(item.trigger_type==="after_booking") return value===0?"Imediatamente após agendar":value+" "+unit+" depois de agendar";
  if(item.trigger_type==="after_service") return value===0?"Ao finalizar atendimento":value+" "+unit+" após atendimento";
  if(item.trigger_type==="inactive_customer") return value+" "+unit+" sem retorno";
  return triggerLabel(item.trigger_type);
}

function builtinLibrary(){
  if(!settings) return [];
  return [
    {name:"Confirmação de agendamento",description:"Confirma o novo horário do cliente.",channel:"both",rule:"Imediatamente após agendar",active:settings.booking_confirmation_active},
    {name:"Lembrete de agendamento",description:"Lembra o cliente antes do horário.",channel:"both",rule:settings.booking_reminder_hours+"h antes",active:settings.booking_reminder_active},
    {name:"Pós-atendimento",description:"Contato depois do serviço concluído.",channel:"both",rule:settings.post_service_delay_hours+"h após atendimento",active:settings.post_service_active},
    {name:"Reativação",description:"Contato com cliente que não voltou.",channel:"both",rule:settings.reactivation_days+" dias sem retorno",active:settings.reactivation_active},
    {name:"Aniversário",description:"Mensagem no aniversário do cliente.",channel:"both",rule:"No dia do aniversário",active:settings.birthday_active}
  ];
}

function renderLibrary(){
  const list=$("automationLibraryList");
  if(!list) return;

  const builtins=builtinLibrary().map((item,index)=>({...item,id:"builtin-"+index,builtin:true}));
  const custom=customAutomations.map(item=>({...item,rule:ruleText(item),builtin:false}));
  const rows=[...builtins,...custom];

  list.innerHTML=rows.map(item=>`
    <article class="automation-library-card ${item.active?"active":"inactive"}">
      <div class="automation-library-card-head">
        <span class="automation-library-type">${item.builtin?"PADRÃO":"PERSONALIZADA"}</span>
        <span class="automation-library-state">${item.active?"ATIVA":"PAUSADA"}</span>
      </div>
      <strong>${item.name}</strong>
      <p>${item.description||"Sem descrição."}</p>
      <div class="automation-library-meta">
        <span>${channelLabel(item.channel)}</span>
        <span>${item.rule}</span>
      </div>
      ${item.builtin
        ?'<small class="automation-library-note">Configure nas regras abaixo.</small>'
        :`<div class="automation-library-actions">
            <button type="button" data-custom-edit="${item.id}">EDITAR</button>
            <button type="button" data-custom-toggle="${item.id}">${item.active?"PAUSAR":"ATIVAR"}</button>
            <button type="button" data-custom-delete="${item.id}">EXCLUIR</button>
          </div>`}
    </article>
  `).join("");

  list.querySelectorAll("[data-custom-edit]").forEach(btn=>btn.addEventListener("click",()=>openCustomAutomation(btn.dataset.customEdit)));
  list.querySelectorAll("[data-custom-toggle]").forEach(btn=>btn.addEventListener("click",()=>toggleCustomAutomation(btn.dataset.customToggle)));
  list.querySelectorAll("[data-custom-delete]").forEach(btn=>btn.addEventListener("click",()=>deleteCustomAutomation(btn.dataset.customDelete)));
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
  const [wr,er,sr,cr]=await Promise.all([
    supabase.from("whatsapp_automation_queue")
      .select("id,automation_type,appointment_id,customer_id,phone,status,scheduled_at,sent_at,payload,created_at")
      .order("scheduled_at",{ascending:false}).limit(300),
    supabase.from("email_automation_queue")
      .select("id,automation_type,appointment_id,customer_id,email,status,scheduled_at,sent_at,payload,created_at")
      .order("scheduled_at",{ascending:false}).limit(300),
    supabase.from("automation_settings").select("*").eq("singleton",true).maybeSingle(),
    supabase.from("custom_automations").select("*").order("created_at",{ascending:true})
  ]);

  whatsappRows=wr.data||[];
  emailRows=er.data||[];
  settings=sr.data||null;
  customAutomations=cr.data||[];

  renderSettings();
  renderLibrary();
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
  renderLibrary();
  msg.textContent="Regras atualizadas.";
  setTimeout(()=>{if(msg.textContent==="Regras atualizadas.") msg.textContent=""},2500);
}

function openCustomAutomation(id=null){
  const item=id?customAutomations.find(x=>x.id===id):null;
  $("customAutomationModalTitle").textContent=item?"Editar automação":"Nova automação";
  $("customAutomationId").value=item?.id||"";
  $("customAutomationName").value=item?.name||"";
  $("customAutomationDescription").value=item?.description||"";
  $("customAutomationChannel").value=item?.channel||"whatsapp";
  $("customAutomationTrigger").value=item?.trigger_type||"after_booking";
  $("customAutomationOffset").value=item?.offset_value??0;
  $("customAutomationUnit").value=item?.offset_unit||"hours";
  $("customAutomationMessage").value=item?.message_template||"";
  $("customAutomationEmailSubject").value=item?.email_subject||"";
  $("customAutomationMarketing").checked=Boolean(item?.marketing_only);
  $("customAutomationActive").checked=item?Boolean(item.active):true;
  $("customAutomationMessageStatus").textContent="";
  syncCustomAutomationFields();
  $("customAutomationModal").classList.remove("hidden");
}

function closeCustomAutomation(){
  $("customAutomationModal")?.classList.add("hidden");
}

function syncCustomAutomationFields(){
  const channel=$("customAutomationChannel").value;
  const trigger=$("customAutomationTrigger").value;
  $("customAutomationEmailSubjectWrap").classList.toggle("hidden",channel==="whatsapp");
  const noOffset=trigger==="birthday";
  $("customAutomationOffset").disabled=noOffset;
  $("customAutomationUnit").disabled=noOffset;
  if(noOffset) $("customAutomationOffset").value=0;
}

async function saveCustomAutomation(e){
  e.preventDefault();
  const id=$("customAutomationId").value||null;
  const payload={
    name:$("customAutomationName").value.trim(),
    description:$("customAutomationDescription").value.trim()||null,
    channel:$("customAutomationChannel").value,
    trigger_type:$("customAutomationTrigger").value,
    offset_value:Number($("customAutomationOffset").value||0),
    offset_unit:$("customAutomationUnit").value,
    message_template:$("customAutomationMessage").value.trim(),
    email_subject:$("customAutomationEmailSubject").value.trim()||null,
    marketing_only:$("customAutomationMarketing").checked,
    active:$("customAutomationActive").checked,
    updated_at:new Date().toISOString()
  };

  const msg=$("customAutomationMessageStatus");
  msg.textContent="Salvando...";

  const result=id
    ?await supabase.from("custom_automations").update(payload).eq("id",id)
    :await supabase.from("custom_automations").insert(payload);

  if(result.error){
    msg.textContent="Não foi possível salvar a automação.";
    return;
  }

  closeCustomAutomation();
  await load();
}

async function toggleCustomAutomation(id){
  const item=customAutomations.find(x=>x.id===id);
  if(!item) return;
  const {error}=await supabase.from("custom_automations")
    .update({active:!item.active,updated_at:new Date().toISOString()}).eq("id",id);
  if(!error) await load();
}

async function deleteCustomAutomation(id){
  if(!confirm("Excluir esta automação personalizada?")) return;
  const {error}=await supabase.from("custom_automations").delete().eq("id",id);
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
$("saveAutomationSettingsBtn")?.addEventListener("click",saveSettings);
$("newCustomAutomationBtn")?.addEventListener("click",()=>openCustomAutomation());
$("customAutomationForm")?.addEventListener("submit",saveCustomAutomation);
$("customAutomationChannel")?.addEventListener("change",syncCustomAutomationFields);
$("customAutomationTrigger")?.addEventListener("change",syncCustomAutomationFields);
document.querySelectorAll("[data-close-custom-automation]").forEach(el=>el.addEventListener("click",closeCustomAutomation));
document.querySelector('.nav-item[data-section="automacoes"]')?.addEventListener("click",load);

(async()=>{
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return;
  await load();

  const channel=supabase.channel("c7-automations-live")
    .on("postgres_changes",{event:"*",schema:"public",table:"whatsapp_automation_queue"},load)
    .on("postgres_changes",{event:"*",schema:"public",table:"email_automation_queue"},load)
    .on("postgres_changes",{event:"*",schema:"public",table:"custom_automations"},load)
    .subscribe();

  window.addEventListener("beforeunload",()=>supabase.removeChannel(channel));
})();

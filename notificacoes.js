import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase=createClient(
  "https://cjtgjqxkyvgjlhylrvas.supabase.co",
  "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE"
);

const $=id=>document.getElementById(id);
let filter="active";
let notifications=[];
let manualMessages=[];
let lastActionCount=null;
let audioContext=null;
let audioUnlocked=false;

function formatDate(value){
  if(!value) return "—";
  return new Date(value).toLocaleString("pt-BR",{
    day:"2-digit",month:"2-digit",year:"numeric",
    hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"
  });
}

function titleForType(type){
  return {
    new_appointment:"Novo agendamento",
    rescheduled:"Agendamento alterado",
    cancelled:"Agendamento cancelado",
    system:"Aviso do sistema"
  }[type]||"Notificação";
}

function automationLabel(type,item){
  if(type==="custom") return item?.payload?.custom_automation_name||"PERSONALIZADA";
  return {
    booking_confirmation:"CONFIRMAÇÃO",
    booking_reminder:"LEMBRETE",
    reactivation:"REATIVAÇÃO",
    post_service:"PÓS-ATENDIMENTO",
    birthday:"ANIVERSÁRIO"
  }[type]||type;
}

function serviceLabel(item){
  const list=item.appointment?.appointment_services||[];
  return list.length?list.map(s=>s.service_name).join(" + "):"Serviço";
}

function customerLabel(item){
  return item.appointment?.customer?.full_name||"Cliente";
}

function appointmentDate(item){
  return item.appointment?.starts_at||item.created_at;
}

function visibleNotifications(){
  if(filter==="unread") return notifications.filter(n=>!n.read_at&&!n.archived_at);
  if(filter==="archived") return notifications.filter(n=>n.archived_at);
  return notifications.filter(n=>!n.archived_at);
}

function dueMessages(){
  const now=new Date();
  return manualMessages.filter(m=>m.status==="pending"&&new Date(m.scheduled_at)<=now);
}

function actionCount(){
  return notifications.filter(n=>!n.read_at&&!n.archived_at).length+dueMessages().length;
}

function unlockAudio(){
  if(audioUnlocked) return;
  try{
    audioContext=new (window.AudioContext||window.webkitAudioContext)();
    if(audioContext.state==="suspended") audioContext.resume();
    audioUnlocked=true;
  }catch{}
}

function playAlert(){
  if(!audioUnlocked||!audioContext) return;
  try{
    const now=audioContext.currentTime;
    [0,0.13].forEach((offset,index)=>{
      const osc=audioContext.createOscillator();
      const gain=audioContext.createGain();
      osc.type="sine";
      osc.frequency.setValueAtTime(index===0?740:920,now+offset);
      gain.gain.setValueAtTime(0.0001,now+offset);
      gain.gain.exponentialRampToValueAtTime(0.12,now+offset+0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001,now+offset+0.11);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start(now+offset);
      osc.stop(now+offset+0.12);
    });
  }catch{}
}

function showToast(title,message){
  const toast=$("c7AlertToast");
  if(!toast) return;
  toast.innerHTML=`<strong>${title}</strong><span>${message}</span>`;
  toast.classList.remove("hidden");
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer=setTimeout(()=>{
    toast.classList.remove("show");
    setTimeout(()=>toast.classList.add("hidden"),220);
  },5200);
}

function signalNewAction(title,message){
  playAlert();
  showToast(title,message);
  $("notificationBtn")?.classList.add("has-alert");
  setTimeout(()=>$("notificationBtn")?.classList.remove("alert-pop"),900);
  $("notificationBtn")?.classList.add("alert-pop");
}

function updateBadge({signal=false}={}){
  const total=actionCount();
  const badge=$("notificationBadge");
  const btn=$("notificationBtn");
  if(badge){
    badge.textContent=total>99?"99+":String(total);
    badge.classList.toggle("hidden",total===0);
  }
  btn?.classList.toggle("has-alert",total>0);

  if(signal&&lastActionCount!==null&&total>lastActionCount){
    signalNewAction("C7 SYSTEM",`${total} pendência${total===1?"":"s"} precisa${total===1?"":"m"} de atenção.`);
  }
  lastActionCount=total;
}

function whatsappPhone(raw){
  const digits=String(raw||"").replace(/\D/g,"");
  if(!digits) return "";
  return digits.startsWith("55")?digits:"55"+digits;
}

function appointmentText(p){
  if(!p?.starts_at) return "";
  const date=new Date(p.starts_at);
  const dateLabel=date.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"America/Sao_Paulo"});
  const timeLabel=date.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"});
  return `${dateLabel}, às ${timeLabel}`;
}

function expandCustomMessage(template,item){
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

function manualMessageText(item){
  const p=item.payload||{};
  if(item.automation_type==="custom"&&p.message_template){
    return expandCustomMessage(p.message_template,item);
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

function renderPrioritySummary(){
  const unread=notifications.filter(n=>!n.read_at&&!n.archived_at).length;
  const due=dueMessages().length;
  const total=unread+due;
  if(!total) return `
    <div class="notification-priority-summary all-clear">
      <div><span>TUDO CERTO</span><strong>Nenhuma ação pendente</strong></div>
    </div>`;

  return `
    <div class="notification-priority-summary">
      <div>
        <span>AÇÃO NECESSÁRIA</span>
        <strong>${total} pendência${total===1?"":"s"} agora</strong>
        <small>${due} WhatsApp • ${unread} notificaç${unread===1?"ão":"ões"} não lida${unread===1?"":"s"}</small>
      </div>
      <button id="openAutomationsFromNotifications" type="button">ABRIR AUTOMAÇÕES</button>
    </div>
  `;
}

function renderManualMessages(){
  const due=dueMessages();
  if(!due.length) return "";

  return `
    <section class="manual-message-section">
      <div class="manual-message-section-head">
        <div><span>WHATSAPP</span><strong>Mensagens que precisam ser enviadas</strong></div>
        <b>${due.length}</b>
      </div>
      ${due.map(item=>{
        const p=item.payload||{};
        const text=manualMessageText(item);
        const url=`https://wa.me/${whatsappPhone(item.phone)}?text=${encodeURIComponent(text)}`;
        return `
          <article class="manual-message-card urgent">
            <div class="manual-message-top">
              <span>${automationLabel(item.automation_type,item)}</span>
              <small>${formatDate(item.scheduled_at)}</small>
            </div>
            <strong>${p.customer_name||"Cliente"}</strong>
            <p>${text}</p>
            <div class="notification-actions">
              <a class="manual-whatsapp-btn" href="${url}" target="_blank" rel="noopener">ABRIR WHATSAPP</a>
              <button type="button" data-manual-sent="${item.id}">MARCAR COMO ENVIADA</button>
            </div>
          </article>
        `;
      }).join("")}
    </section>
  `;
}

function render(){
  updateBadge();
  const list=$("notificationList");
  if(!list) return;

  const rows=visibleNotifications();
  const manualHtml=renderManualMessages();

  list.innerHTML=renderPrioritySummary()+manualHtml+(rows.length?rows.map(item=>{
    const unread=!item.read_at&&!item.archived_at;
    return `
      <article class="notification-item ${unread?"unread":""}" data-notification-id="${item.id}">
        <div class="notification-dot"></div>
        <div class="notification-content">
          <div class="notification-item-top">
            <strong>${item.title||titleForType(item.notification_type)}</strong>
            <span>${formatDate(item.created_at)}</span>
          </div>
          <h3>${new Date(appointmentDate(item)).toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric",timeZone:"America/Sao_Paulo"})} • ${new Date(appointmentDate(item)).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"})}</h3>
          <p>${item.message||`${customerLabel(item)} • ${serviceLabel(item)}`}</p>
          <div class="notification-actions">
            ${unread?`<button type="button" data-mark-read="${item.id}">MARCAR COMO LIDA</button>`:""}
            ${!item.archived_at?`<button type="button" data-archive="${item.id}">ARQUIVAR</button>`:`<button type="button" data-unarchive="${item.id}">RESTAURAR</button>`}
            ${item.appointment_id?`<button type="button" data-open-appointment="${item.appointment_id}">VER NA AGENDA</button>`:""}
          </div>
        </div>
      </article>
    `;
  }).join(""):'<div class="notification-empty compact">Nenhuma outra notificação.</div>');

  list.querySelectorAll("[data-mark-read]").forEach(btn=>btn.addEventListener("click",()=>markRead(btn.dataset.markRead)));
  list.querySelectorAll("[data-archive]").forEach(btn=>btn.addEventListener("click",()=>archiveOne(btn.dataset.archive)));
  list.querySelectorAll("[data-unarchive]").forEach(btn=>btn.addEventListener("click",()=>unarchiveOne(btn.dataset.unarchive)));
  list.querySelectorAll("[data-open-appointment]").forEach(btn=>btn.addEventListener("click",()=>openAppointment(btn.dataset.openAppointment)));
  list.querySelectorAll("[data-manual-sent]").forEach(btn=>btn.addEventListener("click",()=>markManualSent(btn.dataset.manualSent)));
  $("openAutomationsFromNotifications")?.addEventListener("click",()=>{
    closeDrawer();
    document.querySelector('.nav-item[data-section="automacoes"]')?.click();
  });
}

async function loadManualMessages(){
  const {data,error}=await supabase.from("whatsapp_automation_queue")
    .select("id,automation_type,appointment_id,customer_id,phone,status,scheduled_at,sent_at,payload,created_at")
    .eq("status","pending").lte("scheduled_at",new Date().toISOString())
    .order("scheduled_at",{ascending:true}).limit(100);
  manualMessages=error?[]:(data||[]);
}

async function markManualSent(id){
  const now=new Date().toISOString();
  const {error}=await supabase.from("whatsapp_automation_queue")
    .update({status:"sent",sent_at:now,updated_at:now}).eq("id",id);
  if(!error){
    manualMessages=manualMessages.filter(item=>item.id!==id);
    render();
  }
}

async function loadNotifications({signal=false}={}){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return;

  await loadManualMessages();
  const {data,error}=await supabase.from("notifications")
    .select("id,notification_type,title,message,appointment_id,professional_id,read_at,archived_at,created_at,appointment:appointments(id,starts_at,status,customer:customers(full_name),professional:professionals(full_name),appointment_services(service_name,sort_order))")
    .order("created_at",{ascending:false}).limit(100);

  if(error){
    $("notificationList").innerHTML='<div class="notification-empty">Não foi possível carregar as notificações.</div>';
    return;
  }

  notifications=data||[];
  render();
  updateBadge({signal});
}

async function markRead(id){
  const {error}=await supabase.from("notifications").update({read_at:new Date().toISOString()}).eq("id",id);
  if(!error){
    const item=notifications.find(n=>n.id===id);
    if(item) item.read_at=new Date().toISOString();
    render();
  }
}

async function archiveOne(id){
  const now=new Date().toISOString();
  const {error}=await supabase.from("notifications").update({archived_at:now,read_at:now}).eq("id",id);
  if(!error){
    const item=notifications.find(n=>n.id===id);
    if(item){item.archived_at=now;item.read_at=item.read_at||now}
    render();
  }
}

async function unarchiveOne(id){
  const {error}=await supabase.from("notifications").update({archived_at:null}).eq("id",id);
  if(!error){
    const item=notifications.find(n=>n.id===id);
    if(item) item.archived_at=null;
    render();
  }
}

async function archiveAll(){
  const ids=notifications.filter(n=>!n.archived_at).map(n=>n.id);
  if(!ids.length) return;
  const now=new Date().toISOString();
  const {error}=await supabase.from("notifications").update({archived_at:now,read_at:now}).in("id",ids);
  if(!error){
    notifications.forEach(n=>{if(ids.includes(n.id)){n.archived_at=now;n.read_at=n.read_at||now}});
    render();
  }
}

function openDrawer(){
  $("notificationDrawer")?.classList.remove("hidden");
  $("notificationDrawerBackdrop")?.classList.remove("hidden");
  loadNotifications();
}

function closeDrawer(){
  $("notificationDrawer")?.classList.add("hidden");
  $("notificationDrawerBackdrop")?.classList.add("hidden");
}

async function openAppointment(appointmentId){
  const item=notifications.find(n=>String(n.appointment_id)===String(appointmentId));
  if(item&&!item.read_at) await markRead(item.id);
  closeDrawer();
  document.querySelector('.nav-item[data-section="agenda"]')?.click();

  if(item?.appointment?.starts_at){
    const date=new Date(item.appointment.starts_at);
    const y=date.getFullYear();
    const m=String(date.getMonth()+1).padStart(2,"0");
    const d=String(date.getDate()).padStart(2,"0");
    const input=$("agendaDate");
    if(input){
      input.value=`${y}-${m}-${d}`;
      input.dispatchEvent(new Event("change"));
    }
  }
}

async function init(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return;

  document.addEventListener("pointerdown",unlockAudio,{once:true});
  document.addEventListener("keydown",unlockAudio,{once:true});

  $("notificationBtn")?.addEventListener("click",openDrawer);
  $("closeNotificationBtn")?.addEventListener("click",closeDrawer);
  $("notificationDrawerBackdrop")?.addEventListener("click",closeDrawer);
  $("archiveAllNotificationsBtn")?.addEventListener("click",archiveAll);

  document.querySelectorAll("[data-notification-filter]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      filter=btn.dataset.notificationFilter;
      document.querySelectorAll("[data-notification-filter]").forEach(x=>x.classList.toggle("active",x===btn));
      render();
    });
  });

  await loadNotifications();
  lastActionCount=actionCount();

  const channel=supabase.channel("c7-notifications")
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications"},payload=>{
      signalNewAction(payload.new?.title||"Nova notificação","Confira a central de notificações.");
      loadNotifications();
    })
    .on("postgres_changes",{event:"*",schema:"public",table:"whatsapp_automation_queue"},()=>loadNotifications({signal:true}))
    .subscribe();

  const timer=setInterval(()=>loadNotifications({signal:true}),60000);

  window.addEventListener("beforeunload",()=>{
    clearInterval(timer);
    supabase.removeChannel(channel);
  });
}

init();

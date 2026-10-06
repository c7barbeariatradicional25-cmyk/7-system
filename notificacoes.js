import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase=createClient(
  "https://cjtgjqxkyvgjlhylrvas.supabase.co",
  "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE"
);

const $=id=>document.getElementById(id);
let filter="active";
let notifications=[];

function formatDate(value){
  if(!value) return "—";
  return new Date(value).toLocaleString("pt-BR",{
    day:"2-digit",
    month:"2-digit",
    year:"numeric",
    hour:"2-digit",
    minute:"2-digit"
  });
}

function titleForType(type){
  return {
    new_appointment:"Você tem um novo agendamento!",
    rescheduled:"Agendamento alterado",
    cancelled:"Agendamento cancelado",
    system:"Aviso do sistema"
  }[type]||"Notificação";
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

function updateBadge(){
  const unread=notifications.filter(n=>!n.read_at&&!n.archived_at).length;
  const badge=$("notificationBadge");
  if(!badge) return;
  badge.textContent=unread>99?"99+":String(unread);
  badge.classList.toggle("hidden",unread===0);
}

function render(){
  updateBadge();
  const list=$("notificationList");
  if(!list) return;

  const rows=visibleNotifications();

  if(!rows.length){
    list.innerHTML='<div class="notification-empty">Nenhuma notificação por aqui.</div>';
    return;
  }

  list.innerHTML=rows.map(item=>{
    const unread=!item.read_at&&!item.archived_at;
    return `
      <article class="notification-item ${unread?"unread":""}" data-notification-id="${item.id}">
        <div class="notification-dot"></div>
        <div class="notification-content">
          <div class="notification-item-top">
            <strong>${titleForType(item.notification_type)}</strong>
            <span>${formatDate(item.created_at)}</span>
          </div>
          <h3>${new Date(appointmentDate(item)).toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric"})} • ${new Date(appointmentDate(item)).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</h3>
          <p>${customerLabel(item)} • ${serviceLabel(item)}</p>
          <div class="notification-actions">
            ${unread?`<button type="button" data-mark-read="${item.id}">MARCAR COMO LIDA</button>`:""}
            ${!item.archived_at?`<button type="button" data-archive="${item.id}">ARQUIVAR</button>`:`<button type="button" data-unarchive="${item.id}">RESTAURAR</button>`}
            ${item.appointment_id?`<button type="button" data-open-appointment="${item.appointment_id}">VER NA AGENDA</button>`:""}
          </div>
        </div>
      </article>
    `;
  }).join("");

  list.querySelectorAll("[data-mark-read]").forEach(btn=>btn.addEventListener("click",()=>markRead(btn.dataset.markRead)));
  list.querySelectorAll("[data-archive]").forEach(btn=>btn.addEventListener("click",()=>archiveOne(btn.dataset.archive)));
  list.querySelectorAll("[data-unarchive]").forEach(btn=>btn.addEventListener("click",()=>unarchiveOne(btn.dataset.unarchive)));
  list.querySelectorAll("[data-open-appointment]").forEach(btn=>btn.addEventListener("click",()=>openAppointment(btn.dataset.openAppointment)));
}

async function loadNotifications(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return;

  const {data,error}=await supabase
    .from("notifications")
    .select("id,notification_type,title,message,appointment_id,professional_id,read_at,archived_at,created_at,appointment:appointments(id,starts_at,status,customer:customers(full_name),professional:professionals(full_name),appointment_services(service_name,sort_order))")
    .order("created_at",{ascending:false})
    .limit(100);

  if(error){
    $("notificationList").innerHTML='<div class="notification-empty">Não foi possível carregar as notificações.</div>';
    return;
  }

  notifications=data||[];
  render();
}

async function markRead(id){
  const {error}=await supabase.from("notifications")
    .update({read_at:new Date().toISOString()})
    .eq("id",id);

  if(!error){
    const item=notifications.find(n=>n.id===id);
    if(item) item.read_at=new Date().toISOString();
    render();
  }
}

async function archiveOne(id){
  const now=new Date().toISOString();
  const {error}=await supabase.from("notifications")
    .update({archived_at:now,read_at:now})
    .eq("id",id);

  if(!error){
    const item=notifications.find(n=>n.id===id);
    if(item){item.archived_at=now;item.read_at=item.read_at||now}
    render();
  }
}

async function unarchiveOne(id){
  const {error}=await supabase.from("notifications")
    .update({archived_at:null})
    .eq("id",id);

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
  const {error}=await supabase.from("notifications")
    .update({archived_at:now,read_at:now})
    .in("id",ids);

  if(!error){
    notifications.forEach(n=>{
      if(ids.includes(n.id)){n.archived_at=now;n.read_at=n.read_at||now}
    });
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

  const nav=document.querySelector('.nav-item[data-section="agenda"]');
  nav?.click();

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

  const channel=supabase
    .channel("c7-notifications")
    .on("postgres_changes",{event:"*",schema:"public",table:"notifications"},()=>loadNotifications())
    .subscribe();

  window.addEventListener("beforeunload",()=>supabase.removeChannel(channel));
}

init();

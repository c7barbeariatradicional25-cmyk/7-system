import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  "https://cjtgjqxkyvgjlhylrvas.supabase.co",
  "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE"
);

const $ = (id) => document.getElementById(id);
const escapeHtml = (value="") => String(value)
  .replaceAll("&","&amp;")
  .replaceAll("<","&lt;")
  .replaceAll(">","&gt;")
  .replaceAll('"',"&quot;")
  .replaceAll("'","&#039;");

const loginView=$("loginView");
const appView=$("appView");
const loginForm=$("loginForm");

const loginMessage=$("loginMessage");
const logoutBtn=$("logoutBtn");
const userName=$("userName");
const userRole=$("userRole");
const userAvatar=$("userAvatar");
const pageTitle=$("pageTitle");

const agendaDate=$("agendaDate");
const agendaDateLabel=$("agendaDateLabel");
const agendaCount=$("agendaCount");
const agendaTotal=$("agendaTotal");
const agendaList=$("agendaList");
const agendaTimeline=$("agendaTimeline");
const professionalFilter=$("professionalFilter");
const newAppointmentBtn=$("newAppointmentBtn");
const listViewBtn=$("listViewBtn");
const timelineViewBtn=$("timelineViewBtn");
const blockTimeBtn=$("blockTimeBtn");

const appointmentModal=$("appointmentModal");
const appointmentForm=$("appointmentForm");
const appointmentMessage=$("appointmentMessage");
const appointmentProfessional=$("appointmentProfessional");
const appointmentServiceList=$("appointmentServiceList");
const appointmentServiceCount=$("appointmentServiceCount");
// Serviços escolhidos no agendamento, na ordem; o mesmo serviço pode entrar mais de uma vez (ex.: pai e filho).
let pickedServiceIds=[];
const saveAndNewAppointmentBtn=$("saveAndNewAppointmentBtn");

const blockModal=$("blockModal");
const blockForm=$("blockForm");
const blockProfessional=$("blockProfessional");
const blockMessage=$("blockMessage");

const roleLabels={admin:"Administrador",reception:"Recepção",barber:"Barbeiro"};
const statusLabels={
  scheduled:"Agendado",
  confirmed:"Confirmado",
  waiting:"Aguardando",
  in_service:"Em atendimento",
  completed:"Finalizado",
  cancelled:"Cancelado",
  no_show:"Faltou"
};
// Atendimento ainda em aberto: pode ser recebido, remarcado, cancelado ou marcado como falta.
const OPEN_STATUSES=["scheduled","confirmed","waiting","in_service"];

let currentRole=null;
let accountRole=null;
let personalRights=null;
const c7Sections={clientes:"clients.read",agenda:"appointments.view",caixa:"cash.view",financeiro:"finance.view",acertos:"finance.view",produtos:"products.view",servicos:"services.manage",equipe:"team.view",permissoes:"team.manage","historico-produtos":"products.manage",relatorios:"reports.view",operacoes:"operations.view",promocoes:"promotions.manage",automacoes:"automations.manage",configuracoes:"settings.manage",desempenho:"barber.portal","meus-clientes":"barber.portal","meus-consumos":"barber.portal","minhas-comissoes":"barber.portal"};
const c7DefaultPermissions={
 barber:new Set(["appointments.view","appointments.edit","appointments.cancel","operations.view","barber.portal"]),
 reception:new Set(["clients.create","clients.read","clients.edit","clients.delete","clients.history","appointments.view","appointments.create","appointments.edit","appointments.cancel","cash.view","finance.view","products.view","products.manage","stock.manage","team.view","reports.view","services.manage","operations.view","promotions.manage","automations.manage"])
};
function c7Allowed(key){return accountRole==="admin" || (personalRights?Boolean(personalRights[key]):Boolean(c7DefaultPermissions[accountRole]?.has(key)));}
function c7SectionAllowed(section){return section==="clientes"?(c7Allowed("clients.read")||c7Allowed("clients.create")):c7Allowed(c7Sections[section]);}
async function c7AttachVisibleNames(appointments){
 // Sem permissão explícita de leitura, nenhum dado cadastral deve ser retornado.
 if(c7Allowed("clients.read")||!appointments?.length)return appointments;
 return appointments.map(item=>({...item,customer:{full_name:"Cliente",phone:null}}));
}
async function refreshPersonalRights(){if(accountRole==="admin"){personalRights=null;return;}const {data:{session}}=await supabase.auth.getSession();if(!session)return; const {data}=await supabase.from("staff_permissions").select("permissions").eq("email",session.user.email.toLowerCase()).maybeSingle();personalRights=data?.permissions||null;}

let barberPreviewMode=false;
let currentUser=null;
let currentProfessionalId=null;
let professionals=[];
let services=[];
let currentAppointments=[];
let currentBlocks=[];
let currentWorkingHours=[];
let agendaView="timeline";
let timelineClock=null;
let detailAppointmentId=null;
let detailProductsCatalog=[];

function localDateInput(date=new Date()){
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,"0");
  const d=String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

function money(value){
  return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(value||0));
}

// Aceita "30", "45 min", "1h", "1h20", "1h 30min" e "01:20".
function durationToMinutes(value){
  const text=String(value||"").trim().toLowerCase();
  if(/^\d+$/.test(text)) return Number(text)||30;
  const hhmm=text.match(/^(\d{1,2}):(\d{2})/);
  if(hhmm) return Number(hhmm[1])*60+Number(hhmm[2]);
  const h=text.match(/(\d+)\s*h\s*(\d+)?/);
  const m=text.match(/(\d+)\s*min/);
  return (h?Number(h[1])*60+Number(h[2]||0):m?Number(m[1]):0) || 30;
}

function formatTime(value){
  return new Date(value).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
}

function formatDateLabel(value){
  if(!value) return "—";
  const [y,m,d]=value.split("-").map(Number);
  const text=new Date(y,m-1,d).toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"});
  return text.charAt(0).toUpperCase()+text.slice(1);
}

function minutesFromHHMM(value){
  if(!value) return 0;
  const [h,m]=value.slice(0,5).split(":").map(Number);
  return h*60+m;
}

function hhmmFromMinutes(total){
  const h=Math.floor(total/60);
  const m=total%60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}

function selectedWeekday(){
  if(!agendaDate.value) return 0;
  const [y,m,d]=agendaDate.value.split("-").map(Number);
  return new Date(y,m-1,d).getDay();
}

function showLogin(){loginView.classList.remove("hidden");appView.classList.add("hidden");$("resetPasswordView")?.classList.add("hidden");$("recoveryEmailView")?.classList.add("hidden")}
function showReset(){loginView.classList.add("hidden");appView.classList.add("hidden");$("resetPasswordView")?.classList.remove("hidden")}
function showApp(){loginView.classList.add("hidden");appView.classList.remove("hidden")}

async function loadProfile(userId){
  const {data,error}=await supabase.from("profiles").select("full_name,role,active").eq("user_id",userId).single();
  if(error||!data||!data.active){
    await supabase.auth.signOut();
    showLogin();
    loginMessage.textContent="Usuário sem acesso ativo.";
    return;
  }

  accountRole=data.role;
  currentRole=data.role;
  currentUser=userId;
  await refreshPersonalRights();
  userName.textContent=data.full_name||"Usuário C7";
  userRole.textContent=roleLabels[data.role]||data.role;

  if(data.role==="barber"||data.role==="admin"){
    const {data:professional}=await supabase
      .from("professionals")
      .select("id,full_name,avatar_url,specialty")
      .eq("user_id",userId)
      .eq("active",true)
      .maybeSingle();

    currentProfessionalId=professional?.id||null;
    if(data.role==="admin"&&currentProfessionalId)userRole.textContent="ADMIN / BARBEIRO";

    if(professional?.avatar_url && userAvatar){
      userAvatar.innerHTML=`<img src="${escapeHtml(professional.avatar_url)}" alt="${escapeHtml(professional.full_name||"Barbeiro")}">`;
    }else if(userAvatar){
      userAvatar.textContent=(professional?.full_name||data.full_name||"C7").slice(0,2).toUpperCase();
    }

    if(!currentProfessionalId){
      userRole.textContent="Barbeiro • Acesso não vinculado";
    }
  }

  document.querySelectorAll(".nav-item").forEach(item=>{
    const section=item.dataset.section;
    let hide=false;

    if(data.role==="barber"){
      hide=!["dashboard","agenda","desempenho","operacoes","meus-clientes","meus-consumos","minhas-comissoes"].includes(section);
    }else if(data.role==="reception"){
      hide=section==="configuracoes";
    }

    if(section==="permissoes"||section==="historico-produtos")hide=data.role!=="admin";
    else if(personalRights && c7Sections[section])hide=!c7SectionAllowed(section);
    item.classList.toggle("hidden",hide);
  });

  document.querySelectorAll(".barber-only").forEach(el=>{
    el.classList.toggle("hidden",!(data.role==="barber"||(data.role==="admin"&&currentProfessionalId)));
  });

  const previewBtn=$("arthurPortalModeBtn");
  if(previewBtn){
    previewBtn.classList.toggle("hidden",!(data.role==="admin"&&currentProfessionalId));
    previewBtn.textContent="VISUALIZAR COMO BARBEIRO";
  }
  const canCreateAppointment=c7Allowed("appointments.create")&&c7Allowed("clients.create");
  const canBlockAgenda=["admin","reception","barber"].includes(data.role);
  newAppointmentBtn.classList.toggle("hidden",!canCreateAppointment||!c7Allowed("appointments.create"));
  blockTimeBtn.classList.toggle("hidden",!canBlockAgenda);

  showApp();
  await initAgenda();
}

$("forgotPasswordBtn")?.addEventListener("click",()=>{
  showLogin();
  loginView.classList.add("hidden");
  $("recoveryEmailView").classList.remove("hidden");
  $("recoveryEmailInput").value=$("email").value.trim();
  $("recoveryEmailMessage").textContent="";
});
$("backToLoginBtn")?.addEventListener("click",()=>showLogin());
$("recoveryEmailForm")?.addEventListener("submit",async e=>{
  e.preventDefault();
  const email=$("recoveryEmailInput").value.replace(/[\s\u00a0\u200b-\u200d\ufeff]/g,"").trim().toLowerCase();
  $("recoveryEmailInput").value=email;
  const msg=$("recoveryEmailMessage"),btn=$("sendRecoveryBtn");
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){msg.textContent="Informe um e-mail válido.";return;}
  btn.disabled=true;msg.textContent="Solicitando recuperação...";
  try{
    const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:"https://sistema.c7barbeariatradicional.com.br/?type=recovery"});
    if(error){
      const reason=String(error.message||"");
      msg.textContent=/invalid format|validate email/i.test(reason)?"O servidor recusou o endereço. Confira o e-mail cadastrado.":/rate limit|too many/i.test(reason)?"Muitas tentativas. Aguarde alguns minutos.":"Não foi possível solicitar o link: "+reason;
      console.warn("C7 recovery",error.code,error.status,reason);
    }else msg.textContent="Solicitação aceita! Confira sua caixa de entrada e spam. Use apenas o link mais recente.";
  }catch(err){msg.textContent="Falha na conexão. Tente novamente.";console.error(err);}
  finally{btn.disabled=false;}
});
$("resetPasswordForm")?.addEventListener("submit",async e=>{
  e.preventDefault();
  const password=$("resetNewPassword").value;
  if(password.length<8||password!==$("resetConfirmPassword").value){
    $("resetPasswordMessage").textContent="As senhas devem ser iguais e ter pelo menos 8 caracteres.";return;
  }
  $("resetPasswordMessage").textContent="Atualizando senha...";
  const {error}=await supabase.auth.updateUser({password});
  if(error){$("resetPasswordMessage").textContent="Não foi possível atualizar. Solicite um novo link.";return;}
  await supabase.auth.signOut();
  history.replaceState(null,"",window.location.pathname);
  $("resetPasswordMessage").textContent="Senha atualizada! Entre com sua nova senha.";
  setTimeout(()=>showLogin(),1500);
});
loginForm.addEventListener("submit",async e=>{
  e.preventDefault();
  loginMessage.textContent="Entrando...";
  const email=$("email").value.trim();
  const password=$("password").value;
  const {data,error}=await supabase.auth.signInWithPassword({email,password});
  if(error){loginMessage.textContent="E-mail ou senha inválidos.";return}
  loginMessage.textContent="";
  window.location.reload();
});

logoutBtn.addEventListener("click",async()=>{
  await supabase.auth.signOut();
  showLogin();
});

function setBarberPreview(enabled){
  if(accountRole!=="admin"||!currentProfessionalId)return;
  barberPreviewMode=Boolean(enabled);
  // Mantém autorização administrativa; a alternância controla apenas a experiência.
  currentRole=accountRole;
  userRole.textContent=barberPreviewMode?"BARBEIRO • ARTHUR":"ADMIN / BARBEIRO";
  const sections=["dashboard","agenda","desempenho","operacoes","meus-clientes","meus-consumos","minhas-comissoes"];
  document.querySelectorAll(".nav-item").forEach(item=>{
    const hide=barberPreviewMode&&!sections.includes(item.dataset.section);
    item.classList.toggle("hidden",hide);
  });
  $("arthurPortalModeBtn").textContent=barberPreviewMode?"ABRIR ADMINISTRAÇÃO":"ABRIR PORTAL DO BARBEIRO";
  newAppointmentBtn.classList.toggle("hidden",barberPreviewMode);
  blockTimeBtn.classList.toggle("hidden",false);
  document.querySelectorAll(".barber-only").forEach(el=>el.classList.remove("hidden"));
  if(barberPreviewMode){
    professionalFilter.value=currentProfessionalId;
    professionalFilter.disabled=true;
    blockProfessional.value=currentProfessionalId;
    blockProfessional.disabled=true;
    openSection("desempenho");
  }else{
    professionalFilter.disabled=false;
    professionalFilter.value="";
    blockProfessional.disabled=false;
    openSection("dashboard");
  }
  window.dispatchEvent(new Event("c7-mode-changed"));
  loadAgenda();
}
$("arthurPortalModeBtn")?.addEventListener("click",()=>setBarberPreview(!barberPreviewMode));
function openSection(id){
  if((id==="historico-produtos"||id==="permissoes")&&accountRole!=="admin")return;
  if(accountRole!=="admin" && personalRights && c7Sections[id] && !c7SectionAllowed(id))return;
  document.querySelectorAll(".section").forEach(el=>el.classList.toggle("active",el.id===id));
  document.querySelectorAll(".nav-item").forEach(el=>el.classList.toggle("active",el.dataset.section===id));
  const btn=document.querySelector(`.nav-item[data-section="${id}"]`);
  pageTitle.textContent=btn?btn.textContent:"C7 System";
  if(id==="agenda" && !currentAppointments.length) loadAgenda();
  if(id==="dashboard") updateDashboard();
}

document.querySelectorAll(".nav-item").forEach(btn=>{
  btn.addEventListener("click",()=>openSection(btn.dataset.section));
});

async function initAgenda(){
  agendaDate.value=agendaDate.value||localDateInput();

  const [{data:proData},{data:serviceData}] = await Promise.all([
    supabase.from("professionals").select("id,full_name,specialty,active,avatar_url,user_id").eq("active",true).order("full_name"),
    supabase.from("services").select("id,category,name,duration,price,sort_order").eq("active",true).order("category").order("sort_order")
  ]);

  professionals=proData||[];
  services=serviceData||[];

  const proOptions=professionals.map(p=>`<option value="${p.id}">${escapeHtml(p.full_name)}</option>`).join("");

  professionalFilter.innerHTML='<option value="">Todos os Profissionais</option>'+proOptions;
  appointmentProfessional.innerHTML='<option value="">Selecione</option>'+proOptions;
  blockProfessional.innerHTML='<option value="">Selecione</option>'+proOptions;

  if(currentRole==="barber"&&currentProfessionalId){
    professionalFilter.value=currentProfessionalId;
    professionalFilter.disabled=true;
    blockProfessional.innerHTML=professionals
      .filter(p=>p.id===currentProfessionalId)
      .map(p=>`<option value="${p.id}">${escapeHtml(p.full_name)}</option>`)
      .join("");
    blockProfessional.value=currentProfessionalId;
    blockProfessional.disabled=true;
  }else{
    professionalFilter.disabled=false;
    blockProfessional.disabled=false;
  }

  const serviceGroups=services.reduce((acc,s)=>{
    const category=(s.category||"Outros").trim()||"Outros";
    (acc[category] ||= []).push(s);
    return acc;
  },{});

  // Lista no estilo Booksy: categorias que abrem e fecham, uma linha por serviço; clicar adiciona.
  appointmentServiceList.innerHTML=Object.entries(serviceGroups).map(([category,items],index)=>`
    <details class="service-picker-category"${index===0?" open":""}>
      <summary class="service-picker-category-title">${escapeHtml(category)}<small>${items.length}</small></summary>
      ${items.map(s=>`
        <button type="button" class="service-option" data-service-id="${s.id}" data-search="${escapeHtml(`${s.name} ${category}`.toLowerCase())}">
          <strong>${escapeHtml(s.name)}</strong>
          <small>${formatDuration(durationToMinutes(s.duration))}</small>
          <b>${money(s.price)}</b>
          <i aria-hidden="true">+</i>
        </button>
      `).join("")}
    </details>
  `).join("");

  await loadAgenda();
  startAgendaLiveUpdates();
}

/* Agenda ao vivo: recarrega quando um atendimento muda (tempo real do Supabase) e,
   como garantia, a cada 30s com a agenda aberta. Não recarrega com janela aberta. */
let agendaLiveTimer=null;
let agendaReloadTimer=null;
function scheduleAgendaReload(){
  clearTimeout(agendaReloadTimer);
  agendaReloadTimer=setTimeout(()=>{
    if(document.hidden||!$("agenda")?.classList.contains("active")) return;
    if(document.querySelector(".modal:not(.hidden)")) return;
    loadAgenda();
  },600);
}
function startAgendaLiveUpdates(){
  if(agendaLiveTimer) return;
  supabase.channel("c7-agenda-live")
    .on("postgres_changes",{event:"*",schema:"public",table:"appointments"},scheduleAgendaReload)
    .on("postgres_changes",{event:"*",schema:"public",table:"schedule_blocks"},scheduleAgendaReload)
    .subscribe();
  agendaLiveTimer=setInterval(scheduleAgendaReload,30000);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden) scheduleAgendaReload();});
}

async function loadAgenda(){
  if(!agendaDate.value) return;

  const selected=agendaDate.value;
  const start=new Date(`${selected}T00:00:00`);
  const end=new Date(`${selected}T23:59:59.999`);
  const weekday=selectedWeekday();

  const CLIENT_SELECT=c7Allowed("clients.read")?"customer:customers(id,full_name,phone)":"customer_id";
  let appointmentQuery=supabase
    .from("appointments")
    .select(`id,professional_id,starts_at,ends_at,extra_minutes,status,source,total_amount,notes,${CLIENT_SELECT},professional:professionals(id,full_name),appointment_services(id,service_name,duration_minutes,price)`)
    .gte("starts_at",start.toISOString())
    .lte("starts_at",end.toISOString())
    .order("starts_at",{ascending:true});

  let blockQuery=supabase
    .from("schedule_blocks")
    .select("id,professional_id,starts_at,ends_at,reason,professional:professionals(id,full_name)")
    .lt("starts_at",end.toISOString())
    .gt("ends_at",start.toISOString())
    .order("starts_at",{ascending:true});

  if(professionalFilter.value){
    appointmentQuery=appointmentQuery.eq("professional_id",professionalFilter.value);
    blockQuery=blockQuery.eq("professional_id",professionalFilter.value);
  }

  const [appointmentsResult,blocksResult,hoursResult]=await Promise.all([
    appointmentQuery,
    blockQuery,
    supabase.from("professional_working_hours")
      .select("professional_id,weekday,starts_at,ends_at,active")
      .eq("weekday",weekday)
      .eq("active",true)
  ]);

  agendaDateLabel.textContent=formatDateLabel(selected);

  if(appointmentsResult.error||blocksResult.error||hoursResult.error){
    agendaList.innerHTML='<div class="agenda-empty">Não foi possível carregar a agenda.</div>';
    agendaTimeline.innerHTML='<div class="agenda-empty">Não foi possível carregar a grade.</div>';
    return;
  }

  currentAppointments=await c7AttachVisibleNames(appointmentsResult.data||[]);
  currentBlocks=blocksResult.data||[];
  currentWorkingHours=hoursResult.data||[];
  const {data:unlocks}=await supabase.from("c7_lunch_unlocks").select("professional_id").eq("day",selected);
  const unlocked=new Set((unlocks||[]).map(x=>x.professional_id));
  const activeToday=new Set(currentWorkingHours.map(x=>x.professional_id));
  for(const pro of professionals.filter(x=>activeToday.has(x.id)&&!unlocked.has(x.id))){
    currentBlocks.push({id:"lunch:"+pro.id,professional_id:pro.id,starts_at:new Date(selected+"T12:00:00").toISOString(),ends_at:new Date(selected+"T13:00:00").toISOString(),reason:"Almoço diário",professional:{id:pro.id,full_name:pro.full_name},recurringLunch:true});
  }

  renderAgendaList();
  renderTimeline();
  updateAgendaSummary();
  updateDashboard(currentAppointments,selected);
}

function updateAgendaSummary(){
  const active=currentAppointments.filter(a=>a.status!=="cancelled");
  agendaCount.textContent=active.length;
  agendaTotal.textContent=money(active.reduce((sum,a)=>sum+Number(a.total_amount||0),0));
}

function renderAgendaList(){
  const appointmentRows=currentAppointments.map(a=>{
    const customer=escapeHtml(a.customer?.full_name||"Cliente sem cadastro");
    const phone=escapeHtml(a.customer?.phone||"");
    const professional=escapeHtml(a.professional?.full_name||"Sem profissional");
    const service=escapeHtml((a.appointment_services||[]).map(s=>s.service_name).join(" + ")||"Serviço não informado");
    const canEditStatus=["admin","reception"].includes(currentRole)||
      (currentRole==="barber"&&a.professional_id===currentProfessionalId);
    const disabled=canEditStatus?"":"disabled";

    return {
      start:new Date(a.starts_at),
      html:`
        <article class="appointment-card clickable-appointment" data-status="${a.status}" data-open-appointment="${a.id}" role="button" tabindex="0">
          <div class="appointment-time">
            <strong>${formatTime(a.starts_at)}</strong>
            <small>até ${formatTime(a.ends_at)}</small>
          </div>
          <div class="appointment-info">
            <strong>${customer}</strong>
            <span>${service} • ${professional}${phone?` • ${phone}`:""}</span>
          </div>
          <div class="appointment-meta">
            <span class="source-badge">${escapeHtml(a.source)}</span>
            <strong class="amount-badge">${money(a.total_amount)}</strong>
            <select class="status-select" data-status="${a.status}" data-appointment-status="${a.id}" ${disabled}>
              ${Object.entries(statusLabels).filter(([value])=>!["waiting","in_service"].includes(value)||a.status===value).map(([value,label])=>`<option value="${value}" ${a.status===value?"selected":""}>${label}</option>`).join("")}
            </select>
          </div>
        </article>`
    };
  });

  const blockRows=currentBlocks.map(b=>{
    const canDelete=["admin","reception"].includes(currentRole)||
      (!b.recurringLunch&&currentRole==="barber"&&b.professional_id===currentProfessionalId);
    return {
      start:new Date(b.starts_at),
      html:`
        <article class="block-card">
          <div class="appointment-time">
            <strong>${formatTime(b.starts_at)}</strong>
            <small>até ${formatTime(b.ends_at)}</small>
          </div>
          <div>
            <strong>HORÁRIO BLOQUEADO</strong>
            <span>${escapeHtml(b.professional?.full_name||"Profissional")} • ${escapeHtml(b.reason||"Sem motivo informado")}</span>
          </div>
          ${canDelete?`<button class="block-delete" data-delete-block="${b.id}" type="button">${b.recurringLunch?"LIBERAR DIA":"REMOVER"}</button>`:""}
        </article>`
    };
  });

  const rows=[...appointmentRows,...blockRows].sort((a,b)=>a.start-b.start);

  if(!rows.length){
    agendaList.innerHTML='<div class="agenda-empty">Nenhum agendamento ou bloqueio para este dia.</div>';
  } else {
    agendaList.innerHTML=rows.map(r=>r.html).join("");
  }


  document.querySelectorAll("[data-open-appointment]").forEach(card=>{
    const open=()=>openAppointmentDetail(card.dataset.openAppointment);
    card.addEventListener("click",e=>{
      if(e.target.closest("select,button")) return;
      open();
    });
    card.addEventListener("keydown",e=>{
      if(e.key==="Enter"||e.key===" "){
        e.preventDefault();
        open();
      }
    });
  });

  document.querySelectorAll("[data-appointment-status]").forEach(select=>{
    select.addEventListener("change",async()=>{
      const appointment=currentAppointments.find(a=>String(a.id)===String(select.dataset.appointmentStatus));

      if(select.value==="completed" && appointment?.status!=="completed"){
        select.value=appointment?.status||"in_service";
        if(window.C7Cash?.checkoutAppointment){
          await window.C7Cash.checkoutAppointment(select.dataset.appointmentStatus);
        }else{
          window.C7UX?.notify("Não foi possível abrir o pagamento. Tente novamente.","error");
        }
        return;
      }

      const {error}=await supabase.from("appointments")
        .update({status:select.value,updated_at:new Date().toISOString()})
        .eq("id",select.dataset.appointmentStatus);

      if(error){
        window.C7UX?.notify("Não foi possível alterar o status.","error");
      }
      await loadAgenda();
    });
  });

  document.querySelectorAll("[data-delete-block]").forEach(btn=>{
    btn.addEventListener("click",async()=>{
      const lunch=btn.dataset.deleteBlock.startsWith("lunch:");
      if(!confirm(lunch?"Liberar almoço só nesta data?":"Remover este bloqueio?")) return;
      const {error}=lunch?await supabase.rpc("c7_toggle_lunch",{p_professional_id:btn.dataset.deleteBlock.slice(6),p_day:agendaDate.value,p_unlock:true}):await supabase.from("schedule_blocks").delete().eq("id",btn.dataset.deleteBlock);
      if(error) window.C7UX?.notify("Não foi possível remover o bloqueio.","error");
      await loadAgenda();
    });
  });
}


async function fetchAppointmentDetail(appointmentId){
  const CLIENT_SELECT=c7Allowed("clients.read")?"customer:customers(id,full_name,phone)":"customer_id";
  const [{data:appointment,error},{data:extras},{data:productCatalog}]=await Promise.all([
    supabase.from("appointments")
      .select(`id,customer_id,professional_id,starts_at,ends_at,extra_minutes,status,source,total_amount,notes${c7Allowed("clients.read")?",customer:customers(id,full_name,phone)":""},professional:professionals(id,full_name),appointment_services(id,service_id,service_name,duration_minutes,price,sort_order)`)
      .eq("id",appointmentId)
      .maybeSingle(),
    supabase.from("appointment_products")
      .select("id,appointment_id,product_id,product_name,quantity,unit_price,total_amount,department")
      .eq("appointment_id",appointmentId)
      .order("created_at",{ascending:true}),
    supabase.from("products")
      .select("id,name,price,stock_quantity,department,category,active")
      .eq("active",true)
      .order("department")
      .order("sort_order")
  ]);

  if(error||!appointment) return null;
  detailProductsCatalog=productCatalog||[];
  appointment.appointment_products=extras||[];
  if(!c7Allowed("clients.read")){const [safe]=await c7AttachVisibleNames([appointment]);return safe;}
  return appointment;
}

function canManageDetail(appointment){
  if(!c7Allowed("appointments.edit"))return false;
  return currentRole!=="barber" || appointment.professional_id===currentProfessionalId;
}

function renderAppointmentDetail(appointment){
  const servicesRows=appointment.appointment_services||[];
  const productRows=appointment.appointment_products||[];
  const canManage=canManageDetail(appointment);
  const finished=appointment.status==="completed"||appointment.status==="cancelled";

  const serviceTotal=servicesRows.reduce((sum,item)=>sum+Number(item.price||0),0);
  const productTotal=productRows.reduce((sum,item)=>sum+Number(item.total_amount||0),0);

  $("appointmentDetailTitle").textContent=appointment.customer?.full_name||"Atendimento";
  $("detailCustomer").textContent=[
    appointment.customer?.full_name||"Cliente",
    appointment.customer?.phone||""
  ].filter(Boolean).join(" • ");
  $("detailProfessional").textContent=appointment.professional?.full_name||"—";
  $("detailTime").textContent=`${formatTime(appointment.starts_at)}–${formatTime(appointment.ends_at)}`;
  $("detailStatus").textContent=statusLabels[appointment.status]||appointment.status;
  $("detailStatus").className="c7-status";
  $("detailStatus").dataset.status=appointment.status;
  document.querySelector(".appointment-detail-modal").dataset.status=appointment.status;
  $("detailServiceTotal").textContent=money(serviceTotal);
  $("detailProductTotal").textContent=money(productTotal);
  const extraSelect=$("detailExtraMinutes");
  if(extraSelect){
    extraSelect.value=String(appointment.extra_minutes||0);
    $("detailExtraControl").classList.toggle("hidden",!canManage||["cancelled","no_show"].includes(appointment.status));
    $("detailExtraSave").disabled=!canManage||["cancelled","no_show"].includes(appointment.status);
  }
  $("detailGrandTotal").textContent=money(serviceTotal+productTotal);

  $("detailServicesList").innerHTML=servicesRows.length
    ?servicesRows.map(item=>`
      <div class="detail-item">
        <div><strong>${escapeHtml(item.service_name)}</strong><span>${item.duration_minutes} min</span></div>
        <strong>${money(item.price)}</strong>
        ${canManage&&!finished&&servicesRows.length>1?`<button type="button" class="detail-remove" data-remove-service="${item.id}">×</button>`:""}
      </div>
    `).join("")
    :'<div class="detail-empty">Nenhum serviço.</div>';

  $("detailProductsList").innerHTML=productRows.length
    ?productRows.map(item=>`
      <div class="detail-item">
        <div>
          <strong>${escapeHtml(item.product_name)}</strong>
          <span>${Number(item.quantity)}x • ${item.department==="convenience"?"Consumível":"Produto"}</span>
        </div>
        <strong>${money(item.total_amount)}</strong>
        ${canManage&&!finished?`<button type="button" class="detail-remove" data-remove-product="${item.id}">×</button>`:""}
      </div>
    `).join("")
    :'<div class="detail-empty">Nenhum produto ou consumível adicionado.</div>';

  // O mesmo serviço pode entrar de novo (ex.: pai e filho no mesmo horário).
  $("detailAddService").innerHTML='<option value="">Adicionar serviço...</option>'+
    services
      .map(s=>`<option value="${s.id}">${escapeHtml(s.name)} — ${money(s.price)}</option>`)
      .join("");

  $("detailAddProduct").innerHTML='<option value="">Adicionar produto/consumível...</option>'+
    detailProductsCatalog
      .map(p=>{
        const stock=Number(p.stock_quantity||0);
        return `<option value="${p.id}" ${stock<=0?"disabled":""}>${escapeHtml(p.name)} — ${money(p.price)} • ${stock>0?`estoque ${stock}`:"SEM ESTOQUE"}</option>`;
      })
      .join("");

  $("detailAddService").disabled=!canManage||finished;
  $("detailAddServiceBtn").disabled=!canManage||finished;
  $("detailAddProduct").disabled=!canManage||finished;
  $("detailProductQty").disabled=!canManage||finished;
  $("detailAddProductBtn").disabled=!canManage||finished;

  const open=OPEN_STATUSES.includes(appointment.status);
  $("detailCheckoutBtn").classList.toggle("hidden",!canManage||finished||appointment.status==="no_show");
  $("detailRescheduleBtn").classList.toggle("hidden",!canManage||!(open||appointment.status==="no_show"));
  $("detailNoShowBtn").classList.toggle("hidden",!canManage||!open);
  $("detailCancelBtn").classList.toggle("hidden",!canManage||!open);
  $("detailReopenBtn")?.classList.toggle("hidden",!(appointment.status==="completed"&&currentRole==="admin"));
  $("appointmentDetailMessage").textContent="";

  document.querySelectorAll("[data-remove-service]").forEach(btn=>{
    btn.addEventListener("click",()=>removeDetailService(btn.dataset.removeService));
  });
  document.querySelectorAll("[data-remove-product]").forEach(btn=>{
    btn.addEventListener("click",()=>removeDetailProduct(btn.dataset.removeProduct));
  });
}

async function refreshAppointmentDetail(){
  if(!detailAppointmentId) return;
  const appointment=await fetchAppointmentDetail(detailAppointmentId);
  if(!appointment){
    $("appointmentDetailMessage").textContent="Não foi possível carregar o atendimento.";
    return;
  }
  renderAppointmentDetail(appointment);
}

async function openAppointmentDetail(appointmentId){
  detailAppointmentId=appointmentId;
  $("appointmentDetailMessage").textContent="Carregando atendimento...";
  $("appointmentDetailModal").classList.remove("hidden");
  await refreshAppointmentDetail();
}

function closeAppointmentDetail(){
  $("appointmentDetailModal").classList.add("hidden");
  detailAppointmentId=null;
}

async function removeDetailService(id){
  const {error}=await supabase.rpc("remove_appointment_service",{p_appointment_service_id:id});
  if(error){
    $("appointmentDetailMessage").textContent=String(error.message||"").includes("ao menos um serviço")
      ?"O atendimento precisa manter pelo menos um serviço."
      :"Não foi possível remover o serviço.";
    return;
  }
  await Promise.all([refreshAppointmentDetail(),loadAgenda()]);
}

async function removeDetailProduct(id){
  const {error}=await supabase.rpc("remove_appointment_product",{p_appointment_product_id:id});
  if(error){
    $("appointmentDetailMessage").textContent="Não foi possível remover o item.";
    return;
  }
  await Promise.all([refreshAppointmentDetail(),loadAgenda()]);
}

document.querySelectorAll("[data-close-appointment-detail]").forEach(el=>{
  el.addEventListener("click",closeAppointmentDetail);
});

$("detailAddServiceBtn")?.addEventListener("click",async()=>{
  const serviceId=Number($("detailAddService").value||0);
  if(!detailAppointmentId||!serviceId) return;

  $("appointmentDetailMessage").textContent="Adicionando serviço...";
  const {error}=await supabase.rpc("add_appointment_service",{
    p_appointment_id:detailAppointmentId,
    p_service_id:serviceId
  });

  if(error){
    $("appointmentDetailMessage").textContent=String(error.message||"").includes("já adicionado")
      ?"Esse serviço já está no atendimento."
      :"Não foi possível adicionar o serviço.";
    return;
  }

  await Promise.all([refreshAppointmentDetail(),loadAgenda()]);
});

$("detailAddProductBtn")?.addEventListener("click",async()=>{
  const productId=Number($("detailAddProduct").value||0);
  const qty=Math.max(1,Number($("detailProductQty").value||1));
  if(!detailAppointmentId||!productId) return;

  $("appointmentDetailMessage").textContent="Adicionando item...";
  const {error}=await supabase.rpc("add_appointment_product",{
    p_appointment_id:detailAppointmentId,
    p_product_id:productId,
    p_quantity:qty
  });

  if(error){
    $("appointmentDetailMessage").textContent=String(error.message||"").includes("Estoque insuficiente")
      ?"Estoque insuficiente para adicionar esse item."
      :"Não foi possível adicionar o item.";
    return;
  }

  $("detailProductQty").value="1";
  await refreshAppointmentDetail();
});

// Corrigir atendimento já recebido: desfaz o recebimento (só admin, com o caixa do dia aberto).
$("detailReopenBtn")?.addEventListener("click",async()=>{
  if(!detailAppointmentId) return;
  if(!confirm("Reabrir este atendimento para corrigir?\n\nO recebimento, a comissão, a taxa da maquininha e o cupom/benefício usados serão desfeitos. Depois é só ajustar e receber de novo.")) return;
  const {error}=await supabase.rpc("c7_reopen_appointment",{p_appointment_id:detailAppointmentId});
  if(error){
    $("appointmentDetailMessage").textContent=/function/i.test(String(error.message||""))
      ?"Essa opção ainda não foi ativada no banco de dados."
      :error.message||"Não foi possível reabrir o atendimento.";
    return;
  }
  window.C7UX?.notify("Atendimento reaberto. Ajuste e receba novamente.");
  await Promise.all([refreshAppointmentDetail(),loadAgenda(),window.C7Cash?.refresh?.()]);
});

$("detailNoShowBtn")?.addEventListener("click",async()=>{
  if(!detailAppointmentId) return;
  const {error}=await supabase.from("appointments")
    .update({status:"no_show",updated_at:new Date().toISOString()})
    .eq("id",detailAppointmentId);

  if(error){
    $("appointmentDetailMessage").textContent="Não foi possível marcar a falta.";
    return;
  }

  window.C7UX?.notify("Falta registrada. Se o cliente remarcar, use REMARCAR.");
  await Promise.all([refreshAppointmentDetail(),loadAgenda()]);
});

/* Mover, remarcar ou dar tempo extra por cima de outro atendimento: admin e recepção
   podem confirmar um ENCAIXE (cliente atrasado); o banco só libera para esses perfis. */
async function rpcWithEncaixe(name,args){
  const result=await supabase.rpc(name,args);
  const overlap=/Já existe atendimento|sobrepõe a outro atendimento/.test(String(result.error?.message||""));
  if(!overlap||!["admin","reception"].includes(currentRole)) return result;
  if(!confirm("Já existe atendimento nesse horário para este profissional.\n\nFazer um ENCAIXE mesmo assim?")) return {error:{message:"Encaixe cancelado."}};
  return supabase.rpc(name,{...args,p_allow_overlap:true});
}

let staffRescheduleAppointment=null;
async function openStaffReschedule(appointmentId){
  const appointment=await fetchAppointmentDetail(appointmentId);
  if(!appointment||!(OPEN_STATUSES.includes(appointment.status)||appointment.status==="no_show")){
    window.C7UX?.notify("Este atendimento não pode ser remarcado.","error");return;
  }
  staffRescheduleAppointment=appointment;
  const local=new Date(appointment.starts_at);
  $("staffRescheduleDate").value=localDateInput(local);
  $("staffRescheduleDate").min=localDateInput();
  $("staffRescheduleTime").value=local.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",hour12:false});
  $("staffRescheduleExtra").value=String(appointment.extra_minutes||0);
  $("staffRescheduleInfo").textContent=(appointment.customer?.full_name||"Cliente")+" • "+(appointment.professional?.full_name||"Barbeiro");
  $("staffRescheduleMessage").textContent="";
  $("staffRescheduleModal").classList.remove("hidden");
}
$("detailExtraSave")?.addEventListener("click",async()=>{
  if(!detailAppointmentId||!c7Allowed("appointments.edit"))return;
  const btn=$("detailExtraSave");
  btn.disabled=true;
  $("appointmentDetailMessage").textContent="Atualizando tempo adicional...";
  try{
    const extra=Number($("detailExtraMinutes").value||0);
    const {error}=await rpcWithEncaixe("c7_staff_set_extra_minutes",{
      p_appointment_id:detailAppointmentId,p_extra_minutes:extra
    });
    if(error)throw error;
    await Promise.all([refreshAppointmentDetail(),loadAgenda()]);
    $("appointmentDetailMessage").textContent="Tempo extra atualizado com sucesso.";
  }catch(error){
    $("appointmentDetailMessage").textContent=error.message||"Não foi possível ajustar a duração.";
  }finally{btn.disabled=false;}
});
$("detailRescheduleBtn")?.addEventListener("click",()=>{if(detailAppointmentId)openStaffReschedule(detailAppointmentId);});
document.querySelectorAll("[data-close-staff-reschedule]").forEach(el=>el.addEventListener("click",()=>{$("staffRescheduleModal").classList.add("hidden");}));
$("staffRescheduleForm")?.addEventListener("submit",async e=>{
  e.preventDefault();
  if(!staffRescheduleAppointment)return;
  const date=$("staffRescheduleDate").value,time=$("staffRescheduleTime").value;
  if(!date||!time)return;
  const startsAt=new Date(date+"T"+time+":00");
  if(Number.isNaN(startsAt.getTime()))return;
  $("staffRescheduleMessage").textContent="Verificando disponibilidade...";
  // Quem faltou volta para "Agendado" antes de mudar de horário.
  const wasNoShow=staffRescheduleAppointment.status==="no_show";
  const setStatus=status=>supabase.from("appointments").update({status,updated_at:new Date().toISOString()}).eq("id",staffRescheduleAppointment.id);
  if(wasNoShow)await setStatus("scheduled");
  const {error}=await rpcWithEncaixe("c7_staff_move_appointment",{p_appointment_id:staffRescheduleAppointment.id,p_starts_at:startsAt.toISOString(),p_extra_minutes:Number($("staffRescheduleExtra").value||0)});
  if(error){
    if(wasNoShow)await setStatus("no_show");
    $("staffRescheduleMessage").textContent=error.message||"Não foi possível remarcar.";return;
  }
  $("staffRescheduleModal").classList.add("hidden");
  if(detailAppointmentId===staffRescheduleAppointment.id)closeAppointmentDetail();
  await loadAgenda();
  window.dispatchEvent(new CustomEvent("c7-appointment-rescheduled",{detail:{appointmentId:staffRescheduleAppointment.id}}));
});
window.addEventListener("c7-request-reschedule",e=>{if(e.detail?.appointmentId)openStaffReschedule(e.detail.appointmentId);});
$("detailCancelBtn")?.addEventListener("click",async()=>{
  if(!detailAppointmentId||!confirm("Cancelar este agendamento?"))return;
  const {error}=await supabase.rpc("c7_cancel_appointment",{p_appointment_id:detailAppointmentId});
  if(error){$("appointmentDetailMessage").textContent=error.message||"Falha ao cancelar.";return;}
  closeAppointmentDetail();await loadAgenda();window.dispatchEvent(new Event("c7-appointment-cancelled"));
});
$("detailCheckoutBtn")?.addEventListener("click",async()=>{
  if(!detailAppointmentId) return;
  if(window.C7Cash?.checkoutAppointment){
    const ok=await window.C7Cash.checkoutAppointment(detailAppointmentId);
    if(ok) closeAppointmentDetail();
  }else{
    $("appointmentDetailMessage").textContent="O Caixa ainda está carregando. Tente novamente.";
  }
});

window.addEventListener("c7-checkout-complete",async e=>{
  if(detailAppointmentId&&String(e.detail?.appointmentId)===String(detailAppointmentId)){
    closeAppointmentDetail();
  }
  await loadAgenda();
});

function professionalsForView(){
  if(professionalFilter.value){
    return professionals.filter(p=>p.id===professionalFilter.value);
  }
  return professionals;
}

function renderTimeline(){
  const pros=professionalsForView();
  // Atualização da mesma data mantém a rolagem; troca de data reposiciona no expediente.
  const previousScroll=agendaTimeline.querySelector(".live-timeline-scroll")?.scrollTop;
  const sameDate=agendaTimeline.dataset.renderedDate===agendaDate.value;

  if(!pros.length){
    agendaTimeline.innerHTML='<div class="agenda-empty">Nenhum profissional cadastrado.</div>';
    return;
  }

  const dayHours=currentWorkingHours.filter(h=>pros.some(p=>p.id===h.professional_id));
  const starts=dayHours.map(h=>minutesFromHHMM(h.starts_at));
  const ends=dayHours.map(h=>minutesFromHHMM(h.ends_at));

  const appointmentStarts=currentAppointments
    .filter(a=>a.status!=="cancelled")
    .map(a=>{const d=new Date(a.starts_at);return d.getHours()*60+d.getMinutes();});
  const appointmentEnds=currentAppointments
    .filter(a=>a.status!=="cancelled")
    .map(a=>{const d=new Date(a.ends_at);return d.getHours()*60+d.getMinutes();});
  const blockStarts=currentBlocks.map(b=>{const d=new Date(b.starts_at);return d.getHours()*60+d.getMinutes();});
  const blockEnds=currentBlocks.map(b=>{const d=new Date(b.ends_at);return d.getHours()*60+d.getMinutes();});

  const now=new Date();
  const isToday=agendaDate.value===localDateInput(now);
  const nowMinute=now.getHours()*60+now.getMinutes();

  const startCandidates=[
    ...(starts.length?starts:[8*60]),
    ...appointmentStarts,
    ...blockStarts,
    ...(isToday?[nowMinute-90]:[])
  ];
  const endCandidates=[
    ...(ends.length?ends:[20*60]),
    ...appointmentEnds,
    ...blockEnds,
    ...(isToday?[nowMinute+180]:[])
  ];

  let minMinute=Math.min(...startCandidates);
  let maxMinute=Math.max(...endCandidates);

  if(c7Allowed("appointments.edit")){
    minMinute=Math.min(minMinute,6*60);
    maxMinute=Math.max(maxMinute,23*60);
  }
  minMinute=Math.max(0,Math.floor(minMinute/30)*30);
  maxMinute=Math.min(24*60,Math.ceil(maxMinute/30)*30);

  if(maxMinute-minMinute<8*60){
    maxMinute=Math.min(24*60,minMinute+8*60);
  }

  const pxPerMinute=1.6;
  const timelineTopPadding=22;
  const timelineBottomPadding=22;
  const totalMinutes=maxMinute-minMinute;
  const timelineHeight=totalMinutes*pxPerMinute+timelineTopPadding+timelineBottomPadding;
  const selected=agendaDate.value;

  const timeLabels=[];
  for(let min=minMinute;min<=maxMinute;min+=30){
    timeLabels.push(`
      <div class="live-time-label${min%60?" is-half":""}" style="top:${timelineTopPadding+(min-minMinute)*pxPerMinute}px">
        <span>${min%60?"":hhmmFromMinutes(min)}</span>
      </div>
    `);
  }

  const columns=pros.map(p=>{
    const working=currentWorkingHours.find(h=>h.professional_id===p.id);
    const workStart=working?minutesFromHHMM(working.starts_at):null;
    const workEnd=working?minutesFromHHMM(working.ends_at):null;

    const proAppointments=currentAppointments.filter(a=>
      a.professional_id===p.id && a.status!=="cancelled"
    );

    const proBlocks=currentBlocks.filter(b=>b.professional_id===p.id);

    // Encaixes: atendimentos que se sobrepõem ficam lado a lado, como no Booksy.
    const lanes=new Map();
    {
      const sorted=[...proAppointments].sort((x,y)=>new Date(x.starts_at)-new Date(y.starts_at));
      let cluster=[],clusterEnd=0,laneEnds=[];
      const close=()=>{cluster.forEach(a=>lanes.get(a.id).count=laneEnds.length);cluster=[];laneEnds=[];};
      sorted.forEach(a=>{
        const start=new Date(a.starts_at).getTime(),end=new Date(a.ends_at).getTime();
        if(cluster.length&&start>=clusterEnd) close();
        let lane=laneEnds.findIndex(e=>e<=start);
        if(lane<0){lane=laneEnds.length;laneEnds.push(end);}else laneEnds[lane]=end;
        lanes.set(a.id,{lane,count:1});
        cluster.push(a);
        clusterEnd=Math.max(clusterEnd,end);
      });
      close();
    }

    const appointmentHtml=proAppointments.map(a=>{
      const {lane,count}=lanes.get(a.id)||{lane:0,count:1};
      const laneStyle=count>1?`--lane-left:calc(4px + (100% - 8px) * ${lane} / ${count});--lane-width:calc((100% - 8px) / ${count} - 3px);`:"";
      const startDate=new Date(a.starts_at);
      const endDate=new Date(a.ends_at);
      const startMin=startDate.getHours()*60+startDate.getMinutes();
      const endMin=endDate.getHours()*60+endDate.getMinutes();
      const top=timelineTopPadding+Math.max(0,(startMin-minMinute)*pxPerMinute);
      const height=Math.max(22,(endMin-startMin)*pxPerMinute-3);
      const customer=escapeHtml(a.customer?.full_name||"Cliente");
      const service=escapeHtml((a.appointment_services||[]).map(s=>s.service_name).join(" + ")||"Serviço");

      return `
        <article class="live-booking status-${a.status} clickable-appointment" data-open-appointment="${a.id}" role="button" tabindex="0" style="top:${top}px;height:${height}px;${laneStyle}">
          <div class="live-booking-time">${formatTime(a.starts_at)} - ${formatTime(a.ends_at)}</div>
          <div class="live-booking-line"><strong>${customer}</strong><span> • ${service}</span></div>
        </article>
      `;
    }).join("");

    const blockHtml=proBlocks.map(b=>{
      const startDate=new Date(b.starts_at);
      const endDate=new Date(b.ends_at);
      const startMin=startDate.getHours()*60+startDate.getMinutes();
      const endMin=endDate.getHours()*60+endDate.getMinutes();
      const top=timelineTopPadding+Math.max(0,(startMin-minMinute)*pxPerMinute);
      const height=Math.max(32,(endMin-startMin)*pxPerMinute-4);

      return `
        <article class="live-block" style="top:${top}px;height:${height}px">
          <strong>${b.recurringLunch?"ALMOÇO":"BLOQUEADO"}</strong>
          <span>${formatTime(b.starts_at)}–${formatTime(b.ends_at)}</span>
          <small>${escapeHtml(b.reason||"Indisponível")}</small>
          ${b.recurringLunch&&["admin","reception"].includes(currentRole)?`<button type="button" class="lunch-unlock" data-unlock-lunch="${b.professional_id}">LIBERAR DIA</button>`:""}
        </article>
      `;
    }).join("");

    const outsideBefore=workStart!==null && workStart>minMinute
      ? `<div class="live-outside-hours" style="top:${timelineTopPadding}px;height:${(workStart-minMinute)*pxPerMinute}px"></div>`
      : "";
    const outsideAfter=workEnd!==null && workEnd<maxMinute
      ? `<div class="live-outside-hours" style="top:${timelineTopPadding+(workEnd-minMinute)*pxPerMinute}px;height:${(maxMinute-workEnd)*pxPerMinute}px"></div>`
      : "";

    return `
      <div class="live-pro-column" data-live-professional="${p.id}" style="height:${timelineHeight}px">
        ${outsideBefore}
        ${outsideAfter}
        ${blockHtml}
        ${appointmentHtml}
      </div>
    `;
  }).join("");

  const head=`
    <div class="live-timeline-head" style="--pro-count:${pros.length}">
      <div class="live-time-corner">
        <span>HOJE</span>
        <strong id="liveClockText">—</strong>
      </div>
      ${pros.map(p=>{
        // Expediente do dia, como no Booksy: "9:00-12:00, 13:00-20:00".
        const hours=currentWorkingHours.find(h=>h.professional_id===p.id);
        const lunch=currentBlocks.some(b=>b.recurringLunch&&b.professional_id===p.id);
        const fmt=t=>String(t||"").slice(0,5).replace(/^0/,"");
        const shift=!hours?"Sem expediente hoje":lunch?`${fmt(hours.starts_at)}-12:00, 13:00-${fmt(hours.ends_at)}`:`${fmt(hours.starts_at)}-${fmt(hours.ends_at)}`;
        return `
        <div class="live-pro-head">
          <div class="live-pro-avatar">
            ${p.avatar_url
              ? `<img src="${escapeHtml(p.avatar_url)}" alt="${escapeHtml(p.full_name)}">`
              : escapeHtml((p.full_name||"?").slice(0,1).toUpperCase())}
          </div>
          <div>
            <strong>${escapeHtml(p.full_name)}</strong>
            <small>${escapeHtml(shift)}</small>
          </div>
          ${(["admin","reception"].includes(currentRole)||(currentRole==="barber"&&p.id===currentProfessionalId))
  ? `<button type="button" class="quick-block-btn" data-quick-block="${p.id}" title="Bloquear horário">Bloquear</button>`
  : ""}
        </div>
      `;}).join("")}
    </div>
  `;

  agendaTimeline.innerHTML=`
    <div class="live-timeline-shell">
      <div class="live-timeline-scroll">
        ${head}
        <div class="live-timeline-body" style="--pro-count:${pros.length};--timeline-height:${timelineHeight}px">
          <div class="live-time-rail" style="height:${timelineHeight}px">
            ${timeLabels.join("")}
            <div id="liveNowRail" class="live-now-rail hidden">
              <span id="liveNowLabel">AGORA</span>
            </div>
          </div>
          <div class="live-columns" style="--pro-count:${pros.length};height:${timelineHeight}px;--slot:${30*pxPerMinute}px;--hour:${60*pxPerMinute}px;--grid-top:${timelineTopPadding}px;--hour-top:${timelineTopPadding+(minMinute%60?30*pxPerMinute:0)}px">
            ${columns}
            <div id="liveNowLine" class="live-now-line hidden"></div>
          </div>
        </div>
      </div>
    </div>
  `;


  agendaTimeline.querySelectorAll("[data-open-appointment]").forEach(card=>{
    const open=()=>openAppointmentDetail(card.dataset.openAppointment);
    card.addEventListener("click",e=>{
      if(card.dataset.c7Dragged==="true"){card.dataset.c7Dragged="";e.preventDefault();return;}
      if(e.target.closest("button")) return;
      open();
    });
    card.addEventListener("keydown",e=>{
      if(e.key==="Enter"||e.key===" "){
        e.preventDefault();
        open();
      }
    });
  });

  agendaTimeline.querySelectorAll("[data-unlock-lunch]").forEach(btn=>{
    btn.addEventListener("click",async e=>{
      e.stopPropagation();
      if(!confirm("Liberar almoço somente nesta data?"))return;
      const {error}=await supabase.rpc("c7_toggle_lunch",{p_professional_id:btn.dataset.unlockLunch,p_day:agendaDate.value,p_unlock:true});
      if(error)window.C7UX?.notify("Não foi possível liberar o horário.","error"); await loadAgenda();
    });
  });
  agendaTimeline.querySelectorAll("[data-quick-block]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      openBlockModal({
        professionalId:btn.dataset.quickBlock,
        date:selected
      });
    });
  });

  agendaTimeline.querySelectorAll("[data-live-professional]").forEach(column=>{
    column.addEventListener("dblclick",e=>{
      if(!["admin","reception"].includes(currentRole)&&currentRole!=="barber") return;
      if(currentRole==="barber"&&column.dataset.liveProfessional!==currentProfessionalId) return;
      if(e.target.closest(".live-booking,.live-block")) return;

      const rect=column.getBoundingClientRect();
      const y=e.clientY-rect.top;
      const rawMinute=minMinute+((y-timelineTopPadding)/pxPerMinute);
      const snapped=Math.round(rawMinute/15)*15;
      const start=Math.max(minMinute,Math.min(snapped,maxMinute-15));
      const end=Math.min(start+60,maxMinute);

      openBlockModal({
        professionalId:column.dataset.liveProfessional,
        date:selected,
        start:hhmmFromMinutes(start),
        end:hhmmFromMinutes(end)
      });
    });
  });


  // Feedback discreto no lugar de caixas de diálogo que interrompem a agenda.
  function c7AgendaToast(message,isError=false){
    let el=document.getElementById("c7AgendaToast");
    if(!el){
      el=document.createElement("div");
      el.id="c7AgendaToast";el.setAttribute("role","status");
      document.body.appendChild(el);
    }
    el.textContent=message;
    el.className="c7-agenda-toast"+(isError?" c7-agenda-toast-error":"");
    el.classList.add("visible");
    clearTimeout(window.c7ToastTimer);
    window.c7ToastTimer=setTimeout(()=>el.classList.remove("visible"),isError?4500:2200);
  }
  // Arraste via eventos na janela: o movimento continua mesmo fora do cartão.
  // Isso evita que o navegador solte o item antes de confirmar o reagendamento.
  agendaTimeline.querySelectorAll(".live-booking[data-open-appointment]").forEach(card=>{
    const record=currentAppointments.find(a=>a.id===card.dataset.openAppointment);
    if(!record||!c7Allowed("appointments.edit")||
       (currentRole==="barber"&&record.professional_id!==currentProfessionalId)||
       !["scheduled","confirmed","waiting"].includes(record.status))return;
    card.classList.add("c7-drag-ready");
    card.draggable=false;
    card.addEventListener("dragstart",e=>e.preventDefault());
    let origin=null,active=false,timer=null;
    function cleanup(){
      clearTimeout(timer);
      window.removeEventListener("pointermove",move,true);
      window.removeEventListener("pointerup",release,true);
      window.removeEventListener("pointercancel",abort,true);
      window.removeEventListener("blur",abort,true);
      card.classList.remove("c7-dragging");
      card.style.transform="";
      card.style.zIndex="";
      origin=null;active=false;
    }
    function abort(){cleanup();}
    function move(e){
      if(!origin||e.pointerId!==origin.id)return;
      if(!active){
        if(Math.hypot(e.clientX-origin.x,e.clientY-origin.y)>12)cleanup();
        return;
      }
      e.preventDefault();
      card.style.transform="translateY("+(e.clientY-origin.y)+"px)";
    }
    async function release(e){
      if(!origin||e.pointerId!==origin.id)return;
      const engaged=active;
      const delta=e.clientY-origin.y;
      cleanup();
      if(!engaged)return;
      card.dataset.c7Dragged="true";
      e.preventDefault();
      e.stopPropagation();
      const date=new Date(record.starts_at);
      const currentMin=date.getHours()*60+date.getMinutes();
      const minute=Math.round((currentMin+delta/pxPerMinute)/5)*5;
      if(minute<0||minute>=1440||minute===currentMin)return;
      date.setHours(Math.floor(minute/60),minute%60,0,0);
      if(date<=new Date()){window.C7UX?.notify("Escolha um horário futuro.","error");return;}
      c7AgendaToast("Atualizando horário...");
      const {error}=await rpcWithEncaixe("c7_staff_move_appointment",{
        p_appointment_id:record.id,p_starts_at:date.toISOString(),
        p_extra_minutes:record.extra_minutes||0
      });
      if(error){c7AgendaToast(error.message||"Não foi possível alterar o horário.",true);return;}
      await loadAgenda();
      c7AgendaToast("Horário atualizado.");
      window.dispatchEvent(new CustomEvent("c7-appointment-rescheduled",{detail:{appointmentId:record.id}}));
    }
    card.addEventListener("pointerdown",e=>{
      if(e.button!==0||e.target.closest("button")||origin)return;
      origin={id:e.pointerId,x:e.clientX,y:e.clientY};
      window.addEventListener("pointermove",move,{capture:true,passive:false});
      window.addEventListener("pointerup",release,true);
      window.addEventListener("pointercancel",abort,true);
      window.addEventListener("blur",abort,true);
      timer=setTimeout(()=>{
        if(!origin)return;
        active=true;
        card.classList.add("c7-dragging");
        card.style.zIndex="25";
      },250);
    });
  });
  function updateLiveLine(){
    const now=new Date();
    const today=localDateInput(now);
    const line=$("liveNowLine");
    const label=$("liveNowLabel");
    const rail=$("liveNowRail");
    const clock=$("liveClockText");

    if(clock){
      clock.textContent=now.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
    }

    if(!line||selected!==today){
      line?.classList.add("hidden");
      rail?.classList.add("hidden");
      return;
    }

    const nowMinutes=now.getHours()*60+now.getMinutes()+now.getSeconds()/60;
    if(nowMinutes<minMinute||nowMinutes>maxMinute){
      line.classList.add("hidden");
      rail?.classList.add("hidden");
      return;
    }

    const top=timelineTopPadding+(nowMinutes-minMinute)*pxPerMinute;
    line.classList.remove("hidden");
    rail?.classList.remove("hidden");
    line.style.top=`${top}px`;
    if(rail) rail.style.top=`${top}px`;
    if(label) label.textContent=now.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
  }

  if(timelineClock) clearInterval(timelineClock);
  updateLiveLine();
  timelineClock=setInterval(updateLiveLine,1000);

  // Abre a grade no horário que importa: agora (se dentro do expediente) ou o início do dia de trabalho.
  {
    const firstWork=Math.min(...(starts.length?starts:[9*60]),...(appointmentStarts.length?appointmentStarts:[24*60]));
    const lastWork=Math.max(...(ends.length?ends:[20*60]),...appointmentEnds);
    let focus=firstWork;
    if(isToday&&nowMinute>firstWork&&nowMinute<lastWork) focus=nowMinute-60;
    agendaTimeline.dataset.focusTop=String(Math.max(0,timelineTopPadding+(focus-minMinute)*pxPerMinute-12));
  }
  agendaTimeline.dataset.renderedDate=selected;
  if(sameDate&&previousScroll!=null){
    const scroller=agendaTimeline.querySelector(".live-timeline-scroll");
    if(scroller) scroller.scrollTop=previousScroll;
  }else requestAnimationFrame(focusTimeline);
}

function focusTimeline(){
  const scroller=agendaTimeline.querySelector(".live-timeline-scroll");
  if(scroller&&!agendaTimeline.classList.contains("hidden")) scroller.scrollTop=Number(agendaTimeline.dataset.focusTop||0);
}
async function updateDashboard(){
  const today=localDateInput();
  const start=new Date(`${today}T00:00:00`);
  const end=new Date(`${today}T23:59:59.999`);
  const now=new Date();

  const CLIENT_SELECT_DASH=c7Allowed("clients.read")?"customer:customers(full_name)":"customer_id";
  const [
    appointmentsResult,
    transactionsResult,
    productsResult,
    cashResult,
    professionalsResult
  ]=await Promise.all([
    supabase.from("appointments")
      .select(`id,starts_at,status,${CLIENT_SELECT_DASH},professional:professionals(full_name)`)
      .gte("starts_at",start.toISOString())
      .lte("starts_at",end.toISOString())
      .neq("status","cancelled")
      .order("starts_at",{ascending:true}),
    supabase.from("cash_transactions")
      .select("direction,net_amount,status,created_at")
      .gte("created_at",start.toISOString())
      .lte("created_at",end.toISOString())
      .eq("status","posted"),
    supabase.from("products")
      .select("id,name,stock_quantity,min_stock,active")
      .eq("active",true),
    supabase.from("open_cash_summary").select("*").limit(1).maybeSingle(),
    supabase.from("professionals").select("id,full_name,active").eq("active",true)
  ]);

  let appointments=await c7AttachVisibleNames(appointmentsResult.data||[]);
  const transactions=transactionsResult.data||[];
  const products=productsResult.data||[];
  const openCash=cashResult.data||null;
  const activePros=professionalsResult.data||[];

  if((currentRole==="barber"||barberPreviewMode)&&currentProfessionalId){
    appointments=appointments.filter(a=>a.professional?.full_name && professionals.find(p=>p.id===currentProfessionalId)?.full_name===a.professional.full_name);
  }

  const relevantAppointments=appointments.filter(a=>a.status==="completed");
  const waiting=appointments.filter(a=>OPEN_STATUSES.includes(a.status));
  const revenue=transactions.filter(t=>t.direction==="in")
    .reduce((sum,t)=>sum+Number(t.net_amount||0),0);
  const lowStock=products.filter(p=>Number(p.stock_quantity||0)<=Number(p.min_stock||0));

  if(currentRole==="barber"||barberPreviewMode){
    $("statAppointmentsLabel").textContent="Finalizados";
    $("statAppointmentsHint").textContent="Seus atendimentos de hoje";
    $("statRevenueLabel").textContent="Faltaram";
    $("statRevenueHint").textContent="Clientes que não vieram hoje";
    $("statWaitingLabel").textContent="A atender";
    $("statWaitingHint").textContent="Ainda hoje na sua agenda";
    $("statLowStockLabel").textContent="Próximo Horário";
    $("statLowStockHint").textContent="Seu próximo atendimento";

    const inService=appointments.filter(a=>a.status==="no_show").length;
    const nextMine=appointments.find(a=>new Date(a.starts_at)>=now&&["scheduled","confirmed"].includes(a.status));

    $("statAppointments").textContent=relevantAppointments.length;
    $("statRevenue").textContent=inService;
    $("statWaiting").textContent=waiting.length;
    $("statLowStock").textContent=nextMine?formatTime(nextMine.starts_at):"—";
  }else{
    $("statAppointments").textContent=relevantAppointments.length;
    $("statRevenue").textContent=money(revenue);
    $("statWaiting").textContent=waiting.length;
    $("statLowStock").textContent=lowStock.length;
    $("statLowStock").closest("article").classList.toggle("is-alert",lowStock.length>0);
  }

  if(currentRole==="barber"||barberPreviewMode){
    $("dashboardCashStatus").textContent="Minha Agenda";
    $("dashboardCashText").textContent="Acompanhe seus atendimentos, bloqueios e checkouts do dia.";
  }else if(openCash){
    $("dashboardCashStatus").textContent="Aberto";
    $("dashboardCashText").textContent=`Saldo esperado: ${money(openCash.expected_balance)} • Entradas: ${money(openCash.total_in)} • Saídas: ${money(openCash.total_out)}`;
  }else{
    $("dashboardCashStatus").textContent="Fechado";
    $("dashboardCashText").textContent="Nenhum Caixa aberto no momento.";
  }

  const next=appointments.find(a=>new Date(a.starts_at)>=now && ["scheduled","confirmed"].includes(a.status));
  if(next){
    $("dashboardNextClient").textContent=next.customer?.full_name||"Cliente";
    $("dashboardNextText").textContent=`${formatTime(next.starts_at)} • ${next.professional?.full_name||"Sem profissional"}`;
  }else{
    $("dashboardNextClient").textContent="—";
    $("dashboardNextText").textContent="Nenhum horário próximo.";
  }

  $("dashboardActivePros").textContent=`${activePros.length} ${activePros.length===1?"barbeiro ativo":"barbeiros ativos"}`;
  $("dashboardTeamText").textContent=waiting.length
    ? `${waiting.length} atendimento${waiting.length===1?"":"s"} ainda hoje.`
    : "Agenda de hoje concluída.";

  const alerts=[];
  if(lowStock.length){
    alerts.push({title:"Estoque baixo",text:lowStock.slice(0,4).map(p=>p.name).join(", ")+(lowStock.length>4?"...":"")});
  }
  if(!openCash && ["admin","reception"].includes(currentRole)){
    alerts.push({title:"Caixa fechado",text:"Abra o caixa antes de registrar recebimentos."});
  }
  const overdue=waiting.filter(a=>new Date(a.starts_at)<new Date(now.getTime()-30*60000));
  if(overdue.length){
    alerts.push({title:"Sem recebimento",text:`${overdue.length} atendimento${overdue.length===1?"":"s"} já passou do horário e não foi recebido nem marcado como falta.`});
  }

  $("dashboardAlertCount").textContent=`${alerts.length} ${alerts.length===1?"pendência":"pendências"}`;
  $("dashboardAlerts").innerHTML=alerts.length
    ? alerts.map(a=>`<div class="dashboard-alert"><strong>${escapeHtml(a.title)}</strong>${escapeHtml(a.text)}</div>`).join("")
    : '<div class="dashboard-alert">Nenhuma pendência importante agora.</div>';
}

function setAgendaView(view){
  agendaView=view;
  const list=view==="list";
  agendaList.classList.toggle("hidden",!list);
  agendaTimeline.classList.toggle("hidden",list);
  listViewBtn.classList.toggle("active-view",list);
  timelineViewBtn.classList.toggle("active-view",!list);
  if(!list) requestAnimationFrame(focusTimeline);
}

listViewBtn.addEventListener("click",()=>setAgendaView("list"));
timelineViewBtn.addEventListener("click",()=>setAgendaView("timeline"));

$("prevDay").addEventListener("click",()=>{
  const [y,m,d]=agendaDate.value.split("-").map(Number);
  agendaDate.value=localDateInput(new Date(y,m-1,d-1));
  loadAgenda();
});

$("nextDay").addEventListener("click",()=>{
  const [y,m,d]=agendaDate.value.split("-").map(Number);
  agendaDate.value=localDateInput(new Date(y,m-1,d+1));
  loadAgenda();
});

$("todayBtn").addEventListener("click",()=>{
  agendaDate.value=localDateInput();
  loadAgenda();
});

agendaDate.addEventListener("change",loadAgenda);
professionalFilter.addEventListener("change",loadAgenda);

function selectedServices(){
  return pickedServiceIds.map(id=>services.find(s=>String(s.id)===id)).filter(Boolean);
}

function renderPickedServices(){
  const list=$("appointmentSelectedServices");
  const picked=selectedServices();
  list.innerHTML=picked.length
    ? picked.map((s,i)=>`
      <div class="service-picked">
        <strong>${escapeHtml(s.name)}</strong>
        <small>${formatDuration(durationToMinutes(s.duration))}</small>
        <b>${money(s.price)}</b>
        <button type="button" data-repeat-service="${s.id}" title="Repetir este serviço (ex.: cliente com o filho)">Repetir</button>
        <button type="button" data-unpick-service="${i}" aria-label="Remover ${escapeHtml(s.name)}">×</button>
      </div>`).join("")
    : '<p class="service-picked-empty">Toque nos serviços abaixo para adicionar.</p>';
  appointmentServiceList.querySelectorAll("[data-service-id]").forEach(btn=>btn.classList.toggle("is-picked",pickedServiceIds.includes(btn.dataset.serviceId)));
  updateAppointmentPreview();
}

function resetPickedServices(){
  pickedServiceIds=[];
  if($("appointmentServiceSearch")) $("appointmentServiceSearch").value="";
  filterServiceOptions();
  renderPickedServices();
}

function filterServiceOptions(){
  const term=($("appointmentServiceSearch")?.value||"").trim().toLowerCase();
  appointmentServiceList.querySelectorAll(".service-picker-category").forEach(group=>{
    let visible=0;
    group.querySelectorAll("[data-service-id]").forEach(btn=>{
      const show=!term||btn.dataset.search.includes(term);
      btn.classList.toggle("hidden",!show);
      if(show) visible++;
    });
    group.classList.toggle("hidden",!visible);
    if(term) group.open=true;
  });
}

appointmentServiceList.addEventListener("click",e=>{
  const btn=e.target.closest("[data-service-id]");
  if(!btn) return;
  pickedServiceIds.push(btn.dataset.serviceId);
  renderPickedServices();
});
$("appointmentSelectedServices")?.addEventListener("click",e=>{
  const repeat=e.target.closest("[data-repeat-service]");
  const remove=e.target.closest("[data-unpick-service]");
  if(repeat) pickedServiceIds.push(repeat.dataset.repeatService);
  if(remove) pickedServiceIds.splice(Number(remove.dataset.unpickService),1);
  if(repeat||remove) renderPickedServices();
});
$("appointmentServiceSearch")?.addEventListener("input",filterServiceOptions);

function formatDuration(minutes){
  const h=Math.floor(minutes/60);
  const m=minutes%60;
  if(h&&m) return `${h}h ${m}min`;
  if(h) return `${h}h`;
  return `${m}min`;
}

function updateAppointmentPreview(){
  const selected=selectedServices();
  const date=$("appointmentDate").value;
  const time=$("appointmentTime").value;
  const totalMinutes=selected.reduce((sum,s)=>sum+durationToMinutes(s.duration),0)+Number($("appointmentExtraMinutes")?.value||0);
  const totalPrice=selected.reduce((sum,s)=>sum+Number(s.price||0),0);

  appointmentServiceCount.textContent=selected.length
    ? `${selected.length} ${selected.length===1?"serviço selecionado":"serviços selecionados"}`
    : "Nenhum serviço selecionado";

  if(!selected.length){
    $("previewDuration").textContent="—";
    $("previewPrice").textContent="—";
    $("previewEnd").textContent="—";
    return;
  }

  $("previewDuration").textContent=formatDuration(totalMinutes);
  $("previewPrice").textContent=money(totalPrice);

  if(date&&time){
    const start=new Date(`${date}T${time}:00`);
    const end=new Date(start.getTime()+totalMinutes*60000);
    $("previewEnd").textContent=end.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
  } else {
    $("previewEnd").textContent="—";
  }
}

function openAppointmentModal(){
  appointmentForm.reset();
  appointmentMessage.textContent="";
  $("appointmentDate").value=agendaDate.value||localDateInput();
  $("appointmentSource").value="manual";
  if(professionalFilter.value) appointmentProfessional.value=professionalFilter.value;
  resetPickedServices();
  appointmentModal.classList.remove("hidden");
}

function closeAppointmentModal(){
  appointmentForm.reset();
  appointmentMessage.textContent="";
  appointmentModal.classList.add("hidden");
}

newAppointmentBtn.addEventListener("click",openAppointmentModal);
document.querySelectorAll("[data-close-modal]").forEach(el=>el.addEventListener("click",closeAppointmentModal));
$("appointmentDate").addEventListener("change",updateAppointmentPreview);
$("appointmentTime").addEventListener("input",updateAppointmentPreview);
$("appointmentExtraMinutes")?.addEventListener("change",updateAppointmentPreview);

async function saveAppointment({keepOpen=false}={}){
  if(!c7Allowed("appointments.create")||!c7Allowed("clients.create")){
    appointmentMessage.textContent="É necessário ter permissão para criar agendamentos e cadastrar clientes.";
    return false;
  }

  const name=$("clientName").value.trim();
  const phone=$("clientPhone").value.trim();
  const professionalId=appointmentProfessional.value;
  const selected=selectedServices();
  const date=$("appointmentDate").value;
  const time=$("appointmentTime").value;

  if(!name||!phone||!professionalId||!selected.length||!date||!time){
    appointmentMessage.textContent="Preencha os campos obrigatórios e selecione ao menos um serviço.";
    return false;
  }

  const extraMinutes=Number($("appointmentExtraMinutes")?.value||0);
  const durationMinutes=selected.reduce((sum,s)=>sum+durationToMinutes(s.duration),0)+extraMinutes;
  const totalAmount=selected.reduce((sum,s)=>sum+Number(s.price||0),0);
  const start=new Date(`${date}T${time}:00`);
  const end=new Date(start.getTime()+durationMinutes*60000);

  appointmentMessage.textContent="Verificando horário...";

  const weekday=new Date(`${date}T12:00:00`).getDay();
  const {data:hours}=await supabase.from("professional_working_hours")
    .select("starts_at,ends_at,active")
    .eq("professional_id",professionalId)
    .eq("weekday",weekday)
    .eq("active",true)
    .maybeSingle();

  // Somente o sistema interno permite exceções ao expediente; o banco verifica autorização.
  const startMinutes=start.getHours()*60+start.getMinutes();
  const endMinutes=end.getHours()*60+end.getMinutes();
  if(start.toDateString()!==end.toDateString()){
    appointmentMessage.textContent="O atendimento não pode passar da meia-noite.";return false;
  }
  if(!hours && !c7Allowed("appointments.create")){
    appointmentMessage.textContent="Sem expediente configurado.";return false;
  }
    const [{data:conflicts},{data:blocks}] = await Promise.all([
    supabase.from("appointments")
      .select("id")
      .eq("professional_id",professionalId)
      .neq("status","cancelled")
      .lt("starts_at",end.toISOString())
      .gt("ends_at",start.toISOString())
      .limit(1),
    supabase.from("schedule_blocks")
      .select("id")
      .eq("professional_id",professionalId)
      .lt("starts_at",end.toISOString())
      .gt("ends_at",start.toISOString())
      .limit(1)
  ]);

  const {data:lunchLocked}=await supabase.rpc("c7_lunch_enabled",{p_professional_id:professionalId,p_day:date});
  if(lunchLocked!==false && startMinutes<780 && endMinutes>720){
    appointmentMessage.textContent="Horário de almoço bloqueado.";return false;
  }
  if(blocks&&blocks.length){
    appointmentMessage.textContent="Esse horário está bloqueado para o profissional.";
    return false;
  }
  if(conflicts&&conflicts.length){
    // Encaixe: só admin e recepção podem sobrepor (cliente atrasado, horário apertado).
    if(!["admin","reception"].includes(currentRole)){
      appointmentMessage.textContent="Esse profissional já está ocupado nesse horário.";
      return false;
    }
    if(!confirm("Já existe atendimento nesse horário para este profissional.\n\nFazer um ENCAIXE mesmo assim?")) return false;
  }

  appointmentMessage.textContent="Salvando...";

  let customerId=null;
  if(!c7Allowed("clients.read")){
    const {data:id,error:lookupError}=await supabase.rpc("c7_customer_for_booking",{p_full_name:name,p_phone:phone});
    if(lookupError||!id){appointmentMessage.textContent="Não foi possível registrar o cliente para este agendamento.";return false;}
    customerId=id;
  }else{
  const {data:existingCustomer}=await supabase.from("customers")
    .select("id,full_name")
    .eq("phone",phone)
    .maybeSingle();

  if(existingCustomer){
    customerId=existingCustomer.id;
    if(existingCustomer.full_name!==name){
      await supabase.from("customers")
        .update({full_name:name,updated_at:new Date().toISOString()})
        .eq("id",customerId);
    }
  } else {
    const {data:newCustomer,error:customerError}=await supabase
      .from("customers")
      .insert({full_name:name,phone})
      .select("id")
      .single();

    if(customerError){
      appointmentMessage.textContent="Não foi possível cadastrar o cliente.";
      return false;
    }

    customerId=newCustomer.id;
  }
  }

  const {data:appointment,error:appointmentError}=await supabase
    .from("appointments")
    .insert({
      customer_id:customerId,
      professional_id:professionalId,
      starts_at:start.toISOString(),
      ends_at:end.toISOString(),
      status:"scheduled",
      source:$("appointmentSource").value,
      notes:$("appointmentNotes").value.trim()||null,
      total_amount:totalAmount,
      extra_minutes:extraMinutes,
      created_by:currentUser
    })
    .select("id")
    .single();

  if(appointmentError){
    appointmentMessage.textContent="Não foi possível salvar o agendamento.";
    return false;
  }

  const serviceRows=selected.map((service,index)=>({
    appointment_id:appointment.id,
    service_id:service.id,
    service_name:service.name,
    duration_minutes:durationToMinutes(service.duration),
    price:Number(service.price),
    sort_order:index
  }));

  const {error:serviceError}=await supabase.from("appointment_services").insert(serviceRows);

  if(serviceError){
    await supabase.from("appointments").delete().eq("id",appointment.id);
    appointmentMessage.textContent="Não foi possível vincular os serviços.";
    return false;
  }

  agendaDate.value=date;
  await loadAgenda();

  if(keepOpen){
    const savedDate=date;
    const savedProfessional=professionalId;
    const savedSource=$("appointmentSource").value;

    appointmentForm.reset();
    $("appointmentDate").value=savedDate;
    $("appointmentSource").value=savedSource||"manual";
    appointmentProfessional.value=savedProfessional;
    resetPickedServices();
    appointmentMessage.textContent="Agendamento salvo. Cadastre o próximo.";
    $("clientName").focus();
  }else{
    closeAppointmentModal();
  }

  return true;
}

appointmentForm.addEventListener("submit",async e=>{
  e.preventDefault();
  await saveAppointment({keepOpen:false});
});

saveAndNewAppointmentBtn?.addEventListener("click",async()=>{
  await saveAppointment({keepOpen:true});
});

function openBlockModal(preset={}){
  blockForm.reset();
  blockMessage.textContent="";
  $("blockDate").value=preset.date||agendaDate.value||localDateInput();
  $("blockStart").value=preset.start||"12:00";
  $("blockEnd").value=preset.end||"13:00";
  if(preset.professionalId){
    blockProfessional.value=preset.professionalId;
  }else if(professionalFilter.value){
    blockProfessional.value=professionalFilter.value;
  }
  blockModal.classList.remove("hidden");
}

function closeBlockModal(){
  blockModal.classList.add("hidden");
}

blockTimeBtn.addEventListener("click",openBlockModal);
document.querySelectorAll("[data-close-block]").forEach(el=>el.addEventListener("click",closeBlockModal));

blockForm.addEventListener("submit",async e=>{
  e.preventDefault();

  if(!["admin","reception","barber"].includes(currentRole)){
    blockMessage.textContent="Seu perfil não possui permissão para bloquear horários.";
    return;
  }

  const professionalId=blockProfessional.value;

  if(currentRole==="barber"&&professionalId!==currentProfessionalId){
    blockMessage.textContent="Você só pode bloquear a sua própria agenda.";
    return;
  }
  const date=$("blockDate").value;
  const startTime=$("blockStart").value;
  const endTime=$("blockEnd").value;
  const reason=$("blockReason").value.trim();

  if(!professionalId||!date||!startTime||!endTime){
    blockMessage.textContent="Preencha os campos obrigatórios.";
    return;
  }

  const start=new Date(`${date}T${startTime}:00`);
  const end=new Date(`${date}T${endTime}:00`);

  if(end<=start){
    blockMessage.textContent="O horário final precisa ser depois do inicial.";
    return;
  }

  blockMessage.textContent="Verificando agenda...";

  const {data:conflicts}=await supabase.from("appointments")
    .select("id")
    .eq("professional_id",professionalId)
    .neq("status","cancelled")
    .lt("starts_at",end.toISOString())
    .gt("ends_at",start.toISOString())
    .limit(1);

  if(conflicts?.length){
    blockMessage.textContent="Já existe um agendamento dentro desse período.";
    return;
  }

  const {error}=await supabase.from("schedule_blocks").insert({
    professional_id:professionalId,
    starts_at:start.toISOString(),
    ends_at:end.toISOString(),
    reason:reason||null,
    created_by:currentUser
  });

  if(error){
    blockMessage.textContent="Não foi possível salvar o bloqueio.";
    return;
  }

  agendaDate.value=date;
  closeBlockModal();
  await loadAgenda();
});

setAgendaView("timeline");

// Fluxo de recuperação: registra o listener ANTES de processar sessão e suporta hash, token_hash e code.
const recoveryHash=new URLSearchParams(window.location.hash.slice(1));
const recoveryQuery=new URLSearchParams(window.location.search);
const recoveryRequested=recoveryHash.get("type")==="recovery"||recoveryQuery.get("type")==="recovery"||
  recoveryQuery.has("token_hash")||recoveryQuery.has("code")||recoveryHash.has("access_token");
let recoveryMode=recoveryRequested;
let recoveryProcessing=false;
supabase.auth.onAuthStateChange((event,session)=>{
  if(event==="PASSWORD_RECOVERY"){
    recoveryMode=true;
    showReset();
    return;
  }
  if(!session&&!recoveryMode)showLogin();
});
async function finishRecoveryNavigation(){
  if(recoveryProcessing)return;
  recoveryProcessing=true;
  const authError=recoveryQuery.get("error_description")||recoveryHash.get("error_description");
  if(authError){showLogin();loginMessage.textContent="Este link expirou ou já foi utilizado. Solicite um novo em Esqueci minha senha.";return;}
  if(recoveryQuery.has("token_hash")){
    const {error}=await supabase.auth.verifyOtp({token_hash:recoveryQuery.get("token_hash"),type:"recovery"});
    if(error){showLogin();loginMessage.textContent="Link de recuperação inválido ou expirado. Solicite outro.";return;}
  }else if(recoveryQuery.has("code")){
    const {error}=await supabase.auth.exchangeCodeForSession(recoveryQuery.get("code"));
    if(error){showLogin();loginMessage.textContent="Não foi possível validar o link. Solicite outro.";return;}
  }
  const {data:{session}}=await supabase.auth.getSession();
  if(recoveryMode){
    if(session){
      history.replaceState(null,"",window.location.pathname+"?recuperar=1");
      showReset();
    }else{
      showLogin();
      loginMessage.textContent="Não foi possível validar o link. Solicite outro em Esqueci minha senha.";
    }
  }else if(session)await loadProfile(session.user.id);
  else showLogin();
}
await finishRecoveryNavigation();

window.addEventListener("c7-checkout-complete",async()=>{
  await loadAgenda();
  if(document.getElementById("dashboard")?.classList.contains("active")){
    await updateDashboard();
  }
});


let c7RightsChecking=false;
async function c7VerifyPermissions(){
 if(!currentUser||c7RightsChecking)return;
 c7RightsChecking=true;
 try{
   const {data:{session}}=await supabase.auth.getSession();
   if(!session)return;
   const {data:profile,error:profileError}=await supabase.from("profiles")
     .select("role,active").eq("user_id",session.user.id).maybeSingle();
   if(profileError)return;
   if(!profile?.active || profile.role!==accountRole){
     await supabase.auth.signOut();
     window.location.reload();
     return;
   }
   if(accountRole==="admin")return;
   const {data:grant,error:grantError}=await supabase.from("staff_permissions")
     .select("permissions").eq("email",session.user.email.toLowerCase()).maybeSingle();
   if(grantError)return;
   const latest=grant?.permissions||null;
   if(JSON.stringify(latest)!==JSON.stringify(personalRights)){
     window.location.reload();
   }
 }catch(error){
   console.warn("C7 atualização de permissões",error);
 }finally{c7RightsChecking=false;}
}
window.addEventListener("focus",c7VerifyPermissions);
document.addEventListener("visibilitychange",()=>{
 if(document.visibilityState==="visible")c7VerifyPermissions();
});
setInterval(()=>{
 if(document.visibilityState==="visible")c7VerifyPermissions();
},12000);

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
const firstAccessBtn=$("firstAccessBtn");
const loginMessage=$("loginMessage");
const logoutBtn=$("logoutBtn");
const userName=$("userName");
const userRole=$("userRole");
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
const appointmentService=$("appointmentService");

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

let currentRole=null;
let currentUser=null;
let professionals=[];
let services=[];
let currentAppointments=[];
let currentBlocks=[];
let currentWorkingHours=[];
let agendaView="list";

function localDateInput(date=new Date()){
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,"0");
  const d=String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

function money(value){
  return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(value||0));
}

function durationToMinutes(value){
  const text=String(value||"").toLowerCase();
  const hours=Number((text.match(/(\d+)\s*h/)||[])[1]||0);
  const minutes=Number((text.match(/(\d+)\s*min/)||[])[1]||0);
  return hours*60+minutes || 30;
}

function formatTime(value){
  return new Date(value).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
}

function formatDateLabel(value){
  if(!value) return "—";
  const [y,m,d]=value.split("-").map(Number);
  return new Date(y,m-1,d).toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"});
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

function showLogin(){loginView.classList.remove("hidden");appView.classList.add("hidden")}
function showApp(){loginView.classList.add("hidden");appView.classList.remove("hidden")}

async function loadProfile(userId){
  const {data,error}=await supabase.from("profiles").select("full_name,role,active").eq("user_id",userId).single();
  if(error||!data||!data.active){
    await supabase.auth.signOut();
    showLogin();
    loginMessage.textContent="Usuário sem acesso ativo.";
    return;
  }

  currentRole=data.role;
  currentUser=userId;
  userName.textContent=data.full_name||"Usuário C7";
  userRole.textContent=roleLabels[data.role]||data.role;

  document.querySelectorAll(".nav-item").forEach(item=>{
    const section=item.dataset.section;
    const hide=(data.role==="barber"&&["caixa","relatorios","configuracoes"].includes(section))||(data.role==="reception"&&section==="configuracoes");
    item.classList.toggle("hidden",hide);
  });

  const canManageAgenda=["admin","reception"].includes(data.role);
  newAppointmentBtn.classList.toggle("hidden",!canManageAgenda);
  blockTimeBtn.classList.toggle("hidden",!canManageAgenda);

  showApp();
  await initAgenda();
}

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

firstAccessBtn.addEventListener("click",async()=>{
  const email=$("email").value.trim();
  const password=$("password").value;

  if(!email||password.length<8){
    loginMessage.textContent="Informe o e-mail e uma senha com pelo menos 8 caracteres.";
    return;
  }

  loginMessage.textContent="Criando acesso...";

  const {data,error}=await supabase.auth.signUp({
    email,
    password,
    options:{emailRedirectTo:window.location.origin+"/"}
  });

  if(error){
    loginMessage.textContent="Não foi possível criar o acesso. Confira se o e-mail está autorizado.";
    return;
  }

  if(data.session){
    loginMessage.textContent="";
    window.location.reload();
  } else {
    loginMessage.textContent="Acesso criado. Confira seu e-mail para confirmar a conta.";
  }
});

logoutBtn.addEventListener("click",async()=>{
  await supabase.auth.signOut();
  showLogin();
});

function openSection(id){
  document.querySelectorAll(".section").forEach(el=>el.classList.toggle("active",el.id===id));
  document.querySelectorAll(".nav-item").forEach(el=>el.classList.toggle("active",el.dataset.section===id));
  const btn=document.querySelector(`.nav-item[data-section="${id}"]`);
  pageTitle.textContent=btn?btn.textContent:"C7 System";
  if(id==="agenda") loadAgenda();
  if(id==="dashboard") updateDashboard();
}

document.querySelectorAll(".nav-item").forEach(btn=>{
  btn.addEventListener("click",()=>openSection(btn.dataset.section));
});

async function initAgenda(){
  agendaDate.value=agendaDate.value||localDateInput();

  const [{data:proData},{data:serviceData}] = await Promise.all([
    supabase.from("professionals").select("id,full_name,specialty,active").eq("active",true).order("full_name"),
    supabase.from("services").select("id,name,duration,price,sort_order").eq("active",true).order("sort_order")
  ]);

  professionals=proData||[];
  services=serviceData||[];

  const proOptions=professionals.map(p=>`<option value="${p.id}">${escapeHtml(p.full_name)}</option>`).join("");

  professionalFilter.innerHTML='<option value="">Todos os profissionais</option>'+proOptions;
  appointmentProfessional.innerHTML='<option value="">Selecione</option>'+proOptions;
  blockProfessional.innerHTML='<option value="">Selecione</option>'+proOptions;

  appointmentService.innerHTML='<option value="">Selecione</option>'+services.map(
    s=>`<option value="${s.id}">${escapeHtml(s.name)} — ${money(s.price)}</option>`
  ).join("");

  await loadAgenda();
}

async function loadAgenda(){
  if(!agendaDate.value) return;

  const selected=agendaDate.value;
  const start=new Date(`${selected}T00:00:00`);
  const end=new Date(`${selected}T23:59:59.999`);
  const weekday=selectedWeekday();

  let appointmentQuery=supabase
    .from("appointments")
    .select("id,professional_id,starts_at,ends_at,status,source,total_amount,notes,customer:customers(id,full_name,phone),professional:professionals(id,full_name),appointment_services(id,service_name,duration_minutes,price)")
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

  currentAppointments=appointmentsResult.data||[];
  currentBlocks=blocksResult.data||[];
  currentWorkingHours=hoursResult.data||[];

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
    const disabled=currentRole==="barber"?"disabled":"";

    return {
      start:new Date(a.starts_at),
      html:`
        <article class="appointment-card">
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
            <select class="status-select" data-appointment-status="${a.id}" ${disabled}>
              ${Object.entries(statusLabels).map(([value,label])=>`<option value="${value}" ${a.status===value?"selected":""}>${label}</option>`).join("")}
            </select>
          </div>
        </article>`
    };
  });

  const blockRows=currentBlocks.map(b=>{
    const canDelete=["admin","reception"].includes(currentRole);
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
          ${canDelete?`<button class="block-delete" data-delete-block="${b.id}" type="button">REMOVER</button>`:""}
        </article>`
    };
  });

  const rows=[...appointmentRows,...blockRows].sort((a,b)=>a.start-b.start);

  if(!rows.length){
    agendaList.innerHTML='<div class="agenda-empty">Nenhum agendamento ou bloqueio para este dia.</div>';
  } else {
    agendaList.innerHTML=rows.map(r=>r.html).join("");
  }

  document.querySelectorAll("[data-appointment-status]").forEach(select=>{
    select.addEventListener("change",async()=>{
      const {error}=await supabase.from("appointments")
        .update({status:select.value,updated_at:new Date().toISOString()})
        .eq("id",select.dataset.appointmentStatus);

      if(error){
        alert("Não foi possível atualizar o status.");
      }
      await loadAgenda();
    });
  });

  document.querySelectorAll("[data-delete-block]").forEach(btn=>{
    btn.addEventListener("click",async()=>{
      if(!confirm("Remover este bloqueio de horário?")) return;
      const {error}=await supabase.from("schedule_blocks").delete().eq("id",btn.dataset.deleteBlock);
      if(error) alert("Não foi possível remover o bloqueio.");
      await loadAgenda();
    });
  });
}

function professionalsForView(){
  if(professionalFilter.value){
    return professionals.filter(p=>p.id===professionalFilter.value);
  }
  return professionals;
}

function renderTimeline(){
  const pros=professionalsForView();

  if(!pros.length){
    agendaTimeline.innerHTML='<div class="agenda-empty">Nenhum profissional cadastrado.</div>';
    return;
  }

  const dayHours=currentWorkingHours.filter(h=>pros.some(p=>p.id===h.professional_id));

  const starts=dayHours.map(h=>minutesFromHHMM(h.starts_at));
  const ends=dayHours.map(h=>minutesFromHHMM(h.ends_at));

  let minMinute=starts.length?Math.min(...starts):8*60;
  let maxMinute=ends.length?Math.max(...ends):20*60;

  minMinute=Math.floor(minMinute/30)*30;
  maxMinute=Math.ceil(maxMinute/30)*30;

  const slots=[];
  for(let min=minMinute;min<maxMinute;min+=30) slots.push(min);

  const selected=agendaDate.value;

  const head=`
    <div class="timeline-head" style="--pro-count:${pros.length}">
      <div class="timeline-corner">HORÁRIO</div>
      ${pros.map(p=>`
        <div class="pro-head">
          <strong>${escapeHtml(p.full_name)}</strong>
          <small>${escapeHtml(p.specialty||"Profissional")}</small>
        </div>
      `).join("")}
    </div>`;

  const rows=slots.map(slotMin=>{
    return `
      <div class="timeline-row" style="--pro-count:${pros.length}">
        <div class="timeline-time">${hhmmFromMinutes(slotMin)}</div>
        ${pros.map(p=>{
          const working=currentWorkingHours.find(h=>h.professional_id===p.id);
          const within=working && slotMin>=minutesFromHHMM(working.starts_at) && slotMin<minutesFromHHMM(working.ends_at);

          const slotStart=new Date(`${selected}T${hhmmFromMinutes(slotMin)}:00`);
          const slotEnd=new Date(slotStart.getTime()+30*60000);

          const appointment=currentAppointments.find(a=>
            a.professional_id===p.id &&
            a.status!=="cancelled" &&
            new Date(a.starts_at)<slotEnd &&
            new Date(a.ends_at)>slotStart
          );

          const block=currentBlocks.find(b=>
            b.professional_id===p.id &&
            new Date(b.starts_at)<slotEnd &&
            new Date(b.ends_at)>slotStart
          );

          let content="";
          if(appointment){
            const customer=escapeHtml(appointment.customer?.full_name||"Cliente");
            const service=escapeHtml((appointment.appointment_services||[]).map(s=>s.service_name).join(" + "));
            content=`<div class="timeline-booking"><strong>${formatTime(appointment.starts_at)} • ${customer}</strong><span>${service}</span></div>`;
          } else if(block){
            content=`<div class="timeline-block"><strong>BLOQUEADO</strong><span>${escapeHtml(block.reason||"Indisponível")}</span></div>`;
          }

          return `<div class="timeline-cell ${within?"":"outside-hours"}">${content}</div>`;
        }).join("")}
      </div>`;
  }).join("");

  agendaTimeline.innerHTML=`<div class="timeline-grid">${head}${rows}</div>`;
}

async function updateDashboard(){
  const today=localDateInput();
  const start=new Date(`${today}T00:00:00`);
  const end=new Date(`${today}T23:59:59.999`);
  const now=new Date();

  const [
    appointmentsResult,
    transactionsResult,
    productsResult,
    cashResult,
    professionalsResult
  ]=await Promise.all([
    supabase.from("appointments")
      .select("id,starts_at,status,customer:customers(full_name),professional:professionals(full_name)")
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

  const appointments=appointmentsResult.data||[];
  const transactions=transactionsResult.data||[];
  const products=productsResult.data||[];
  const openCash=cashResult.data||null;
  const activePros=professionalsResult.data||[];

  const relevantAppointments=appointments.filter(a=>["waiting","in_service","completed"].includes(a.status));
  const waiting=appointments.filter(a=>a.status==="waiting");
  const revenue=transactions.filter(t=>t.direction==="in")
    .reduce((sum,t)=>sum+Number(t.net_amount||0),0);
  const lowStock=products.filter(p=>Number(p.stock_quantity||0)<=Number(p.min_stock||0));

  $("statAppointments").textContent=relevantAppointments.length;
  $("statRevenue").textContent=money(revenue);
  $("statWaiting").textContent=waiting.length;
  $("statLowStock").textContent=lowStock.length;

  if(openCash){
    $("dashboardCashStatus").textContent="Aberto";
    $("dashboardCashText").textContent=`Saldo esperado: ${money(openCash.expected_balance)} • Entradas: ${money(openCash.total_in)} • Saídas: ${money(openCash.total_out)}`;
  }else{
    $("dashboardCashStatus").textContent="Fechado";
    $("dashboardCashText").textContent="Nenhum caixa aberto no momento.";
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
    ? `${waiting.length} cliente${waiting.length===1?"":"s"} aguardando atendimento.`
    : "Nenhum cliente aguardando.";

  const alerts=[];
  if(lowStock.length){
    alerts.push({title:"Estoque baixo",text:lowStock.slice(0,4).map(p=>p.name).join(", ")+(lowStock.length>4?"...":"")});
  }
  if(!openCash && ["admin","reception"].includes(currentRole)){
    alerts.push({title:"Caixa fechado",text:"Abra o caixa antes de registrar recebimentos."});
  }
  if(waiting.length){
    alerts.push({title:"Cliente aguardando",text:`${waiting.length} atendimento${waiting.length===1?"":"s"} na fila.`});
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

function selectedService(){
  return services.find(s=>String(s.id)===appointmentService.value);
}

function updateAppointmentPreview(){
  const service=selectedService();
  const date=$("appointmentDate").value;
  const time=$("appointmentTime").value;

  if(!service){
    $("previewDuration").textContent="—";
    $("previewPrice").textContent="—";
    $("previewEnd").textContent="—";
    return;
  }

  const minutes=durationToMinutes(service.duration);
  $("previewDuration").textContent=service.duration;
  $("previewPrice").textContent=money(service.price);

  if(date&&time){
    const start=new Date(`${date}T${time}:00`);
    const end=new Date(start.getTime()+minutes*60000);
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
  updateAppointmentPreview();
  appointmentModal.classList.remove("hidden");
}

function closeAppointmentModal(){
  appointmentModal.classList.add("hidden");
}

newAppointmentBtn.addEventListener("click",openAppointmentModal);
document.querySelectorAll("[data-close-modal]").forEach(el=>el.addEventListener("click",closeAppointmentModal));
appointmentService.addEventListener("change",updateAppointmentPreview);
$("appointmentDate").addEventListener("change",updateAppointmentPreview);
$("appointmentTime").addEventListener("input",updateAppointmentPreview);

appointmentForm.addEventListener("submit",async e=>{
  e.preventDefault();

  if(!["admin","reception"].includes(currentRole)){
    appointmentMessage.textContent="Seu perfil não possui permissão para criar agendamentos.";
    return;
  }

  const name=$("clientName").value.trim();
  const phone=$("clientPhone").value.trim();
  const professionalId=appointmentProfessional.value;
  const service=selectedService();
  const date=$("appointmentDate").value;
  const time=$("appointmentTime").value;

  if(!name||!phone||!professionalId||!service||!date||!time){
    appointmentMessage.textContent="Preencha os campos obrigatórios.";
    return;
  }

  const durationMinutes=durationToMinutes(service.duration);
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

  if(!hours){
    appointmentMessage.textContent="Esse profissional não possui expediente configurado para este dia.";
    return;
  }

  const startMinutes=start.getHours()*60+start.getMinutes();
  const endMinutes=end.getHours()*60+end.getMinutes();

  if(startMinutes<minutesFromHHMM(hours.starts_at)||endMinutes>minutesFromHHMM(hours.ends_at)){
    appointmentMessage.textContent="O horário está fora do expediente desse profissional.";
    return;
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

  if((conflicts&&conflicts.length)||(blocks&&blocks.length)){
    appointmentMessage.textContent="Esse profissional já está ocupado nesse horário.";
    return;
  }

  appointmentMessage.textContent="Salvando...";

  let customerId=null;
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
      return;
    }

    customerId=newCustomer.id;
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
      total_amount:Number(service.price),
      created_by:currentUser
    })
    .select("id")
    .single();

  if(appointmentError){
    appointmentMessage.textContent="Não foi possível salvar o agendamento.";
    return;
  }

  const {error:serviceError}=await supabase.from("appointment_services").insert({
    appointment_id:appointment.id,
    service_id:service.id,
    service_name:service.name,
    duration_minutes:durationMinutes,
    price:Number(service.price),
    sort_order:0
  });

  if(serviceError){
    await supabase.from("appointments").delete().eq("id",appointment.id);
    appointmentMessage.textContent="Não foi possível vincular o serviço.";
    return;
  }

  agendaDate.value=date;
  closeAppointmentModal();
  await loadAgenda();
});

function openBlockModal(){
  blockForm.reset();
  blockMessage.textContent="";
  $("blockDate").value=agendaDate.value||localDateInput();
  $("blockStart").value="12:00";
  $("blockEnd").value="13:00";
  if(professionalFilter.value) blockProfessional.value=professionalFilter.value;
  blockModal.classList.remove("hidden");
}

function closeBlockModal(){
  blockModal.classList.add("hidden");
}

blockTimeBtn.addEventListener("click",openBlockModal);
document.querySelectorAll("[data-close-block]").forEach(el=>el.addEventListener("click",closeBlockModal));

blockForm.addEventListener("submit",async e=>{
  e.preventDefault();

  if(!["admin","reception"].includes(currentRole)){
    blockMessage.textContent="Seu perfil não possui permissão para bloquear horários.";
    return;
  }

  const professionalId=blockProfessional.value;
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

setAgendaView("list");

const {data:{session}}=await supabase.auth.getSession();
if(session) await loadProfile(session.user.id); else showLogin();

supabase.auth.onAuthStateChange((_event,session)=>{
  if(!session) showLogin();
});
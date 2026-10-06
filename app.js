import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  "https://cjtgjqxkyvgjlhylrvas.supabase.co",
  "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE"
);

const $ = (id) => document.getElementById(id);

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
const professionalFilter=$("professionalFilter");
const newAppointmentBtn=$("newAppointmentBtn");
const appointmentModal=$("appointmentModal");
const appointmentForm=$("appointmentForm");
const appointmentMessage=$("appointmentMessage");
const appointmentProfessional=$("appointmentProfessional");
const appointmentService=$("appointmentService");

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

  if(data.role==="barber") newAppointmentBtn.classList.add("hidden");
  else newAppointmentBtn.classList.remove("hidden");

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
  await loadProfile(data.user.id);
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
    await loadProfile(data.user.id);
  } else {
    loginMessage.textContent="Acesso criado. Confira seu e-mail para confirmar a conta.";
  }
});

logoutBtn.addEventListener("click",async()=>{await supabase.auth.signOut();showLogin()});

function openSection(id){
  document.querySelectorAll(".section").forEach(el=>el.classList.toggle("active",el.id===id));
  document.querySelectorAll(".nav-item").forEach(el=>el.classList.toggle("active",el.dataset.section===id));
  const btn=document.querySelector(`.nav-item[data-section="${id}"]`);
  pageTitle.textContent=btn?btn.textContent:"C7 System";
  if(id==="agenda") loadAgenda();
}

document.querySelectorAll(".nav-item").forEach(btn=>btn.addEventListener("click",()=>openSection(btn.dataset.section)));

async function initAgenda(){
  agendaDate.value=agendaDate.value||localDateInput();

  const [{data:proData},{data:serviceData}] = await Promise.all([
    supabase.from("professionals").select("id,full_name,active").eq("active",true).order("full_name"),
    supabase.from("services").select("id,name,duration,price,sort_order").eq("active",true).order("sort_order")
  ]);

  professionals=proData||[];
  services=serviceData||[];

  professionalFilter.innerHTML='<option value="">Todos os profissionais</option>'+professionals.map(p=>`<option value="${p.id}">${p.full_name}</option>`).join("");
  appointmentProfessional.innerHTML='<option value="">Selecione</option>'+professionals.map(p=>`<option value="${p.id}">${p.full_name}</option>`).join("");
  appointmentService.innerHTML='<option value="">Selecione</option>'+services.map(s=>`<option value="${s.id}">${s.name} — ${money(s.price)}</option>`).join("");

  await loadAgenda();
}

async function loadAgenda(){
  if(!agendaDate.value) return;

  const selected=agendaDate.value;
  const start=new Date(`${selected}T00:00:00`);
  const end=new Date(`${selected}T23:59:59.999`);

  let query=supabase
    .from("appointments")
    .select("id,starts_at,ends_at,status,source,total_amount,notes,customer:customers(id,full_name,phone),professional:professionals(id,full_name),appointment_services(id,service_name,duration_minutes,price)")
    .gte("starts_at",start.toISOString())
    .lte("starts_at",end.toISOString())
    .order("starts_at",{ascending:true});

  if(professionalFilter.value) query=query.eq("professional_id",professionalFilter.value);

  const {data,error}=await query;

  agendaDateLabel.textContent=formatDateLabel(selected);

  if(error){
    agendaList.innerHTML='<div class="agenda-empty">Não foi possível carregar a agenda.</div>';
    return;
  }

  currentAppointments=data||[];
  renderAgenda(currentAppointments);
  updateDashboard(currentAppointments,selected);
}

function renderAgenda(items){
  const active=items.filter(a=>a.status!=="cancelled");
  agendaCount.textContent=active.length;
  agendaTotal.textContent=money(active.reduce((sum,a)=>sum+Number(a.total_amount||0),0));

  if(!items.length){
    agendaList.innerHTML='<div class="agenda-empty">Nenhum agendamento para este dia.</div>';
    return;
  }

  agendaList.innerHTML=items.map(a=>{
    const customer=a.customer?.full_name||"Cliente sem cadastro";
    const phone=a.customer?.phone||"";
    const professional=a.professional?.full_name||"Sem profissional";
    const service=(a.appointment_services||[]).map(s=>s.service_name).join(" + ")||"Serviço não informado";
    const disabled=currentRole==="barber"?"disabled":"";

    return `
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
          <span class="source-badge">${a.source}</span>
          <strong class="amount-badge">${money(a.total_amount)}</strong>
          <select class="status-select" data-appointment-status="${a.id}" ${disabled}>
            ${Object.entries(statusLabels).map(([value,label])=>`<option value="${value}" ${a.status===value?"selected":""}>${label}</option>`).join("")}
          </select>
        </div>
      </article>
    `;
  }).join("");

  document.querySelectorAll("[data-appointment-status]").forEach(select=>{
    select.addEventListener("change",async()=>{
      const id=select.dataset.appointmentStatus;
      const {error}=await supabase.from("appointments").update({status:select.value,updated_at:new Date().toISOString()}).eq("id",id);
      if(error){alert("Não foi possível atualizar o status.");await loadAgenda();return}
      await loadAgenda();
    });
  });
}

function updateDashboard(items,selectedDate){
  if(selectedDate!==localDateInput()) return;
  const active=items.filter(a=>a.status!=="cancelled");
  const now=new Date();
  $("statAppointments").textContent=active.length;
  $("statRevenue").textContent=money(active.reduce((sum,a)=>sum+Number(a.total_amount||0),0));
  $("statUpcoming").textContent=active.filter(a=>new Date(a.starts_at)>now).length;
  $("statWaiting").textContent=active.filter(a=>a.status==="waiting").length;
}

$("prevDay").addEventListener("click",()=>{
  const [y,m,d]=agendaDate.value.split("-").map(Number);
  const date=new Date(y,m-1,d-1);
  agendaDate.value=localDateInput(date);
  loadAgenda();
});

$("nextDay").addEventListener("click",()=>{
  const [y,m,d]=agendaDate.value.split("-").map(Number);
  const date=new Date(y,m-1,d+1);
  agendaDate.value=localDateInput(date);
  loadAgenda();
});

$("todayBtn").addEventListener("click",()=>{agendaDate.value=localDateInput();loadAgenda()});
agendaDate.addEventListener("change",loadAgenda);
professionalFilter.addEventListener("change",loadAgenda);

function openAppointmentModal(){
  appointmentForm.reset();
  appointmentMessage.textContent="";
  $("appointmentDate").value=agendaDate.value||localDateInput();
  $("appointmentSource").value="manual";
  updateAppointmentPreview();
  appointmentModal.classList.remove("hidden");
}

function closeAppointmentModal(){
  appointmentModal.classList.add("hidden");
}

newAppointmentBtn.addEventListener("click",openAppointmentModal);
document.querySelectorAll("[data-close-modal]").forEach(el=>el.addEventListener("click",closeAppointmentModal));

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
  const {data:existingCustomer}=await supabase.from("customers").select("id,full_name").eq("phone",phone).maybeSingle();

  if(existingCustomer){
    customerId=existingCustomer.id;
    if(existingCustomer.full_name!==name){
      await supabase.from("customers").update({full_name:name,updated_at:new Date().toISOString()}).eq("id",customerId);
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

const {data:{session}}=await supabase.auth.getSession();
if(session) await loadProfile(session.user.id); else showLogin();
supabase.auth.onAuthStateChange((_event,session)=>{if(!session)showLogin()});

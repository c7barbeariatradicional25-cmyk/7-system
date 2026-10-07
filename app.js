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

let currentRole=null;
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

  if(data.role==="barber"){
    const {data:professional}=await supabase
      .from("professionals")
      .select("id,full_name,avatar_url,specialty")
      .eq("user_id",userId)
      .eq("active",true)
      .maybeSingle();

    currentProfessionalId=professional?.id||null;

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
      hide=!["dashboard","agenda","desempenho","operacoes"].includes(section);
    }else if(data.role==="reception"){
      hide=section==="configuracoes";
    }

    item.classList.toggle("hidden",hide);
  });

  document.querySelectorAll(".barber-only").forEach(el=>{
    el.classList.toggle("hidden",data.role!=="barber");
  });

  const canCreateAppointment=["admin","reception"].includes(data.role);
  const canBlockAgenda=["admin","reception","barber"].includes(data.role);
  newAppointmentBtn.classList.toggle("hidden",!canCreateAppointment);
  blockTimeBtn.classList.toggle("hidden",!canBlockAgenda);

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

  appointmentServiceList.innerHTML=Object.entries(serviceGroups).map(([category,items])=>`
    <div class="service-picker-category">
      <div class="service-picker-category-title">${escapeHtml(category)}</div>
      ${items.map(s=>`
        <label class="service-option">
          <input type="checkbox" value="${s.id}" data-service-id="${s.id}">
          <span class="service-option-main">
            <strong>${escapeHtml(s.name)}</strong>
            <small>${escapeHtml(s.duration)} • ${money(s.price)}</small>
          </span>
        </label>
      `).join("")}
    </div>
  `).join("");

  appointmentServiceList.querySelectorAll('input[type="checkbox"]').forEach(input=>{
    input.addEventListener("change",updateAppointmentPreview);
  });

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
    const canEditStatus=["admin","reception"].includes(currentRole)||
      (currentRole==="barber"&&a.professional_id===currentProfessionalId);
    const disabled=canEditStatus?"":"disabled";

    return {
      start:new Date(a.starts_at),
      html:`
        <article class="appointment-card clickable-appointment" data-open-appointment="${a.id}" role="button" tabindex="0">
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
    const canDelete=["admin","reception"].includes(currentRole)||
      (currentRole==="barber"&&b.professional_id===currentProfessionalId);
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
          alert("O checkout ainda não terminou de carregar. Tente novamente.");
        }
        return;
      }

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


async function fetchAppointmentDetail(appointmentId){
  const [{data:appointment,error},{data:extras},{data:productCatalog}]=await Promise.all([
    supabase.from("appointments")
      .select("id,customer_id,professional_id,starts_at,ends_at,status,source,total_amount,notes,customer:customers(id,full_name,phone),professional:professionals(id,full_name),appointment_services(id,service_id,service_name,duration_minutes,price,sort_order)")
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
  return appointment;
}

function canManageDetail(appointment){
  return ["admin","reception"].includes(currentRole) ||
    (currentRole==="barber"&&appointment.professional_id===currentProfessionalId);
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
  $("detailServiceTotal").textContent=money(serviceTotal);
  $("detailProductTotal").textContent=money(productTotal);
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

  const currentServiceIds=new Set(servicesRows.map(item=>String(item.service_id)));
  $("detailAddService").innerHTML='<option value="">Adicionar serviço...</option>'+
    services
      .filter(s=>!currentServiceIds.has(String(s.id)))
      .map(s=>`<option value="${s.id}">${escapeHtml(s.name)} — ${money(s.price)}</option>`)
      .join("");

  $("detailAddProduct").innerHTML='<option value="">Adicionar produto/consumível...</option>'+
    detailProductsCatalog
      .filter(p=>Number(p.stock_quantity||0)>0)
      .map(p=>`<option value="${p.id}">${escapeHtml(p.name)} — ${money(p.price)} • estoque ${Number(p.stock_quantity||0)}</option>`)
      .join("");

  $("detailAddService").disabled=!canManage||finished;
  $("detailAddServiceBtn").disabled=!canManage||finished;
  $("detailAddProduct").disabled=!canManage||finished;
  $("detailProductQty").disabled=!canManage||finished;
  $("detailAddProductBtn").disabled=!canManage||finished;

  $("detailStartBtn").classList.toggle("hidden",!canManage||finished||appointment.status==="in_service");
  $("detailStartBtn").textContent=appointment.status==="waiting"?"INICIAR ATENDIMENTO":"MARCAR EM ATENDIMENTO";
  $("detailCheckoutBtn").classList.toggle("hidden",!canManage||finished);
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

$("detailStartBtn")?.addEventListener("click",async()=>{
  if(!detailAppointmentId) return;
  const {error}=await supabase.from("appointments")
    .update({
      status:"in_service",
      service_started_at:new Date().toISOString(),
      updated_at:new Date().toISOString()
    })
    .eq("id",detailAppointmentId);

  if(error){
    $("appointmentDetailMessage").textContent="Não foi possível iniciar o atendimento.";
    return;
  }

  await Promise.all([refreshAppointmentDetail(),loadAgenda()]);
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

  minMinute=Math.max(0,Math.floor(minMinute/30)*30);
  maxMinute=Math.min(24*60,Math.ceil(maxMinute/30)*30);

  if(maxMinute-minMinute<8*60){
    maxMinute=Math.min(24*60,minMinute+8*60);
  }

  const pxPerMinute=2;
  const timelineTopPadding=22;
  const timelineBottomPadding=22;
  const totalMinutes=maxMinute-minMinute;
  const timelineHeight=totalMinutes*pxPerMinute+timelineTopPadding+timelineBottomPadding;
  const selected=agendaDate.value;

  const timeLabels=[];
  for(let min=minMinute;min<=maxMinute;min+=30){
    timeLabels.push(`
      <div class="live-time-label" style="top:${timelineTopPadding+(min-minMinute)*pxPerMinute}px">
        <span>${hhmmFromMinutes(min)}</span>
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

    const appointmentHtml=proAppointments.map(a=>{
      const startDate=new Date(a.starts_at);
      const endDate=new Date(a.ends_at);
      const startMin=startDate.getHours()*60+startDate.getMinutes();
      const endMin=endDate.getHours()*60+endDate.getMinutes();
      const top=timelineTopPadding+Math.max(0,(startMin-minMinute)*pxPerMinute);
      const height=Math.max(32,(endMin-startMin)*pxPerMinute-4);
      const customer=escapeHtml(a.customer?.full_name||"Cliente");
      const service=escapeHtml((a.appointment_services||[]).map(s=>s.service_name).join(" + ")||"Serviço");
      const canCheckout=["admin","reception"].includes(currentRole)||
        (currentRole==="barber"&&a.professional_id===currentProfessionalId);
      const checkout=a.status==="in_service" && canCheckout
        ? `<button class="live-checkout" type="button" data-timeline-checkout="${a.id}">CHECKOUT</button>`
        : "";

      return `
        <article class="live-booking status-${a.status} clickable-appointment" data-open-appointment="${a.id}" role="button" tabindex="0" style="top:${top}px;height:${height}px">
          <div class="live-booking-time">${formatTime(a.starts_at)}–${formatTime(a.ends_at)}</div>
          <strong>${customer}</strong>
          <span>${service}</span>
          <small>${escapeHtml(statusLabels[a.status]||a.status)}</small>
          ${checkout}
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
          <strong>BLOQUEADO</strong>
          <span>${formatTime(b.starts_at)}–${formatTime(b.ends_at)}</span>
          <small>${escapeHtml(b.reason||"Indisponível")}</small>
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
      ${pros.map(p=>`
        <div class="live-pro-head">
          <div class="live-pro-avatar">
            ${p.avatar_url
              ? `<img src="${escapeHtml(p.avatar_url)}" alt="${escapeHtml(p.full_name)}">`
              : escapeHtml((p.full_name||"?").slice(0,1).toUpperCase())}
          </div>
          <div>
            <strong>${escapeHtml(p.full_name)}</strong>
            <small>${escapeHtml(p.specialty||"Barbeiro")}</small>
          </div>
          ${(["admin","reception"].includes(currentRole)||(currentRole==="barber"&&p.id===currentProfessionalId))
  ? `<button type="button" class="quick-block-btn" data-quick-block="${p.id}">BLOQUEAR</button>`
  : ""}
        </div>
      `).join("")}
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
          <div class="live-columns" style="--pro-count:${pros.length};height:${timelineHeight}px">
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

  agendaTimeline.querySelectorAll("[data-timeline-checkout]").forEach(btn=>{
    btn.addEventListener("click",async e=>{
      e.stopPropagation();
      if(window.C7Cash?.checkoutAppointment){
        await window.C7Cash.checkoutAppointment(btn.dataset.timelineCheckout);
      }else{
        alert("O checkout ainda não terminou de carregar. Tente novamente.");
      }
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

  requestAnimationFrame(()=>{
    const scroller=agendaTimeline.querySelector(".live-timeline-scroll");
    if(!scroller||selected!==localDateInput()) return;
    const now=new Date();
    const nowMinutes=now.getHours()*60+now.getMinutes();
    const target=Math.max(0,timelineTopPadding+(nowMinutes-minMinute)*pxPerMinute-180);
    scroller.scrollTop=target;
  });
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

  let appointments=appointmentsResult.data||[];
  const transactions=transactionsResult.data||[];
  const products=productsResult.data||[];
  const openCash=cashResult.data||null;
  const activePros=professionalsResult.data||[];

  if(currentRole==="barber"&&currentProfessionalId){
    appointments=appointments.filter(a=>a.professional?.full_name && professionals.find(p=>p.id===currentProfessionalId)?.full_name===a.professional.full_name);
  }

  const relevantAppointments=appointments.filter(a=>["waiting","in_service","completed"].includes(a.status));
  const waiting=appointments.filter(a=>a.status==="waiting");
  const revenue=transactions.filter(t=>t.direction==="in")
    .reduce((sum,t)=>sum+Number(t.net_amount||0),0);
  const lowStock=products.filter(p=>Number(p.stock_quantity||0)<=Number(p.min_stock||0));

  if(currentRole==="barber"){
    $("statAppointmentsLabel").textContent="Meus Atendimentos Hoje";
    $("statAppointmentsHint").textContent="Concluídos + em andamento";
    $("statRevenueLabel").textContent="Em Atendimento";
    $("statRevenueHint").textContent="Atendimento em andamento agora";
    $("statWaitingLabel").textContent="Aguardando";
    $("statWaitingHint").textContent="Clientes da sua agenda";
    $("statLowStockLabel").textContent="Próximo Horário";
    $("statLowStockHint").textContent="Seu próximo atendimento";

    const inService=appointments.filter(a=>a.status==="in_service").length;
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
  }

  if(currentRole==="barber"){
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

function selectedServices(){
  const ids=[...appointmentServiceList.querySelectorAll('input[type="checkbox"]:checked')].map(input=>String(input.value));
  return services.filter(s=>ids.includes(String(s.id)));
}

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
  const totalMinutes=selected.reduce((sum,s)=>sum+durationToMinutes(s.duration),0);
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
  appointmentServiceList.querySelectorAll('input[type="checkbox"]').forEach(input=>input.checked=false);
  updateAppointmentPreview();
  appointmentModal.classList.remove("hidden");
}

function closeAppointmentModal(){
  appointmentModal.classList.add("hidden");
}

newAppointmentBtn.addEventListener("click",openAppointmentModal);
document.querySelectorAll("[data-close-modal]").forEach(el=>el.addEventListener("click",closeAppointmentModal));
$("appointmentDate").addEventListener("change",updateAppointmentPreview);
$("appointmentTime").addEventListener("input",updateAppointmentPreview);

async function saveAppointment({keepOpen=false}={}){
  if(!["admin","reception"].includes(currentRole)){
    appointmentMessage.textContent="Seu perfil não possui permissão para criar agendamentos.";
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

  const durationMinutes=selected.reduce((sum,s)=>sum+durationToMinutes(s.duration),0);
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

  if(!hours){
    appointmentMessage.textContent="Esse profissional não possui expediente configurado para este dia.";
    return false;
  }

  const startMinutes=start.getHours()*60+start.getMinutes();
  const endMinutes=end.getHours()*60+end.getMinutes();

  if(startMinutes<minutesFromHHMM(hours.starts_at)||endMinutes>minutesFromHHMM(hours.ends_at)){
    appointmentMessage.textContent="O horário está fora do expediente desse profissional.";
    return false;
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
    return false;
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
      return false;
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
      total_amount:totalAmount,
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
    appointmentServiceList.querySelectorAll('input[type="checkbox"]').forEach(input=>input.checked=false);
    appointmentMessage.textContent="Agendamento salvo. Cadastre o próximo.";
    updateAppointmentPreview();
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

const {data:{session}}=await supabase.auth.getSession();
if(session) await loadProfile(session.user.id); else showLogin();

supabase.auth.onAuthStateChange((_event,session)=>{
  if(!session) showLogin();
});

window.addEventListener("c7-checkout-complete",async()=>{
  await loadAgenda();
  if(document.getElementById("dashboard")?.classList.contains("active")){
    await updateDashboard();
  }
});

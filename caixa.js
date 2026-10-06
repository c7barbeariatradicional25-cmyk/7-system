import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  "https://cjtgjqxkyvgjlhylrvas.supabase.co",
  "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE"
);

const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(value||0));

let currentUser = null;
let currentRole = null;
let openSession = null;
let pendingAppointments = [];
let products = [];

async function loadContext(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return false;
  currentUser=session.user.id;
  const {data}=await supabase.from("profiles").select("role").eq("user_id",currentUser).single();
  currentRole=data?.role||null;
  return true;
}

async function loadCash(){
  if(!["admin","reception"].includes(currentRole)) return;

  const [{data:sessionData},{data:productData}] = await Promise.all([
    supabase.from("cash_sessions").select("*").eq("status","open").maybeSingle(),
    supabase.from("products").select("id,name,price").eq("active",true).order("sort_order")
  ]);

  openSession=sessionData||null;
  products=productData||[];

  renderCashState();

  if(openSession){
    await Promise.all([loadCashSummary(),loadTransactions(),loadPendingAppointments()]);
  }
}

function renderCashState(){
  const isOpen=Boolean(openSession);

  $("cashStatusTitle").textContent=isOpen?"Caixa aberto":"Caixa fechado";
  $("cashStatusText").textContent=isOpen
    ? "Movimentações do caixa atual."
    : "Abra o caixa para registrar movimentações.";

  $("openCashBtn").classList.toggle("hidden",isOpen);
  $("receiveAppointmentBtn").classList.toggle("hidden",!isOpen);
  $("sellProductBtn").classList.toggle("hidden",!isOpen);
  $("cashMovementBtn").classList.toggle("hidden",!isOpen);
  $("closeCashBtn").classList.toggle("hidden",!isOpen);

  if(!isOpen){
    $("cashOpening").textContent=money(0);
    $("cashIn").textContent=money(0);
    $("cashOut").textContent=money(0);
    $("cashBalance").textContent=money(0);
    $("cashTransactionList").innerHTML='<div class="cash-empty">Nenhum caixa aberto.</div>';
    $("pendingAppointmentList").innerHTML='<div class="cash-empty">Abra o caixa para receber atendimentos.</div>';
  }
}

async function loadCashSummary(){
  const {data}=await supabase.from("open_cash_summary").select("*").eq("id",openSession.id).maybeSingle();
  if(!data) return;

  $("cashOpening").textContent=money(data.opening_amount);
  $("cashIn").textContent=money(data.total_in);
  $("cashOut").textContent=money(data.total_out);
  $("cashBalance").textContent=money(data.expected_balance);
  $("closeExpected").textContent=money(data.expected_balance);
  $("closingAmount").dataset.expected=String(data.expected_balance||0);
}

async function loadTransactions(){
  const {data,error}=await supabase
    .from("cash_transactions")
    .select("id,transaction_type,direction,payment_method,description,net_amount,status,created_at")
    .eq("session_id",openSession.id)
    .order("created_at",{ascending:false});

  const list=$("cashTransactionList");
  if(error){
    list.innerHTML='<div class="cash-empty">Não foi possível carregar as movimentações.</div>';
    return;
  }

  if(!data?.length){
    list.innerHTML='<div class="cash-empty">Nenhuma movimentação registrada.</div>';
    return;
  }

  list.innerHTML=data.map(item=>{
    const time=new Date(item.created_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
    const sign=item.direction==="out"?"-":"+";
    return `
      <div class="cash-row">
        <div class="cash-row-time"><strong>${time}</strong><small>${item.status==="cancelled"?"CANCELADO":"REGISTRADO"}</small></div>
        <div class="cash-row-main">
          <strong>${item.description}</strong>
          <span>${item.transaction_type}</span>
          ${item.payment_method?`<span class="cash-method">${item.payment_method}</span>`:""}
        </div>
        <div class="cash-row-value ${item.direction==="out"?"out":""}">${sign} ${money(item.net_amount)}</div>
      </div>
    `;
  }).join("");
}


async function loadPendingAppointments(){
  const start=new Date();
  start.setHours(0,0,0,0);
  const end=new Date();
  end.setHours(23,59,59,999);

  const {data,error}=await supabase
    .from("appointments")
    .select("id,customer_id,professional_id,starts_at,total_amount,status,customer:customers(full_name),professional:professionals(full_name),appointment_services(service_name)")
    .gte("starts_at",start.toISOString())
    .lte("starts_at",end.toISOString())
    .in("status",["confirmed","waiting","in_service","completed"])
    .order("starts_at",{ascending:true});

  if(error){
    $("pendingAppointmentList").innerHTML='<div class="cash-empty">Não foi possível carregar os atendimentos.</div>';
    return;
  }

  const ids=(data||[]).map(a=>a.id);
  let paidIds=new Set();

  if(ids.length){
    const {data:paid}=await supabase
      .from("cash_transactions")
      .select("appointment_id")
      .in("appointment_id",ids)
      .eq("transaction_type","service")
      .eq("status","posted");

    paidIds=new Set((paid||[]).map(x=>x.appointment_id));
  }

  pendingAppointments=(data||[]).filter(a=>!paidIds.has(a.id));
  renderPendingAppointments();
}

function renderPendingAppointments(){
  const list=$("pendingAppointmentList");

  if(!pendingAppointments.length){
    list.innerHTML='<div class="cash-empty">Nenhum atendimento pendente.</div>';
    return;
  }

  list.innerHTML=pendingAppointments.map(a=>{
    const time=new Date(a.starts_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
    const services=(a.appointment_services||[]).map(s=>s.service_name).join(" + ")||"Serviço";
    return `
      <div class="pending-row">
        <div class="pending-row-time"><strong>${time}</strong><small>${a.status}</small></div>
        <div class="pending-row-main">
          <strong>${a.customer?.full_name||"Cliente"}</strong>
          <span>${services} • ${a.professional?.full_name||"Sem profissional"}</span>
        </div>
        <button class="pending-receive" data-receive-id="${a.id}" type="button">RECEBER</button>
      </div>
    `;
  }).join("");

  document.querySelectorAll("[data-receive-id]").forEach(btn=>{
    btn.addEventListener("click",()=>openReceiveModal(btn.dataset.receiveId));
  });
}


function openModal(id){$(id).classList.remove("hidden")}
function closeModal(id){$(id).classList.add("hidden")}

$("openCashBtn")?.addEventListener("click",()=>{
  $("openCashForm").reset();
  $("openingAmount").value="0";
  $("openCashMessage").textContent="";
  openModal("openCashModal");
});

document.querySelectorAll("[data-close-open-cash]").forEach(el=>el.addEventListener("click",()=>closeModal("openCashModal")));

$("openCashForm")?.addEventListener("submit",async e=>{
  e.preventDefault();
  if(!["admin","reception"].includes(currentRole)) return;

  $("openCashMessage").textContent="Abrindo caixa...";

  const {data,error}=await supabase.from("cash_sessions").insert({
    opened_by:currentUser,
    opening_amount:Number($("openingAmount").value||0),
    notes:$("openingNotes").value.trim()||null
  }).select("*").single();

  if(error){
    $("openCashMessage").textContent="Não foi possível abrir o caixa.";
    return;
  }

  openSession=data;
  closeModal("openCashModal");
  await loadCash();
});

function fillReceiveOptions(){
  $("receiveAppointment").innerHTML='<option value="">Selecione um atendimento</option>'+
    pendingAppointments.map(a=>{
      const time=new Date(a.starts_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
      return `<option value="${a.id}">${time} — ${a.customer?.full_name||"Cliente"}</option>`;
    }).join("");
}

function updateReceivePreview(){
  const item=pendingAppointments.find(a=>a.id===$("receiveAppointment").value);
  const gross=Number($("receiveGross").value||0);
  const discount=Math.min(Number($("receiveDiscount").value||0),gross);
  $("receiveNet").textContent=money(gross-discount);
  $("receiveCustomer").textContent=item?.customer?.full_name||"—";
  $("receiveProfessional").textContent=item?.professional?.full_name||"—";
}

function openReceiveModal(id=null){
  $("receiveForm").reset();
  $("receiveDiscount").value="0";
  $("receiveMessage").textContent="";
  fillReceiveOptions();

  if(id) $("receiveAppointment").value=id;

  const item=pendingAppointments.find(a=>a.id===$("receiveAppointment").value);
  $("receiveGross").value=item?Number(item.total_amount||0).toFixed(2):"";
  updateReceivePreview();
  openModal("receiveModal");
}

$("receiveAppointmentBtn")?.addEventListener("click",()=>openReceiveModal());
document.querySelectorAll("[data-close-receive]").forEach(el=>el.addEventListener("click",()=>closeModal("receiveModal")));

$("receiveAppointment")?.addEventListener("change",()=>{
  const item=pendingAppointments.find(a=>a.id===$("receiveAppointment").value);
  $("receiveGross").value=item?Number(item.total_amount||0).toFixed(2):"";
  updateReceivePreview();
});
$("receiveGross")?.addEventListener("input",updateReceivePreview);
$("receiveDiscount")?.addEventListener("input",updateReceivePreview);

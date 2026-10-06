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

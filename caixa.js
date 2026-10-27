import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PAYMENT_LABELS, CARD_METHODS, fetchPaymentSplits } from "./pagamentos.js";
import { fetchLevels, fetchCustomerLevelMap, fetchMonthUses, benefitsWithBalance, levelBadge, benefitText } from "./niveis.js";

const supabase = createClient(
  "https://cjtgjqxkyvgjlhylrvas.supabase.co",
  "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE"
);

const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(value||0));

let currentUser = null;
let currentRole = null;
let c7ModuleRights=null;
let currentProfessionalId = null;
let openSession = null;
let pendingAppointments = [];
let products = [];
let cashProfessionals = [];
let cashCustomers = [];
let activeServiceLinks = [];
let receiveBenefits = [];
let appliedCoupon = null;
let splitRows = [];
let checkoutAfterOpening = null;

function canAccessCash(){return currentRole==="admin" || (c7ModuleRights?Boolean(c7ModuleRights["cash.view"]):currentRole==="reception");}
async function loadContext(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return false;
  currentUser=session.user.id;
  const {data}=await supabase.from("profiles").select("role").eq("user_id",currentUser).single();
  currentRole=data?.role||null;
  const {data:grant}=await supabase.from("staff_permissions").select("permissions").eq("email",session.user.email.toLowerCase()).maybeSingle();
  c7ModuleRights=grant?.permissions||null;

  if(currentRole==="barber"){
    const {data:professional}=await supabase
      .from("professionals")
      .select("id")
      .eq("user_id",currentUser)
      .eq("active",true)
      .maybeSingle();
    currentProfessionalId=professional?.id||null;
  }

  return true;
}

async function loadCash(){
  if(!canAccessCash()) return;

  const start=new Date();
  start.setHours(0,0,0,0);
  const end=new Date();
  end.setHours(23,59,59,999);

  const [{data:sessionData},{data:productData},{data:professionalData},{data:customerData},{data:serviceData}] = await Promise.all([
    supabase.from("cash_sessions").select("*").eq("status","open").maybeSingle(),
    supabase.from("products").select("id,name,price,stock_quantity,product_kind,department,category").eq("active",true).order("sort_order"),
    supabase.from("professionals").select("id,full_name").eq("active",true).order("full_name"),
    supabase.from("customers").select("id,full_name,phone").eq("active",true).order("full_name").limit(500),
    supabase.from("appointments")
      .select("id,customer_id,professional_id,status,starts_at,customer:customers(id,full_name),professional:professionals(full_name)")
      .gte("starts_at",start.toISOString())
      .lte("starts_at",end.toISOString())
      .in("status",["scheduled","confirmed","waiting","in_service"])
      .order("starts_at",{ascending:true})
  ]);

  openSession=sessionData||null;
  products=productData||[];
  cashProfessionals=professionalData||[];
  cashCustomers=customerData||[];
  activeServiceLinks=serviceData||[];

  renderCashState();
  fillPosSelects();
  renderPos();

  if(openSession){
    await Promise.all([loadCashSummary(),loadTransactions(),loadPendingAppointments()]);
  }
}

function paymentChips(transaction,splits){
  const parts=splits.get(String(transaction.id));
  if(!parts?.length) return `<b class="pay-chip" data-method="${transaction.payment_method||"other"}">${PAYMENT_LABELS[transaction.payment_method]||"Sem forma de pagamento"}</b>`;
  return parts.map(p=>`<b class="pay-chip" data-method="${p.payment_method}">${PAYMENT_LABELS[p.payment_method]||p.payment_method} ${money(p.amount)}</b>`).join("");
}

function renderCashState(){
  const isOpen=Boolean(openSession);

  $("cashStatusTitle").textContent=isOpen?"Caixa aberto":"Caixa fechado";
  $("cashStatusTitle").dataset.open=String(isOpen);
  $("cashStatusText").textContent=isOpen
    ? "Movimentações do caixa atual."
    : "Abra o caixa para registrar movimentações.";

  $("openCashBtn").classList.toggle("hidden",isOpen);
  $("receiveAppointmentBtn").classList.toggle("hidden",!isOpen);
  $("sellProductBtn").classList.toggle("hidden",!isOpen);
  $("employeeConsumptionBtn").classList.toggle("hidden",false);
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
  const {data,error}=await supabase.from("cash_transactions")
    .select("id,transaction_type,direction,payment_method,description,gross_amount,discount_amount,net_amount,status,created_at,appointment_id")
    .eq("session_id",openSession.id)
    .order("created_at",{ascending:false});
  const list=$("cashTransactionList");
  if(error){list.innerHTML='<div class="cash-empty">Não foi possível carregar as movimentações.</div>';return;}
  if(!data?.length){list.innerHTML='<div class="cash-empty">Nenhuma movimentação registrada.</div>';return;}

  const serviceIds=data.filter(t=>t.transaction_type==="service").map(t=>t.id);
  let itemsByTransaction=new Map();
  if(serviceIds.length){
    const {data:items,error:itemError}=await supabase.from("cash_transaction_items")
      .select("transaction_id,item_type,description,quantity,unit_price,total_amount")
      .in("transaction_id",serviceIds);
    if(itemError)console.warn("C7: detalhes do recebimento indisponíveis",itemError.message);
    for(const item of items||[]){
      if(!itemsByTransaction.has(item.transaction_id))itemsByTransaction.set(item.transaction_id,[]);
      itemsByTransaction.get(item.transaction_id).push(item);
    }
  }
  const splits=await fetchPaymentSplits(supabase,data.map(t=>t.id));
  const safe=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const titles={service:"Atendimento",product:"Venda de produto",withdrawal:"Retirada",deposit:"Entrada",expense:"Despesa"};
  list.innerHTML=data.map(t=>{
    const stamp=new Date(t.created_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
    const lines=itemsByTransaction.get(t.id)||[];
    const overview=lines.length
      ? lines.map(i=>safe(i.description)+(Number(i.quantity||1)>1?" (x"+Number(i.quantity)+")":"")).join(" • ")
      : t.transaction_type==="service"?"Atendimento recebido":safe(t.description||titles[t.transaction_type]||"Movimentação");
    const headline=t.transaction_type==="service"?overview:safe(t.description||titles[t.transaction_type]||"Movimentação");
    const sign=t.direction==="out"?"−":"+";
    const extras=t.transaction_type==="service"&&lines.length
      ? `<details class="c7-cash-extract"><summary>Ver extrato</summary><div class="c7-cash-extract-lines">
       ${lines.map(i=>`<div><span>${safe(i.description)}${Number(i.quantity||1)>1?" · "+Number(i.quantity)+" un.":""}</span><strong>${money(i.total_amount)}</strong></div>`).join("")}
       ${Number(t.discount_amount||0)>0?`<div><span>Desconto</span><strong>− ${money(t.discount_amount)}</strong></div>`:""}
       <div class="c7-cash-extract-total"><span>Total recebido</span><strong>${money(t.net_amount)}</strong></div>
       </div></details>`:"";
    return `<div class="cash-row">
      <div class="cash-row-time"><strong>${stamp}</strong><small>${t.status==="cancelled"?"Cancelado":"Recebido"}</small></div>
      <div class="cash-row-main"><strong>${headline}</strong>
        <span class="pay-chips">${paymentChips(t,splits)}</span>
        ${extras}
      </div>
      <div class="cash-row-value ${t.direction==="out"?"out":""}">${sign} ${money(t.net_amount)}</div>
    </div>`;
  }).join("");
}

async function loadPendingAppointments(){
  const start=new Date();
  start.setHours(0,0,0,0);
  const end=new Date();
  end.setHours(23,59,59,999);

  const {data,error}=await supabase
    .from("appointments")
    .select("id,customer_id,professional_id,starts_at,total_amount,status,customer:customers(id,full_name,birth_date),professional:professionals(full_name),appointment_services(service_id,service_name,price),appointment_products(id,product_id,product_name,quantity,unit_price,total_amount,department)")
    .gte("starts_at",start.toISOString())
    .lte("starts_at",end.toISOString())
    .in("status",["scheduled","confirmed","waiting","in_service","completed"])
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
  renderPos();
  const list=$("pendingAppointmentList");

  if(!pendingAppointments.length){
    list.innerHTML='<div class="cash-empty">Nenhum atendimento pendente.</div>';
    return;
  }

  list.innerHTML=pendingAppointments.map(a=>{
    const time=new Date(a.starts_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
    const services=(a.appointment_services||[]).map(s=>s.service_name).join(" + ")||"Atendimento";
    const statusNames={scheduled:"Agendado",confirmed:"Confirmado",waiting:"Aguardando",in_service:"Em atendimento",completed:"Finalizado",no_show:"Faltou",cancelled:"Cancelado"};
    return `
      <div class="pending-row">
        <div class="pending-row-time"><strong>${time}</strong><small class="c7-status" data-status="${a.status}">${statusNames[a.status]||a.status}</small></div>
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
  checkoutAfterOpening=null;
  $("openCashForm").reset();
  $("openingAmount").value="0";
  $("openCashMessage").textContent="";
  openModal("openCashModal");
});

document.querySelectorAll("[data-close-open-cash]").forEach(el=>el.addEventListener("click",()=>{checkoutAfterOpening=null;closeModal("openCashModal");}));

$("openCashForm")?.addEventListener("submit",async e=>{
  e.preventDefault();
  if(!canAccessCash()) return;

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
  if(checkoutAfterOpening){
    const id=checkoutAfterOpening;
    checkoutAfterOpening=null;
    await checkoutAppointment(id);
  }
});


function appointmentCheckoutGross(item){
  if(!item) return 0;
  const services=(item.appointment_services||[]).reduce((sum,row)=>sum+Number(row.price||0),0);
  const products=(item.appointment_products||[]).reduce((sum,row)=>sum+Number(row.total_amount||0),0);
  return services+products;
}

function fillReceiveOptions(){
  $("receiveAppointment").innerHTML='<option value="">Selecione um atendimento</option>'+
    pendingAppointments.map(a=>{
      const time=new Date(a.starts_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
      return `<option value="${a.id}">${time} — ${a.customer?.full_name||"Cliente"}</option>`;
    }).join("");
}

function benefitDiscount(gross,benefit){
  if(!benefit) return 0;
  if(benefit.discount_type==="percent"){
    return Math.min(gross,gross*Math.min(Number(benefit.discount_value||0),100)/100);
  }
  return Math.min(gross,Number(benefit.discount_value||0));
}

function selectedBenefit(){
  const value=$("receiveBenefit")?.value;
  return receiveBenefits.find(b=>b.key===value)||null;
}

function cardFee(methodId,inputId,boxId){
  const enabled=CARD_METHODS.includes($(methodId)?.value)||(methodId==="receiveMethod"&&splitCardAmount()>0);
  $(boxId).style.display=enabled?"":"none";
  return enabled?Math.min(100,Math.max(0,Number($(inputId)?.value||0))):0;
}
$("receiveMethod")?.addEventListener("change",()=>{
  if(isSplitPayment()&&!splitRows.length){
    splitRows=[{method:"cash",amount:receiveDue()},{method:"credit",amount:0}];
    renderSplitRows();
  }
  updateReceivePreview();
});
$("receiveCardFee")?.addEventListener("input",updateReceivePreview);
$("cashProductMethod")?.addEventListener("change",updateProductPreview);
$("productCardFee")?.addEventListener("input",updateProductPreview);

/* Dividir pagamento: várias formas de pagamento no mesmo recebimento. */
const cents=value=>Math.round(Number(value||0)*100);
function isSplitPayment(){return $("receiveMethod")?.value==="split";}
function receiveDue(){
  const gross=Number($("receiveGross").value||0);
  return Math.max(0,gross-Math.min(Number($("receiveDiscount").value||0),gross));
}
function splitCardAmount(){
  if(!isSplitPayment()) return 0;
  return splitRows.filter(r=>CARD_METHODS.includes(r.method)).reduce((sum,r)=>sum+Number(r.amount||0),0);
}
function splitPayments(){
  const byMethod=new Map();
  splitRows.forEach(r=>{if(cents(r.amount)>0)byMethod.set(r.method,(byMethod.get(r.method)||0)+cents(r.amount));});
  return [...byMethod.entries()].map(([method,total])=>({method,amount:total/100})).sort((a,b)=>b.amount-a.amount);
}
function renderSplitRows(){
  const options=Object.entries(PAYMENT_LABELS);
  $("receiveSplitRows").innerHTML=splitRows.map((row,i)=>`
    <div class="split-payment-row" data-method="${row.method}">
      <label><span>Quantia</span><input type="number" min="0" step="0.01" inputmode="decimal" placeholder="0,00" value="${cents(row.amount)?Number(row.amount).toFixed(2):""}" data-split-amount="${i}"></label>
      <label><span>Método de pagamento</span><select data-split-method="${i}">${options.map(([value,label])=>`<option value="${value}" ${value===row.method?"selected":""}>${label}</option>`).join("")}</select></label>
      <button type="button" class="split-payment-remove" data-split-remove="${i}" aria-label="Remover forma de pagamento" ${splitRows.length<=2?"disabled":""}>×</button>
    </div>`).join("");
  updateReceivePreview();
}
function updateSplitRemaining(){
  const rest=cents(receiveDue())-splitRows.reduce((sum,r)=>sum+cents(r.amount),0);
  const el=$("receiveSplitRemaining");
  el.textContent=rest===0?"Valor completo":rest>0?`Restante ${money(rest/100)}`:`Excedente ${money(-rest/100)}`;
  el.classList.toggle("is-pending",rest!==0);
  const due=cents(receiveDue());
  const bar=$("receiveSplitProgress");
  bar.style.width=(due?Math.min(100,Math.max(0,(due-rest)/due*100)):100)+"%";
  bar.classList.toggle("is-over",rest<0);
}

$("receiveMethodTiles")?.addEventListener("click",e=>{
  const method=e.target.closest("[data-pay-method]")?.dataset.payMethod;
  if(!method) return;
  $("receiveMethod").value=method;
  $("receiveMethod").dispatchEvent(new Event("change"));
});

$("receiveSplitRows")?.addEventListener("input",e=>{
  const i=e.target.dataset.splitAmount;
  if(i==null) return;
  splitRows[i].amount=Math.max(0,Number(e.target.value||0));
  // Com duas formas, a outra completa automaticamente o restante.
  if(splitRows.length===2){
    const other=i==="0"?1:0;
    splitRows[other].amount=Math.max(0,cents(receiveDue())-cents(splitRows[i].amount))/100;
    const input=document.querySelector(`[data-split-amount="${other}"]`);
    if(input) input.value=splitRows[other].amount?splitRows[other].amount.toFixed(2):"";
  }
  updateReceivePreview();
});
$("receiveSplitRows")?.addEventListener("change",e=>{
  const i=e.target.dataset.splitMethod;
  if(i==null) return;
  splitRows[i].method=e.target.value;
  e.target.closest(".split-payment-row").dataset.method=e.target.value;
  updateReceivePreview();
});
$("receiveSplitRows")?.addEventListener("click",e=>{
  const i=e.target.closest("[data-split-remove]")?.dataset.splitRemove;
  if(i==null||splitRows.length<=2) return;
  splitRows.splice(Number(i),1);
  renderSplitRows();
});
$("receiveSplitAdd")?.addEventListener("click",()=>{
  const rest=Math.max(0,cents(receiveDue())-splitRows.reduce((sum,r)=>sum+cents(r.amount),0));
  const used=new Set(splitRows.map(r=>r.method));
  const method=Object.keys(PAYMENT_LABELS).find(m=>!used.has(m))||"other";
  splitRows.push({method,amount:rest/100});
  renderSplitRows();
});

function updateReceivePreview(){
  const item=pendingAppointments.find(a=>a.id===$("receiveAppointment").value);
  const gross=Number($("receiveGross").value||0);
  const discount=Math.min(Number($("receiveDiscount").value||0),gross);
  const benefit=selectedBenefit();

  document.querySelectorAll("#receiveMethodTiles [data-pay-method]").forEach(btn=>btn.classList.toggle("active",btn.dataset.payMethod===$("receiveMethod").value));
  $("receiveSplitBox")?.classList.toggle("hidden",!isSplitPayment());
  if(isSplitPayment()) updateSplitRemaining();
  const fee=cardFee("receiveMethod","receiveCardFee","receiveCardFeeBox");
  const feeAmount=Math.round((isSplitPayment()?splitCardAmount():Math.max(0,gross-discount))*fee)/100;
  $("receiveCardFeeValue").textContent=money(feeAmount);
  $("receiveNet").textContent=money(Math.max(0,gross-discount-feeAmount));
  $("receiveDueTotal").textContent=money(Math.max(0,gross-discount));
  $("receiveDueInfo").textContent=item?[item.customer?.full_name,item.professional?.full_name].filter(Boolean).join(" • ")+(discount>0?` • desconto de ${money(discount)}`:""):"Selecione o atendimento";
  $("receiveCustomer").textContent=item?.customer?.full_name||"—";
  $("receiveBenefitPreview").textContent=appliedCoupon
    ? `Cupom ${appliedCoupon.code}`
    : (benefit?.label||"Nenhum");
}

async function loadReceiveBenefits(item){
  receiveBenefits=[];
  appliedCoupon=null;
  $("receiveCouponCode").value="";

  if(!item){
    $("receiveBenefit").innerHTML='<option value="">Sem benefício</option>';
    return;
  }

  const now=new Date();

  const [promoResult,membershipResult,birthdayResult]=await Promise.all([
    supabase.from("promotions").select("*").eq("active",true),
    supabase.from("customer_memberships")
      .select("id,starts_at,ends_at,status,plan:membership_plans(id,name,discount_percent,active)")
      .eq("customer_id",item.customer_id)
      .eq("status","active"),
    supabase.from("birthday_campaigns").select("*").eq("active",true).order("created_at",{ascending:false}).limit(1).maybeSingle()
  ]);

  (promoResult.data||[]).forEach(p=>{
    if(p.starts_at&&new Date(p.starts_at)>now) return;
    if(p.ends_at&&new Date(p.ends_at)<now) return;
    receiveBenefits.push({
      key:`promotion:${p.id}`,
      source:"promotion",
      label:p.name,
      discount_type:p.discount_type,
      discount_value:p.discount_value
    });
  });

  (membershipResult.data||[]).forEach(m=>{
    if(!m.plan?.active) return;
    if(m.starts_at&&new Date(m.starts_at+"T00:00:00")>now) return;
    if(m.ends_at&&new Date(m.ends_at+"T23:59:59")<now) return;
    if(Number(m.plan.discount_percent||0)<=0) return;
    receiveBenefits.push({
      key:`plan:${m.id}`,
      source:"plan",
      label:`Plano ${m.plan.name}`,
      discount_type:"percent",
      discount_value:m.plan.discount_percent
    });
  });

  const birthday=birthdayResult.data;
  const birthDate=item.customer?.birth_date;
  if(birthday&&birthDate){
    const [,month,day]=birthDate.split("-").map(Number);
    const thisBirthday=new Date(now.getFullYear(),month-1,day);
    const diffDays=Math.floor((now-thisBirthday)/86400000);
    if(diffDays>=-Number(birthday.valid_days_before||0)&&diffDays<=Number(birthday.valid_days_after||0)){
      receiveBenefits.push({
        key:`birthday:${birthday.id}`,
        source:"birthday",
        label:birthday.name||"Aniversário C7",
        discount_type:birthday.discount_type,
        discount_value:birthday.discount_value
      });
    }
  }

  await addLevelBenefits(item);

  $("receiveBenefit").innerHTML='<option value="">Sem benefício</option>'+
    receiveBenefits.map(b=>`<option value="${b.key}">${b.label} — ${b.discount_type==="percent"?Number(b.discount_value)+"%":money(b.discount_value)}</option>`).join("");

  // Serviço grátis do nível já vem selecionado: o cliente tem direito e o serviço está no atendimento.
  const levelBenefit=receiveBenefits.find(b=>b.levelBenefit);
  if(levelBenefit){
    $("receiveBenefit").value=levelBenefit.key;
    $("receiveDiscount").value=benefitDiscount(appointmentCheckoutGross(item),levelBenefit).toFixed(2);
  }
}

/* Nível do cliente: serviços grátis do mês viram benefício no receber; cortesias aparecem como lembrete. */
async function addLevelBenefits(item){
  const info=$("receiveLevelInfo");
  if(info){info.innerHTML="";info.classList.add("hidden");}
  if(!item?.customer_id) return;
  const levels=await fetchLevels(supabase);
  if(!levels.length) return;
  const row=(await fetchCustomerLevelMap(supabase,[item.customer_id])).get(String(item.customer_id));
  const level=levels.find(l=>String(l.id)===String(row?.level_id));
  if(!level||!level.benefits.length) return;

  const benefits=benefitsWithBalance(level,await fetchMonthUses(supabase,item.customer_id));
  benefits.forEach(b=>{
    if(!b.service_id||!b.remaining) return;
    const service=(item.appointment_services||[]).find(s=>String(s.service_id)===String(b.service_id));
    if(!service) return;
    receiveBenefits.push({
      key:`level:${b.id}`,
      source:"promotion",
      label:`${level.name} · ${b.description}`,
      discount_type:"fixed",
      discount_value:Number(service.price||0),
      levelBenefit:{id:b.id,service_id:b.service_id}
    });
  });

  if(info){
    info.innerHTML=`${levelBadge(level)}<span>${benefits.map(benefitText).join(" · ")}</span>`;
    info.classList.remove("hidden");
  }
}

async function openReceiveModal(id=null){
  $("receiveForm").reset();
  $("receiveDiscount").value="0";
  $("receiveCardFee").value="0";
  $("receiveMessage").textContent="";
  splitRows=[];
  fillReceiveOptions();

  if(id) $("receiveAppointment").value=id;

  const item=pendingAppointments.find(a=>a.id===$("receiveAppointment").value);
  $("receiveGross").value=item?appointmentCheckoutGross(item).toFixed(2):"";
  await loadReceiveBenefits(item);
  updateReceivePreview();
  openModal("receiveModal");
}

$("receiveAppointmentBtn")?.addEventListener("click",()=>openReceiveModal());
document.querySelectorAll("[data-close-receive]").forEach(el=>el.addEventListener("click",()=>closeModal("receiveModal")));

$("receiveAppointment")?.addEventListener("change",async()=>{
  const item=pendingAppointments.find(a=>a.id===$("receiveAppointment").value);
  $("receiveGross").value=item?appointmentCheckoutGross(item).toFixed(2):"";
  $("receiveDiscount").value="0";
  await loadReceiveBenefits(item);
  updateReceivePreview();
});

$("receiveBenefit")?.addEventListener("change",()=>{
  appliedCoupon=null;
  $("receiveCouponCode").value="";
  const gross=Number($("receiveGross").value||0);
  $("receiveDiscount").value=benefitDiscount(gross,selectedBenefit()).toFixed(2);
  updateReceivePreview();
});

$("receiveGross")?.addEventListener("input",()=>{
  const gross=Number($("receiveGross").value||0);
  if(appliedCoupon){
    $("receiveDiscount").value=benefitDiscount(gross,appliedCoupon).toFixed(2);
  }else if(selectedBenefit()){
    $("receiveDiscount").value=benefitDiscount(gross,selectedBenefit()).toFixed(2);
  }
  updateReceivePreview();
});

$("receiveDiscount")?.addEventListener("input",()=>{
  appliedCoupon=null;
  if($("receiveBenefit")) $("receiveBenefit").value="";
  if($("receiveCouponCode")) $("receiveCouponCode").value="";
  updateReceivePreview();
});

$("applyReceiveCouponBtn")?.addEventListener("click",async()=>{
  const code=$("receiveCouponCode").value.trim().toUpperCase();
  const gross=Number($("receiveGross").value||0);
  const item=pendingAppointments.find(a=>a.id===$("receiveAppointment").value);

  if(!code||!item){
    $("receiveMessage").textContent="Selecione o atendimento e informe o cupom.";
    return;
  }

  const {data,error}=await supabase.from("coupons")
    .select("*")
    .eq("code",code)
    .eq("active",true)
    .maybeSingle();

  const now=new Date();

  if(error||!data){
    $("receiveMessage").textContent="Cupom inválido ou inativo.";
    return;
  }
  if(data.starts_at&&new Date(data.starts_at)>now){
    $("receiveMessage").textContent="Esse cupom ainda não está válido.";
    return;
  }
  if(data.ends_at&&new Date(data.ends_at)<now){
    $("receiveMessage").textContent="Esse cupom expirou.";
    return;
  }
  if(data.max_uses!=null&&Number(data.used_count||0)>=Number(data.max_uses)){
    $("receiveMessage").textContent="Esse cupom atingiu o limite de usos.";
    return;
  }
  if(gross<Number(data.min_amount||0)){
    $("receiveMessage").textContent=`Valor mínimo para este cupom: ${money(data.min_amount)}.`;
    return;
  }

  appliedCoupon={
    ...data,
    source:"coupon",
    label:`Cupom ${data.code}`
  };
  $("receiveBenefit").value="";
  $("receiveDiscount").value=benefitDiscount(gross,appliedCoupon).toFixed(2);
  $("receiveMessage").textContent="Cupom aplicado.";
  updateReceivePreview();
});


$("receiveForm")?.addEventListener("submit",async e=>{
  e.preventDefault();

  const appointment=pendingAppointments.find(a=>a.id===$("receiveAppointment").value);
  if(!appointment){
    $("receiveMessage").textContent="Selecione um atendimento.";
    return;
  }

  if(currentRole==="barber"&&appointment.professional_id!==currentProfessionalId){
    $("receiveMessage").textContent="Você só pode finalizar os seus próprios atendimentos.";
    return;
  }

  const gross=appointmentCheckoutGross(appointment);
  const discount=Number($("receiveDiscount").value||0);
  const net=gross-discount;

  if(discount<0||net<0){
    $("receiveMessage").textContent="Confira os valores informados.";
    return;
  }

  let paymentMethod=$("receiveMethod").value;
  let feePercent=cardFee("receiveMethod","receiveCardFee","receiveCardFeeBox");
  let payments=null;

  if(paymentMethod==="split"){
    const parts=splitPayments();
    if(parts.reduce((sum,p)=>sum+cents(p.amount),0)!==cents(net)){
      $("receiveMessage").textContent="Selecione a forma de pagamento que deseja usar para cobrir o valor restante devido.";
      return;
    }
    const fee=feePercent;
    paymentMethod=parts[0]?.method||"other";
    if(parts.length<2){
      feePercent=CARD_METHODS.includes(paymentMethod)?fee:0;
    }else{
      // A taxa da maquininha incide só sobre a parte paga no cartão.
      const cardAmount=parts.filter(p=>CARD_METHODS.includes(p.method)).reduce((sum,p)=>sum+p.amount,0);
      feePercent=net>0?Math.round(fee*cardAmount/net*10000)/10000:0;
      payments=parts.map(p=>({payment_method:p.method,amount:p.amount,card_fee_percent:CARD_METHODS.includes(p.method)?fee:0}));

      const {error:splitTableError}=await supabase.from("cash_transaction_payments").select("id").limit(1);
      if(splitTableError){
        $("receiveMessage").textContent="A divisão de pagamento ainda não foi ativada no banco de dados.";
        return;
      }
    }
  }

  $("receiveMessage").textContent="Registrando recebimento...";
  const checkoutButton=$("receiveForm")?.querySelector('button[type="submit"]');
  if(checkoutButton)checkoutButton.disabled=true;

  const benefit=appliedCoupon||selectedBenefit();

  const {data,error}=await supabase.rpc("checkout_appointment_card",{
    p_appointment_id:appointment.id,
    p_payment_method:paymentMethod,
    p_discount_amount:discount,
    p_benefit_source:benefit?.source||null,
    p_benefit_label:benefit?.label||null,
    p_coupon_id:appliedCoupon?.id||null,
    p_card_fee_percent:feePercent
  });

  if(error){
    if(checkoutButton)checkoutButton.disabled=false;
    const message=String(error.message||"");
    $("receiveMessage").textContent=
      message.includes("Caixa fechado")?"O Caixa está fechado. Peça à recepção para abrir o Caixa antes do checkout.":
      message.includes("já recebido")?"Este atendimento já foi recebido.":
      message.includes("Cupom")?message:
      "Não foi possível concluir o checkout.";
    return;
  }

  if(benefit?.levelBenefit){
    const {error:useError}=await supabase.from("customer_level_benefit_uses").insert({
      customer_id:appointment.customer_id,
      benefit_id:benefit.levelBenefit.id,
      service_id:benefit.levelBenefit.service_id,
      appointment_id:appointment.id
    });
    if(useError) console.warn("C7: uso do benefício do nível não registrado",useError.message);
  }

  let splitWarning=null;
  if(payments){
    let transactionId=data&&typeof data==="object"?(data.id||data.transaction_id):data;
    if(!transactionId){
      const {data:posted}=await supabase.from("cash_transactions")
        .select("id")
        .eq("appointment_id",appointment.id)
        .eq("transaction_type","service")
        .eq("status","posted")
        .order("created_at",{ascending:false})
        .limit(1)
        .maybeSingle();
      transactionId=posted?.id;
    }
    const {error:splitError}=transactionId
      ? await supabase.rpc("register_transaction_payments",{p_transaction_id:String(transactionId),p_payments:payments})
      : {error:{message:"movimentação não encontrada"}};
    if(splitError)splitWarning=`Atendimento recebido em ${PAYMENT_LABELS[paymentMethod]}, mas a divisão do pagamento não foi registrada: ${splitError.message}`;
  }

  if(checkoutButton)checkoutButton.disabled=false;
  closeModal("receiveModal");
  if(splitWarning)window.C7UX?.notify(splitWarning,"error");
  else window.C7UX?.notify("Atendimento finalizado e registrado no Caixa.");
  window.dispatchEvent(new CustomEvent("c7-checkout-complete",{detail:{appointmentId:appointment.id,transactionId:data}}));

  if(["admin","reception"].includes(currentRole)){
    await loadCash();
  }else{
    pendingAppointments=pendingAppointments.filter(a=>a.id!==appointment.id);
  }
});


function updateProductPreview(){
  const product=products.find(p=>String(p.id)===$("cashProduct").value);
  const qty=Math.max(1,Number($("cashProductQty").value||1));
  $("cashProductUnit").textContent=money(product?.price||0);
  $("cashProductQtyPreview").textContent=String(qty);
  const gross=Number(product?.price||0)*qty;
  $("cashProductTotal").textContent=money(gross);
  const percent=cardFee("cashProductMethod","productCardFee","productCardFeeBox");
  const fee=Math.round(gross*percent)/100;
  $("productCardFeeValue").textContent=money(fee);
  $("cashProductNet").textContent=money(gross-fee);
}

$("sellProductBtn")?.addEventListener("click",()=>{
  $("productSaleForm").reset();
  $("cashProductQty").value="1";
  $("productCardFee").value="0";
  $("productSaleMessage").textContent="";

  const activeOptions=activeServiceLinks.map(a=>
    '<option value="appointment:'+a.id+'">'+(a.customer?.full_name||"Cliente")+' • '+(a.professional?.full_name||"Barbeiro")+'</option>'
  ).join("");

  const activeCustomerIds=new Set(activeServiceLinks.map(a=>a.customer_id).filter(Boolean));
  const otherCustomerOptions=cashCustomers
    .filter(customer=>!activeCustomerIds.has(customer.id))
    .map(customer=>'<option value="customer:'+customer.id+'">'+customer.full_name+(customer.phone?' • '+customer.phone:"")+'</option>')
    .join("");

  $("cashProductCustomerLink").innerHTML=
    '<option value="">Venda Avulsa</option>'+
    (activeOptions?'<optgroup label="Atendimentos de hoje">'+activeOptions+'</optgroup>':"")+
    (otherCustomerOptions?'<optgroup label="Outros Clientes">'+otherCustomerOptions+'</optgroup>':"");

  $("cashProductSeller").innerHTML='<option value="">Ninguém / venda da casa</option>'+
    cashProfessionals.map(p=>'<option value="'+p.id+'">'+p.full_name+'</option>').join("");

  $("cashProduct").innerHTML='<option value="">Selecione</option>'+
    products.map(product=>'<option value="'+product.id+'">'+product.name+' — '+money(product.price)+'</option>').join("");

  if(activeServiceLinks.length===1){
    $("cashProductCustomerLink").value="appointment:"+activeServiceLinks[0].id;
  }
  syncProductSeller();

  updateProductPreview();
  openModal("productSaleModal");
});

// Venda ligada a um atendimento: a comissão vai para o barbeiro que está atendendo.
function syncProductSeller(){
  const link=$("cashProductCustomerLink").value;
  const appointment=link.startsWith("appointment:")?activeServiceLinks.find(a=>String(a.id)===link.split(":")[1]):null;
  if(appointment?.professional_id) $("cashProductSeller").value=appointment.professional_id;
}
$("cashProductCustomerLink")?.addEventListener("change",syncProductSeller);

document.querySelectorAll("[data-close-product-sale]").forEach(el=>el.addEventListener("click",()=>closeModal("productSaleModal")));
$("cashProduct")?.addEventListener("change",updateProductPreview);
$("cashProductQty")?.addEventListener("input",updateProductPreview);

$("productSaleForm")?.addEventListener("submit",async e=>{
  e.preventDefault();

  const product=products.find(p=>String(p.id)===$("cashProduct").value);
  const qty=Math.max(1,Number($("cashProductQty").value||1));

  if(!product){
    $("productSaleMessage").textContent="Selecione um produto.";
    return;
  }

  let customerId=null;
  let appointmentId=null;
  const link=$("cashProductCustomerLink").value;

  if(link.startsWith("appointment:")){
    appointmentId=link.split(":")[1];
    const appointment=activeServiceLinks.find(a=>a.id===appointmentId);
    customerId=appointment?.customer_id||null;
  }else if(link.startsWith("customer:")){
    customerId=link.split(":")[1];
  }

  $("productSaleMessage").textContent="Registrando venda...";

  const saleArgs={
    p_product_id:Number(product.id),
    p_quantity:qty,
    p_payment_method:$("cashProductMethod").value,
    p_customer_id:customerId,
    p_appointment_id:appointmentId,
    p_card_fee_percent:cardFee("cashProductMethod","productCardFee","productCardFeeBox")
  };
  const seller=$("cashProductSeller").value;
  let {error}=await supabase.rpc("sell_product_card",seller?{...saleArgs,p_professional_id:seller}:saleArgs);
  // Banco ainda sem o "vendido por": registra a venda sem o vendedor.
  if(error&&seller&&/function|p_professional_id/i.test(String(error.message||""))){
    ({error}=await supabase.rpc("sell_product_card",saleArgs));
  }

  if(error){
    const message=String(error.message||"");
    $("productSaleMessage").textContent=
      message.includes("Estoque insuficiente")?"Estoque insuficiente para concluir a venda.":
      message.includes("Caixa fechado")?"O Caixa está fechado.":
      "Não foi possível registrar a venda.";
    return;
  }

  closeModal("productSaleModal");
  window.dispatchEvent(new Event("c7-customer-consumption-updated"));
  await loadCash();
});

$("cashMovementBtn")?.addEventListener("click",()=>{
  $("movementForm").reset();
  $("movementMessage").textContent="";
  openModal("movementModal");
});

document.querySelectorAll("[data-close-movement]").forEach(el=>el.addEventListener("click",()=>closeModal("movementModal")));

$("movementForm")?.addEventListener("submit",async e=>{
  e.preventDefault();

  const type=$("movementType").value;
  const amount=Number($("movementAmount").value||0);
  const direction=type==="income"?"in":"out";

  if(amount<=0){
    $("movementMessage").textContent="Informe um valor válido.";
    return;
  }

  $("movementMessage").textContent="Salvando movimentação...";

  const {error}=await supabase.from("cash_transactions").insert({
    session_id:openSession.id,
    transaction_type:type,
    direction,
    payment_method:type==="withdrawal"?"cash":$("movementMethod").value,
    description:$("movementDescription").value.trim(),
    gross_amount:amount,
    discount_amount:0,
    net_amount:amount,
    notes:$("movementNotes").value.trim()||null,
    created_by:currentUser
  });

  if(error){
    $("movementMessage").textContent="Não foi possível salvar a movimentação.";
    return;
  }

  closeModal("movementModal");
  await loadCash();
});


function updateClosePreview(){
  const expected=Number($("closingAmount").dataset.expected||0);
  const counted=Number($("closingAmount").value||0);
  $("closeCountedPreview").textContent=money(counted);
  $("closeDifference").textContent=money(counted-expected);
}

$("closeCashBtn")?.addEventListener("click",()=>{
  const expected=Number($("closingAmount").dataset.expected||0);
  $("closeCashForm").reset();
  $("closingAmount").value=expected.toFixed(2);
  $("closeCashMessage").textContent="";
  updateClosePreview();
  openModal("closeCashModal");
  window.C7ClosingReport?.load(openSession);
});

document.querySelectorAll("[data-close-close-cash]").forEach(el=>el.addEventListener("click",()=>closeModal("closeCashModal")));
$("closingAmount")?.addEventListener("input",updateClosePreview);

$("closeCashForm")?.addEventListener("submit",async e=>{
  e.preventDefault();

  if(!openSession) return;

  const counted=Number($("closingAmount").value||0);
  const expected=Number($("closingAmount").dataset.expected||0);
  $("closeCashMessage").textContent="Fechando Caixa...";

  const {error}=await supabase.from("cash_sessions").update({
    status:"closed",
    closed_by:currentUser,
    closed_at:new Date().toISOString(),
    closing_amount:counted,
    expected_closing_amount:expected,
    closing_difference:Number((counted-expected).toFixed(2)),
    notes:$("closingNotes").value.trim()||openSession.notes||null
  }).eq("id",openSession.id);

  if(error){
    $("closeCashMessage").textContent="Não foi possível fechar o caixa.";
    return;
  }

  openSession=null;
  closeModal("closeCashModal");
  await loadCash();
});

async function checkoutAppointment(appointmentId){
  if(!canAccessCash()){
    window.C7UX?.notify("Você não tem acesso a pagamentos.","error");
    return false;
  }

  if(["admin","reception"].includes(currentRole)){
    await loadCash();

    if(!openSession){
      // Abre o caixa ali mesmo e segue para o pagamento.
      checkoutAfterOpening=appointmentId;
      $("openCashForm").reset();
      $("openingAmount").value="0";
      $("openCashMessage").textContent="Abra o caixa para receber este atendimento.";
      openModal("openCashModal");
      return true;
    }

    await loadPendingAppointments();
    if(!pendingAppointments.some(a=>String(a.id)===String(appointmentId))){
      // Atendimento de outro dia: busca direto para poder receber.
      const {data:other}=await supabase
        .from("appointments")
        .select("id,customer_id,professional_id,starts_at,total_amount,status,customer:customers(id,full_name,birth_date),professional:professionals(full_name),appointment_services(service_id,service_name,price),appointment_products(id,product_id,product_name,quantity,unit_price,total_amount,department)")
        .eq("id",appointmentId)
        .maybeSingle();
      const {data:paid}=await supabase.from("cash_transactions").select("id")
        .eq("appointment_id",appointmentId).eq("transaction_type","service").eq("status","posted").limit(1);
      if(other&&!paid?.length&&!["cancelled","no_show"].includes(other.status))pendingAppointments.push(other);
    }
  }else{
    const {data:appointment,error}=await supabase
      .from("appointments")
      .select("id,customer_id,professional_id,starts_at,total_amount,status,customer:customers(id,full_name,birth_date),professional:professionals(full_name),appointment_services(service_id,service_name,price),appointment_products(id,product_id,product_name,quantity,unit_price,total_amount,department)")
      .eq("id",appointmentId)
      .maybeSingle();

    if(error||!appointment){
      window.C7UX?.notify("Atendimento não encontrado.","error");
      return false;
    }

    if(appointment.professional_id!==currentProfessionalId){
      window.C7UX?.notify("Você só pode receber seus atendimentos.","error");
      return false;
    }

    pendingAppointments=[appointment];
  }

  const appointment=pendingAppointments.find(a=>String(a.id)===String(appointmentId));
  if(!appointment){
    window.C7UX?.notify("Este atendimento não está disponível para receber.","error");
    return false;
  }

  await openReceiveModal(appointmentId);
  return true;
}
/* Nova venda no estilo Booksy: itens em cartões, carrinho com cliente, vendedor e pagamento. */
const pos={cat:"pending",cart:[],method:"pix"};
function posProduct(id){return products.find(p=>String(p.id)===String(id));}
function renderPos(){
  if(!$("cashPosView")) return;
  const status=$("posCashStatus");
  status.innerHTML=openSession?'<span class="c7-status" data-status="completed">Caixa aberto</span>':'<span class="c7-status" data-status="no_show">Caixa fechado</span> <button type="button" id="posOpenCash" class="ghost-btn">Abrir caixa</button>';
  $("posOpenCash")?.addEventListener("click",()=>$("openCashBtn").click());
  $("posPendingCount").textContent=openSession?pendingAppointments.length:"–";
  const term=($("posSearch").value||"").trim().toLowerCase();
  const grid=$("posGrid");
  if(pos.cat==="pending"){
    const rows=pendingAppointments.filter(a=>!term||String(a.customer?.full_name||"").toLowerCase().includes(term));
    grid.innerHTML=!openSession?'<div class="agenda-empty">Abra o caixa para cobrar os atendimentos do dia.</div>'
      :rows.length?rows.map(a=>{
        const services=(a.appointment_services||[]).map(x=>x.service_name).join(" + ")||"Atendimento";
        return `<button type="button" class="pos-tile pos-tile-appt" data-status="${a.status}" data-pos-appt="${a.id}">
          <small>${new Date(a.starts_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})} · ${a.professional?.full_name||""}</small>
          <strong>${a.customer?.full_name||"Cliente"}</strong>
          <span>${services}</span>
          <b>${money(appointmentCheckoutGross(a))}</b>
        </button>`;}).join("")
      :'<div class="agenda-empty">Nenhum atendimento para cobrar hoje.</div>';
  }else{
    const rows=products.filter(p=>(p.department||"barbershop")===pos.cat&&(!term||p.name.toLowerCase().includes(term)));
    grid.innerHTML=rows.length?rows.map(p=>{
      const stock=Number(p.stock_quantity||0);
      return `<button type="button" class="pos-tile" data-pos-product="${p.id}" ${stock<=0?"disabled":""}>
        <strong>${p.name}</strong>
        <span>${stock>0?`${stock} em estoque`:"Sem estoque"}</span>
        <b>${money(p.price)}</b>
      </button>`;}).join(""):'<div class="agenda-empty">Nenhum item nesta categoria.</div>';
  }
  renderPosCart();
}
function renderPosCart(){
  const box=$("posCartItems");
  const total=pos.cart.reduce((sum,i)=>sum+Number(posProduct(i.id)?.price||0)*i.qty,0);
  box.innerHTML=pos.cart.length?pos.cart.map((i,idx)=>{
    const p=posProduct(i.id);
    return `<div class="pos-cart-row">
      <div><strong>${p?.name||"Produto"}</strong><small>${money(p?.price)} cada</small></div>
      <div class="pos-qty"><button type="button" data-pos-dec="${idx}">−</button><span>${i.qty}</span><button type="button" data-pos-inc="${idx}">+</button></div>
      <b>${money(Number(p?.price||0)*i.qty)}</b>
      <button type="button" class="pos-remove" data-pos-remove="${idx}" aria-label="Remover">×</button>
    </div>`;}).join(""):'<div class="pos-cart-empty"><strong>O carrinho está vazio</strong><span>Toque nos produtos para adicionar. Para cobrar um atendimento, use "Para ser cobrado".</span></div>';
  $("posTotal").textContent=money(total);
  $("posCheckout").disabled=!pos.cart.length;
  const card=CARD_METHODS.includes(pos.method);
  $("posFeeBox").classList.toggle("hidden",!card);
  document.querySelectorAll("[data-pos-method]").forEach(b=>b.classList.toggle("active",b.dataset.posMethod===pos.method));
}
function fillPosSelects(){
  const customer=$("posCustomer").value,seller=$("posSeller").value;
  $("posCustomer").innerHTML='<option value="">Venda avulsa (sem cliente)</option>'+cashCustomers.map(c=>`<option value="${c.id}">${c.full_name}${c.phone?" · "+c.phone:""}</option>`).join("");
  $("posSeller").innerHTML='<option value="">Ninguém / venda da casa</option>'+cashProfessionals.map(p=>`<option value="${p.id}">${p.full_name}</option>`).join("");
  $("posCustomer").value=customer;$("posSeller").value=seller;
}
document.querySelectorAll("[data-cash-tab]").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll("[data-cash-tab]").forEach(b=>b.classList.toggle("active",b===btn));
  $("cashPosView").classList.toggle("hidden",btn.dataset.cashTab!=="pos");
  $("cashDayView").classList.toggle("hidden",btn.dataset.cashTab!=="day");
}));
document.querySelectorAll("[data-pos-cat]").forEach(btn=>btn.addEventListener("click",()=>{
  pos.cat=btn.dataset.posCat;
  document.querySelectorAll("[data-pos-cat]").forEach(b=>b.classList.toggle("active",b===btn));
  renderPos();
}));
$("posSearch")?.addEventListener("input",renderPos);
$("posGrid")?.addEventListener("click",e=>{
  const appt=e.target.closest("[data-pos-appt]");
  if(appt){checkoutAppointment(appt.dataset.posAppt);return;}
  const tile=e.target.closest("[data-pos-product]");
  if(!tile) return;
  const p=posProduct(tile.dataset.posProduct);
  const line=pos.cart.find(i=>String(i.id)===String(p.id));
  if(line){if(line.qty<Number(p.stock_quantity||0)) line.qty++;}
  else pos.cart.push({id:p.id,qty:1});
  renderPosCart();
});
$("posCartItems")?.addEventListener("click",e=>{
  const t=e.target.closest("[data-pos-inc],[data-pos-dec],[data-pos-remove]");
  if(!t) return;
  const idx=Number(t.dataset.posInc??t.dataset.posDec??t.dataset.posRemove);
  const line=pos.cart[idx];
  if(t.dataset.posInc!=null){if(line.qty<Number(posProduct(line.id)?.stock_quantity||0)) line.qty++;}
  else if(t.dataset.posDec!=null){line.qty--;if(line.qty<=0) pos.cart.splice(idx,1);}
  else pos.cart.splice(idx,1);
  renderPosCart();
});
$("posMethods")?.addEventListener("click",e=>{
  const m=e.target.closest("[data-pos-method]")?.dataset.posMethod;
  if(m){pos.method=m;renderPosCart();}
});
$("posClear")?.addEventListener("click",()=>{pos.cart=[];$("posMessage").textContent="";renderPosCart();});
$("posCheckout")?.addEventListener("click",async()=>{
  if(!pos.cart.length) return;
  if(!openSession){$("posMessage").textContent="Abra o caixa antes de vender.";return;}
  const btn=$("posCheckout");btn.disabled=true;
  $("posMessage").textContent="Registrando venda...";
  const fee=CARD_METHODS.includes(pos.method)?Math.min(100,Math.max(0,Number($("posFee").value||0))):0;
  const seller=$("posSeller").value||null;
  const sold=[];
  for(const line of [...pos.cart]){
    const args={p_product_id:Number(line.id),p_quantity:line.qty,p_payment_method:pos.method,p_customer_id:$("posCustomer").value||null,p_appointment_id:null,p_card_fee_percent:fee};
    let {error}=await supabase.rpc("sell_product_card",seller?{...args,p_professional_id:seller}:args);
    if(error&&seller&&/function|p_professional_id/i.test(String(error.message||""))) ({error}=await supabase.rpc("sell_product_card",args));
    if(error){
      $("posMessage").textContent=`${posProduct(line.id)?.name||"Produto"}: ${String(error.message||"").includes("Estoque insuficiente")?"estoque insuficiente":"não foi possível vender"}.${sold.length?" Os itens anteriores foram vendidos.":""}`;
      pos.cart=pos.cart.filter(i=>!sold.includes(i));
      btn.disabled=false;await loadCash();return;
    }
    sold.push(line);
  }
  pos.cart=[];$("posMessage").textContent="";$("posFee").value="0";
  window.C7UX?.notify("Venda registrada no Caixa.");
  window.dispatchEvent(new Event("c7-customer-consumption-updated"));
  await loadCash();
});

window.C7Cash={
  checkoutAppointment,
  refresh:loadCash
};

async function initCash(){
  if(!await loadContext()) return;

  document.querySelectorAll('.nav-item[data-section="caixa"]').forEach(btn=>{
    btn.addEventListener("click",loadCash);
  });

  await loadCash();
}

initCash();


window.addEventListener("c7-financial-expense-updated",async()=>{
  if(canAccessCash()) await loadCash();
});

window.addEventListener("c7-settlement-paid",async()=>{
  if(canAccessCash()) await loadCash();
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  "https://cjtgjqxkyvgjlhylrvas.supabase.co",
  "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE"
);

const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(value||0));

let currentUser = null;
let currentRole = null;
let currentProfessionalId = null;
let openSession = null;
let pendingAppointments = [];
let products = [];
let cashProfessionals = [];
let cashCustomers = [];
let activeServiceLinks = [];
let receiveBenefits = [];
let appliedCoupon = null;

async function loadContext(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return false;
  currentUser=session.user.id;
  const {data}=await supabase.from("profiles").select("role").eq("user_id",currentUser).single();
  currentRole=data?.role||null;

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
  if(!["admin","reception"].includes(currentRole)) return;

  const start=new Date();
  start.setHours(0,0,0,0);
  const end=new Date();
  end.setHours(23,59,59,999);

  const [{data:sessionData},{data:productData},{data:professionalData},{data:customerData},{data:serviceData}] = await Promise.all([
    supabase.from("cash_sessions").select("*").eq("status","open").maybeSingle(),
    supabase.from("products").select("id,name,price,stock_quantity,product_kind,department").eq("active",true).order("sort_order"),
    supabase.from("professionals").select("id,full_name").eq("active",true).order("full_name"),
    supabase.from("customers").select("id,full_name,phone").eq("active",true).order("full_name").limit(500),
    supabase.from("appointments")
      .select("id,customer_id,status,starts_at,customer:customers(id,full_name),professional:professionals(full_name)")
      .gte("starts_at",start.toISOString())
      .lte("starts_at",end.toISOString())
      .in("status",["waiting","in_service"])
      .order("starts_at",{ascending:true})
  ]);

  openSession=sessionData||null;
  products=productData||[];
  cashProfessionals=professionalData||[];
  cashCustomers=customerData||[];
  activeServiceLinks=serviceData||[];

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
    .select("id,customer_id,professional_id,starts_at,total_amount,status,customer:customers(id,full_name,birth_date),professional:professionals(full_name),appointment_services(service_id,service_name,price)")
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

function updateReceivePreview(){
  const item=pendingAppointments.find(a=>a.id===$("receiveAppointment").value);
  const gross=Number($("receiveGross").value||0);
  const discount=Math.min(Number($("receiveDiscount").value||0),gross);
  const benefit=selectedBenefit();

  $("receiveNet").textContent=money(gross-discount);
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

  $("receiveBenefit").innerHTML='<option value="">Sem benefício</option>'+
    receiveBenefits.map(b=>`<option value="${b.key}">${b.label} — ${b.discount_type==="percent"?Number(b.discount_value)+"%":money(b.discount_value)}</option>`).join("");
}

async function openReceiveModal(id=null){
  $("receiveForm").reset();
  $("receiveDiscount").value="0";
  $("receiveMessage").textContent="";
  fillReceiveOptions();

  if(id) $("receiveAppointment").value=id;

  const item=pendingAppointments.find(a=>a.id===$("receiveAppointment").value);
  $("receiveGross").value=item?Number(item.total_amount||0).toFixed(2):"";
  await loadReceiveBenefits(item);
  updateReceivePreview();
  openModal("receiveModal");
}

$("receiveAppointmentBtn")?.addEventListener("click",()=>openReceiveModal());
document.querySelectorAll("[data-close-receive]").forEach(el=>el.addEventListener("click",()=>closeModal("receiveModal")));

$("receiveAppointment")?.addEventListener("change",async()=>{
  const item=pendingAppointments.find(a=>a.id===$("receiveAppointment").value);
  $("receiveGross").value=item?Number(item.total_amount||0).toFixed(2):"";
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

  const gross=Number(appointment.total_amount||0);
  const discount=Number($("receiveDiscount").value||0);
  const net=gross-discount;

  if(discount<0||net<0){
    $("receiveMessage").textContent="Confira os valores informados.";
    return;
  }

  $("receiveMessage").textContent="Registrando recebimento...";

  const benefit=appliedCoupon||selectedBenefit();

  const {data,error}=await supabase.rpc("checkout_appointment",{
    p_appointment_id:appointment.id,
    p_payment_method:$("receiveMethod").value,
    p_discount_amount:discount,
    p_benefit_source:benefit?.source||null,
    p_benefit_label:benefit?.label||null,
    p_coupon_id:appliedCoupon?.id||null
  });

  if(error){
    const message=String(error.message||"");
    $("receiveMessage").textContent=
      message.includes("Caixa fechado")?"O Caixa está fechado. Peça à recepção para abrir o Caixa antes do checkout.":
      message.includes("já recebido")?"Este atendimento já foi recebido.":
      message.includes("Cupom")?message:
      "Não foi possível concluir o checkout.";
    return;
  }

  closeModal("receiveModal");
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
  $("cashProductTotal").textContent=money(Number(product?.price||0)*qty);
}

$("sellProductBtn")?.addEventListener("click",()=>{\n  $("productSaleForm").reset();\n  $("cashProductQty").value="1";\n  $("productSaleMessage").textContent="";\n\n  const activeOptions=activeServiceLinks.map(a=>\n    '<option value="appointment:'+a.id+'">EM ATENDIMENTO — '+(a.customer?.full_name||"Cliente")+' • '+(a.professional?.full_name||"Barbeiro")+'</option>'\n  ).join("");\n\n  const activeCustomerIds=new Set(activeServiceLinks.map(a=>a.customer_id).filter(Boolean));\n  const otherCustomerOptions=cashCustomers\n    .filter(customer=>!activeCustomerIds.has(customer.id))\n    .map(customer=>'<option value="customer:'+customer.id+'">'+customer.full_name+(customer.phone?' • '+customer.phone:"")+'</option>')\n    .join("");\n\n  $("cashProductCustomerLink").innerHTML=\n    '<option value="">Venda Avulsa</option>'+\n    (activeOptions?'<optgroup label="Em Atendimento">'+activeOptions+'</optgroup>':"")+\n    (otherCustomerOptions?'<optgroup label="Outros Clientes">'+otherCustomerOptions+'</optgroup>':"");\n\n  $("cashProduct").innerHTML='<option value="">Selecione</option>'+\n    products.map(product=>'<option value="'+product.id+'">'+product.name+' — '+money(product.price)+'</option>').join("");\n\n  if(activeServiceLinks.length===1){\n    $("cashProductCustomerLink").value="appointment:"+activeServiceLinks[0].id;\n  }\n\n  updateProductPreview();\n  openModal("productSaleModal");\n});\n\ndocument.querySelectorAll("[data-close-product-sale]").forEach(el=>el.addEventListener("click",()=>closeModal("productSaleModal")));\n$("cashProduct")?.addEventListener("change",updateProductPreview);\n$("cashProductQty")?.addEventListener("input",updateProductPreview);\n\n$("productSaleForm")?.addEventListener("submit",async e=>{\n  e.preventDefault();\n\n  const product=products.find(p=>String(p.id)===$("cashProduct").value);\n  const qty=Math.max(1,Number($("cashProductQty").value||1));\n\n  if(!product){\n    $("productSaleMessage").textContent="Selecione um produto.";\n    return;\n  }\n\n  let customerId=null;\n  let appointmentId=null;\n  const link=$("cashProductCustomerLink").value;\n\n  if(link.startsWith("appointment:")){\n    appointmentId=link.split(":")[1];\n    const appointment=activeServiceLinks.find(a=>a.id===appointmentId);\n    customerId=appointment?.customer_id||null;\n  }else if(link.startsWith("customer:")){\n    customerId=link.split(":")[1];\n  }\n\n  $("productSaleMessage").textContent="Registrando venda...";\n\n  const {error}=await supabase.rpc("sell_product",{\n    p_product_id:Number(product.id),\n    p_quantity:qty,\n    p_payment_method:$("cashProductMethod").value,\n    p_customer_id:customerId,\n    p_appointment_id:appointmentId\n  });\n\n  if(error){\n    const message=String(error.message||"");\n    $("productSaleMessage").textContent=\n      message.includes("Estoque insuficiente")?"Estoque insuficiente para concluir a venda.":\n      message.includes("Caixa fechado")?"O Caixa está fechado.":\n      "Não foi possível registrar a venda.";\n    return;\n  }\n\n  closeModal("productSaleModal");\n  window.dispatchEvent(new Event("c7-customer-consumption-updated"));\n  await loadCash();\n});\n\n$("cashMovementBtn")?.addEventListener("click",()=>{
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
  if(!["admin","reception","barber"].includes(currentRole)){
    alert("Seu perfil não possui permissão para registrar pagamentos.");
    return false;
  }

  if(["admin","reception"].includes(currentRole)){
    await loadCash();

    if(!openSession){
      alert("O Caixa está fechado. Abra o Caixa antes de finalizar o atendimento.");
      return false;
    }

    await loadPendingAppointments();
  }else{
    const {data:appointment,error}=await supabase
      .from("appointments")
      .select("id,customer_id,professional_id,starts_at,total_amount,status,customer:customers(id,full_name,birth_date),professional:professionals(full_name),appointment_services(service_id,service_name,price)")
      .eq("id",appointmentId)
      .maybeSingle();

    if(error||!appointment){
      alert("Atendimento não encontrado.");
      return false;
    }

    if(appointment.professional_id!==currentProfessionalId){
      alert("Você só pode realizar checkout dos seus próprios atendimentos.");
      return false;
    }

    pendingAppointments=[appointment];
  }

  const appointment=pendingAppointments.find(a=>String(a.id)===String(appointmentId));
  if(!appointment){
    alert("Este atendimento já foi recebido ou não está disponível para checkout.");
    return false;
  }

  await openReceiveModal(appointmentId);
  return true;
}
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
  if(["admin","reception"].includes(currentRole)) await loadCash();
});

window.addEventListener("c7-settlement-paid",async()=>{
  if(["admin","reception"].includes(currentRole)) await loadCash();
});

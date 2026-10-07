import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase=createClient(
  "https://cjtgjqxkyvgjlhylrvas.supabase.co",
  "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE"
);

const $=id=>document.getElementById(id);
const money=v=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(v||0));
let currentRole=null;

async function loadContext(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return false;
  const {data}=await supabase.from("profiles").select("role").eq("user_id",session.user.id).single();
  currentRole=data?.role||null;
  return true;
}

async function loadCommissions(){
  if(!["admin","reception"].includes(currentRole)) return;
  const {data,error}=await supabase
    .from("commission_entries")
    .select("id,commission_amount,commission_percent,base_amount,status,created_at,paid_at,professional:professionals(full_name)")
    .order("created_at",{ascending:false})
    .limit(100);

  const target=$("commissionList");
  if(error){
    target.innerHTML='<div class="cash-empty">Não foi possível carregar as comissões.</div>';
    return;
  }

  const rows=data||[];
  if(!rows.length){
    target.innerHTML='<div class="cash-empty">Nenhuma comissão registrada.</div>';
    return;
  }

  const grouped=new Map();
  rows.forEach(item=>{
    const key=item.professional?.full_name||"Profissional";
    if(!grouped.has(key)) grouped.set(key,{pending:0,paid:0,ids:[]});
    const g=grouped.get(key);
    if(item.status==="pending"){
      g.pending+=Number(item.commission_amount||0);
      g.ids.push(item.id);
    }
    if(item.status==="paid") g.paid+=Number(item.commission_amount||0);
  });

  target.replaceChildren();

  [...grouped.entries()].sort((a,b)=>b[1].pending-a[1].pending).forEach(([name,values])=>{
    const row=document.createElement("div");
    row.className="finance-row";

    const main=document.createElement("div");
    const title=document.createElement("strong");
    title.textContent=name;
    const sub=document.createElement("span");
    sub.textContent="Pendente: "+money(values.pending)+" • Pago: "+money(values.paid);
    main.append(title,sub);

    const actions=document.createElement("div");
    actions.className="finance-actions";

    const value=document.createElement("div");
    value.className="finance-value";
    value.textContent=money(values.pending);
    actions.appendChild(value);

    if(currentRole==="admin"&&values.ids.length){
      const go=document.createElement("button");
      go.type="button";
      go.textContent="IR PARA ACERTOS";
      go.addEventListener("click",()=>{
        document.querySelector('.nav-item[data-section="acertos"]')?.click();
      });
      actions.appendChild(go);
    }

    row.append(main,actions);
    target.appendChild(row);
  });
}

async function loadCashHistory(){
  if(!["admin","reception"].includes(currentRole)) return;

  const {data,error}=await supabase
    .from("cash_sessions")
    .select("id,opened_at,opening_amount,closed_at,closing_amount,expected_closing_amount,closing_difference,status,notes")
    .order("opened_at",{ascending:false})
    .limit(30);

  const target=$("cashHistoryList");
  if(error){
    target.innerHTML='<div class="cash-empty">Não foi possível carregar o histórico.</div>';
    return;
  }

  const sessions=data||[];
  target.replaceChildren();

  if(!sessions.length){
    target.innerHTML='<div class="cash-empty">Nenhum caixa registrado.</div>';
    return;
  }

  for(const session of sessions){
    const {data:transactions}=await supabase
      .from("cash_transactions")
      .select("direction,net_amount,status,payment_method,transaction_type")
      .eq("session_id",session.id)
      .eq("status","posted");

    const tx=transactions||[];
    const totalIn=tx.filter(t=>t.direction==="in").reduce((s,t)=>s+Number(t.net_amount||0),0);
    const totalOut=tx.filter(t=>t.direction==="out").reduce((s,t)=>s+Number(t.net_amount||0),0);
    const cashIn=tx.filter(t=>t.direction==="in"&&t.payment_method==="cash").reduce((s,t)=>s+Number(t.net_amount||0),0);
    const cashOut=tx.filter(t=>t.direction==="out"&&(t.payment_method==="cash"||t.transaction_type==="withdrawal")).reduce((s,t)=>s+Number(t.net_amount||0),0);
    const expected=session.expected_closing_amount==null
      ? Number(session.opening_amount||0)+cashIn-cashOut
      : Number(session.expected_closing_amount);
    const difference=session.closing_difference==null
      ? (session.closing_amount==null?null:Number(session.closing_amount)-expected)
      : Number(session.closing_difference);

    const row=document.createElement("div");
    row.className="finance-row";

    const main=document.createElement("div");
    const title=document.createElement("strong");
    title.textContent=new Date(session.opened_at).toLocaleDateString("pt-BR");
    const sub=document.createElement("span");
    sub.textContent=session.status==="open"
      ? "Caixa ainda aberto"
      : `Esperado: ${money(expected)} • Fechado: ${money(session.closing_amount)} • Diferença: ${money(difference)}`;
    main.append(title,sub);

    const value=document.createElement("div");
    value.className="finance-value";
    value.textContent=money(totalIn);

    row.append(main,value);
    target.appendChild(row);
  }
}


function currentWeekRange(){
  const now=new Date();
  const start=new Date(now);
  start.setHours(0,0,0,0);
  start.setDate(now.getDate()-now.getDay());

  const end=new Date(start);
  end.setDate(start.getDate()+6);
  end.setHours(23,59,59,999);

  const input=d=>{
    const y=d.getFullYear();
    const m=String(d.getMonth()+1).padStart(2,"0");
    const day=String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  };

  return {start,end,startValue:input(start),endValue:input(end)};
}

async function loadEmployeeConsumptions(){
  if(!["admin","reception"].includes(currentRole)) return;

  const {data,error}=await supabase
    .from("employee_consumptions")
    .select("id,quantity,unit_price,total_amount,status,created_at,professional:professionals(full_name),product:products(name)")
    .eq("status","pending")
    .order("created_at",{ascending:false})
    .limit(100);

  const target=$("employeeConsumptionList");
  if(!target) return;

  if(error){
    target.innerHTML='<div class="cash-empty">Não foi possível carregar os consumos.</div>';
    return;
  }

  const rows=data||[];

  target.innerHTML=rows.length
    ? rows.map(item=>`
        <div class="finance-row">
          <div>
            <strong>${item.professional?.full_name||"Colaborador"}</strong>
            <span>${item.product?.name||"Produto"} • ${Number(item.quantity||0)} un. • ${new Date(item.created_at).toLocaleDateString("pt-BR")}</span>
          </div>
          <div class="finance-value">${money(item.total_amount)}</div>
        </div>
      `).join("")
    : '<div class="cash-empty">Nenhum consumo pendente.</div>';
}

async function loadWeeklySettlements(){
  if(!["admin","reception"].includes(currentRole)) return;

  const range=currentWeekRange();

  const [proResult,commissionResult,consumptionResult]=await Promise.all([
    supabase.from("professionals").select("id,full_name").eq("active",true).order("full_name"),
    supabase.from("commission_entries")
      .select("id,professional_id,commission_amount,status,created_at")
      .eq("status","pending")
      .gte("created_at",range.start.toISOString())
      .lte("created_at",range.end.toISOString()),
    supabase.from("employee_consumptions")
      .select("id,professional_id,total_amount,status,created_at")
      .eq("status","pending")
      .gte("created_at",range.start.toISOString())
      .lte("created_at",range.end.toISOString())
  ]);

  const professionals=proResult.data||[];
  const commissions=commissionResult.data||[];
  const consumptions=consumptionResult.data||[];
  const target=$("weeklySettlementList");
  if(!target) return;

  if(!professionals.length){
    target.innerHTML='<div class="cash-empty">Nenhum colaborador ativo.</div>';
    return;
  }

  target.replaceChildren();

  professionals.forEach(pro=>{
    const commission=commissions
      .filter(x=>x.professional_id===pro.id)
      .reduce((sum,x)=>sum+Number(x.commission_amount||0),0);

    const consumption=consumptions
      .filter(x=>x.professional_id===pro.id)
      .reduce((sum,x)=>sum+Number(x.total_amount||0),0);

    const net=Math.max(commission-consumption,0);

    const row=document.createElement("div");
    row.className="finance-row";

    const main=document.createElement("div");
    const title=document.createElement("strong");
    title.textContent=pro.full_name;
    const sub=document.createElement("span");
    sub.textContent=`Comissão: ${money(commission)} • Consumo: ${money(consumption)} • ${range.start.toLocaleDateString("pt-BR")} a ${range.end.toLocaleDateString("pt-BR")}`;
    main.append(title,sub);

    const actions=document.createElement("div");
    actions.className="finance-actions";

    const value=document.createElement("div");
    value.className="finance-value";
    value.textContent=money(net);
    actions.appendChild(value);

    if(currentRole==="admin"&&(commission>0||consumption>0)){
      const btn=document.createElement("button");
      btn.type="button";
      btn.textContent="REGISTRAR PAGAMENTO";
      btn.addEventListener("click",()=>{
        $("settlementProfessionalId").value=pro.id;
        $("settlementPeriodStart").value=range.startValue;
        $("settlementPeriodEnd").value=range.endValue;
        $("settlementProfessionalName").value=pro.full_name;
        $("settlementGrossCommission").textContent=money(commission);
        $("settlementConsumption").textContent=money(consumption);
        $("settlementNetPayable").textContent=money(net);
        $("settlementPaymentMethod").value="pix";
        $("settlementPaymentNotes").value="";
        $("settlementPaymentMessage").textContent="";
        $("settlementPaymentModal").classList.remove("hidden");
      });
      actions.appendChild(btn);
    }

    row.append(main,actions);
    target.appendChild(row);
  });
}


async function loadSettlementHistory(){
  if(!["admin","reception"].includes(currentRole)) return;

  const {data,error}=await supabase
    .from("employee_settlements")
    .select("id,period_start,period_end,gross_commission,consumption_discount,net_payable,status,paid_at,payment_method,cash_session_id,notes,professional:professionals(full_name)")
    .eq("status","paid")
    .order("paid_at",{ascending:false})
    .limit(60);

  const target=$("settlementHistoryList");
  if(!target) return;

  if(error){
    target.innerHTML='<div class="cash-empty">Não foi possível carregar o histórico de acertos.</div>';
    return;
  }

  const rows=data||[];
  const methodLabels={cash:"Dinheiro",pix:"Pix",credit:"Crédito",debit:"Débito",other:"Outro"};

  target.innerHTML=rows.length
    ? rows.map(item=>`
      <div class="finance-row settlement-history-row">
        <div>
          <strong>${item.professional?.full_name||"Colaborador"}</strong>
          <span>
            ${new Date(item.period_start+"T12:00:00").toLocaleDateString("pt-BR")}
            a
            ${new Date(item.period_end+"T12:00:00").toLocaleDateString("pt-BR")}
            • Comissão ${money(item.gross_commission)}
            • Consumo ${money(item.consumption_discount)}
            • ${methodLabels[item.payment_method]||item.payment_method||"—"}
          </span>
          <small>
            Pago em ${item.paid_at?new Date(item.paid_at).toLocaleString("pt-BR"):"—"}
            ${item.cash_session_id?` • Caixa ${String(item.cash_session_id).slice(0,8)}`:""}
          </small>
        </div>
        <div class="finance-value">${money(item.net_payable)}</div>
      </div>
    `).join("")
    : '<div class="cash-empty">Nenhum acerto pago ainda.</div>';
}

async function loadFinance(){
  await Promise.all([
    loadCommissions(),
    loadCashHistory(),
    loadEmployeeConsumptions(),
    loadWeeklySettlements(),
    loadSettlementHistory()
  ]);
}

async function init(){
  if(!await loadContext()) return;
  document.querySelectorAll('.nav-item[data-section="caixa"], .nav-item[data-section="acertos"]').forEach(btn=>btn.addEventListener("click",loadFinance));
  $("refreshCommissionsBtn")?.addEventListener("click",loadCommissions);
  $("refreshCashHistoryBtn")?.addEventListener("click",loadCashHistory);
  $("refreshEmployeeConsumptionBtn")?.addEventListener("click",loadEmployeeConsumptions);
  $("refreshSettlementsBtn")?.addEventListener("click",loadWeeklySettlements);
  $("refreshSettlementHistoryBtn")?.addEventListener("click",loadSettlementHistory);

  document.querySelectorAll("[data-close-settlement-payment]").forEach(el=>{
    el.addEventListener("click",()=>$("settlementPaymentModal")?.classList.add("hidden"));
  });

  $("settlementPaymentForm")?.addEventListener("submit",async e=>{
    e.preventDefault();

    $("settlementPaymentMessage").textContent="Registrando pagamento...";

    const {error}=await supabase.rpc("pay_employee_settlement",{
      p_professional_id:$("settlementProfessionalId").value,
      p_period_start:$("settlementPeriodStart").value,
      p_period_end:$("settlementPeriodEnd").value,
      p_payment_method:$("settlementPaymentMethod").value,
      p_notes:$("settlementPaymentNotes").value.trim()||null
    });

    if(error){
      const message=String(error.message||"");
      $("settlementPaymentMessage").textContent=message.includes("Caixa fechado")
        ?"Abra o Caixa antes de registrar o pagamento."
        :"Não foi possível registrar o pagamento.";
      return;
    }

    $("settlementPaymentModal").classList.add("hidden");
    await Promise.all([
      loadCommissions(),
      loadEmployeeConsumptions(),
      loadWeeklySettlements(),
      loadSettlementHistory(),
      loadCashHistory()
    ]);
    window.dispatchEvent(new Event("c7-settlement-paid"));
  });
  const range=currentWeekRange();
  if($("settlementPeriodLabel")){
    $("settlementPeriodLabel").textContent=`${range.start.toLocaleDateString("pt-BR")} a ${range.end.toLocaleDateString("pt-BR")}`;
  }

  window.addEventListener("c7-employee-consumption-updated",async()=>{
    await Promise.all([loadEmployeeConsumptions(),loadWeeklySettlements()]);
  });
}

init();

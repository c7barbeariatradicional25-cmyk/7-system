import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchPaymentSplits, paymentParts } from "./pagamentos.js";

const supabase=createClient(
  "https://cjtgjqxkyvgjlhylrvas.supabase.co",
  "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE"
);

const $=id=>document.getElementById(id);
const money=v=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(v||0));
let currentRole=null;
let c7ModuleRights=null;

function canAccessFinance(){return currentRole==="admin" || (c7ModuleRights?Boolean(c7ModuleRights["finance.view"]):currentRole==="reception");}
async function loadContext(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return false;
  const {data}=await supabase.from("profiles").select("role").eq("user_id",session.user.id).single();
  currentRole=data?.role||null;
  const {data:grant}=await supabase.from("staff_permissions").select("permissions").eq("email",session.user.email.toLowerCase()).maybeSingle();
  c7ModuleRights=grant?.permissions||null;
  return true;
}

async function loadCommissions(){
  if(!canAccessFinance()||!$("commissionList")) return;
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
  if(!canAccessFinance()) return;

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
      .select("id,direction,net_amount,status,payment_method,transaction_type")
      .eq("session_id",session.id)
      .eq("status","posted");

    const tx=transactions||[];
    const totalIn=tx.filter(t=>t.direction==="in").reduce((s,t)=>s+Number(t.net_amount||0),0);
    const totalOut=tx.filter(t=>t.direction==="out").reduce((s,t)=>s+Number(t.net_amount||0),0);
    const splits=await fetchPaymentSplits(supabase,tx.filter(t=>t.direction==="in").map(t=>t.id));
    const cashIn=tx.filter(t=>t.direction==="in")
      .flatMap(t=>paymentParts(t,splits))
      .filter(part=>part.method==="cash")
      .reduce((s,part)=>s+part.amount,0);
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
  if(!canAccessFinance()) return;

  const {data,error}=await supabase
    .from("employee_consumptions")
    .select("id,quantity,unit_price,total_amount,amount_settled,status,created_at,professional:professionals(full_name),product:products(name)")
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
          <div class="finance-value">${money(Math.max(Number(item.total_amount||0)-Number(item.amount_settled||0),0))}</div>
        </div>
      `).join("")
    : '<div class="cash-empty">Nenhum consumo pendente.</div>';
}

const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/* Meta de produtos: o Arthur define meta mensal e comissão extra; cada cartão mostra o andamento. */
let goals=[];
let goalProgress=new Map();
let goalProfessionals=[];
const goalModeText={month:"sobre tudo o que vendeu no mês",above:"só sobre o que passar da meta"};

async function loadGoals(){
  const panel=$("goalPanel");
  if(!panel) return;
  const [goalResult,progressResult,proResult]=await Promise.all([
    supabase.from("commission_goals").select("*").order("professional_id",{nullsFirst:true}),
    supabase.rpc("c7_product_goal_progress"),
    supabase.from("professionals").select("id,full_name").eq("active",true).order("full_name")
  ]);
  // Sem o SQL da meta aplicado, o painel fica escondido.
  if(goalResult.error){panel.classList.add("hidden");goals=[];goalProgress=new Map();return;}
  goals=goalResult.data||[];
  goalProfessionals=proResult.data||[];
  goalProgress=new Map((progressResult.data||[]).map(r=>[String(r.professional_id),r]));
  const name=id=>id?goalProfessionals.find(p=>String(p.id)===String(id))?.full_name||"Barbeiro":"Todos os barbeiros";
  panel.innerHTML=`
    <div class="goal-panel-head"><div><strong>Meta de produtos do mês</strong><small>Comissão extra para quem bater a meta de vendas de produtos.</small></div>
      ${currentRole==="admin"?'<button type="button" class="ghost-btn" data-new-goal>+ META</button>':""}</div>
    ${goals.length?goals.map(g=>`
      <div class="goal-row${g.active?"":" is-off"}">
        <span><b>${esc(name(g.professional_id))}</b> · meta ${money(g.monthly_target)} → <b class="in">+${Number(g.bonus_percent).toLocaleString("pt-BR")}%</b> ${goalModeText[g.bonus_mode]||""}${g.active?"":" · inativa"}</span>
        ${currentRole==="admin"?`<button type="button" class="ghost-btn" data-edit-goal="${g.id}">EDITAR</button>`:""}
      </div>`).join(""):'<p class="goal-empty">Nenhuma meta definida.</p>'}`;
  panel.classList.remove("hidden");
  panel.querySelector("[data-new-goal]")?.addEventListener("click",()=>openGoal());
  panel.querySelectorAll("[data-edit-goal]").forEach(btn=>btn.addEventListener("click",()=>openGoal(btn.dataset.editGoal)));
}

function openGoal(id=null){
  const goal=goals.find(g=>String(g.id)===String(id));
  $("goalForm").reset();
  $("goalId").value=goal?.id||"";
  $("goalProfessional").innerHTML='<option value="">Todos os barbeiros</option>'+goalProfessionals.map(p=>`<option value="${p.id}">${esc(p.full_name)}</option>`).join("");
  $("goalProfessional").value=goal?.professional_id||"";
  $("goalTarget").value=goal?.monthly_target??"";
  $("goalBonus").value=goal?.bonus_percent??"";
  $("goalMode").value=goal?.bonus_mode||"month";
  $("goalActive").checked=goal?goal.active:true;
  $("goalDeleteBtn").classList.toggle("hidden",!goal);
  $("goalMessage").textContent="";
  $("goalModal").classList.remove("hidden");
}

async function saveGoal(e){
  e.preventDefault();
  const id=$("goalId").value;
  const payload={
    professional_id:$("goalProfessional").value||null,
    monthly_target:Number($("goalTarget").value),
    bonus_percent:Number($("goalBonus").value),
    bonus_mode:$("goalMode").value,
    active:$("goalActive").checked,
    updated_at:new Date().toISOString()
  };
  const result=id
    ? await supabase.from("commission_goals").update(payload).eq("id",id)
    : await supabase.from("commission_goals").insert(payload);
  if(result.error){
    $("goalMessage").textContent=/duplicate|unique/i.test(result.error.message||"")
      ?"Já existe uma meta para esse barbeiro (ou para todos). Edite a existente."
      :"Não foi possível salvar a meta.";
    return;
  }
  $("goalModal").classList.add("hidden");
  await loadWeeklySettlements();
}

function goalLine(proId){
  const g=goalProgress.get(String(proId));
  if(!g) return "";
  const sold=Number(g.sold||0),target=Number(g.monthly_target||0);
  const pct=target?Math.min(100,sold/target*100):0;
  const done=sold>=target;
  return `<div class="settle-goal${done?" is-done":""}">
    <div class="settle-goal-text"><span>Produtos no mês: <b>${money(sold)}</b> de ${money(target)}</span>
      <span>${done?`Meta batida! Extra: <b>${money(g.bonus_earned)}</b>`:`Falta ${money(target-sold)} para +${Number(g.bonus_percent).toLocaleString("pt-BR")}%`}</span></div>
    <div class="settle-goal-bar"><i style="width:${pct}%"></i></div>
  </div>`;
}

/* Acerto da semana: um cartão por barbeiro com Comissão − Consumo = A pagar. */
async function loadWeeklySettlements(){
  if(!canAccessFinance()) return;
  await loadGoals();

  const range=currentWeekRange();

  const [proResult,commissionResult,consumptionResult]=await Promise.all([
    supabase.from("professionals").select("id,full_name").eq("active",true).order("full_name"),
    supabase.from("commission_entries")
      .select("id,professional_id,commission_amount,status,created_at")
      .eq("status","pending")
      .gte("created_at",range.start.toISOString())
      .lte("created_at",range.end.toISOString()),
    supabase.from("employee_consumptions")
      .select("id,professional_id,quantity,total_amount,amount_settled,status,created_at,product:products(name)")
      .eq("status","pending")
      .lte("created_at",range.end.toISOString())
      .order("created_at",{ascending:false})
  ]);

  const professionals=proResult.data||[];
  const commissions=commissionResult.data||[];
  const consumptions=consumptionResult.data||[];
  const target=$("weeklySettlementList");
  if(!target) return;

  if(!professionals.length){
    target.innerHTML='<div class="cash-empty">Nenhum barbeiro ativo.</div>';
    return;
  }

  const cards=professionals.map(pro=>{
    const commission=commissions
      .filter(x=>x.professional_id===pro.id)
      .reduce((sum,x)=>sum+Number(x.commission_amount||0),0);
    const items=consumptions.filter(x=>x.professional_id===pro.id);
    const open=item=>Math.max(Number(item.total_amount||0)-Number(item.amount_settled||0),0);
    const consumption=items.reduce((sum,x)=>sum+open(x),0);
    const consumptionApplied=Math.min(commission,consumption);
    const residualDebt=Math.max(consumption-commission,0);
    const net=Math.max(commission-consumptionApplied,0);
    const empty=commission<=0&&consumption<=0;

    return {pro,commission,consumption,consumptionApplied,net,empty,html:`
      <article class="settle-card${empty?" is-empty":""}">
        <div class="settle-name">${esc(pro.full_name)}</div>
        <div class="settle-math">
          <div><span>Comissão</span><strong class="in">${money(commission)}</strong></div>
          <b>−</b>
          <div><span>Consumo</span><strong class="out">${money(consumptionApplied)}</strong></div>
          <b>=</b>
          <div class="settle-net"><span>A pagar</span><strong>${money(net)}</strong></div>
        </div>
        ${currentRole==="admin"&&!empty?`<button type="button" class="settle-pay" data-settle="${esc(pro.id)}">${net>0?"PAGAR":"ACERTAR"}</button>`:""}
        ${goalLine(pro.id)}
        ${residualDebt>0?`<p class="settle-note">Consumo maior que a comissão: ${money(residualDebt)} fica para a próxima semana.</p>`:""}
        ${items.length?`<details class="settle-items"><summary>Ver consumos (${items.length})</summary>
          ${items.map(x=>`<div><span>${esc(x.product?.name||"Produto")} · ${Number(x.quantity||0)} un. · ${new Date(x.created_at).toLocaleDateString("pt-BR")}</span><strong>${money(open(x))}</strong></div>`).join("")}
        </details>`:""}
      </article>`};
  });

  // Quem tem valor aparece primeiro; quem não tem nada fica no fim, apagado.
  cards.sort((a,b)=>Number(a.empty)-Number(b.empty)||b.net-a.net);
  target.innerHTML=cards.map(c=>c.html).join("");

  target.querySelectorAll("[data-settle]").forEach(btn=>{
    const c=cards.find(x=>String(x.pro.id)===btn.dataset.settle);
    btn.addEventListener("click",()=>{
      $("settlementProfessionalId").value=c.pro.id;
      $("settlementPeriodStart").value=range.startValue;
      $("settlementPeriodEnd").value=range.endValue;
      $("settlementProfessionalName").value=c.pro.full_name;
      $("settlementGrossCommission").textContent=money(c.commission);
      $("settlementConsumption").textContent=money(c.consumptionApplied);
      $("settlementNetPayable").textContent=money(c.net);
      $("settlementPaymentMethod").value="pix";
      $("settlementPaymentNotes").value="";
      $("settlementPaymentMessage").textContent="";
      $("settlementPaymentModal").classList.remove("hidden");
    });
  });
}


async function loadSettlementHistory(){
  if(!canAccessFinance()) return;

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
  $("goalForm")?.addEventListener("submit",saveGoal);
  document.querySelectorAll("[data-close-goal]").forEach(el=>el.addEventListener("click",()=>$("goalModal").classList.add("hidden")));
  $("goalDeleteBtn")?.addEventListener("click",async()=>{
    const id=$("goalId").value;
    if(!id||!confirm("Remover esta meta? As comissões extras já lançadas continuam.")) return;
    await supabase.from("commission_goals").delete().eq("id",id);
    $("goalModal").classList.add("hidden");
    await loadWeeklySettlements();
  });

  document.querySelectorAll("[data-close-settlement-payment]").forEach(el=>{
    el.addEventListener("click",()=>$("settlementPaymentModal")?.classList.add("hidden"));
  });

  $("settlementPaymentForm")?.addEventListener("submit",async e=>{
    e.preventDefault();
    if(currentRole!=="admin")return;

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

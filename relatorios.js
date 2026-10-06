import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase=createClient(
  "https://cjtgjqxkyvgjlhylrvas.supabase.co",
  "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE"
);

const $=id=>document.getElementById(id);
const money=v=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(v||0));

function dateInput(date){
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,"0");
  const d=String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

function row(label,sub,value){
  return `<div class="report-row"><div><strong>${label}</strong><span>${sub||""}</span></div><div class="report-row-value">${value}</div></div>`;
}

async function loadReport(){
  const startValue=$("reportStart").value;
  const endValue=$("reportEnd").value;
  if(!startValue||!endValue) return;

  const start=new Date(`${startValue}T00:00:00`);
  const end=new Date(`${endValue}T23:59:59.999`);

  const results=await Promise.all([
    supabase.from("cash_transactions")
      .select("transaction_type,payment_method,direction,net_amount,status,professional:professionals(full_name)")
      .gte("created_at",start.toISOString())
      .lte("created_at",end.toISOString())
      .eq("status","posted"),
    supabase.from("appointments")
      .select("status,total_amount,professional:professionals(full_name)")
      .gte("starts_at",start.toISOString())
      .lte("starts_at",end.toISOString()),
    supabase.from("commission_entries")
      .select("commission_amount,status,professional:professionals(full_name)")
      .gte("created_at",start.toISOString())
      .lte("created_at",end.toISOString()),
    supabase.from("customer_crm_summary")
      .select("completed_visits,last_visit_at,next_visit_at")
  ]);

  const tx=results[0].data||[];
  const apps=results[1].data||[];
  const comm=results[2].data||[];
  const customers=results[3].data||[];

  const revenue=tx.filter(t=>t.direction==="in").reduce((s,t)=>s+Number(t.net_amount||0),0);
  const completed=apps.filter(a=>a.status==="completed");
  const commissionsTotal=comm.filter(c=>c.status!=="cancelled").reduce((s,c)=>s+Number(c.commission_amount||0),0);

  $("reportRevenue").textContent=money(revenue);
  $("reportAppointments").textContent=completed.length;
  $("reportTicket").textContent=money(completed.length?revenue/completed.length:0);
  $("reportCommissions").textContent=money(commissionsTotal);


  const byProfessional=new Map();
  tx.filter(t=>t.direction==="in"&&t.professional?.full_name).forEach(t=>{
    const name=t.professional.full_name;
    byProfessional.set(name,(byProfessional.get(name)||0)+Number(t.net_amount||0));
  });

  $("professionalReportList").innerHTML=byProfessional.size
    ? [...byProfessional.entries()]
        .sort((a,b)=>b[1]-a[1])
        .map(([name,total])=>row(name,"Faturamento",money(total)))
        .join("")
    : '<div class="cash-empty">Sem dados no período.</div>';

  const paymentLabels={cash:"Dinheiro",pix:"Pix",credit:"Crédito",debit:"Débito",other:"Outro"};
  const byPayment=new Map();

  tx.filter(t=>t.direction==="in").forEach(t=>{
    const key=t.payment_method||"other";
    byPayment.set(key,(byPayment.get(key)||0)+Number(t.net_amount||0));
  });

  $("paymentReportList").innerHTML=byPayment.size
    ? [...byPayment.entries()]
        .sort((a,b)=>b[1]-a[1])
        .map(([key,total])=>row(paymentLabels[key]||key,"Recebido",money(total)))
        .join("")
    : '<div class="cash-empty">Sem recebimentos no período.</div>';


  const serviceTotal=tx.filter(t=>t.transaction_type==="service"&&t.direction==="in")
    .reduce((s,t)=>s+Number(t.net_amount||0),0);
  const productTotal=tx.filter(t=>t.transaction_type==="product"&&t.direction==="in")
    .reduce((s,t)=>s+Number(t.net_amount||0),0);

  $("salesTypeReportList").innerHTML=[
    row("Serviços","Receita de atendimentos",money(serviceTotal)),
    row("Produtos","Receita de produtos",money(productTotal))
  ].join("");

  const recurring=customers.filter(c=>Number(c.completed_visits||0)>=3).length;
  const dormant=customers.filter(c=>{
    if(!c.last_visit_at||c.next_visit_at) return false;
    return (Date.now()-new Date(c.last_visit_at).getTime())/86400000>=45;
  }).length;

  $("customerReportList").innerHTML=[
    row("Clientes recorrentes","3 ou mais atendimentos",String(recurring)),
    row("Sem retorno","45 dias ou mais",String(dormant))
  ].join("");
}

async function init(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return;

  const now=new Date();
  const start=new Date(now.getFullYear(),now.getMonth(),1);
  $("reportStart").value=dateInput(start);
  $("reportEnd").value=dateInput(now);

  document.querySelectorAll('.nav-item[data-section="relatorios"]').forEach(btn=>{
    btn.addEventListener("click",loadReport);
  });

  $("loadReportBtn")?.addEventListener("click",loadReport);
}

init();

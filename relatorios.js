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

function drawBarChart(canvas,labels,datasets){
  if(!canvas) return;
  const rect=canvas.getBoundingClientRect();
  const width=Math.max(320,rect.width||canvas.parentElement?.clientWidth||640);
  const height=210;
  const dpr=window.devicePixelRatio||1;

  canvas.width=width*dpr;
  canvas.height=height*dpr;
  canvas.style.width=width+"px";
  canvas.style.height=height+"px";

  const ctx=canvas.getContext("2d");
  ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,width,height);

  const padding={left:48,right:18,top:18,bottom:38};
  const plotW=width-padding.left-padding.right;
  const plotH=height-padding.top-padding.bottom;
  const values=datasets.flatMap(d=>d.values);
  const max=Math.max(1,...values);
  const groups=Math.max(1,labels.length);
  const groupW=plotW/groups;
  const barGap=4;
  const barW=Math.max(5,(groupW-14)/Math.max(1,datasets.length));

  ctx.font="10px Manrope";
  ctx.fillStyle="#75695f";
  ctx.strokeStyle="#e2d6ca";
  ctx.lineWidth=1;

  for(let i=0;i<=4;i++){
    const y=padding.top+plotH-(plotH*i/4);
    ctx.beginPath();
    ctx.moveTo(padding.left,y);
    ctx.lineTo(width-padding.right,y);
    ctx.stroke();
    const value=max*i/4;
    ctx.fillText(
      new Intl.NumberFormat("pt-BR",{notation:"compact",maximumFractionDigits:1}).format(value),
      4,y+3
    );
  }

  const palette=["#a86f3f","#2f6a4b","#6c86a3","#8b73a6"];

  labels.forEach((label,index)=>{
    const groupX=padding.left+index*groupW;
    datasets.forEach((dataset,di)=>{
      const value=Number(dataset.values[index]||0);
      const h=(value/max)*plotH;
      const x=groupX+7+di*(barW+barGap);
      const y=padding.top+plotH-h;
      ctx.fillStyle=palette[di%palette.length];
      ctx.fillRect(x,y,barW,h);
    });

    ctx.save();
    ctx.translate(groupX+groupW/2,height-13);
    ctx.rotate(-0.35);
    ctx.fillStyle="#685d54";
    ctx.textAlign="right";
    ctx.fillText(label,0,0);
    ctx.restore();
  });
}

function monthKey(date){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;
}

function last12Months(){
  const now=new Date();
  return Array.from({length:12},(_,i)=>{
    const d=new Date(now.getFullYear(),now.getMonth()-11+i,1);
    return {
      key:monthKey(d),
      label:d.toLocaleDateString("pt-BR",{month:"short"}).replace(".","")
    };
  });
}


async function loadReport(){
  const startValue=$("reportStart").value;
  const endValue=$("reportEnd").value;
  if(!startValue||!endValue) return;

  const start=new Date(`${startValue}T00:00:00`);
  const end=new Date(`${endValue}T23:59:59.999`);

  const months=last12Months();
  const monthlyStart=new Date();
  monthlyStart.setDate(1);
  monthlyStart.setMonth(monthlyStart.getMonth()-11);
  monthlyStart.setHours(0,0,0,0);

  const results=await Promise.all([
    supabase.from("cash_transactions")
      .select("id,transaction_type,payment_method,direction,net_amount,status,created_at,professional:professionals(full_name)")
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
      .select("completed_visits,last_visit_at,next_visit_at"),
    supabase.from("cash_transactions")
      .select("created_at,direction,net_amount,status")
      .gte("created_at",monthlyStart.toISOString())
      .eq("status","posted")
  ]);

  const tx=results[0].data||[];
  const apps=results[1].data||[];
  const comm=results[2].data||[];
  const customers=results[3].data||[];
  const monthlyTx=results[4].data||[];

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


  const txIds=tx.map(t=>t.id);
  let saleItems=[];

  if(txIds.length){
    const {data:itemData}=await supabase
      .from("cash_transaction_items")
      .select("transaction_id,item_type,description,quantity,total_amount")
      .in("transaction_id",txIds);
    saleItems=itemData||[];
  }

  const serviceRanking=new Map();
  const productRanking=new Map();

  saleItems.forEach(item=>{
    const target=item.item_type==="service"?serviceRanking:item.item_type==="product"?productRanking:null;
    if(!target) return;
    const key=item.description||"Item";
    if(!target.has(key)) target.set(key,{qty:0,total:0});
    const value=target.get(key);
    value.qty+=Number(item.quantity||0);
    value.total+=Number(item.total_amount||0);
  });

  const renderRanking=(target,map,emptyText)=>{
    target.innerHTML=map.size
      ? [...map.entries()]
          .sort((a,b)=>b[1].qty-a[1].qty || b[1].total-a[1].total)
          .slice(0,10)
          .map(([name,value],index)=>row(
            `${index+1}. ${name}`,
            `${Number(value.qty).toLocaleString("pt-BR")} vendidos`,
            money(value.total)
          )).join("")
      : `<div class="cash-empty">${emptyText}</div>`;
  };

  renderRanking($("serviceSalesRanking"),serviceRanking,"Sem serviços vendidos no período.");
  renderRanking($("productSalesRanking"),productRanking,"Sem produtos vendidos no período.");

  const monthlyRevenue=months.map(month=>
    monthlyTx
      .filter(t=>monthKey(new Date(t.created_at))===month.key&&t.direction==="in")
      .reduce((sum,t)=>sum+Number(t.net_amount||0),0)
  );

  const monthlyIn=[...monthlyRevenue];
  const monthlyOut=months.map(month=>
    monthlyTx
      .filter(t=>monthKey(new Date(t.created_at))===month.key&&t.direction==="out")
      .reduce((sum,t)=>sum+Number(t.net_amount||0),0)
  );

  drawBarChart(
    $("monthlyRevenueChart"),
    months.map(m=>m.label),
    [{label:"Faturamento",values:monthlyRevenue}]
  );

  drawBarChart(
    $("monthlyCashFlowChart"),
    months.map(m=>m.label),
    [
      {label:"Entradas",values:monthlyIn},
      {label:"Saídas",values:monthlyOut}
    ]
  );

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
  window.addEventListener("resize",()=>{
    if(document.getElementById("relatorios")?.classList.contains("active")) loadReport();
  });
}

init();

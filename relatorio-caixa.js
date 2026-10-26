import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PAYMENT_LABELS, fetchPaymentSplits, paymentParts, describePayment } from "./pagamentos.js";
const db=createClient("https://cjtgjqxkyvgjlhylrvas.supabase.co","sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE");
const fmt=n=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(n||0));
const dt=d=>d?new Date(d).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}):"—";
const esc=s=>String(s??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let report=null;
async function fetchAll(table,filter,columns="*"){
  let rows=[],from=0;
  while(true){
    let query=db.from(table).select(columns).range(from,from+499);
    query=filter(query);
    const {data,error}=await query;
    if(error) throw new Error(error.message);
    rows.push(...(data||[]));
    if(!data||data.length<500) break;
    from+=500;
  }
  return rows;
}
async function load(session){
  const slot=document.getElementById("cashClosingReport");
  if(!slot||!session)return;
  slot.innerHTML='<p class="c7-report-loading">Carregando a conferência do período...</p>';
  report=null;
  try{
    const [transactions,consumptions]=await Promise.all([
      fetchAll("cash_transactions",q=>q.eq("session_id",session.id).order("created_at",{ascending:true})),
      fetchAll("employee_consumptions",q=>q.eq("cash_session_id",session.id).order("created_at",{ascending:true}),"id,professional_id,product_id,quantity,unit_price,total_amount,status,created_at,notes")
    ]);
    const appointmentIds=[...new Set(transactions.filter(x=>x.appointment_id&&x.transaction_type==="service"&&x.status!=="cancelled").map(x=>x.appointment_id))];
    const [items,professionals,products]=await Promise.all([
      appointmentIds.length?fetchAll("appointment_products",q=>q.in("appointment_id",appointmentIds),"appointment_id,product_name,quantity,total_amount,department"):Promise.resolve([]),
      fetchAll("professionals",q=>q.order("full_name"),"id,full_name"),
      fetchAll("products",q=>q.order("name"),"id,name")
    ]);
    const pro=new Map(professionals.map(x=>[String(x.id),x.full_name]));
    const prod=new Map(products.map(x=>[String(x.id),x.name]));
    const posted=transactions.filter(x=>x.status!=="cancelled");
    const splits=await fetchPaymentSplits(db,posted.map(x=>x.id));
    const total=(arr)=>arr.reduce((n,x)=>n+Number(x.net_amount||0),0);
    const ins=posted.filter(x=>x.direction==="in"), outs=posted.filter(x=>x.direction==="out");
    const services=posted.filter(x=>x.transaction_type==="service");
    const productSales=posted.filter(x=>x.transaction_type==="product");
    const consumptionAmount=consumptions.filter(x=>x.status!=="cancelled").reduce((n,x)=>n+Number(x.total_amount||0),0);
    const expected=Number(session.opening_amount||0)+total(ins)-total(outs);
    const byMethod=new Map();
    ins.forEach(x=>paymentParts(x,splits).forEach(part=>byMethod.set(part.method,(byMethod.get(part.method)||0)+part.amount)));
    report={session,transactions,consumptions,items,pro,prod,expected,splits};
    const row=(label,value)=>'<div class="c7-report-line"><span>'+esc(label)+'</span><strong>'+fmt(value)+'</strong></div>';
    slot.innerHTML=`
    <div class="c7-report-header"><div><span>RESUMO DA SESSÃO</span><h3>Conferência do caixa</h3><small>${esc(dt(session.opened_at))} até ${esc(session.closed_at?dt(session.closed_at):"agora")}</small></div><b>${posted.length} lançamentos</b></div>
    <div class="c7-report-kpis">
      <div><small>ABERTURA</small><strong>${fmt(session.opening_amount)}</strong></div>
      <div><small>ENTRADAS</small><strong>${fmt(total(ins))}</strong></div>
      <div><small>SAÍDAS</small><strong>${fmt(total(outs))}</strong></div>
      <div><small>SALDO PREVISTO</small><strong>${fmt(expected)}</strong></div>
    </div>
    <div class="c7-report-grid">
      <section><h4>Atendimentos <small>${services.length}</small></h4>
        ${services.length?services.map(x=>row(x.description||"Atendimento",x.net_amount)).join(""):'<p>Sem atendimentos recebidos.</p>'}
      </section>
      <section><h4>Produtos vendidos <small>${productSales.length+items.length}</small></h4>
        ${productSales.map(x=>row(x.description||"Venda de produto",x.net_amount)).join("")}
        ${items.map(x=>row((x.product_name||"Produto")+" · "+x.quantity+" un. (incluído no atendimento)",x.total_amount)).join("")}
        ${!productSales.length&&!items.length?'<p>Sem produtos registrados.</p>':""}
        <small>Produtos vinculados a atendimentos já estão incluídos no total do respectivo atendimento, sem soma em duplicidade.</small>
      </section>
      <section><h4>Consumo da equipe <small>${consumptions.length}</small></h4>
        ${consumptions.length?consumptions.map(x=>row((pro.get(String(x.professional_id))||"Colaborador")+" · "+(prod.get(String(x.product_id))||"Produto")+" · "+x.quantity+" un. ("+x.status+")",x.total_amount)).join(""):'<p>Nenhum consumo registrado.</p>'}
        <small>Total consumido: ${fmt(consumptionAmount)}. Consumo não é receita automática do Caixa.</small>
      </section>
      <section><h4>Recebido por forma de pagamento</h4>
        ${byMethod.size?[...byMethod.entries()].sort((a,b)=>b[1]-a[1]).map(([method,value])=>row(PAYMENT_LABELS[method]||method,value)).join(""):'<p>Nenhum recebimento.</p>'}
      </section>
      <section><h4>Movimentações e pagamentos</h4>
        ${posted.length?posted.map(x=>row((x.direction==="out"?"− ":"+ ")+(x.description||x.transaction_type)+" · "+describePayment(x,splits,fmt),(x.direction==="out"?-1:1)*Number(x.net_amount||0))).join(""):'<p>Nenhum lançamento.</p>'}
      </section>
    </div>
    <div class="c7-report-actions">
      <button type="button" id="cashReportPrint">IMPRIMIR / SALVAR PDF</button>
      <button type="button" id="cashReportCsv">BAIXAR PLANILHA CSV</button>
    </div>`;
    document.getElementById("cashReportPrint").addEventListener("click",print);
    document.getElementById("cashReportCsv").addEventListener("click",csv);
    const expectedInput=document.getElementById("closingAmount");
    if(expectedInput&&document.getElementById("closeCashModal")&&!document.getElementById("closeCashModal").classList.contains("hidden")){
      document.getElementById("closeExpected").textContent=fmt(expected);
      expectedInput.dataset.expected=String(expected);
      if(document.activeElement!==expectedInput){expectedInput.value=expected.toFixed(2);expectedInput.dispatchEvent(new Event("input"));}
    }
  }catch(e){slot.innerHTML='<p class="c7-report-error">Não foi possível carregar o relatório: '+esc(e.message)+'. Confira antes de fechar.</p>';}
}
function csv(){
  if(!report)return;
  const rows=[["C7 BARBEARIA TRADICIONAL — RELATÓRIO DO CAIXA"],["Abertura",dt(report.session.opened_at)],["Fechamento",dt(report.session.closed_at)||"Em andamento"],["Saldo previsto",report.expected.toFixed(2)],[],["TIPO","DATA/HORA","DESCRIÇÃO","RESPONSÁVEL","QUANTIDADE","FORMA","VALOR (R$)","STATUS"]];
  report.transactions.forEach(x=>rows.push(["CAIXA",dt(x.created_at),x.description||x.transaction_type,"","",x.payment_method?describePayment(x,report.splits,fmt):"",((x.direction==="out"?-1:1)*Number(x.net_amount||0)).toFixed(2),x.status]));
  report.items.forEach(x=>rows.push(["PRODUTO NO ATENDIMENTO","",x.product_name,"",x.quantity,"Incluído no atendimento",Number(x.total_amount||0).toFixed(2),"Informativo - não somar"]));
  report.consumptions.forEach(x=>rows.push(["CONSUMO EQUIPE",dt(x.created_at),report.prod.get(String(x.product_id))||"Produto",report.pro.get(String(x.professional_id))||"Colaborador",x.quantity,"Não é receita",Number(x.total_amount||0).toFixed(2),x.status]));
  const content="\ufeff"+rows.map(row=>row.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(";")).join("\r\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([content],{type:"text/csv;charset=utf-8"}));a.download="C7-Fechamento-"+new Date(report.session.opened_at).toISOString().slice(0,10)+".csv";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3000);
}
function print(){
  if(!report)return;
  const body=document.getElementById("cashClosingReport").cloneNode(true);
  body.querySelector(".c7-report-actions")?.remove();
  const w=window.open("","_blank");
  if(!w){alert("Permita pop-ups para gerar o PDF.");return;}
  w.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>C7 — Relatório de caixa</title><style>body{font-family:Arial,sans-serif;color:#241f1b;margin:35px}h1{font-size:25px}.c7-report-header{display:flex;justify-content:space-between;border-bottom:2px solid #222;padding-bottom:14px}.c7-report-header h3{font-size:25px;margin:7px 0}.c7-report-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}.c7-report-kpis div{background:#f4f2f0;padding:12px;border-radius:7px}.c7-report-kpis strong{display:block;margin-top:10px}.c7-report-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.c7-report-grid section{border:1px solid #ddd;padding:14px;break-inside:avoid}.c7-report-grid h4{margin:0 0 12px}.c7-report-line{display:flex;justify-content:space-between;gap:14px;border-bottom:1px solid #eee;padding:7px 0;font-size:12px}.c7-report-line strong{white-space:nowrap}small{color:#777;font-size:11px}@media print{body{margin:12mm}}</style></head><body><h1>C7 BARBEARIA TRADICIONAL</h1>'+body.innerHTML+'</body></html>');
  w.document.close();w.focus();setTimeout(()=>w.print(),350);
}
window.C7ClosingReport={load};

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
      const pay=document.createElement("button");
      pay.type="button";
      pay.textContent="MARCAR PAGO";
      pay.addEventListener("click",async()=>{
        if(!confirm("Marcar as comissões pendentes deste barbeiro como pagas?")) return;
        const {error}=await supabase.from("commission_entries").update({
          status:"paid",
          paid_at:new Date().toISOString()
        }).in("id",values.ids);

        if(error){
          alert("Não foi possível atualizar as comissões.");
          return;
        }
        await loadCommissions();
      });
      actions.appendChild(pay);
    }

    row.append(main,actions);
    target.appendChild(row);
  });
}

async function loadCashHistory(){
  if(!["admin","reception"].includes(currentRole)) return;

  const {data,error}=await supabase
    .from("cash_sessions")
    .select("id,opened_at,opening_amount,closed_at,closing_amount,status,notes")
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
      .select("direction,net_amount,status")
      .eq("session_id",session.id)
      .eq("status","posted");

    const tx=transactions||[];
    const totalIn=tx.filter(t=>t.direction==="in").reduce((s,t)=>s+Number(t.net_amount||0),0);
    const totalOut=tx.filter(t=>t.direction==="out").reduce((s,t)=>s+Number(t.net_amount||0),0);
    const expected=Number(session.opening_amount||0)+totalIn-totalOut;
    const difference=session.closing_amount==null?null:Number(session.closing_amount)-expected;

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

async function loadFinance(){
  await Promise.all([loadCommissions(),loadCashHistory()]);
}

async function init(){
  if(!await loadContext()) return;
  document.querySelectorAll('.nav-item[data-section="caixa"]').forEach(btn=>btn.addEventListener("click",loadFinance));
  $("refreshCommissionsBtn")?.addEventListener("click",loadCommissions);
  $("refreshCashHistoryBtn")?.addEventListener("click",loadCashHistory);
}

init();

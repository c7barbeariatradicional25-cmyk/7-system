import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase=createClient(
  "https://cjtgjqxkyvgjlhylrvas.supabase.co",
  "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE"
);

const $=id=>document.getElementById(id);
let currentRole=null;

async function loadContext(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return false;
  const {data}=await supabase.from("profiles").select("role").eq("user_id",session.user.id).single();
  currentRole=data?.role||null;
  return true;
}

function time(v){
  return new Date(v).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
}

function serviceNames(a){
  return (a.appointment_services||[]).map(s=>s.service_name).join(" + ")||"Serviço";
}

function renderColumn(targetId,items){
  const target=$(targetId);
  target.replaceChildren();

  if(!items.length){
    const empty=document.createElement("div");
    empty.className="ops-empty";
    empty.textContent="Nenhum atendimento.";
    target.appendChild(empty);
    return;
  }

  items.forEach(a=>{
    const card=document.createElement("div");
    card.className="ops-card";

    const head=document.createElement("div");
    head.className="ops-card-head";

    const name=document.createElement("strong");
    name.textContent=a.customer?.full_name||"Cliente";

    const hour=document.createElement("span");
    hour.textContent=time(a.starts_at);

    head.append(name,hour);

    const meta=document.createElement("div");
    meta.className="ops-card-meta";
    meta.textContent=`${serviceNames(a)} • ${a.professional?.full_name||"Sem profissional"}`;

    const actions=document.createElement("div");
    actions.className="ops-card-actions";

    if(["admin","reception"].includes(currentRole)){
      if(["scheduled","confirmed"].includes(a.status)){
        const btn=document.createElement("button");
        btn.className="primary";
        btn.textContent="CLIENTE CHEGOU";
        btn.addEventListener("click",()=>setStatus(a.id,"waiting",{arrived_at:new Date().toISOString()}));
        actions.appendChild(btn);
      }

      if(a.status==="waiting"){
        const btn=document.createElement("button");
        btn.className="primary";
        btn.textContent="INICIAR ATENDIMENTO";
        btn.addEventListener("click",()=>setStatus(a.id,"in_service",{service_started_at:new Date().toISOString()}));
        actions.appendChild(btn);
      }

      if(a.status==="in_service"){
        const btn=document.createElement("button");
        btn.className="primary";
        btn.textContent="FINALIZAR";
        btn.addEventListener("click",()=>setStatus(a.id,"completed",{completed_at:new Date().toISOString()}));
        actions.appendChild(btn);
      }
    }

    card.append(head,meta,actions);
    target.appendChild(card);
  });
}

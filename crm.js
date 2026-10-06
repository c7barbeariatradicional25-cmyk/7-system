import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  "https://cjtgjqxkyvgjlhylrvas.supabase.co",
  "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE"
);

const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(value||0));

let customers = [];
let professionals = [];
let currentRole = null;
let currentUser = null;

const statusLabels={scheduled:"Agendado",confirmed:"Confirmado",waiting:"Aguardando",in_service:"Em atendimento",completed:"Finalizado",cancelled:"Cancelado",no_show:"Faltou"};

function esc(value=""){
  return String(value)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function daysSince(value){
  if(!value) return null;
  return Math.floor((Date.now()-new Date(value).getTime())/86400000);
}

function statusText(customer){
  if(customer.next_visit_at) return "Próximo horário agendado";
  const days=daysSince(customer.last_visit_at);
  if(days===null) return "Ainda sem atendimento concluído";
  if(days>=45) return `Sem retorno há ${days} dias`;
  if(days<=15) return "Cliente recente";
  return `Última visita há ${days} dias`;
}

async function loadContext(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return false;
  currentUser=session.user.id;
  const {data}=await supabase.from("profiles").select("role").eq("user_id",currentUser).single();
  currentRole=data?.role||null;
  return true;
}

async function loadProfessionals(){
  const {data}=await supabase.from("professionals").select("id,full_name").eq("active",true).order("full_name");
  professionals=data||[];
  const select=$("crmPreferredProfessional");
  if(select){
    select.innerHTML='<option value="">Sem preferência</option>'+professionals.map(p=>`<option value="${p.id}">${esc(p.full_name)}</option>`).join("");
  }
}

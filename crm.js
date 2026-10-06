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

async function loadCustomers(){
  const result=await supabase.from("customer_crm_summary").select("*").order("full_name",{ascending:true});
  if(result.error) return;
  customers=result.data||[];
  renderCustomers(customers);
}

function makeEl(tag,className,text){
  const el=document.createElement(tag);
  if(className) el.className=className;
  if(text!==undefined) el.textContent=text;
  return el;
}

function renderCustomers(items){
  const list=$("customerList");
  const active=items.filter(c=>c.active!==false);

  $("crmTotalCustomers").textContent=active.length;
  $("crmRecurringCustomers").textContent=active.filter(c=>Number(c.completed_visits)>=3).length;

  const dormant=active.filter(c=>{
    const days=daysSince(c.last_visit_at);
    return days!==null && days>=45 && !c.next_visit_at;
  });
  $("crmDormantCustomers").textContent=dormant.length;
  $("crmTotalSpent").textContent=money(active.reduce((sum,c)=>sum+Number(c.total_spent||0),0));

  list.replaceChildren();

  if(!active.length){
    list.appendChild(makeEl("div","agenda-empty","Nenhum cliente encontrado."));
    return;
  }

  active.forEach(customer=>{
    const card=makeEl("article","customer-card");
    const info=makeEl("div");
    info.appendChild(makeEl("strong","",customer.full_name||"Cliente"));
    info.appendChild(makeEl("span","",customer.phone||"Sem telefone"));

    if(customer.tags?.length){
      const tags=makeEl("div","tag-row");
      customer.tags.forEach(tag=>tags.appendChild(makeEl("span","tag-pill",tag)));
      info.appendChild(tags);
    }

    const visits=makeEl("div","customer-metric");
    visits.appendChild(makeEl("strong","",String(customer.completed_visits||0)));
    visits.appendChild(makeEl("small","","ATENDIMENTOS"));

    const spent=makeEl("div","customer-metric");
    spent.appendChild(makeEl("strong","",money(customer.total_spent)));
    const last=customer.last_visit_at ? new Date(customer.last_visit_at).toLocaleDateString("pt-BR") : "—";
    spent.appendChild(makeEl("small","",`TOTAL GASTO • ÚLTIMA ${last}`));
    spent.appendChild(makeEl("span","",statusText(customer)));

    const button=makeEl("button","customer-open","ABRIR PERFIL");
    button.type="button";
    button.addEventListener("click",()=>openCustomer(customer.id));

    card.append(info,visits,spent,button);
    list.appendChild(card);
  });
}

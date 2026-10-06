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

function applySearch(){
  const term=($("customerSearch")?.value||"").trim().toLowerCase();
  if(!term){renderCustomers(customers);return}
  renderCustomers(customers.filter(c=>
    String(c.full_name||"").toLowerCase().includes(term) ||
    String(c.phone||"").toLowerCase().includes(term)
  ));
}

async function loadHistory(customerId){
  const result=await supabase
    .from("appointments")
    .select("starts_at,status,total_amount,professional:professionals(full_name),appointment_services(service_name)")
    .eq("customer_id",customerId)
    .order("starts_at",{ascending:false});

  const target=$("customerHistoryList");
  target.replaceChildren();

  if(result.error){
    target.appendChild(makeEl("div","agenda-empty","Não foi possível carregar o histórico."));
    return;
  }

  if(!result.data?.length){
    target.appendChild(makeEl("div","agenda-empty","Nenhum atendimento registrado."));
    return;
  }

  result.data.forEach(item=>{
    const row=makeEl("div","history-row");
    const left=makeEl("div");
    left.appendChild(makeEl("strong","",new Date(item.starts_at).toLocaleDateString("pt-BR")));
    left.appendChild(makeEl("span","",statusLabels[item.status]||item.status));

    const center=makeEl("div");
    const services=(item.appointment_services||[]).map(s=>s.service_name).join(" + ")||"Serviço";
    center.appendChild(makeEl("strong","",services));
    center.appendChild(makeEl("span","",item.professional?.full_name||"Sem profissional"));

    row.append(left,center,makeEl("div","history-value",money(item.total_amount)));
    target.appendChild(row);
  });
}

async function openCustomer(id=null){
  $("customerForm").reset();
  $("customerMessage").textContent="";
  $("customerId").value=id||"";
  $("customerModalTitle").textContent=id?"Perfil do cliente":"Novo cliente";
  $("customerHistory").classList.toggle("hidden",!id);

  if(id){
    const customer=customers.find(c=>c.id===id);
    if(!customer) return;

    $("crmCustomerName").value=customer.full_name||"";
    $("crmCustomerPhone").value=customer.phone||"";
    $("crmCustomerEmail").value=customer.email||"";
    $("crmCustomerBirthDate").value=customer.birth_date||"";
    $("crmPreferredProfessional").value=customer.preferred_professional_id||"";
    $("crmCustomerTags").value=(customer.tags||[]).join(", ");
    $("crmCustomerNotes").value=customer.notes||"";
    $("crmMarketingOptIn").checked=Boolean(customer.marketing_opt_in);
    await loadHistory(id);
  }

  $("customerModal").classList.remove("hidden");
}

function closeCustomer(){
  $("customerModal").classList.add("hidden");
}

async function saveCustomer(event){
  event.preventDefault();

  if(!["admin","reception"].includes(currentRole)){
    $("customerMessage").textContent="Seu perfil não possui permissão para alterar clientes.";
    return;
  }

  const id=$("customerId").value||null;
  const payload={
    full_name:$("crmCustomerName").value.trim(),
    phone:$("crmCustomerPhone").value.trim()||null,
    email:$("crmCustomerEmail").value.trim()||null,
    birth_date:$("crmCustomerBirthDate").value||null,
    preferred_professional_id:$("crmPreferredProfessional").value||null,
    tags:$("crmCustomerTags").value.split(",").map(v=>v.trim()).filter(Boolean),
    notes:$("crmCustomerNotes").value.trim()||null,
    marketing_opt_in:$("crmMarketingOptIn").checked,
    updated_at:new Date().toISOString(),
    updated_by:currentUser
  };

  if(!payload.full_name){
    $("customerMessage").textContent="Informe o nome do cliente.";
    return;
  }

  $("customerMessage").textContent="Salvando...";
  const result=id
    ? await supabase.from("customers").update(payload).eq("id",id)
    : await supabase.from("customers").insert(payload);

  if(result.error){
    $("customerMessage").textContent="Não foi possível salvar o cliente.";
    return;
  }

  closeCustomer();
  await loadCustomers();
}

async function initCRM(){
  if(!await loadContext()) return;

  await loadProfessionals();

  document.querySelectorAll('.nav-item[data-section="clientes"]').forEach(btn=>{
    btn.addEventListener("click",loadCustomers);
  });

  $("customerSearch")?.addEventListener("input",applySearch);
  $("newCustomerBtn")?.addEventListener("click",()=>openCustomer());
  $("customerForm")?.addEventListener("submit",saveCustomer);

  document.querySelectorAll("[data-close-customer]").forEach(el=>{
    el.addEventListener("click",closeCustomer);
  });
}

initCRM();

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

    const identity=makeEl("div","customer-identity");
    const avatar=makeEl("div","customer-avatar",(customer.full_name||"C").slice(0,1).toUpperCase());
    const identityText=makeEl("div","customer-identity-text");
    identityText.appendChild(makeEl("strong","customer-name",customer.full_name||"Cliente"));
    identityText.appendChild(makeEl("span","customer-phone",customer.phone||"Sem telefone"));

    if(customer.tags?.length){
      const tags=makeEl("div","tag-row");
      customer.tags.forEach(tag=>tags.appendChild(makeEl("span","tag-pill",tag)));
      identityText.appendChild(tags);
    }

    identity.append(avatar,identityText);

    const last=customer.last_visit_at
      ? new Date(customer.last_visit_at).toLocaleDateString("pt-BR")
      : "—";

    const next=customer.next_visit_at
      ? new Date(customer.next_visit_at).toLocaleString("pt-BR",{
          day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"
        })
      : "—";

    const metrics=makeEl("div","customer-metrics-grid");

    const visits=makeEl("div","customer-metric");
    visits.appendChild(makeEl("small","","ATENDIMENTOS"));
    visits.appendChild(makeEl("strong","",String(customer.completed_visits||0)));

    const spent=makeEl("div","customer-metric");
    spent.appendChild(makeEl("small","","TOTAL GASTO"));
    spent.appendChild(makeEl("strong","",money(customer.total_spent)));

    const lastVisit=makeEl("div","customer-metric");
    lastVisit.appendChild(makeEl("small","","ÚLTIMA VISITA"));
    lastVisit.appendChild(makeEl("strong","",last));

    const nextVisit=makeEl("div","customer-metric");
    nextVisit.appendChild(makeEl("small","","PRÓXIMO HORÁRIO"));
    nextVisit.appendChild(makeEl("strong","",next));
    nextVisit.appendChild(makeEl("span","customer-status-text",statusText(customer)));

    metrics.append(visits,spent,lastVisit,nextVisit);

    const button=makeEl("button","customer-open","ABRIR PERFIL");
    button.type="button";
    button.addEventListener("click",()=>openCustomer(customer.id));

    card.append(identity,metrics,button);
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

async function loadConsumptionProfile(customerId){
  const target=$("customerInsights");
  if(!target) return;

  const {data,error}=await supabase
    .from("cash_transactions")
    .select("id,created_at,net_amount,transaction_type,cash_transaction_items(item_type,description,quantity,total_amount,product:products(name,department,category))")
    .eq("customer_id",customerId)
    .eq("status","posted")
    .order("created_at",{ascending:false});

  if(error){
    target.classList.remove("hidden");
    $("customerTopServices").innerHTML='<div class="agenda-empty">Não foi possível carregar o perfil de consumo.</div>';
    $("customerTopProducts").innerHTML="";
    $("customerTopConvenience").innerHTML="";
    return;
  }

  const transactions=data||[];
  const totalSpent=transactions.reduce((sum,t)=>sum+Number(t.net_amount||0),0);
  const ticket=transactions.length?totalSpent/transactions.length:0;

  $("customerInsightPurchases").textContent=String(transactions.length);
  $("customerInsightSpent").textContent=money(totalSpent);
  $("customerInsightTicket").textContent=money(ticket);

  const serviceMap=new Map();
  const productMap=new Map();
  const convenienceMap=new Map();

  transactions.forEach(transaction=>{
    (transaction.cash_transaction_items||[]).forEach(item=>{
      const qty=Number(item.quantity||0);
      const total=Number(item.total_amount||0);

      if(item.item_type==="service"){
        const key=item.description||"Serviço";
        const current=serviceMap.get(key)||{qty:0,total:0};
        current.qty+=qty;
        current.total+=total;
        serviceMap.set(key,current);
        return;
      }

      if(item.item_type==="product"){
        const key=item.product?.name||item.description||"Produto";
        const targetMap=item.product?.department==="convenience"?convenienceMap:productMap;
        const current=targetMap.get(key)||{qty:0,total:0};
        current.qty+=qty;
        current.total+=total;
        targetMap.set(key,current);
      }
    });
  });

  const renderRanking=(element,map,emptyText)=>{
    if(!element) return;
    if(!map.size){
      element.innerHTML='<div class="customer-insight-empty">'+emptyText+'</div>';
      return;
    }

    element.innerHTML=[...map.entries()]
      .sort((a,b)=>b[1].qty-a[1].qty || b[1].total-a[1].total)
      .slice(0,5)
      .map(([name,value],index)=>
        '<div class="customer-insight-row"><span>'+(index+1)+'. '+esc(name)+'</span><strong>'+Number(value.qty).toLocaleString("pt-BR")+'×</strong></div>'
      ).join("");
  };

  renderRanking($("customerTopServices"),serviceMap,"Nenhum serviço registrado.");
  renderRanking($("customerTopProducts"),productMap,"Nenhum produto de barbearia comprado.");
  renderRanking($("customerTopConvenience"),convenienceMap,"Nenhuma bebida ou consumível registrado.");

  target.classList.remove("hidden");
}

async function openCustomer(id=null){
  $("customerForm").reset();
  $("customerMessage").textContent="";
  $("customerId").value=id||"";
  $("customerModalTitle").textContent=id?"Perfil do cliente":"Novo cliente";
  $("customerHistory").classList.toggle("hidden",!id);
  $("customerInsights")?.classList.toggle("hidden",!id);

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
    await Promise.all([loadHistory(id),loadConsumptionProfile(id)]);
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

window.addEventListener("c7-customer-consumption-updated",async()=>{
  const id=$("customerId")?.value;
  if(id) await loadConsumptionProfile(id);
  await loadCustomers();
});

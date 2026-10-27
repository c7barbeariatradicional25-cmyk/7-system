import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchLevels, fetchCustomerLevelMap, fetchMonthUses, benefitsWithBalance, levelBadge, benefitText, nextLevelHint } from "./niveis.js";

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
let rights=null;
let levels=[];
let levelMap=new Map();
const levelOf=customerId=>{const row=levelMap.get(String(customerId));return levels.find(l=>String(l.id)===String(row?.level_id))||null;};
function can(key){return currentRole==="admin" || (rights?Boolean(rights[key]):["admin","reception"].includes(currentRole));}

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

async function loadContext(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return false;
  currentUser=session.user.id;
  const {data}=await supabase.from("profiles").select("role").eq("user_id",currentUser).single();
  currentRole=data?.role||null;
  const {data:permissionRow}=await supabase.from("staff_permissions").select("permissions").eq("email",session.user.email.toLowerCase()).maybeSingle();
  rights=permissionRow?.permissions||null;
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
  if(!can("clients.read"))return;
  const result=await supabase.from("customer_crm_summary").select("*").order("full_name",{ascending:true});
  if(result.error) return;
  customers=result.data||[];
  [levels,levelMap]=await Promise.all([fetchLevels(supabase),fetchCustomerLevelMap(supabase)]);
  const levelFilter=$("crmLevelFilter");
  if(levelFilter){
    const current=levelFilter.value;
    levelFilter.innerHTML='<option value="">Todos os níveis</option>'+levels.map(l=>`<option value="${l.id}">${l.name}</option>`).join("");
    levelFilter.value=current;
    levelFilter.classList.toggle("hidden",!levels.length);
  }
  renderCustomers(customers);
}

function makeEl(tag,className,text){
  const el=document.createElement(tag);
  if(className) el.className=className;
  if(text!==undefined) el.textContent=text;
  return el;
}

// Situação do cliente em uma etiqueta: cor + texto curto.
function customerSituation(customer){
  if(customer.next_visit_at) return {status:"scheduled",text:"Horário marcado"};
  const days=daysSince(customer.last_visit_at);
  if(days===null) return {status:"cancelled",text:"Novo"};
  if(days>=45) return {status:"no_show",text:`Sem retorno · ${days} dias`};
  if(days<=15) return {status:"completed",text:"Recente"};
  return {status:"confirmed",text:`Veio há ${days} dias`};
}

const isDormant=c=>{const days=daysSince(c.last_visit_at);return days!==null&&days>=45&&!c.next_visit_at;};
const crmFilters={
  all:()=>true,
  scheduled:c=>Boolean(c.next_visit_at),
  recurring:c=>Number(c.completed_visits)>=3,
  dormant:isDormant
};
let crmFilter="all";

function renderCustomers(items){
  const list=$("customerList");
  const all=customers.filter(c=>c.active!==false);
  const levelFilter=$("crmLevelFilter")?.value||"";
  const active=items.filter(c=>c.active!==false&&crmFilters[crmFilter](c)&&(!levelFilter||String(levelOf(c.id)?.id)===levelFilter));

  $("crmTotalCustomers").textContent=all.length;
  $("crmScheduledCustomers").textContent=all.filter(crmFilters.scheduled).length;
  $("crmRecurringCustomers").textContent=all.filter(crmFilters.recurring).length;
  $("crmDormantCustomers").textContent=all.filter(isDormant).length;

  list.replaceChildren();

  if(!active.length){
    list.appendChild(makeEl("div","agenda-empty","Nenhum cliente encontrado."));
    return;
  }

  active.forEach(customer=>{
    const row=makeEl("button","customer-row");
    row.type="button";
    row.addEventListener("click",()=>openCustomer(customer.id));

    const identity=makeEl("div","customer-identity");
    identity.appendChild(makeEl("div","customer-avatar",(customer.full_name||"C").slice(0,1).toUpperCase()));
    const identityText=makeEl("div","customer-identity-text");
    const nameLine=makeEl("strong","customer-name",customer.full_name||"Cliente");
    const level=levelOf(customer.id);
    if(level&&level.sort_order>1) nameLine.insertAdjacentHTML("beforeend"," "+levelBadge(level));
    identityText.appendChild(nameLine);
    identityText.appendChild(makeEl("span","customer-phone",customer.phone||"Sem telefone"));
    (customer.tags||[]).forEach(tag=>identityText.appendChild(makeEl("span","tag-pill",tag)));
    identity.appendChild(identityText);

    const situation=customerSituation(customer);
    const pill=makeEl("span","c7-status",situation.text);
    pill.dataset.status=situation.status;
    if(customer.next_visit_at) pill.title=new Date(customer.next_visit_at).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
    const situationCell=makeEl("div","customer-cell");
    situationCell.appendChild(pill);

    row.append(
      identity,
      situationCell,
      makeEl("div","customer-cell customer-num",String(customer.completed_visits||0)),
      makeEl("div","customer-cell customer-money",money(customer.total_spent)),
      makeEl("div","customer-cell",customer.last_visit_at?new Date(customer.last_visit_at).toLocaleDateString("pt-BR"):"—")
    );
    list.appendChild(row);
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

$("crmLevelFilter")?.addEventListener("change",applySearch);
document.querySelectorAll("[data-crm-filter]").forEach(btn=>btn.addEventListener("click",()=>{
  crmFilter=btn.dataset.crmFilter;
  document.querySelectorAll("[data-crm-filter]").forEach(b=>b.classList.toggle("active",b===btn));
  applySearch();
}));

async function loadHistory(customerId){
  const result=await supabase
    .from("appointments")
    .select("id,starts_at,status,total_amount,professional:professionals(full_name),appointment_services(service_name)")
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

    const right=makeEl("div","history-value",money(item.total_amount));
    if(["admin","reception"].includes(currentRole)&&["scheduled","confirmed","waiting"].includes(item.status)&&new Date(item.starts_at)>new Date()){
      const rebook=makeEl("button","block-delete","REAGENDAR");
      rebook.type="button";
      rebook.addEventListener("click",()=>window.dispatchEvent(new CustomEvent("c7-request-reschedule",{detail:{appointmentId:item.id}})));
      right.appendChild(rebook);
      const cancel=makeEl("button","block-delete","CANCELAR HORÁRIO");
      cancel.type="button";
      cancel.addEventListener("click",async()=>{
        if(!confirm("Cancelar este agendamento?"))return;
        const {error}=await supabase.rpc("c7_cancel_appointment",{p_appointment_id:item.id});
        if(error){alert(error.message||"Não foi possível cancelar.");return;}
        await loadHistory(customerId);window.dispatchEvent(new Event("c7-appointment-cancelled"));
      });
      right.appendChild(cancel);
    }
    row.append(left,center,right);
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
  if(id&&!can("clients.read"))return;
  $("customerForm").reset();
  $("customerMessage").textContent="";
  $("customerId").value=id||"";
  $("customerModalTitle").textContent=id?"Perfil do cliente":"Novo cliente";
  $("deleteCustomerBtn")?.classList.toggle("hidden",!id||!can("clients.delete")||!can("clients.read"));
  $("customerHistory").classList.toggle("hidden",!id||!can("clients.history"));
  $("customerInsights")?.classList.toggle("hidden",!id||!can("clients.history"));
  $("crmLevelField")?.classList.toggle("hidden",!id||!levels.length);

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
    await renderLevelField(id);
    if(can("clients.history"))await Promise.all([loadHistory(id),loadConsumptionProfile(id)]);
  }

  $("customerModal").classList.remove("hidden");
}

// Nível no perfil: automático (pelas visitas) ou escolhido à mão, com os benefícios do mês.
async function renderLevelField(customerId){
  const select=$("crmCustomerLevel");
  if(!select||!levels.length) return;
  const row=levelMap.get(String(customerId));
  const current=levelOf(customerId);
  const autoLevel=row&&!row.level_locked?current:null;
  select.innerHTML=`<option value="auto">Automático${autoLevel?` (hoje: ${autoLevel.name})`:""}</option>`+
    levels.map(l=>`<option value="${l.id}">${l.name}${l.manual_only?" — escolhido pelo Arthur":""}</option>`).join("");
  select.value=row?.level_locked&&row.level_id!=null?String(row.level_id):"auto";

  const uses=await fetchMonthUses(supabase,customerId);
  const benefits=benefitsWithBalance(current,uses);
  const hint=nextLevelHint(levels,current,row);
  $("crmLevelInfo").innerHTML=`
    <div class="level-info-head">${levelBadge(current)}<small>${row?`${row.visits_90d} visita${Number(row.visits_90d)===1?"":"s"} nos últimos 90 dias`:""}</small></div>
    ${benefits.length?`<ul>${benefits.map(b=>`<li class="${b.remaining===0?"is-used":""}">${benefitText(b)}</li>`).join("")}</ul>`:'<p>Sem benefícios neste nível.</p>'}
    ${hint&&!row?.level_locked?`<p class="level-next">${hint.text}.</p>`:""}`;
}

function closeCustomer(){
  $("customerForm").reset();
  $("customerId").value="";
  $("customerModal").classList.add("hidden");
}

async function saveCustomer(event){
  event.preventDefault();

  const id=$("customerId").value||null;
  if(!can(id?"clients.edit":"clients.create")){
    $("customerMessage").textContent="Seu perfil não possui permissão para alterar clientes.";
    return;
  }

  const payload={
    full_name:$("crmCustomerName").value.trim(),
    phone:$("crmCustomerPhone").value.trim()||null,
    email:$("crmCustomerEmail").value.trim()||null,
    birth_date:$("crmCustomerBirthDate").value||null,
    preferred_professional_id:$("crmPreferredProfessional").value||null,
    tags:$("crmCustomerTags").value.split(",").map(v=>v.trim()).filter(Boolean),
    notes:$("crmCustomerNotes").value.trim()||null,
    marketing_opt_in:$("crmMarketingOptIn").checked,
    ...(id&&levels.length?{
      level_id:$("crmCustomerLevel").value==="auto"?null:$("crmCustomerLevel").value,
      level_locked:$("crmCustomerLevel").value!=="auto"
    }:{}),
    updated_at:new Date().toISOString(),
    updated_by:currentUser
  };

  if(!payload.full_name){
    $("customerMessage").textContent="Informe o nome do cliente.";
    return;
  }

  const normalizedPhone=(payload.phone||"").replace(/\D/g,"");
  const normalizedEmail=(payload.email||"").trim().toLowerCase();
  const normalizedName=payload.full_name.toLowerCase().replace(/\s+/g," ").trim();
  const {data:others,error:lookupError}=can("clients.read")?await supabase.from("customers").select("id,full_name,phone,email"):{data:[],error:null};
  if(lookupError){$("customerMessage").textContent="Não foi possível validar cadastros existentes.";return;}
  const duplicate=(others||[]).find(c=>{
    if(c.id===id)return false;
    const phone=(c.phone||"").replace(/\D/g,"");
    const email=(c.email||"").trim().toLowerCase();
    const name=(c.full_name||"").toLowerCase().replace(/\s+/g," ").trim();
    return (normalizedPhone&&phone===normalizedPhone)||(normalizedEmail&&email===normalizedEmail)||(name===normalizedName&&!normalizedPhone&&!normalizedEmail);
  });
  if(duplicate){$("customerMessage").textContent="Cliente já cadastrado: "+duplicate.full_name+". Abra o cadastro existente.";return;}
  $("customerMessage").textContent="Salvando...";
  const result=id
    ? await supabase.from("customers").update(payload).eq("id",id)
    : can("clients.read")?await supabase.from("customers").insert(payload):await supabase.rpc("c7_register_customer",{p_full_name:payload.full_name,p_phone:payload.phone,p_email:payload.email,p_birth_date:payload.birth_date,p_preferred_professional_id:payload.preferred_professional_id,p_tags:payload.tags,p_notes:payload.notes,p_marketing_opt_in:payload.marketing_opt_in});

  if(!id && !can("clients.read") && result.data==="exists"){$("customerMessage").textContent="Cliente já cadastrado. Solicite a um responsável com acesso aos clientes.";return;}
  if(result.error){
    $("customerMessage").textContent=String(result.error.message||"").includes("unique")?"Esse telefone já pertence a outro cliente.":"Não foi possível salvar o cliente.";
    return;
  }

  closeCustomer();
  await loadCustomers();
}


async function deleteCustomer(){
 const id=$("customerId")?.value;
 if(!id||!can("clients.delete")||!can("clients.read"))return;
 const customer=customers.find(c=>c.id===id);
 if(!customer)return;
 const question='Excluir "'+(customer.full_name||"este cliente")+'" da lista?\n\nO histórico de atendimentos e pagamentos será preservado.';
 if(!window.confirm(question))return;
 const button=$("deleteCustomerBtn");
 button.disabled=true;
 $("customerMessage").textContent="Excluindo cliente...";
 try{
   const {data,error}=await supabase.rpc("c7_archive_customer",{p_customer_id:id});
   if(error)throw error;
   if(data!==true)throw Error("Esse cliente já foi excluído ou não está mais disponível.");
   closeCustomer();
   await loadCustomers();
   window.C7UX?.notify("Cliente excluído da lista.");
 }catch(error){
   $("customerMessage").textContent=error.message||"Não foi possível excluir o cliente.";
 }finally{button.disabled=false;}
}

async function initCRM(){
  if(!await loadContext()) return;

  await loadProfessionals();
  if(!can("clients.read")){document.querySelector(".crm-stats")?.classList.add("hidden");$("customerSearch")?.classList.add("hidden");$("customerList")?.classList.add("hidden");}
  $("newCustomerBtn")?.classList.toggle("hidden",!can("clients.create"));

  document.querySelectorAll('.nav-item[data-section="clientes"]').forEach(btn=>{
    btn.addEventListener("click",loadCustomers);
  });

  $("customerSearch")?.addEventListener("input",applySearch);
  $("newCustomerBtn")?.addEventListener("click",()=>openCustomer());
  $("customerForm")?.addEventListener("submit",saveCustomer);
  $("deleteCustomerBtn")?.addEventListener("click",deleteCustomer);

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

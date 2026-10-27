import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { paymentLabel } from "./pagamentos.js";
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

  $("crmListCount").textContent=`(${active.length})`;
  let letter="";
  active.forEach(customer=>{
    const first=(customer.full_name||"#").trim().charAt(0).toUpperCase();
    if(first!==letter){letter=first;list.appendChild(makeEl("div","customer-letter",letter));}
    const row=makeEl("button","customer-row");
    row.type="button";
    row.dataset.customerId=customer.id;
    row.classList.toggle("is-selected",String(customer.id)===String(profileCustomerId));
    row.addEventListener("click",()=>openCustomerProfile(customer.id));

    const identity=makeEl("div","customer-identity");
    identity.appendChild(makeEl("div","customer-avatar",(customer.full_name||"C").slice(0,1).toUpperCase()));
    const identityText=makeEl("div","customer-identity-text");
    const nameLine=makeEl("strong","customer-name",customer.full_name||"Cliente");
    const level=levelOf(customer.id);
    if(level&&level.sort_order>1) nameLine.insertAdjacentHTML("beforeend"," "+levelBadge(level));
    identityText.appendChild(nameLine);
    identityText.appendChild(makeEl("span","customer-phone",customer.phone||"Sem telefone"));
    identity.appendChild(identityText);

    const situation=customerSituation(customer);
    const pill=makeEl("span","c7-status",situation.text);
    pill.dataset.status=situation.status;

    row.append(identity,pill);
    list.appendChild(row);
  });
}

/* Perfil do cliente à direita, como no Booksy: números, ações e abas. */
let profileCustomerId=null;
let profileTab="appointments";
async function openCustomerProfile(id){
  profileCustomerId=id;
  document.querySelectorAll(".customer-row").forEach(r=>r.classList.toggle("is-selected",r.dataset.customerId===String(id)));
  document.querySelector(".crm-split")?.classList.add("has-profile");
  const customer=customers.find(c=>String(c.id)===String(id));
  const target=$("customerProfile");
  if(!customer){target.innerHTML='<div class="crm-profile-empty"><strong>Cliente não encontrado</strong></div>';return;}
  const level=levelOf(id);
  const digits=String(customer.phone||"").replace(/\D/g,"");
  const wa=digits?`https://wa.me/${digits.length<=11?"55":""}${digits}`:"";
  target.innerHTML=`
    <button type="button" class="crm-profile-back">‹ Clientes</button>
    <div class="crm-profile-head">
      <div class="crm-profile-avatar">${esc((customer.full_name||"C").slice(0,1).toUpperCase())}</div>
      <h2>${esc(customer.full_name||"Cliente")}</h2>
      <span>${esc(customer.phone||"Sem telefone")}${customer.email?` · ${esc(customer.email)}`:""}</span>
      <div class="crm-profile-tags">${level?levelBadge(level):""}${(customer.tags||[]).map(t=>`<span class="tag-pill">${esc(t)}</span>`).join("")}</div>
      <div class="crm-profile-actions">
        ${wa?`<a href="${wa}" target="_blank" rel="noopener" title="WhatsApp">WhatsApp</a>`:""}
        ${digits?`<a href="tel:${digits}" title="Ligar">Ligar</a>`:""}
        ${customer.email?`<a href="mailto:${esc(customer.email)}" title="E-mail">E-mail</a>`:""}
        ${can("clients.edit")?'<button type="button" data-profile-edit>Editar</button>':""}
        <button type="button" class="is-primary" data-profile-book>+ Agendar</button>
      </div>
    </div>
    <div class="crm-profile-stats" id="crmProfileStats"><div class="agenda-empty">Carregando...</div></div>
    <div class="crm-profile-tabs">
      <button type="button" data-profile-tab="appointments">Agendamentos</button>
      <button type="button" data-profile-tab="products">Produtos</button>
      <button type="button" data-profile-tab="payments">Pagamentos</button>
      <button type="button" data-profile-tab="packages">Pacotes</button>
      <button type="button" data-profile-tab="about">Sobre</button>
    </div>
    <div id="crmProfileTab" class="crm-profile-tab"></div>`;
  target.querySelector(".crm-profile-back").addEventListener("click",()=>{document.querySelector(".crm-split")?.classList.remove("has-profile");});
  target.querySelector("[data-profile-edit]")?.addEventListener("click",()=>openCustomer(id));
  target.querySelector("[data-profile-book]").addEventListener("click",()=>{
    window.C7UX?.view("agenda");
    setTimeout(()=>window.dispatchEvent(new CustomEvent("c7-book-customer",{detail:{id:customer.id,full_name:customer.full_name,phone:customer.phone}})),300);
  });
  target.querySelectorAll("[data-profile-tab]").forEach(btn=>btn.addEventListener("click",()=>{profileTab=btn.dataset.profileTab;renderProfileTab();}));

  const history=can("clients.history");
  const [apptResult,txResult,packageResult]=await Promise.all([
    history?supabase.from("appointments").select("id,starts_at,status,total_amount,professional:professionals(full_name),appointment_services(service_name)").eq("customer_id",id).order("starts_at",{ascending:false}).limit(200):{data:[]},
    history?supabase.from("cash_transactions").select("id,created_at,net_amount,payment_method,transaction_type,status,cash_transaction_items(item_type,description,quantity,total_amount)").eq("customer_id",id).eq("status","posted").order("created_at",{ascending:false}).limit(100):{data:[]},
    history?supabase.rpc("c7_customer_package_balance",{p_customer_id:id}):{data:[]}
  ]);
  if(profileCustomerId!==id) return;
  profileData={appointments:apptResult.data||[],transactions:txResult.data||[],packages:packageResult.error?null:(packageResult.data||[]),customer};
  const appts=profileData.appointments;
  const count=st=>appts.filter(a=>a.status===st).length;
  $("crmProfileStats").innerHTML=[
    ["Agendamentos",appts.length],
    ["Não compareceu",count("no_show")],
    ["Cancelamentos",count("cancelled")],
    ["Última visita",customer.last_visit_at?new Date(customer.last_visit_at).toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"}):"—"],
    ["Receita total",money(customer.total_spent)],
    ["Visitas finalizadas",customer.completed_visits||0]
  ].map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong></div>`).join("");
  renderProfileTab();
}

let profileData={appointments:[],transactions:[],packages:[],customer:null};
let profileApptView="upcoming";
function renderProfileTab(){
  const box=$("crmProfileTab");
  if(!box) return;
  document.querySelectorAll("[data-profile-tab]").forEach(b=>b.classList.toggle("active",b.dataset.profileTab===profileTab));
  if(!can("clients.history")&&profileTab!=="about"){box.innerHTML='<div class="agenda-empty">Seu acesso não inclui o histórico do cliente.</div>';return;}
  const now=new Date();
  if(profileTab==="appointments"){
    const upcoming=profileData.appointments.filter(a=>new Date(a.starts_at)>=now&&!["cancelled","no_show","completed"].includes(a.status)).reverse();
    const past=profileData.appointments.filter(a=>!upcoming.includes(a));
    const rows=profileApptView==="upcoming"?upcoming:past;
    box.innerHTML=`
      <div class="crm-segment"><button type="button" data-appt-view="upcoming" class="${profileApptView==="upcoming"?"active":""}">Próximos (${upcoming.length})</button><button type="button" data-appt-view="past" class="${profileApptView==="past"?"active":""}">Anteriores (${past.length})</button></div>
      ${rows.length?rows.map(a=>`
        <div class="crm-appt" data-status="${a.status}">
          <div><strong>${new Date(a.starts_at).toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"})}</strong><small>${new Date(a.starts_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</small></div>
          <div><strong>${esc((a.appointment_services||[]).map(x=>x.service_name).join(" + ")||"Serviço")}</strong><small>${esc(a.professional?.full_name||"Sem profissional")}</small></div>
          <span class="c7-status" data-status="${a.status}">${esc(statusLabels[a.status]||a.status)}</span>
          <b>${money(a.total_amount)}</b>
        </div>`).join(""):'<div class="agenda-empty">Nenhum agendamento.</div>'}`;
    box.querySelectorAll("[data-appt-view]").forEach(b=>b.addEventListener("click",()=>{profileApptView=b.dataset.apptView;renderProfileTab();}));
  }else if(profileTab==="products"){
    const map=new Map();
    profileData.transactions.forEach(t=>(t.cash_transaction_items||[]).filter(i=>i.item_type==="product").forEach(i=>{
      const cur=map.get(i.description)||{qty:0,total:0};cur.qty+=Number(i.quantity||0);cur.total+=Number(i.total_amount||0);map.set(i.description,cur);
    }));
    box.innerHTML=map.size?[...map.entries()].sort((a,b)=>b[1].qty-a[1].qty).map(([name,v])=>`<div class="crm-line"><span>${esc(name)}</span><small>${v.qty} un.</small><b>${money(v.total)}</b></div>`).join(""):'<div class="agenda-empty">Nenhum produto comprado.</div>';
  }else if(profileTab==="payments"){
    box.innerHTML=profileData.transactions.length?profileData.transactions.map(t=>`<div class="crm-line"><span>${new Date(t.created_at).toLocaleDateString("pt-BR")} · ${t.transaction_type==="product"?"Produto":t.transaction_type==="package"?"Pacote":"Atendimento"}</span><small class="pay-chip" data-method="${t.payment_method}">${esc(paymentLabel(t.payment_method))}</small><b>${money(t.net_amount)}</b></div>`).join(""):'<div class="agenda-empty">Nenhum pagamento registrado.</div>';
  }else if(profileTab==="packages"){
    const rows=profileData.packages;
    if(rows===null){box.innerHTML='<div class="agenda-empty">Os pacotes ainda não foram ativados no banco de dados.</div>';return;}
    const groups=new Map();
    rows.forEach(r=>{if(!groups.has(r.customer_package_id)) groups.set(r.customer_package_id,{...r,items:[]});groups.get(r.customer_package_id).items.push(r);});
    const label={active:"Ativo",expired:"Expirado",cancelled:"Cancelado"};
    box.innerHTML=groups.size?[...groups.values()].map(g=>`<div class="crm-line crm-package">
        <span><strong>${esc(g.package_name)}</strong><small>${g.items.map(i=>`${esc(i.service_name)} ${i.remaining}/${i.quantity}`).join(" · ")}${g.expires_at?` · vence ${new Date(g.expires_at).toLocaleDateString("pt-BR")}`:""}</small></span>
        <small class="c7-status" data-status="${g.status==="active"?"confirmed":"cancelled"}">${label[g.status]||g.status}</small>
      </div>`).join(""):'<div class="agenda-empty">Nenhum pacote. Venda pelo Caixa → Nova venda → Pacotes.</div>';
  }else{
    const c=profileData.customer||{};
    box.innerHTML=`<div class="crm-about">
      <div><span>Aniversário</span><strong>${c.birth_date?new Date(c.birth_date+"T12:00:00").toLocaleDateString("pt-BR"):"—"}</strong></div>
      <div><span>E-mail</span><strong>${esc(c.email||"—")}</strong></div>
      <div><span>Recebe comunicações</span><strong>${c.marketing_opt_in?"Sim":"Não"}</strong></div>
      <div class="full"><span>Observações</span><strong>${esc(c.notes||"—")}</strong></div>
    </div>`;
  }
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
  if(profileCustomerId) openCustomerProfile(profileCustomerId);
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
   profileCustomerId=null;
   $("customerProfile").innerHTML='<div class="crm-profile-empty"><strong>Selecione um cliente</strong></div>';
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

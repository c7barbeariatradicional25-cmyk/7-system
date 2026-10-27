import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchLevels, fetchCustomerLevelMap, levelBadge } from "./niveis.js";

const supabase=createClient(
  "https://cjtgjqxkyvgjlhylrvas.supabase.co",
  "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE"
);

const $=id=>document.getElementById(id);
const money=v=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(v||0));
let currentRole=null;
let mayManagePromotions=false;
let promotions=[];
let coupons=[];
let plans=[];
let birthdayCampaign=null;
let levels=[];
let promotionsHaveVisibility=false;
let levelServices=[];
let packages=[];
let packageFilter="all";

function canAdmin(){return mayManagePromotions}

function discountLabel(type,value){
  return type==="percent"
    ? Number(value||0).toLocaleString("pt-BR")+"%"
    : money(value);
}

function toLocalInput(value){
  if(!value) return "";
  const d=new Date(value);
  const pad=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function loadContext(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return false;
  const {data}=await supabase.from("profiles").select("role").eq("user_id",session.user.id).single();
  currentRole=data?.role||null;
  const {data:grants}=await supabase.from("staff_permissions").select("permissions").eq("email",session.user.email.toLowerCase()).maybeSingle();
  mayManagePromotions=currentRole==="admin" || Boolean(grants?.permissions?.["promotions.manage"]) || (currentRole==="reception" && !grants);
  return true;
}

function empty(text){
  return `<div class="agenda-empty">${text}</div>`;
}

const escHtml=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/* Níveis de cliente: lista com regra, benefícios e quantos clientes estão em cada nível. */
async function loadLevels(){
  const target=$("levelList");
  if(!target) return;
  const [list,levelMap,servicesResult]=await Promise.all([
    fetchLevels(supabase,{includeInactive:true}),
    fetchCustomerLevelMap(supabase),
    supabase.from("services").select("id,name,price").eq("active",true).order("name")
  ]);
  levels=list;
  if($("levelActiveCount")) $("levelActiveCount").textContent=levels.filter(l=>l.active).length;
  levelServices=servicesResult.data||[];
  $("newLevelBtn")?.classList.toggle("hidden",!canAdmin()||!levels.length);
  if(!levels.length){
    target.innerHTML=empty("Os níveis ainda não foram ativados no banco de dados.");
    return;
  }
  const counts=new Map();
  levelMap.forEach(row=>counts.set(String(row.level_id),(counts.get(String(row.level_id))||0)+1));
  const rule=l=>l.manual_only
    ? "Escolhido pelo Arthur no perfil do cliente"
    : Number(l.min_visits_90d)===0&&Number(l.min_spent_90d)===0
      ? "Todo cliente"
      : `${l.min_visits_90d}+ visitas em 90 dias${Number(l.min_spent_90d)>0?` ou ${money(l.min_spent_90d)}+ gastos`:""}`;
  target.innerHTML=[...levels].reverse().map(l=>`
    <div class="level-row${l.active?"":" is-off"}">
      <div class="level-row-main">${levelBadge(l)}<small>${rule(l)}</small></div>
      <ul class="level-row-benefits">${l.benefits.length?l.benefits.map(b=>`<li>${escHtml(b.description)}${b.quantity_per_month?` <b>${b.quantity_per_month}x/mês</b>`:""}</li>`).join(""):"<li class=\"muted\">Sem benefícios</li>"}</ul>
      <div class="level-row-count"><strong>${counts.get(String(l.id))||0}</strong><small>clientes</small></div>
      ${canAdmin()?`<button type="button" class="ghost-btn" data-edit-level="${l.id}">EDITAR</button>`:""}
    </div>`).join("");
  target.querySelectorAll("[data-edit-level]").forEach(btn=>btn.addEventListener("click",()=>openLevel(btn.dataset.editLevel)));
}

function levelBenefitRow(b={}){
  const options='<option value="">Sem serviço (cortesia)</option>'+levelServices.map(s=>`<option value="${s.id}" ${String(s.id)===String(b.service_id)?"selected":""}>${escHtml(s.name)} — ${money(s.price)}</option>`).join("");
  const row=document.createElement("div");
  row.className="level-benefit-row";
  row.innerHTML=`
    <input type="text" data-benefit-description placeholder="Ex.: Sobrancelha grátis" value="${escHtml(b.description||"")}">
    <select data-benefit-service>${options}</select>
    <input type="number" min="1" step="1" data-benefit-qty placeholder="x/mês" value="${b.quantity_per_month??""}">
    <button type="button" class="split-payment-remove" aria-label="Remover benefício">×</button>`;
  row.querySelector("button").addEventListener("click",()=>row.remove());
  row.querySelector("[data-benefit-service]").addEventListener("change",e=>{
    const desc=row.querySelector("[data-benefit-description]");
    const service=levelServices.find(s=>String(s.id)===e.target.value);
    if(service&&!desc.value.trim()) desc.value=`${service.name} grátis`;
    const qty=row.querySelector("[data-benefit-qty]");
    if(service&&!qty.value) qty.value="1";
  });
  return row;
}

function syncLevelRuleFields(){
  const manual=$("levelManualOnly").checked;
  $("levelMinVisits").disabled=manual;
  $("levelMinSpent").disabled=manual;
}

function openLevel(id=null){
  const level=levels.find(l=>String(l.id)===String(id));
  $("levelForm").reset();
  $("levelId").value=level?.id||"";
  $("levelModalTitle").textContent=level?`Editar ${level.name}`:"Novo nível";
  $("levelName").value=level?.name||"";
  $("levelColor").value=level?.color||"#b8892f";
  $("levelManualOnly").checked=Boolean(level?.manual_only);
  $("levelSortOrder").value=level?.sort_order??(Math.max(0,...levels.map(l=>l.sort_order))+1);
  $("levelMinVisits").value=level?.min_visits_90d??0;
  $("levelMinSpent").value=level?.min_spent_90d??0;
  $("levelActive").checked=level?level.active:true;
  $("levelMessage").textContent="";
  const rows=$("levelBenefitRows");
  rows.replaceChildren(...(level?.benefits||[]).map(levelBenefitRow));
  if(!rows.children.length) rows.appendChild(levelBenefitRow());
  syncLevelRuleFields();
  $("levelModal").classList.remove("hidden");
}

async function saveLevel(e){
  e.preventDefault();
  if(!canAdmin()) return;
  const id=$("levelId").value;
  const payload={
    name:$("levelName").value.trim(),
    color:$("levelColor").value,
    manual_only:$("levelManualOnly").checked,
    sort_order:Number($("levelSortOrder").value||0),
    min_visits_90d:Number($("levelMinVisits").value||0),
    min_spent_90d:Number($("levelMinSpent").value||0),
    active:$("levelActive").checked,
    updated_at:new Date().toISOString()
  };
  const benefits=[...$("levelBenefitRows").children].map((row,i)=>({
    description:row.querySelector("[data-benefit-description]").value.trim(),
    service_id:row.querySelector("[data-benefit-service]").value||null,
    quantity_per_month:row.querySelector("[data-benefit-qty]").value?Number(row.querySelector("[data-benefit-qty]").value):null,
    sort_order:i+1
  })).filter(b=>b.description);
  if(benefits.some(b=>b.service_id&&!b.quantity_per_month)){
    $("levelMessage").textContent="Informe quantas vezes por mês o serviço sai grátis.";
    return;
  }
  $("levelMessage").textContent="Salvando...";
  const result=id
    ? await supabase.from("customer_levels").update(payload).eq("id",id).select("id").single()
    : await supabase.from("customer_levels").insert(payload).select("id").single();
  if(result.error){$("levelMessage").textContent="Não foi possível salvar o nível.";return;}
  const levelId=result.data.id;
  const cleared=await supabase.from("customer_level_benefits").delete().eq("level_id",levelId);
  const inserted=benefits.length&&!cleared.error
    ? await supabase.from("customer_level_benefits").insert(benefits.map(b=>({...b,level_id:levelId})))
    : {error:cleared.error};
  if(inserted.error){$("levelMessage").textContent="Nível salvo, mas os benefícios não foram atualizados.";return;}
  close("levelModal");
  await loadLevels();
}

/* Pacotes (como no Booksy): visível online, interno (só caixa) ou desligado. */
const PACKAGE_VISIBILITY={
  online:{label:"Visível",icon:"🌐",cls:"is-online"},
  internal:{label:"Interno",icon:"🔒",cls:"is-internal"},
  off:{label:"Desligado",icon:"⏻",cls:"is-off"}
};
const expiresLabel=days=>days?`Expira em ${Number(days)%30===0&&days<365?`${days/30} ${days/30===1?"mês":"meses"}`:days===365?"1 ano":`${days} dias`}`:"Nunca expira";

async function loadPackages(){
  const target=$("packageList");
  if(!target) return;
  const [{data,error},servicesResult]=await Promise.all([
    supabase.from("packages").select("*,items:package_items(id,service_id,quantity,unit_price,service:services(id,name,price))").order("sort_order").order("name"),
    levelServices.length?{data:levelServices}:supabase.from("services").select("id,name,price").eq("active",true).order("name")
  ]);
  levelServices=servicesResult.data||[];
  $("newPackageBtn")?.classList.toggle("hidden",!canAdmin()||Boolean(error));
  if(error){
    target.innerHTML=empty("Os pacotes ainda não foram ativados no banco de dados (rode o SQL 20261027_pacotes.sql).");
    $("packageActiveCount").textContent="0";
    return;
  }
  packages=data||[];
  $("packageActiveCount").textContent=packages.filter(p=>p.visibility!=="off").length;
  renderPackages();
}

function renderPackages(){
  const target=$("packageList");
  const list=packages.filter(p=>packageFilter==="all"||p.visibility===packageFilter);
  if(!list.length){
    target.innerHTML=empty(packages.length?"Nenhum pacote neste filtro.":"Nenhum pacote criado. Crie o primeiro com + CRIAR PACOTE.");
    return;
  }
  target.innerHTML=list.map(p=>{
    const vis=PACKAGE_VISIBILITY[p.visibility]||PACKAGE_VISIBILITY.internal;
    const items=(p.items||[]).map(i=>`${i.quantity}x ${escHtml(i.service?.name||"Serviço")}`).join(", ")||"Sem serviços";
    const full=(p.items||[]).reduce((t,i)=>t+Number(i.service?.price||0)*i.quantity,0);
    const save=full-Number(p.price);
    return `<div class="package-row${p.visibility==="off"?" is-off":""}">
      <div class="package-row-main">
        <strong>${escHtml(p.name)}</strong>
        <small>${items}</small>
        <small class="muted">${expiresLabel(p.expires_days)} · ${Number(p.commission_percent||0)>0?`comissão ${Number(p.commission_percent)}% para quem vende`:"sem comissão"}${p.note?` · ${escHtml(p.note)}`:""}</small>
      </div>
      <span class="package-vis ${vis.cls}">${vis.icon} ${vis.label}</span>
      <div class="package-row-price"><strong>${money(p.price)}</strong>${save>0?`<small>economia ${money(save)}</small>`:""}</div>
      ${canAdmin()?`<button type="button" class="ghost-btn" data-edit-package="${p.id}">EDITAR</button>`:""}
    </div>`;
  }).join("");
  target.querySelectorAll("[data-edit-package]").forEach(btn=>btn.addEventListener("click",()=>openPackage(btn.dataset.editPackage)));
}

async function loadSoldPackages(){
  const target=$("packageSoldList");
  target.innerHTML=empty("Carregando...");
  const {data,error}=await supabase.rpc("c7_customer_package_balance",{p_customer_id:null});
  if(error){target.innerHTML=empty("Não foi possível carregar os pacotes adquiridos.");return;}
  const groups=new Map();
  (data||[]).forEach(r=>{
    if(!groups.has(r.customer_package_id)) groups.set(r.customer_package_id,{...r,items:[]});
    groups.get(r.customer_package_id).items.push(r);
  });
  if(!groups.size){target.innerHTML=empty("Nenhum pacote vendido ainda. Venda pelo Caixa → Nova venda → Pacotes.");return;}
  const statusLabel={active:"Ativo",expired:"Expirado",cancelled:"Cancelado"};
  const date=v=>v?new Date(v).toLocaleDateString("pt-BR"):"";
  target.innerHTML=[...groups.values()].map(g=>{
    const left=g.items.reduce((t,i)=>t+i.remaining,0);
    const st=left===0&&g.status==="active"?"used":g.status;
    return `<div class="package-row sold${st!=="active"?" is-off":""}">
      <div class="package-row-main">
        <strong>${escHtml(g.customer_name)}</strong>
        <small>${escHtml(g.package_name)} · comprado em ${date(g.purchased_at)}${g.expires_at?` · vence ${date(g.expires_at)}`:""}</small>
        <div class="package-balance">${g.items.map(i=>`<span>${escHtml(i.service_name)} <b>${i.remaining}/${i.quantity}</b></span>`).join("")}</div>
      </div>
      <span class="package-vis ${st==="active"?"is-online":"is-off"}">${st==="used"?"Usado":statusLabel[st]||st}</span>
    </div>`;
  }).join("");
}

function packageItemRow(item={}){
  const row=document.createElement("div");
  row.className="package-item-row";
  const options=levelServices.map(s=>`<option value="${s.id}" data-price="${s.price}" ${String(s.id)===String(item.service_id)?"selected":""}>${escHtml(s.name)} — ${money(s.price)}</option>`).join("");
  row.innerHTML=`
    <select data-package-service required><option value="">Escolha o serviço</option>${options}</select>
    <div class="qty-stepper"><button type="button" data-qty="-1" aria-label="Menos">−</button><input type="number" min="1" step="1" data-package-qty value="${item.quantity||1}"><button type="button" data-qty="1" aria-label="Mais">+</button></div>
    <label class="package-unit"><small>R$ por uso</small><input type="number" min="0" step="0.01" data-package-unit value="${item.unit_price??""}"></label>
    <button type="button" class="split-payment-remove" aria-label="Remover serviço">×</button>`;
  const qty=row.querySelector("[data-package-qty]");
  row.querySelectorAll("[data-qty]").forEach(b=>b.addEventListener("click",()=>{qty.value=Math.max(1,Number(qty.value||1)+Number(b.dataset.qty));syncPackageSummary();}));
  row.querySelector(".split-payment-remove").addEventListener("click",()=>{row.remove();syncPackageSummary();});
  row.querySelector("[data-package-service]").addEventListener("change",syncPackageUnits);
  row.querySelectorAll("input").forEach(i=>i.addEventListener("input",syncPackageSummary));
  return row;
}

function packageRows(){
  return [...$("packageItemRows").children].map(row=>{
    const select=row.querySelector("[data-package-service]");
    return {
      row,
      service_id:select.value,
      full:Number(select.selectedOptions[0]?.dataset.price||0),
      quantity:Math.max(1,Number(row.querySelector("[data-package-qty]").value||1)),
      unitInput:row.querySelector("[data-package-unit]")
    };
  });
}

/* Divide o preço do pacote entre os serviços (valor de cada uso), proporcional ao preço cheio. */
function syncPackageUnits(){
  const rows=packageRows().filter(r=>r.service_id);
  const price=Number($("packagePrice").value||0);
  const full=rows.reduce((t,r)=>t+r.full*r.quantity,0);
  rows.forEach(r=>{r.unitInput.value=full>0?(price*r.full/full).toFixed(2):"0.00";});
  syncPackageSummary();
}

function syncPackageSummary(){
  const rows=packageRows().filter(r=>r.service_id);
  const price=Number($("packagePrice").value||0);
  const full=rows.reduce((t,r)=>t+r.full*r.quantity,0);
  const uses=rows.reduce((t,r)=>t+r.quantity,0);
  $("packageSummary").innerHTML=rows.length
    ? `<span>${uses} uso${uses===1?"":"s"} · valor cheio <b>${money(full)}</b></span><span>Cliente paga <b>${money(price)}</b>${full>price?` · economiza <b class="pos">${money(full-price)} (${Math.round((full-price)/full*100)}%)</b>`:""}</span>`
    : "";
}

function openPackage(id=null){
  const pkg=packages.find(p=>String(p.id)===String(id));
  $("packageForm").reset();
  $("packageId").value=pkg?.id||"";
  $("packageModalTitle").textContent=pkg?"Editar pacote":"Criar pacote";
  $("packageName").value=pkg?.name||"";
  $("packagePrice").value=pkg?.price??"";
  $("packageExpires").value=pkg?.expires_days?String(pkg.expires_days):"";
  if(pkg?.expires_days&&!$("packageExpires").value){
    $("packageExpires").append(new Option(`${pkg.expires_days} dias`,String(pkg.expires_days),true,true));
  }
  $("packageNote").value=pkg?.note||"";
  $("packageCommission").value=pkg?.commission_percent??0;
  document.querySelectorAll('[name="packageVisibility"]').forEach(r=>{r.checked=r.value===(pkg?.visibility||"internal");});
  const rows=$("packageItemRows");
  rows.replaceChildren(...(pkg?.items||[]).map(packageItemRow));
  if(!rows.children.length) rows.appendChild(packageItemRow());
  $("packageMessage").textContent="";
  syncPackageSummary();
  $("packageModal").classList.remove("hidden");
}

async function savePackage(e){
  e.preventDefault();
  if(!canAdmin()) return;
  const id=$("packageId").value;
  const items=packageRows().filter(r=>r.service_id).map(r=>({
    service_id:Number(r.service_id),
    quantity:r.quantity,
    unit_price:Number(r.unitInput.value||0)
  }));
  if(!items.length){$("packageMessage").textContent="Adicione pelo menos um serviço ao pacote.";return;}
  const payload={
    name:$("packageName").value.trim(),
    price:Number($("packagePrice").value||0),
    expires_days:$("packageExpires").value?Number($("packageExpires").value):null,
    visibility:document.querySelector('[name="packageVisibility"]:checked')?.value||"internal",
    note:$("packageNote").value.trim()||null,
    commission_percent:Math.min(100,Math.max(0,Number($("packageCommission").value||0))),
    updated_at:new Date().toISOString()
  };
  $("packageMessage").textContent="Salvando...";
  const result=id
    ? await supabase.from("packages").update(payload).eq("id",id).select("id").single()
    : await supabase.from("packages").insert(payload).select("id").single();
  if(result.error){$("packageMessage").textContent="Não foi possível salvar o pacote.";return;}
  const packageId=result.data.id;
  const cleared=await supabase.from("package_items").delete().eq("package_id",packageId);
  const inserted=cleared.error?cleared:await supabase.from("package_items").insert(items.map(i=>({...i,package_id:packageId})));
  if(inserted.error){$("packageMessage").textContent="Pacote salvo, mas os serviços não foram atualizados.";return;}
  close("packageModal");
  await loadPackages();
}

function showPromoTab(tab){
  document.querySelectorAll("[data-promo-tab]").forEach(b=>b.classList.toggle("is-active",b.dataset.promoTab===tab));
  document.querySelectorAll("[data-promo-pane]").forEach(p=>p.classList.toggle("hidden",p.dataset.promoPane!==tab));
  try{localStorage.setItem("c7PromoTab",tab)}catch{}
}

function showPackageView(view){
  document.querySelectorAll("[data-package-view]").forEach(b=>b.classList.toggle("is-active",b.dataset.packageView===view));
  $("packageList").classList.toggle("hidden",view!=="list");
  $("packageFilter").classList.toggle("hidden",view!=="list");
  $("packageSoldList").classList.toggle("hidden",view!=="sold");
  if(view==="sold") loadSoldPackages();
}

async function loadAll(){
  loadPackages();
  loadLevels();
  const now=new Date();
  const month=now.getMonth()+1;

  const [p,c,pl,b,customers]=await Promise.all([
    supabase.from("promotions").select("*").order("created_at",{ascending:false}),
    supabase.from("coupons").select("*").order("created_at",{ascending:false}),
    supabase.from("membership_plans").select("*").order("created_at",{ascending:false}),
    supabase.from("birthday_campaigns").select("*").order("created_at",{ascending:false}).limit(1).maybeSingle(),
    supabase.from("customers").select("id,full_name,phone,birth_date,active").eq("active",true).not("birth_date","is",null)
  ]);

  promotions=p.data||[];
  if(!promotions.length){
    const probe=await supabase.from("promotions").select("show_online").limit(1);
    promotionsHaveVisibility=!probe.error;
  }
  coupons=c.data||[];
  plans=pl.data||[];
  birthdayCampaign=b.data||null;

  renderPromotions();
  renderCoupons();
  renderPlans();
  renderBirthdays((customers.data||[]).filter(x=>Number(String(x.birth_date).slice(5,7))===month));

  $("promoActiveCount").textContent=promotions.filter(x=>x.active).length;
  $("couponActiveCount").textContent=coupons.filter(x=>x.active).length;
  $("planActiveCount").textContent=plans.filter(x=>x.active).length;
}

function renderPromotions(){
  const target=$("promotionList");
  if(!promotions.length){
    target.innerHTML=empty("Nenhuma promoção criada.");
    return;
  }

  target.innerHTML=promotions.map(item=>`
    <div class="promo-row">
      <div>
        <strong>${item.name}</strong>
        <span>${item.description||"Sem descrição"} • ${discountLabel(item.discount_type,item.discount_value)}</span>
        <span class="promo-status">${item.active?"ATIVA":"INATIVA"}${"show_online" in item?(item.show_online?" · 🌐 ONLINE":" · 🔒 SÓ INTERNA"):""}</span>
      </div>
      <div class="promo-row-actions">
        <button type="button" data-edit-promotion="${item.id}">EDITAR</button>
        <button type="button" data-toggle-promotion="${item.id}">${item.active?"DESATIVAR":"ATIVAR"}</button>
      </div>
    </div>
  `).join("");

  target.querySelectorAll("[data-edit-promotion]").forEach(btn=>btn.addEventListener("click",()=>openPromotion(btn.dataset.editPromotion)));
  target.querySelectorAll("[data-toggle-promotion]").forEach(btn=>btn.addEventListener("click",()=>togglePromotion(btn.dataset.togglePromotion)));
}

function renderCoupons(){
  const target=$("couponList");
  if(!coupons.length){
    target.innerHTML=empty("Nenhum cupom criado.");
    return;
  }

  target.innerHTML=coupons.map(item=>`
    <div class="promo-row">
      <div>
        <strong>${item.code}</strong>
        <span>${item.description||"Cupom C7"} • ${discountLabel(item.discount_type,item.discount_value)} • Uso ${item.used_count||0}${item.max_uses?"/"+item.max_uses:""}</span>
        <span class="promo-status">${item.active?"ATIVO":"INATIVO"}</span>
      </div>
      <div class="promo-row-actions">
        <button type="button" data-edit-coupon="${item.id}">EDITAR</button>
        <button type="button" data-toggle-coupon="${item.id}">${item.active?"DESATIVAR":"ATIVAR"}</button>
      </div>
    </div>
  `).join("");

  target.querySelectorAll("[data-edit-coupon]").forEach(btn=>btn.addEventListener("click",()=>openCoupon(btn.dataset.editCoupon)));
  target.querySelectorAll("[data-toggle-coupon]").forEach(btn=>btn.addEventListener("click",()=>toggleCoupon(btn.dataset.toggleCoupon)));
}

function renderPlans(){
  const target=$("planList");
  if(!plans.length){
    target.innerHTML=empty("Nenhum plano criado.");
    return;
  }

  const period={monthly:"Mensal",quarterly:"Trimestral",yearly:"Anual",custom:"Personalizado"};

  target.innerHTML=plans.map(item=>`
    <div class="promo-row">
      <div>
        <strong>${item.name}</strong>
        <span>${money(item.price)} • ${period[item.billing_period]||item.billing_period}${item.visits_per_cycle?" • "+item.visits_per_cycle+" visitas":""}</span>
        <span class="promo-status">${item.active?"ATIVO":"INATIVO"}</span>
      </div>
      <div class="promo-row-actions">
        <button type="button" data-edit-plan="${item.id}">EDITAR</button>
        <button type="button" data-toggle-plan="${item.id}">${item.active?"DESATIVAR":"ATIVAR"}</button>
      </div>
    </div>
  `).join("");

  target.querySelectorAll("[data-edit-plan]").forEach(btn=>btn.addEventListener("click",()=>openPlan(btn.dataset.editPlan)));
  target.querySelectorAll("[data-toggle-plan]").forEach(btn=>btn.addEventListener("click",()=>togglePlan(btn.dataset.togglePlan)));
}

function renderBirthdays(customers){
  const target=$("birthdayList");
  $("birthdayMonthCount").textContent=customers.length;

  const campaign=birthdayCampaign
    ? `<div class="promo-row"><div><strong>${birthdayCampaign.name}</strong><span>${birthdayCampaign.description||"Benefício de aniversário"} • ${discountLabel(birthdayCampaign.discount_type,birthdayCampaign.discount_value)}</span><span class="promo-status">${birthdayCampaign.active?"CAMPANHA ATIVA":"CAMPANHA INATIVA"}</span></div></div>`
    : "";

  const rows=customers.sort((a,b)=>String(a.birth_date).slice(8,10)-String(b.birth_date).slice(8,10)).map(c=>{
    const day=String(c.birth_date).slice(8,10);
    return `
      <div class="promo-row">
        <div>
          <strong>${c.full_name}</strong>
          <span>Dia ${day} • ${c.phone||"Sem telefone"}</span>
        </div>
        <div class="promo-row-value">${day}</div>
      </div>
    `;
  }).join("");

  target.innerHTML=campaign+(rows||empty("Nenhum aniversariante neste mês."));
}

async function togglePromotion(id){
  if(!canAdmin()) return;
  const item=promotions.find(x=>x.id===id);
  if(!item) return;
  await supabase.from("promotions").update({active:!item.active,updated_at:new Date().toISOString()}).eq("id",id);
  await loadAll();
}

async function toggleCoupon(id){
  if(!canAdmin()) return;
  const item=coupons.find(x=>x.id===id);
  if(!item) return;
  await supabase.from("coupons").update({active:!item.active,updated_at:new Date().toISOString()}).eq("id",id);
  await loadAll();
}

async function togglePlan(id){
  if(!canAdmin()) return;
  const item=plans.find(x=>x.id===id);
  if(!item) return;
  await supabase.from("membership_plans").update({active:!item.active,updated_at:new Date().toISOString()}).eq("id",id);
  await loadAll();
}

function openPromotion(id=null){
  const item=promotions.find(x=>x.id===id);
  $("promotionForm").reset();
  $("promotionId").value=item?.id||"";
  $("promotionModalTitle").textContent=item?"Editar promoção":"Nova promoção";
  $("promotionName").value=item?.name||"";
  $("promotionDescription").value=item?.description||"";
  $("promotionDiscountType").value=item?.discount_type||"percent";
  $("promotionDiscountValue").value=item?.discount_value??"";
  $("promotionStart").value=toLocalInput(item?.starts_at);
  $("promotionEnd").value=toLocalInput(item?.ends_at);
  $("promotionActive").checked=item?.active??true;
  // Online/interna só aparece depois que o SQL foi aplicado (coluna show_online).
  const hasVisibility=promotions.some(x=>"show_online" in x)||!promotions.length&&promotionsHaveVisibility;
  $("promotionVisibilityField").classList.toggle("hidden",!hasVisibility);
  document.querySelector(`[name="promotionVisibility"][value="${item?.show_online?"online":"internal"}"]`).checked=true;
  $("promotionMessage").textContent="";
  $("promotionModal").classList.remove("hidden");
}

function openCoupon(id=null){
  const item=coupons.find(x=>x.id===id);
  $("couponForm").reset();
  $("couponId").value=item?.id||"";
  $("couponModalTitle").textContent=item?"Editar cupom":"Novo cupom";
  $("couponCode").value=item?.code||"";
  $("couponDescription").value=item?.description||"";
  $("couponDiscountType").value=item?.discount_type||"percent";
  $("couponDiscountValue").value=item?.discount_value??"";
  $("couponMinAmount").value=item?.min_amount??0;
  $("couponMaxUses").value=item?.max_uses??"";
  $("couponStart").value=toLocalInput(item?.starts_at);
  $("couponEnd").value=toLocalInput(item?.ends_at);
  $("couponActive").checked=item?.active??true;
  $("couponMessage").textContent="";
  $("couponModal").classList.remove("hidden");
}

function openPlan(id=null){
  const item=plans.find(x=>x.id===id);
  $("planForm").reset();
  $("planId").value=item?.id||"";
  $("planModalTitle").textContent=item?"Editar plano":"Novo plano";
  $("planName").value=item?.name||"";
  $("planDescription").value=item?.description||"";
  $("planPrice").value=item?.price??"";
  $("planPeriod").value=item?.billing_period||"monthly";
  $("planVisits").value=item?.visits_per_cycle??"";
  $("planDiscount").value=item?.discount_percent??0;
  $("planActive").checked=item?.active??true;
  $("planMessage").textContent="";
  $("planModal").classList.remove("hidden");
}

function openBirthday(){
  const item=birthdayCampaign;
  $("birthdayCampaignForm").reset();
  $("birthdayCampaignId").value=item?.id||"";
  $("birthdayCampaignName").value=item?.name||"Aniversário C7";
  $("birthdayCampaignDescription").value=item?.description||"";
  $("birthdayDiscountType").value=item?.discount_type||"percent";
  $("birthdayDiscountValue").value=item?.discount_value??0;
  $("birthdayDaysBefore").value=item?.valid_days_before??0;
  $("birthdayDaysAfter").value=item?.valid_days_after??7;
  $("birthdayCampaignActive").checked=item?.active??true;
  $("birthdayCampaignMessage").textContent="";
  $("birthdayCampaignModal").classList.remove("hidden");
}

function close(id){ $(id).classList.add("hidden") }

async function savePromotion(e){
  e.preventDefault();
  if(!canAdmin()) return;
  const id=$("promotionId").value;
  const payload={
    name:$("promotionName").value.trim(),
    description:$("promotionDescription").value.trim()||null,
    discount_type:$("promotionDiscountType").value,
    discount_value:Number($("promotionDiscountValue").value||0),
    starts_at:$("promotionStart").value?new Date($("promotionStart").value).toISOString():null,
    ends_at:$("promotionEnd").value?new Date($("promotionEnd").value).toISOString():null,
    active:$("promotionActive").checked,
    ...(!$("promotionVisibilityField").classList.contains("hidden")?{
      show_online:document.querySelector('[name="promotionVisibility"]:checked')?.value==="online"
    }:{}),
    updated_at:new Date().toISOString()
  };
  const result=id
    ? await supabase.from("promotions").update(payload).eq("id",id)
    : await supabase.from("promotions").insert(payload);
  if(result.error){$("promotionMessage").textContent="Não foi possível salvar.";return}
  close("promotionModal"); await loadAll();
}

async function saveCoupon(e){
  e.preventDefault();
  if(!canAdmin()) return;
  const id=$("couponId").value;
  const payload={
    code:$("couponCode").value.trim().toUpperCase(),
    description:$("couponDescription").value.trim()||null,
    discount_type:$("couponDiscountType").value,
    discount_value:Number($("couponDiscountValue").value||0),
    min_amount:Number($("couponMinAmount").value||0),
    max_uses:$("couponMaxUses").value?Number($("couponMaxUses").value):null,
    starts_at:$("couponStart").value?new Date($("couponStart").value).toISOString():null,
    ends_at:$("couponEnd").value?new Date($("couponEnd").value).toISOString():null,
    active:$("couponActive").checked,
    updated_at:new Date().toISOString()
  };
  const result=id
    ? await supabase.from("coupons").update(payload).eq("id",id)
    : await supabase.from("coupons").insert(payload);
  if(result.error){$("couponMessage").textContent="Não foi possível salvar. Verifique se o código já existe.";return}
  close("couponModal"); await loadAll();
}

async function savePlan(e){
  e.preventDefault();
  if(!canAdmin()) return;
  const id=$("planId").value;
  const payload={
    name:$("planName").value.trim(),
    description:$("planDescription").value.trim()||null,
    price:Number($("planPrice").value||0),
    billing_period:$("planPeriod").value,
    visits_per_cycle:$("planVisits").value?Number($("planVisits").value):null,
    discount_percent:Number($("planDiscount").value||0),
    active:$("planActive").checked,
    updated_at:new Date().toISOString()
  };
  const result=id
    ? await supabase.from("membership_plans").update(payload).eq("id",id)
    : await supabase.from("membership_plans").insert(payload);
  if(result.error){$("planMessage").textContent="Não foi possível salvar.";return}
  close("planModal"); await loadAll();
}

async function saveBirthday(e){
  e.preventDefault();
  if(!canAdmin()) return;
  const id=$("birthdayCampaignId").value;
  const payload={
    name:$("birthdayCampaignName").value.trim(),
    description:$("birthdayCampaignDescription").value.trim()||null,
    discount_type:$("birthdayDiscountType").value,
    discount_value:Number($("birthdayDiscountValue").value||0),
    valid_days_before:Number($("birthdayDaysBefore").value||0),
    valid_days_after:Number($("birthdayDaysAfter").value||0),
    active:$("birthdayCampaignActive").checked,
    updated_at:new Date().toISOString()
  };
  const result=id
    ? await supabase.from("birthday_campaigns").update(payload).eq("id",id)
    : await supabase.from("birthday_campaigns").insert(payload);
  if(result.error){$("birthdayCampaignMessage").textContent="Não foi possível salvar.";return}
  close("birthdayCampaignModal"); await loadAll();
}

async function init(){
  if(!await loadContext()) return;

  document.querySelectorAll('.nav-item[data-section="promocoes"]').forEach(btn=>btn.addEventListener("click",loadAll));

  ["newPromotionBtn","newCouponBtn","newPlanBtn","newBirthdayCampaignBtn"].forEach(id=>{
    $(id)?.classList.toggle("hidden",!canAdmin());
  });

  $("newPromotionBtn")?.addEventListener("click",()=>openPromotion());
  $("newCouponBtn")?.addEventListener("click",()=>openCoupon());
  $("newPlanBtn")?.addEventListener("click",()=>openPlan());
  $("newLevelBtn")?.addEventListener("click",()=>openLevel());
  $("newPackageBtn")?.addEventListener("click",()=>openPackage());
  $("addPackageItemBtn")?.addEventListener("click",()=>{$("packageItemRows").appendChild(packageItemRow());});
  $("packagePrice")?.addEventListener("input",syncPackageUnits);
  $("packageForm")?.addEventListener("submit",savePackage);
  document.querySelectorAll("[data-close-package]").forEach(el=>el.addEventListener("click",()=>close("packageModal")));
  document.querySelectorAll("[data-promo-tab]").forEach(b=>b.addEventListener("click",()=>showPromoTab(b.dataset.promoTab)));
  document.querySelectorAll("[data-package-view]").forEach(b=>b.addEventListener("click",()=>showPackageView(b.dataset.packageView)));
  document.querySelectorAll("[data-package-filter]").forEach(b=>b.addEventListener("click",()=>{
    packageFilter=b.dataset.packageFilter;
    document.querySelectorAll("[data-package-filter]").forEach(x=>x.classList.toggle("is-active",x===b));
    renderPackages();
  }));
  try{const saved=localStorage.getItem("c7PromoTab");if(saved&&document.querySelector(`[data-promo-pane="${saved}"]`)) showPromoTab(saved);}catch{}
  $("addLevelBenefitBtn")?.addEventListener("click",()=>$("levelBenefitRows").appendChild(levelBenefitRow()));
  $("levelManualOnly")?.addEventListener("change",syncLevelRuleFields);
  $("levelForm")?.addEventListener("submit",saveLevel);
  document.querySelectorAll("[data-close-level]").forEach(el=>el.addEventListener("click",()=>close("levelModal")));
  $("newBirthdayCampaignBtn")?.addEventListener("click",openBirthday);

  $("promotionForm")?.addEventListener("submit",savePromotion);
  $("couponForm")?.addEventListener("submit",saveCoupon);
  $("planForm")?.addEventListener("submit",savePlan);
  $("birthdayCampaignForm")?.addEventListener("submit",saveBirthday);

  document.querySelectorAll("[data-close-promotion]").forEach(el=>el.addEventListener("click",()=>close("promotionModal")));
  document.querySelectorAll("[data-close-coupon]").forEach(el=>el.addEventListener("click",()=>close("couponModal")));
  document.querySelectorAll("[data-close-plan]").forEach(el=>el.addEventListener("click",()=>close("planModal")));
  document.querySelectorAll("[data-close-birthday]").forEach(el=>el.addEventListener("click",()=>close("birthdayCampaignModal")));
}

init();

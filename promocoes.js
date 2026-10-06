import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase=createClient(
  "https://cjtgjqxkyvgjlhylrvas.supabase.co",
  "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE"
);

const $=id=>document.getElementById(id);
const money=v=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(v||0));
let currentRole=null;
let promotions=[];
let coupons=[];
let plans=[];
let birthdayCampaign=null;

function canAdmin(){return currentRole==="admin"}

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
  return true;
}

function empty(text){
  return `<div class="agenda-empty">${text}</div>`;
}

async function loadAll(){
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
        <span class="promo-status">${item.active?"ATIVA":"INATIVA"}</span>
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

/* Níveis de cliente (C7 → C7 Prata → C7 Ouro → VIP C7) e seus benefícios em serviços. */
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

export function monthStart(date=new Date()){
  const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,"0");
  return `${y}-${m}-01`;
}

/* Níveis ativos com benefícios, do menor para o maior. Vazio se o SQL ainda não foi aplicado. */
export async function fetchLevels(db,{includeInactive=false}={}){
  let query=db.from("customer_levels")
    .select("*,benefits:customer_level_benefits(id,description,service_id,quantity_per_month,sort_order,service:services(id,name,price))")
    .order("sort_order");
  if(!includeInactive) query=query.eq("active",true);
  const {data,error}=await query;
  if(error){console.warn("C7: níveis de cliente indisponíveis",error.message);return [];}
  return (data||[]).map(level=>({...level,benefits:(level.benefits||[]).sort((a,b)=>a.sort_order-b.sort_order)}));
}

/* Nível atual de cada cliente: Map(customer_id → {level_id, visits_90d, spent_90d, level_locked}). */
export async function fetchCustomerLevelMap(db,customerIds=null){
  let query=db.from("customer_level_status").select("customer_id,level_id,visits_90d,spent_90d,level_locked");
  if(customerIds) query=query.in("customer_id",customerIds);
  const {data,error}=await query;
  const map=new Map();
  if(error) return map;
  (data||[]).forEach(row=>map.set(String(row.customer_id),row));
  return map;
}

export async function fetchMonthUses(db,customerId){
  const {data,error}=await db.from("customer_level_benefit_uses")
    .select("id,benefit_id,service_id,created_at")
    .eq("customer_id",customerId)
    .eq("used_month",monthStart());
  return error?[]:(data||[]);
}

/* Benefícios do nível com quanto ainda resta no mês. */
export function benefitsWithBalance(level,uses){
  return (level?.benefits||[]).map(b=>{
    const used=uses.filter(u=>String(u.benefit_id)===String(b.id)).length;
    const limited=b.quantity_per_month!=null;
    return {...b,used,remaining:limited?Math.max(0,b.quantity_per_month-used):null};
  });
}

export function levelBadge(level){
  if(!level) return "";
  return `<span class="level-badge" style="--lv:${esc(level.color||"#8a817a")}">${esc(level.name)}</span>`;
}

export function benefitText(b){
  if(b.quantity_per_month==null) return b.description;
  const left=b.remaining==null?"":` · resta${b.remaining===1?"":"m"} ${b.remaining} de ${b.quantity_per_month}`;
  return `${b.description} (${b.quantity_per_month}x no mês${left})`;
}

/* Próximo nível automático e o que falta para chegar nele. */
export function nextLevelHint(levels,current,stats){
  const auto=levels.filter(l=>!l.manual_only&&l.sort_order>(current?.sort_order??-1));
  const next=auto[0];
  if(!next||!stats) return null;
  const visits=Math.max(0,next.min_visits_90d-Number(stats.visits_90d||0));
  const spent=Number(next.min_spent_90d||0)>0?Math.max(0,Number(next.min_spent_90d)-Number(stats.spent_90d||0)):null;
  const parts=[`${visits} visita${visits===1?"":"s"}`];
  if(spent!=null) parts.push(`ou ${new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(spent)} em serviços`);
  return {level:next,visitsLeft:visits,text:`Falta ${parts.join(" ")} para ${next.name}`};
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase=createClient(
  "https://cjtgjqxkyvgjlhylrvas.supabase.co",
  "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE"
);

const $=id=>document.getElementById(id);
const money=v=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(v||0));

function formatTime(value){
  return new Date(value).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
}

function formatDate(value){
  return new Date(value).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"});
}

function startOfMonth(){
  const now=new Date();
  return new Date(now.getFullYear(),now.getMonth(),1,0,0,0,0);
}

function endOfMonth(){
  const now=new Date();
  return new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59,999);
}

function todayBounds(){
  const start=new Date();
  start.setHours(0,0,0,0);
  const end=new Date();
  end.setHours(23,59,59,999);
  return {start,end};
}

async function getContext(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return null;

  const {data:profile}=await supabase
    .from("profiles")
    .select("role")
    .eq("user_id",session.user.id)
    .maybeSingle();

  if(profile?.role!=="barber") return null;

  const {data:professional}=await supabase
    .from("professionals")
    .select("id,full_name,specialty,avatar_url,commission_percent")
    .eq("user_id",session.user.id)
    .eq("active",true)
    .maybeSingle();

  return professional||null;
}

function renderProfile(pro){
  $("performanceName").textContent=pro.full_name||"Barbeiro";
  $("performanceSpecialty").textContent=pro.specialty||"Barbeiro C7";
  $("performanceMonthLabel").textContent=new Date().toLocaleDateString("pt-BR",{month:"long",year:"numeric"});

  const avatar=$("performanceAvatar");
  avatar.replaceChildren();

  if(pro.avatar_url){
    const img=document.createElement("img");
    img.src=pro.avatar_url;
    img.alt=pro.full_name||"Barbeiro";
    avatar.appendChild(img);
  }else{
    avatar.textContent=(pro.full_name||"C7").slice(0,2).toUpperCase();
  }
}

function empty(text){
  return `<div class="performance-empty">${text}</div>`;
}

async function loadPerformance(){
  const pro=await getContext();
  if(!pro){
    const section=$("desempenho");
    if(section) section.innerHTML='<div class="agenda-empty">Seu acesso ainda não está vinculado a um barbeiro.</div>';
    return;
  }

  renderProfile(pro);

  const {start:todayStart,end:todayEnd}=todayBounds();
  const monthStart=startOfMonth();
  const monthEnd=endOfMonth();
  const now=new Date();

  const [todayResult,monthResult,commissionResult,upcomingResult,historyResult]=await Promise.all([
    supabase.from("appointments")
      .select("id,status,total_amount")
      .gte("starts_at",todayStart.toISOString())
      .lte("starts_at",todayEnd.toISOString())
      .neq("status","cancelled"),

    supabase.from("appointments")
      .select("id,status,total_amount")
      .gte("starts_at",monthStart.toISOString())
      .lte("starts_at",monthEnd.toISOString())
      .eq("status","completed"),

    supabase.from("commission_entries")
      .select("commission_amount,status,created_at")
      .gte("created_at",monthStart.toISOString())
      .lte("created_at",monthEnd.toISOString())
      .neq("status","cancelled"),

    supabase.from("appointments")
      .select("id,starts_at,status,customer:customers(full_name),appointment_services(service_name,sort_order)")
      .gte("starts_at",now.toISOString())
      .in("status",["scheduled","confirmed","waiting","in_service"])
      .order("starts_at",{ascending:true})
      .limit(6),

    supabase.from("appointments")
      .select("id,starts_at,total_amount,status,customer:customers(full_name),appointment_services(service_name,sort_order)")
      .eq("status","completed")
      .order("starts_at",{ascending:false})
      .limit(8)
  ]);

  const today=todayResult.data||[];
  const month=monthResult.data||[];
  const commissions=commissionResult.data||[];
  const upcoming=upcomingResult.data||[];
  const history=historyResult.data||[];

  $("performanceToday").textContent=today.filter(a=>["waiting","in_service","completed"].includes(a.status)).length;
  $("performanceMonthAppointments").textContent=month.length;
  $("performanceGenerated").textContent=money(month.reduce((sum,a)=>sum+Number(a.total_amount||0),0));
  $("performancePendingCommission").textContent=money(
    commissions.filter(c=>c.status==="pending").reduce((sum,c)=>sum+Number(c.commission_amount||0),0)
  );
  $("performancePaidCommission").textContent=money(
    commissions.filter(c=>c.status==="paid").reduce((sum,c)=>sum+Number(c.commission_amount||0),0)
  );

  $("performanceUpcomingList").innerHTML=upcoming.length
    ? upcoming.map(a=>{
        const services=(a.appointment_services||[]).map(s=>s.service_name).join(" + ")||"Serviço";
        return `
          <div class="performance-row">
            <div class="performance-row-time">
              <strong>${formatTime(a.starts_at)}</strong>
              <span>${formatDate(a.starts_at)}</span>
            </div>
            <div>
              <strong>${a.customer?.full_name||"Cliente"}</strong>
              <span>${services}</span>
            </div>
            <span class="performance-status status-${a.status}">${({
              scheduled:"Agendado",
              confirmed:"Confirmado",
              waiting:"Aguardando",
              in_service:"Em Atendimento"
            })[a.status]||a.status}</span>
          </div>
        `;
      }).join("")
    : empty("Nenhum atendimento futuro.");

  $("performanceHistoryList").innerHTML=history.length
    ? history.map(a=>{
        const services=(a.appointment_services||[]).map(s=>s.service_name).join(" + ")||"Serviço";
        return `
          <div class="performance-row">
            <div class="performance-row-time">
              <strong>${formatTime(a.starts_at)}</strong>
              <span>${formatDate(a.starts_at)}</span>
            </div>
            <div>
              <strong>${a.customer?.full_name||"Cliente"}</strong>
              <span>${services}</span>
            </div>
            <strong class="performance-value">${money(a.total_amount)}</strong>
          </div>
        `;
      }).join("")
    : empty("Nenhum atendimento finalizado ainda.");
}

async function init(){
  const pro=await getContext();
  if(!pro) return;

  document.querySelectorAll('.nav-item[data-section="desempenho"]').forEach(btn=>{
    btn.addEventListener("click",loadPerformance);
  });

  $("performanceOpenAgendaBtn")?.addEventListener("click",()=>{
    document.querySelector('.nav-item[data-section="agenda"]')?.click();
  });

  window.addEventListener("c7-checkout-complete",loadPerformance);
}

init();

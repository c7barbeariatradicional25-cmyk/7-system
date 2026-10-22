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

  if(!["barber","admin"].includes(profile?.role)) return null;

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


async function loadPortalExtras(pro){
 const {data:{session}}=await supabase.auth.getSession();
 const {data:perm}=session?await supabase.from("staff_permissions").select("permissions").eq("email",session.user.email.toLowerCase()).maybeSingle():{data:null};
 const {data:roleInfo}=session?await supabase.from("profiles").select("role").eq("user_id",session.user.id).maybeSingle():{data:null};
 const allowed=roleInfo?.role==="admin" || Boolean(perm?.permissions?.["clients.read"]);
 const [clients,consumptions,commissions]=await Promise.all([
 allowed?supabase.from("appointments").select("customer_id,starts_at,status,appointment_services(service_name),customer:customers(full_name,phone)").eq("professional_id",pro.id).order("starts_at",{ascending:false}).limit(300):Promise.resolve({data:[],error:null}),
 supabase.from("employee_consumptions").select("created_at,quantity,total_amount,status,amount_settled,product:products(name)").eq("professional_id",pro.id).order("created_at",{ascending:false}).limit(60),
 supabase.from("commission_entries").select("created_at,commission_amount,status").eq("professional_id",pro.id).order("created_at",{ascending:false}).limit(60)
 ]);
 const safe=t=>String(t??"").replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
 const unique=new Map();
 for(const a of clients.data||[]){if(!a.customer_id||!a.customer)continue;let row=unique.get(a.customer_id);if(!row){row={...a.customer,visits:[]};unique.set(a.customer_id,row);}row.visits.push(a);}
 const clientRows=allowed?[...unique.values()].sort((x,y)=>x.full_name.localeCompare(y.full_name,"pt-BR")):[];
 const days=["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"];
 const frequent=values=>{const counts=new Map();for(const v of values)counts.set(v,(counts.get(v)||0)+1);return [...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]||"—";};
 const clientCard=c=>{
   const valid=c.visits.filter(v=>!["cancelled","no_show"].includes(v.status));
   const completed=valid.filter(v=>v.status==="completed");
   const preferredDay=frequent(completed.map(v=>days[new Date(v.starts_at).getDay()]));
   const preferredHour=frequent(completed.map(v=>formatTime(v.starts_at)));
   const last=completed[0];
   const phone=String(c.phone||"").replace(/\D/g,"");
   return '<details class="portal-client-card"><summary><span class="portal-client-avatar">'+safe((c.full_name||"C").slice(0,1).toUpperCase())+'</span><span class="portal-client-main"><strong>'+safe(c.full_name)+'</strong><small>'+safe(c.phone||"Telefone não informado")+'</small></span><span class="portal-client-bubble">'+c.visits.length+' agend.</span><span class="portal-client-chevron">⌄</span></summary>'+
   '<div class="portal-client-details"><div class="portal-client-metrics"><div><small>Última visita concluída</small><strong>'+(last?formatDate(last.starts_at):"—")+'</strong></div><div><small>Dia mais frequente</small><strong>'+safe(preferredDay)+'</strong></div><div><small>Horário mais frequente</small><strong>'+safe(preferredHour)+'</strong></div><div><small>Atendimentos concluídos</small><strong>'+completed.length+'</strong></div></div>'+
   '<div class="portal-client-actions">'+(phone?'<a href="https://wa.me/55'+phone.replace(/^55/,"")+'" target="_blank" rel="noopener noreferrer">ABRIR WHATSAPP</a>':"")+'</div>'+
   '<strong class="portal-history-title">Histórico individual</strong><div class="portal-history-items">'+c.visits.map(v=>'<div class="portal-history-line"><span>'+formatDate(v.starts_at)+' às '+formatTime(v.starts_at)+'</span><strong>'+safe((v.appointment_services||[]).map(z=>z.service_name).join(", ")||"Atendimento")+'</strong><small>'+safe(({completed:"Concluído",scheduled:"Agendado",confirmed:"Confirmado",cancelled:"Cancelado",no_show:"Não compareceu",waiting:"Aguardando",in_service:"Em atendimento"})[v.status]||v.status)+'</small></div>').join("")+'</div></div></details>';
 };
 const renderClients=()=>{
   const query=String($("portalClientSearch")?.value||"").toLocaleLowerCase("pt-BR").trim();
   const matches=clientRows.filter(c=>(c.full_name+" "+(c.phone||"")).toLocaleLowerCase("pt-BR").includes(query));
   $("portalClientCount").textContent=matches.length+" cliente(s)";
   $("portalClients").innerHTML=!allowed?empty("Dados de clientes restritos pelo administrador."):clients.error?"Não foi possível carregar seus clientes.":matches.length?matches.map(clientCard).join(""):empty("Nenhum cliente encontrado.");
 };
 $("portalClientSearch").oninput=renderClients;
 renderClients();
 const cons=consumptions.data||[];
 $("portalConsumptions").innerHTML=consumptions.error?"Não foi possível carregar consumos.":cons.length?cons.map(c=>'<div class="performance-row"><div><strong>'+safe(c.product?.name||"Produto")+'</strong><span>'+formatDate(c.created_at)+' • '+safe(c.status)+'</span></div><strong>'+money(c.total_amount)+'</strong></div>').join(""):empty("Nenhum consumo.");
 const outstanding=cons.filter(c=>!["cancelled","canceled"].includes(c.status)).reduce((a,c)=>a+Math.max(0,Number(c.total_amount||0)-Number(c.amount_settled||0)),0);
 $("portalConsumptionTotal").textContent="Total exibido: "+money(cons.reduce((a,c)=>a+Number(c.total_amount||0),0))+" • Ainda não quitado: "+money(outstanding);
 const com=commissions.data||[];
 const pending=com.filter(c=>c.status==="pending").reduce((a,c)=>a+Number(c.commission_amount||0),0);
 $("portalPendingBalance").textContent=money(pending);
 $("portalOutstandingConsumption").textContent=money(outstanding);
 $("portalEstimatedBalance").textContent=money(pending-outstanding);
 $("portalCommissions").innerHTML=commissions.error?"Não foi possível carregar comissões.":com.length?com.map(c=>'<div class="performance-row"><div><strong>'+formatDate(c.created_at)+'</strong><span>'+safe(c.status)+'</span></div><strong>'+money(c.commission_amount)+'</strong></div>').join(""):empty("Nenhuma comissão.");
}
async function loadPerformance(){
  const pro=await getContext();
  if(!pro){
    const section=$("desempenho");
    if(section) section.innerHTML='<div class="agenda-empty">Seu acesso ainda não está vinculado a um barbeiro.</div>';
    return;
  }

  renderProfile(pro);
  await loadPortalExtras(pro);

  const {start:todayStart,end:todayEnd}=todayBounds();
  const monthStart=startOfMonth();
  const monthEnd=endOfMonth();
  const now=new Date();

  const [todayResult,monthResult,commissionResult,upcomingResult,historyResult]=await Promise.all([
    supabase.from("appointments")
      .select("id,professional_id,status,total_amount")
      .eq("professional_id",pro.id)
      .gte("starts_at",todayStart.toISOString())
      .lte("starts_at",todayEnd.toISOString())
      .neq("status","cancelled"),

    supabase.from("appointments")
      .select("id,professional_id,status,total_amount")
      .eq("professional_id",pro.id)
      .gte("starts_at",monthStart.toISOString())
      .lte("starts_at",monthEnd.toISOString())
      .eq("status","completed"),

    supabase.from("commission_entries")
      .select("professional_id,commission_amount,status,created_at")
      .eq("professional_id",pro.id)
      .gte("created_at",monthStart.toISOString())
      .lte("created_at",monthEnd.toISOString())
      .neq("status","cancelled"),

    supabase.from("appointments")
      .select("id,professional_id,starts_at,status,appointment_services(service_name,sort_order)")
      .eq("professional_id",pro.id)
      .gte("starts_at",now.toISOString())
      .in("status",["scheduled","confirmed","waiting","in_service"])
      .order("starts_at",{ascending:true})
      .limit(6),

    supabase.from("appointments")
      .select("id,professional_id,starts_at,total_amount,status,appointment_services(service_name,sort_order)")
      .eq("professional_id",pro.id)
      .eq("status","completed")
      .order("starts_at",{ascending:false})
      .limit(8)
  ]);

  const today=(todayResult.data||[]).filter(a=>a.professional_id===pro.id);
  const month=(monthResult.data||[]).filter(a=>a.professional_id===pro.id);
  const commissions=(commissionResult.data||[]).filter(c=>c.professional_id===pro.id);
  const upcoming=(upcomingResult.data||[]).filter(a=>a.professional_id===pro.id);
  const history=(historyResult.data||[]).filter(a=>a.professional_id===pro.id);

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
              <strong>Cliente</strong>
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

function init(){
  document.querySelectorAll('.nav-item[data-section="desempenho"],.nav-item[data-section="meus-clientes"],.nav-item[data-section="meus-consumos"],.nav-item[data-section="minhas-comissoes"]').forEach(btn=>{
    btn.addEventListener("click",()=>loadPerformance().catch(console.error));
  });
  $("performanceOpenAgendaBtn")?.addEventListener("click",()=>{
    document.querySelector('.nav-item[data-section="agenda"]')?.click();
  });
  $("portalRefreshBtn")?.addEventListener("click",()=>loadPerformance().catch(console.error));
  $("portalAgendaBtn")?.addEventListener("click",()=>document.querySelector('.nav-item[data-section="agenda"]')?.click());
  window.addEventListener("c7-checkout-complete",()=>loadPerformance().catch(console.error));
  window.addEventListener("c7-mode-changed",()=>{
    if(["desempenho","meus-clientes","meus-consumos","minhas-comissoes"].some(id=>document.getElementById(id)?.classList.contains("active")))loadPerformance().catch(console.error);
  });
  supabase.auth.onAuthStateChange((event)=>{
    if(event==="SIGNED_IN"||event==="INITIAL_SESSION"){
      setTimeout(()=>{
        if(document.getElementById("desempenho")?.classList.contains("active"))loadPerformance().catch(console.error);
      },0);
    }
  });
  if(document.getElementById("desempenho")?.classList.contains("active"))loadPerformance().catch(console.error);
}
init();

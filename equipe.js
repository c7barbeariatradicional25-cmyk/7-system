import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase=createClient(
  "https://cjtgjqxkyvgjlhylrvas.supabase.co",
  "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE"
);

const $=id=>document.getElementById(id);
let currentRole=null;
let professionals=[];

async function loadContext(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return false;
  const {data}=await supabase.from("profiles").select("role").eq("user_id",session.user.id).single();
  currentRole=data?.role||null;
  return true;
}

function canAdmin(){return currentRole==="admin"}

async function loadProfessionals(){
  const {data,error}=await supabase
    .from("professionals")
    .select("*")
    .order("sort_order")
    .order("full_name");

  if(error) return;
  professionals=data||[];
  renderProfessionals();
}

function renderProfessionals(){
  const list=$("professionalAdminList");
  list.replaceChildren();

  if(!professionals.length){
    const empty=document.createElement("div");
    empty.className="agenda-empty";
    empty.textContent="Nenhum profissional cadastrado.";
    list.appendChild(empty);
    return;
  }

  professionals.forEach(p=>{
    const row=document.createElement("div");
    row.className="catalog-row";

    const main=document.createElement("div");
    main.className="catalog-main";
    const name=document.createElement("strong");
    name.textContent=p.full_name;
    const meta=document.createElement("span");
    meta.textContent=(p.specialty||"Barbeiro")+" • "+(p.phone||"Sem telefone");
    main.append(name,meta);

    const commission=document.createElement("div");
    commission.className="catalog-meta";
    const cv=document.createElement("strong");
    cv.textContent=p.commission_percent==null?"—":Number(p.commission_percent).toLocaleString("pt-BR")+"%";
    const cl=document.createElement("small");
    cl.textContent="COMISSÃO";
    commission.append(cv,cl);

    const status=document.createElement("div");
    status.className="catalog-meta";
    const sv=document.createElement("strong");
    sv.textContent=p.active?"ATIVO":"INATIVO";
    const sl=document.createElement("small");
    sl.textContent="AGENDA";
    status.append(sv,sl);

    const actions=document.createElement("div");
    actions.className="catalog-actions";

    if(canAdmin()){
      const edit=document.createElement("button");
      edit.textContent="EDITAR";
      edit.addEventListener("click",()=>openProfessional(p.id));

      const toggle=document.createElement("button");
      toggle.textContent=p.active?"DESATIVAR":"ATIVAR";
      toggle.className="active-toggle"+(p.active?"":" off");
      toggle.addEventListener("click",()=>toggleProfessional(p));

      actions.append(edit,toggle);
    }

    row.append(main,commission,status,actions);
    list.appendChild(row);
  });
}

async function toggleProfessional(professional){
  await supabase
    .from("professionals")
    .update({active:!professional.active,updated_at:new Date().toISOString()})
    .eq("id",professional.id);
  await loadProfessionals();
}

function openProfessional(id=null){
  const p=professionals.find(x=>x.id===id);
  $("professionalAdminForm").reset();
  $("professionalAdminId").value=p?.id||"";
  $("professionalAdminTitle").textContent=p?"Editar barbeiro":"Novo barbeiro";
  $("professionalAdminName").value=p?.full_name||"";
  $("professionalAdminPhone").value=p?.phone||"";
  $("professionalAdminSpecialty").value=p?.specialty||"Barbeiro";
  $("professionalAdminCommission").value=p?.commission_percent??"";
  $("professionalAdminSort").value=p?.sort_order??0;
  $("professionalAdminActive").checked=p?.active??true;
  $("professionalAdminMessage").textContent="";
  $("professionalAdminModal").classList.remove("hidden");
}

function closeProfessional(){
  $("professionalAdminModal").classList.add("hidden");
}

async function saveProfessional(e){
  e.preventDefault();
  if(!canAdmin()) return;

  const id=$("professionalAdminId").value;
  const commissionValue=$("professionalAdminCommission").value;
  const payload={
    full_name:$("professionalAdminName").value.trim(),
    phone:$("professionalAdminPhone").value.trim()||null,
    specialty:$("professionalAdminSpecialty").value.trim()||"Barbeiro",
    commission_percent:commissionValue===""?null:Number(commissionValue),
    sort_order:Number($("professionalAdminSort").value||0),
    active:$("professionalAdminActive").checked,
    updated_at:new Date().toISOString()
  };

  if(!payload.full_name){
    $("professionalAdminMessage").textContent="Informe o nome do barbeiro.";
    return;
  }

  const result=id
    ? await supabase.from("professionals").update(payload).eq("id",id)
    : await supabase.from("professionals").insert(payload);

  if(result.error){
    $("professionalAdminMessage").textContent="Não foi possível salvar o barbeiro.";
    return;
  }

  closeProfessional();
  await loadProfessionals();
}

async function init(){
  if(!await loadContext()) return;

  $("newProfessionalBtn")?.classList.toggle("hidden",!canAdmin());
  document.querySelectorAll('.nav-item[data-section="equipe"]').forEach(btn=>btn.addEventListener("click",loadProfessionals));
  $("newProfessionalBtn")?.addEventListener("click",()=>openProfessional());
  $("professionalAdminForm")?.addEventListener("submit",saveProfessional);
  document.querySelectorAll("[data-close-professional-admin]").forEach(el=>el.addEventListener("click",closeProfessional));
}

init();

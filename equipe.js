import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase=createClient(
  "https://cjtgjqxkyvgjlhylrvas.supabase.co",
  "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE"
);

const $=id=>document.getElementById(id);
let currentRole=null;
let professionals=[];
let systemAccess=[];

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
  const options='<option value="">Selecione</option>'+professionals.filter(p=>p.active).map(p=>`<option value="${p.id}">${p.full_name}</option>`).join("");
  if($("workingHoursProfessional")) $("workingHoursProfessional").innerHTML=options;
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
    main.className="catalog-main professional-main";
    const avatar=document.createElement("div");
    avatar.className="professional-list-avatar";
    if(p.avatar_url){
      const img=document.createElement("img");
      img.src=p.avatar_url;
      img.alt=p.full_name;
      avatar.appendChild(img);
    }else{
      avatar.textContent=(p.full_name||"C").slice(0,1).toUpperCase();
    }
    const identity=document.createElement("div");
    const name=document.createElement("strong");
    name.textContent=p.full_name;
    const meta=document.createElement("span");
    meta.textContent=(p.specialty||"Barbeiro")+" • "+(p.phone||"Sem telefone");
    identity.append(name,meta);
    main.append(avatar,identity);

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

async function openProfessional(id=null){
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
  $("professionalAdminPhoto").value="";
  renderProfessionalPhotoPreview(p?.avatar_url,p?.full_name||"C7");
  $("professionalAdminMessage").textContent="";

  let linkedAccess=null;
  if(p){
    const {data}=await supabase
      .from("admin_allowlist")
      .select("email,full_name,role,active,professional_id")
      .eq("professional_id",p.id)
      .eq("role","barber")
      .maybeSingle();
    linkedAccess=data||null;
  }

  $("professionalAccessEmail").value=linkedAccess?.email||"";
  $("professionalAccessEmail").readOnly=Boolean(linkedAccess);
  $("professionalAccessPassword").value="";
  $("professionalAccessPasswordWrap").classList.toggle("hidden",Boolean(linkedAccess));
  $("professionalAccessPassword").required=!linkedAccess;
  $("professionalAccessActive").checked=linkedAccess?.active??true;
  $("professionalAccessStatus").textContent=linkedAccess
    ? (linkedAccess.active?"ACESSO ATIVO":"ACESSO INATIVO")
    : "SEM ACESSO";
  $("professionalAccessStatus").classList.toggle("active",Boolean(linkedAccess?.active));
  $("professionalAccessHint").textContent=linkedAccess
    ? "O e-mail já está vinculado a este barbeiro. Você pode ativar ou desativar o acesso por aqui."
    : "Ao salvar, este e-mail será autorizado e vinculado automaticamente a este barbeiro.";

  $("professionalAdminModal").classList.remove("hidden");
}

function renderProfessionalPhotoPreview(url,name){
  const preview=$("professionalPhotoPreview");
  if(!preview) return;
  preview.replaceChildren();
  if(url){
    const img=document.createElement("img");
    img.src=url;
    img.alt=name||"Barbeiro";
    preview.appendChild(img);
  }else{
    preview.textContent=(name||"C7").slice(0,2).toUpperCase();
  }
}

async function uploadProfessionalPhoto(professionalId,file){
  if(!file) return null;
  const ext=(file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"");
  const path=`team/${professionalId}-${Date.now()}.${ext||"jpg"}`;

  const {error}=await supabase.storage.from("c7-assets").upload(path,file,{
    cacheControl:"3600",
    upsert:false
  });
  if(error) throw error;

  const {data}=supabase.storage.from("c7-assets").getPublicUrl(path);
  return data.publicUrl;
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
    ? await supabase.from("professionals").update(payload).eq("id",id).select("id").single()
    : await supabase.from("professionals").insert(payload).select("id").single();

  if(result.error){
    $("professionalAdminMessage").textContent="Não foi possível salvar o barbeiro.";
    return;
  }

  const professionalId=result.data?.id||id;

  const accessEmail=$("professionalAccessEmail").value.trim().toLowerCase();
  const accessPassword=$("professionalAccessPassword").value;

  if(accessEmail){
    const {data:existingAccess}=await supabase
      .from("admin_allowlist")
      .select("email")
      .eq("professional_id",professionalId)
      .eq("role","barber")
      .maybeSingle();

    if(!existingAccess && accessPassword.length<8){
      $("professionalAdminMessage").textContent="Informe uma senha inicial com pelo menos 8 caracteres.";
      return;
    }

    const {error:accessError}=await supabase
      .from("admin_allowlist")
      .upsert({
        email:accessEmail,
        full_name:payload.full_name,
        role:"barber",
        professional_id:professionalId,
        active:$("professionalAccessActive").checked
      },{onConflict:"email"});

    if(accessError){
      $("professionalAdminMessage").textContent="Barbeiro salvo, mas não foi possível salvar o acesso.";
      await loadProfessionals();
      return;
    }

    if(!existingAccess){
      const authClient=createClient(
        "https://cjtgjqxkyvgjlhylrvas.supabase.co",
        "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE",
        {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}
      );

      const {error:signUpError}=await authClient.auth.signUp({
        email:accessEmail,
        password:accessPassword
      });

      if(signUpError){
        $("professionalAdminMessage").textContent="Barbeiro salvo, mas não foi possível criar o login. Verifique se o e-mail já possui conta.";
        await loadProfessionals();
        return;
      }
    }
  }else{
    const {data:existingAccess}=await supabase
      .from("admin_allowlist")
      .select("email")
      .eq("professional_id",professionalId)
      .eq("role","barber")
      .maybeSingle();

    if(existingAccess?.email){
      await supabase
        .from("admin_allowlist")
        .update({active:false})
        .eq("email",existingAccess.email);
    }
  }

  const photoFile=$("professionalAdminPhoto").files?.[0];

  if(photoFile){
    try{
      $("professionalAdminMessage").textContent="Enviando foto...";
      const avatarUrl=await uploadProfessionalPhoto(professionalId,photoFile);
      await supabase.from("professionals")
        .update({avatar_url:avatarUrl,updated_at:new Date().toISOString()})
        .eq("id",professionalId);
    }catch(error){
      $("professionalAdminMessage").textContent="Barbeiro salvo, mas não foi possível enviar a foto.";
      await loadProfessionals();
      return;
    }
  }

  closeProfessional();
  await loadProfessionals();
}

async function init(){
  if(!await loadContext()) return;

  $("newProfessionalBtn")?.classList.toggle("hidden",!canAdmin());
  document.querySelectorAll('.nav-item[data-section="equipe"]').forEach(btn=>btn.addEventListener("click",async()=>{
    await loadProfessionals();
    if(canAdmin()) await loadSystemAccess();
  }));
  $("newProfessionalBtn")?.addEventListener("click",()=>openProfessional());
  $("professionalAdminForm")?.addEventListener("submit",saveProfessional);
  document.querySelectorAll("[data-close-professional-admin]").forEach(el=>el.addEventListener("click",closeProfessional));
  $("loadWorkingHoursBtn")?.addEventListener("click",loadWorkingHours);
  $("workingHoursProfessional")?.addEventListener("change",loadWorkingHours);
  $("newAccessBtn")?.classList.toggle("hidden",!canAdmin());
  $("newAccessBtn")?.addEventListener("click",()=>openAccess());
  $("accessForm")?.addEventListener("submit",saveAccess);
  $("accessRole")?.addEventListener("change",toggleAccessProfessionalField);
  $("professionalAdminPhoto")?.addEventListener("change",()=>{
    const file=$("professionalAdminPhoto").files?.[0];
    if(!file) return;
    const url=URL.createObjectURL(file);
    renderProfessionalPhotoPreview(url,$("professionalAdminName").value||"Barbeiro");
  });
  document.querySelectorAll("[data-close-access]").forEach(el=>el.addEventListener("click",closeAccess));
}

init();


const weekdayNames=["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];

async function loadWorkingHours(){
  const professionalId=$("workingHoursProfessional")?.value;
  const target=$("workingHoursList");
  if(!professionalId||!target) return;

  const {data,error}=await supabase
    .from("professional_working_hours")
    .select("*")
    .eq("professional_id",professionalId)
    .order("weekday");

  if(error){
    target.innerHTML='<div class="agenda-empty">Não foi possível carregar os horários.</div>';
    return;
  }

  const map=new Map((data||[]).map(x=>[x.weekday,x]));
  target.replaceChildren();

  for(let day=0;day<=6;day++){
    const item=map.get(day);
    const row=document.createElement("div");
    row.className="working-hour-row";

    const toggle=document.createElement("label");
    toggle.className="day-toggle";
    const checkbox=document.createElement("input");
    checkbox.type="checkbox";
    checkbox.checked=Boolean(item?.active);
    const label=document.createElement("span");
    label.textContent=weekdayNames[day];
    toggle.append(checkbox,label);

    const startLabel=document.createElement("label");
    const startText=document.createElement("span");
    startText.textContent="Início";
    const start=document.createElement("input");
    start.type="time";
    start.value=(item?.starts_at||"08:00").slice(0,5);
    startLabel.append(startText,start);

    const endLabel=document.createElement("label");
    const endText=document.createElement("span");
    endText.textContent="Fim";
    const end=document.createElement("input");
    end.type="time";
    end.value=(item?.ends_at||"20:00").slice(0,5);
    endLabel.append(endText,end);

    const save=document.createElement("button");
    save.className="ghost-btn";
    save.type="button";
    save.textContent="SALVAR";
    save.disabled=!canAdmin();

    save.addEventListener("click",async()=>{
      if(!canAdmin()) return;

      const payload={
        professional_id:professionalId,
        weekday:day,
        starts_at:start.value||"08:00",
        ends_at:end.value||"20:00",
        active:checkbox.checked,
        updated_at:new Date().toISOString()
      };

      const existing=map.get(day);
      const result=existing
        ? await supabase.from("professional_working_hours").update(payload).eq("id",existing.id)
        : await supabase.from("professional_working_hours").insert(payload);

      if(result.error){
        alert("Não foi possível salvar o horário.");
        return;
      }

      await loadWorkingHours();
    });

    row.append(toggle,startLabel,endLabel,save);
    target.appendChild(row);
  }
}

async function loadSystemAccess(){
  if(!canAdmin()) return;

  const {data,error}=await supabase
    .from("admin_allowlist")
    .select("email,full_name,role,active,created_at,professional_id")
    .order("full_name",{ascending:true});
  const target=$("systemAccessList");
  if(!target) return;

  if(error){
    target.innerHTML='<div class="agenda-empty">Não foi possível carregar os acessos.</div>';
    return;
  }

  systemAccess=data||[];
  target.replaceChildren();

  if(!systemAccess.length){
    target.innerHTML='<div class="agenda-empty">Nenhum acesso autorizado.</div>';
    return;
  }

  systemAccess.forEach(item=>{
    const row=document.createElement("div");
    row.className="access-row";

    const main=document.createElement("div");
    const name=document.createElement("strong");
    name.textContent=item.full_name||item.email;
    const email=document.createElement("span");
    email.textContent=item.email;
    main.append(name,email);

    const role=document.createElement("div");
    const roleStrong=document.createElement("strong");
    roleStrong.textContent=item.role==="admin"?"ADMIN":item.role==="reception"?"RECEPÇÃO":"BARBEIRO";
    const roleSmall=document.createElement("span");
    roleSmall.textContent=item.active?"ATIVO":"INATIVO";
    role.append(roleStrong,roleSmall);

    const edit=document.createElement("button");
    edit.type="button";
    edit.textContent="EDITAR";
    edit.addEventListener("click",()=>openAccess(item));

    const toggle=document.createElement("button");
    toggle.type="button";
    toggle.textContent=item.active?"DESATIVAR":"ATIVAR";
    toggle.addEventListener("click",async()=>{
      await supabase
        .from("admin_allowlist")
        .update({active:!item.active})
        .eq("email",item.email);
      await loadSystemAccess();
    });

    row.append(main,role,edit,toggle);
    target.appendChild(row);
  });
}

function openAccess(item=null){
  $("accessForm").reset();
  $("accessModalTitle").textContent=item?"Editar acesso":"Novo acesso";
  $("accessFullName").value=item?.full_name||"";
  $("accessEmail").value=item?.email||"";
  $("accessRole").value=item?.role||"barber";
  $("accessActive").checked=item?.active??true;
  $("accessEmail").readOnly=Boolean(item);

  const options='<option value="">Selecione</option>'+
    professionals.filter(p=>p.active).map(p=>`<option value="${p.id}">${p.full_name}</option>`).join("");
  $("accessProfessional").innerHTML=options;
  $("accessProfessional").value=item?.professional_id||"";
  toggleAccessProfessionalField();

  $("accessMessage").textContent="";
  $("accessModal").classList.remove("hidden");
}

function toggleAccessProfessionalField(){
  const isBarber=$("accessRole").value==="barber";
  $("accessProfessionalWrap").classList.toggle("hidden",!isBarber);
  $("accessProfessional").required=isBarber;
}

function closeAccess(){
  $("accessModal").classList.add("hidden");
}

async function saveAccess(e){
  e.preventDefault();
  if(!canAdmin()) return;

  const email=$("accessEmail").value.trim().toLowerCase();
  const fullName=$("accessFullName").value.trim();
  const role=$("accessRole").value;
  const professionalId=role==="barber"?$("accessProfessional").value:null;

  if(!email||!fullName){
    $("accessMessage").textContent="Informe nome e e-mail.";
    return;
  }

  if(role==="barber"&&!professionalId){
    $("accessMessage").textContent="Selecione qual barbeiro pertence a este login.";
    return;
  }

  $("accessMessage").textContent="Salvando acesso...";

  const {error}=await supabase
    .from("admin_allowlist")
    .upsert({
      email,
      full_name:fullName,
      role,
      professional_id:professionalId||null,
      active:$("accessActive").checked
    },{onConflict:"email"});

  if(error){
    $("accessMessage").textContent="Não foi possível salvar o acesso.";
    return;
  }

  closeAccess();
  await loadSystemAccess();
}

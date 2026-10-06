import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase=createClient(
  "https://cjtgjqxkyvgjlhylrvas.supabase.co",
  "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE"
);

const $=id=>document.getElementById(id);
let currentRole=null;
let settingsId=null;

async function loadContext(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return false;
  const {data}=await supabase.from("profiles").select("role").eq("user_id",session.user.id).single();
  currentRole=data?.role||null;
  return true;
}

async function loadSettings(){
  const {data,error}=await supabase
    .from("system_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  if(error||!data) return;

  settingsId=data.id;
  $("settingsBusinessName").value=data.business_name||"";
  $("settingsPhone").value=data.phone||"";
  $("settingsAddress").value=data.address||"";
  $("settingsBookingUrl").value=data.booking_url||"";
  $("settingsMapsUrl").value=data.maps_url||"";
  $("settingsTimezone").value=data.timezone||"America/Sao_Paulo";
}

async function saveSettings(e){
  e.preventDefault();

  if(currentRole!=="admin"){
    $("settingsMessage").textContent="Apenas administradores podem alterar as configurações.";
    return;
  }

  if(!settingsId){
    $("settingsMessage").textContent="Configuração principal não encontrada.";
    return;
  }

  $("settingsMessage").textContent="Salvando...";

  const {error}=await supabase.from("system_settings").update({
    business_name:$("settingsBusinessName").value.trim(),
    phone:$("settingsPhone").value.trim()||null,
    address:$("settingsAddress").value.trim()||null,
    booking_url:$("settingsBookingUrl").value.trim()||null,
    maps_url:$("settingsMapsUrl").value.trim()||null,
    timezone:$("settingsTimezone").value.trim()||"America/Sao_Paulo",
    updated_at:new Date().toISOString()
  }).eq("id",settingsId);

  $("settingsMessage").textContent=error
    ?"Não foi possível salvar as configurações."
    :"Configurações salvas.";
}

async function init(){
  if(!await loadContext()) return;

  document.querySelectorAll('.nav-item[data-section="configuracoes"]').forEach(btn=>{
    btn.addEventListener("click",loadSettings);
  });

  $("settingsForm")?.addEventListener("submit",saveSettings);

  if(currentRole!=="admin"){
    $("settingsForm")?.querySelectorAll("input,button").forEach(el=>el.disabled=true);
  }
}

init();

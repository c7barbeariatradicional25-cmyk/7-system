import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  "https://cjtgjqxkyvgjlhylrvas.supabase.co",
  "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE"
);

const loginView=document.getElementById("loginView");
const appView=document.getElementById("appView");
const loginForm=document.getElementById("loginForm");
const firstAccessBtn=document.getElementById("firstAccessBtn");
const loginMessage=document.getElementById("loginMessage");
const logoutBtn=document.getElementById("logoutBtn");
const userName=document.getElementById("userName");
const userRole=document.getElementById("userRole");
const pageTitle=document.getElementById("pageTitle");

const roleLabels={admin:"Administrador",reception:"Recepção",barber:"Barbeiro"};

function showLogin(){loginView.classList.remove("hidden");appView.classList.add("hidden")}
function showApp(){loginView.classList.add("hidden");appView.classList.remove("hidden")}

async function loadProfile(userId){
  const {data,error}=await supabase.from("profiles").select("full_name,role,active").eq("user_id",userId).single();
  if(error||!data||!data.active){await supabase.auth.signOut();showLogin();loginMessage.textContent="Usuário sem acesso ativo.";return}
  userName.textContent=data.full_name||"Usuário C7";
  userRole.textContent=roleLabels[data.role]||data.role;
  document.querySelectorAll(".nav-item").forEach(item=>{
    const section=item.dataset.section;
    const hide=(data.role==="barber"&&["caixa","relatorios","configuracoes"].includes(section))||(data.role==="reception"&&section==="configuracoes");
    item.classList.toggle("hidden",hide);
  });
  showApp();
}

loginForm.addEventListener("submit",async e=>{
  e.preventDefault();
  loginMessage.textContent="Entrando...";
  const email=document.getElementById("email").value.trim();
  const password=document.getElementById("password").value;
  const {data,error}=await supabase.auth.signInWithPassword({email,password});
  if(error){loginMessage.textContent="E-mail ou senha inválidos.";return}
  loginMessage.textContent="";
  await loadProfile(data.user.id);
});

firstAccessBtn.addEventListener("click",async()=>{
  const email=document.getElementById("email").value.trim();
  const password=document.getElementById("password").value;
  if(!email||password.length<8){loginMessage.textContent="Informe o e-mail e uma senha com pelo menos 8 caracteres.";return}
  loginMessage.textContent="Criando acesso...";
  const {data,error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin+"/"}});
  if(error){loginMessage.textContent="Não foi possível criar o acesso. Confira se o e-mail está autorizado.";return}
  if(data.session){loginMessage.textContent="";await loadProfile(data.user.id)}
  else loginMessage.textContent="Acesso criado. Confira seu e-mail para confirmar a conta.";
});

logoutBtn.addEventListener("click",async()=>{await supabase.auth.signOut();showLogin()});

function openSection(id){
  document.querySelectorAll(".section").forEach(el=>el.classList.toggle("active",el.id===id));
  document.querySelectorAll(".nav-item").forEach(el=>el.classList.toggle("active",el.dataset.section===id));
  const btn=document.querySelector(`.nav-item[data-section="${id}"]`);
  pageTitle.textContent=btn?btn.textContent:"C7 System";
}
document.querySelectorAll(".nav-item").forEach(btn=>btn.addEventListener("click",()=>openSection(btn.dataset.section)));

const {data:{session}}=await supabase.auth.getSession();
if(session) await loadProfile(session.user.id); else showLogin();
supabase.auth.onAuthStateChange((_event,session)=>{if(!session)showLogin()});
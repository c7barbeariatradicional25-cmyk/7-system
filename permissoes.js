
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const db=createClient("https://cjtgjqxkyvgjlhylrvas.supabase.co","sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE");
const $=id=>document.getElementById(id);

const GROUPS=[
 {title:"Clientes",icon:"◈",items:[
  ["clients.create","Cadastrar novos clientes"],["clients.read","Consultar dados pessoais dos clientes"],
  ["clients.edit","Editar cadastros"],["clients.delete","Excluir clientes"],
  ["clients.history","Consultar histórico de atendimentos"]]},
 {title:"Agendamentos",icon:"◷",items:[
  ["appointments.view","Visualizar agenda"],["appointments.create","Criar agendamentos"],
  ["appointments.edit","Alterar agendamentos"],["appointments.cancel","Cancelar agendamentos"]]},
 {title:"Financeiro",icon:"◇",items:[
  ["cash.view","Acessar caixa e movimentações"],["finance.view","Consultar financeiro e acertos"],
  ["reports.view","Visualizar relatórios"]]},
 {title:"Operação e gestão",icon:"▦",items:[
  ["products.view","Consultar produtos"],["products.manage","Editar produtos"],["stock.manage","Gerenciar estoque"],
  ["services.manage","Gerenciar serviços e preços"],["operations.view","Consultar operações"],
  ["team.view","Visualizar equipe"],["team.manage","Gerenciar funcionários"],
  ["promotions.manage","Administrar promoções"],["automations.manage","Administrar automações"],
  ["settings.manage","Acessar configurações"],["barber.portal","Acessar portal do barbeiro"]]}
];
const ALL=GROUPS.flatMap(g=>g.items.map(x=>x[0]));
const BASE={
 reception:new Set(["clients.create","clients.read","clients.edit","clients.delete","clients.history","appointments.view","appointments.create","appointments.edit","appointments.cancel","cash.view","finance.view","products.view","products.manage","stock.manage","team.view","reports.view","services.manage","operations.view","promotions.manage","automations.manage"]),
 barber:new Set(["appointments.view","appointments.edit","appointments.cancel","operations.view","barber.portal"])
};
let people=[],overrides={},selected="",rights={},timers={},saving={},versions={};
const esc=s=>String(s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
function status(message,error=false){const el=$("permissionStatus");if(el){el.textContent=message;el.dataset.error=error?"true":"false";}}
function current(){return people.find(p=>p.email===selected);}
function defaults(role){return Object.fromEntries(ALL.map(k=>[k,role==="admin"||Boolean(BASE[role]?.has(k))]));}
function ensure(email){
 if(rights[email])return;
 const person=people.find(p=>p.email===email);
 rights[email]={...defaults(person?.role),...(overrides[email]||{})};
}
function render(){
 const person=current(), target=$("permissionGroups");
 if(!target)return;
 target.replaceChildren();
 if(!person){target.textContent="Selecione um funcionário.";return;}
 ensure(person.email);
 const protectedAccount=person.role==="admin";
 $("permissionEmployeeName").textContent=person.full_name||person.email;
 $("permissionEmployeeRole").textContent=protectedAccount?"Administrador • permissões protegidas":person.role==="reception"?"Recepção":"Barbeiro / Funcionário";
 $("permissionActive").textContent=person.active?"ATIVO":"INATIVO";
 $("permissionActive").className="staff-permission-badge"+(person.active?" is-active":"");
 for(const group of GROUPS){
   const card=document.createElement("article");card.className="staff-permission-group";
   const heading=document.createElement("h3");heading.textContent=group.icon+"  "+group.title;card.appendChild(heading);
   for(const [key,label] of group.items){
     const row=document.createElement("label");row.className="staff-permission-toggle";
     const span=document.createElement("span");span.textContent=label;
     const cb=document.createElement("input");cb.type="checkbox";cb.checked=Boolean(rights[person.email][key]);cb.disabled=protectedAccount||!person.active;
     cb.dataset.permission=key;

     const prereq={
       "clients.edit":"clients.read","clients.delete":"clients.read","clients.history":"clients.read",
       "appointments.edit":"appointments.view","appointments.cancel":"appointments.view"
     }[key];
     if(prereq && !rights[person.email][prereq]){
       cb.disabled=true;
       row.title="Esta permissão exige: "+prereq;
       cb.checked=false;
       rights[person.email][key]=false;
     }
     cb.addEventListener("change",()=>{
       const email=person.email;
       rights[email][key]=cb.checked;
       if(key==="clients.read" && !cb.checked){
         for(const dep of ["clients.edit","clients.delete","clients.history"]) rights[email][dep]=false;
       }
       if(key==="appointments.view" && !cb.checked){
         for(const dep of ["appointments.edit","appointments.cancel","appointments.create"])rights[email][dep]=false;
       }
       if(key==="appointments.create" && cb.checked){
         rights[email]["appointments.view"]=true;
         rights[email]["clients.create"]=true;
       }
       if(key==="stock.manage" && cb.checked)rights[email]["products.view"]=true;
       if(key==="products.manage" && cb.checked)rights[email]["products.view"]=true;
       if(key==="team.manage" && cb.checked)rights[email]["team.view"]=true;
       render();
       status("Salvando alterações...");
       scheduleSave(email);
     });
     row.append(span,cb);card.appendChild(row);
   }
   target.appendChild(card);
 }
 status(protectedAccount?"Acesso completo do administrador protegido.":person.active?"Marque ou desmarque: cada alteração é salva automaticamente.":"Acesso desativado. Ative o usuário em Equipe.");
}
function scheduleSave(email){
 versions[email]=(versions[email]||0)+1;
 clearTimeout(timers[email]);
 timers[email]=setTimeout(()=>{timers[email]=null;write(email);},350);
}
async function write(email){
 if(saving[email])return;
 saving[email]=true;
 try{
   while(true){
     const version=versions[email]||0;
     const snapshot={...rights[email]};
     const {error}=await db.from("staff_permissions").upsert({
       email,permissions:snapshot,updated_at:new Date().toISOString()
     },{onConflict:"email"});
     if(error)throw error;
     overrides[email]=snapshot;
     if((versions[email]||0)===version)break;
   }
   if(email===selected)status("✓ Permissões atualizadas automaticamente.");
 }catch(e){
   console.error("C7 permissões",e);
   rights[email]={...defaults(people.find(p=>p.email===email)?.role),...(overrides[email]||{})};
   if(email===selected){render();status("Não foi possível salvar. Alterações revertidas.",true);}
 }finally{
   saving[email]=false;
 }
}
async function loadPeople(preferred=""){
 const {data:{session}}=await db.auth.getSession();
 if(!session)return;
 const {data:profile}=await db.from("profiles").select("role").eq("user_id",session.user.id).maybeSingle();
 if(profile?.role!=="admin")return;
 const [{data:accounts,error:e1},{data:configs,error:e2}]=await Promise.all([
   db.from("admin_allowlist").select("email,full_name,role,active").order("full_name"),
   db.from("staff_permissions").select("email,permissions")
 ]);
 if(e1||e2){status("Erro ao carregar os funcionários.",true);return;}
 people=(accounts||[]).map(p=>({...p,email:p.email.toLowerCase()}));
 overrides=Object.fromEntries((configs||[]).map(p=>[p.email,p.permissions]));
 for(const p of people){
   if(!saving[p.email]&&!timers[p.email]){
     rights[p.email]={...defaults(p.role),...(overrides[p.email]||{})};
   } else if(!rights[p.email])ensure(p.email);
 }
 const selector=$("permissionEmployee");
 selector.replaceChildren();
 for(const p of people){
   const opt=document.createElement("option");opt.value=p.email;
   opt.textContent=(p.full_name||p.email)+" — "+(p.role==="admin"?"Administrador":p.role==="reception"?"Recepção":"Barbeiro");
   selector.appendChild(opt);
 }
 selected=people.some(p=>p.email===preferred)?preferred:people.some(p=>p.email===selected)?selected:people.find(p=>p.role!=="admin")?.email||people[0]?.email||"";
 selector.value=selected;
 render();
}
document.querySelector('.nav-item[data-section="permissoes"]')?.addEventListener("click",()=>loadPeople());
$("permissionEmployee")?.addEventListener("change",e=>{selected=e.target.value;render();});
window.addEventListener("c7-edit-permissions",async e=>{
 const email=String(e.detail?.email||"").toLowerCase();
 document.querySelector('.nav-item[data-section="permissoes"]')?.click();
 await loadPeople(email);
});
window.addEventListener("focus",()=>{if(document.getElementById("permissoes")?.classList.contains("active"))loadPeople(selected);});

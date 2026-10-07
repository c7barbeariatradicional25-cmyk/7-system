import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase=createClient(
  "https://cjtgjqxkyvgjlhylrvas.supabase.co",
  "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE"
);

const $=id=>document.getElementById(id);
const money=v=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(v||0));
let role=null;
let professionals=[];
let products=[];

function closeModal(){
  $("employeeConsumptionModal")?.classList.add("hidden");
}

function openModal(){
  $("employeeConsumptionModal")?.classList.remove("hidden");
}

function updatePreview(){
  const product=products.find(p=>String(p.id)===$("employeeConsumptionProduct")?.value);
  const qty=Math.max(1,Number($("employeeConsumptionQty")?.value||1));
  if($("employeeConsumptionTotal")){
    $("employeeConsumptionTotal").value=money(Number(product?.price||0)*qty);
  }
}

async function loadOptions(){
  const [proResult,productResult]=await Promise.all([
    supabase.from("professionals")
      .select("id,full_name")
      .eq("active",true)
      .order("full_name"),
    supabase.from("products")
      .select("id,name,price,stock_quantity,product_kind")
      .eq("active",true)
      .order("category")
      .order("sort_order")
  ]);

  professionals=proResult.data||[];
  products=productResult.data||[];

  $("employeeConsumptionProfessional").innerHTML='<option value="">Selecione</option>'+
    professionals.map(p=>`<option value="${p.id}">${p.full_name}</option>`).join("");

  $("employeeConsumptionProduct").innerHTML='<option value="">Selecione</option>'+
    products.map(p=>`<option value="${p.id}">${p.name} — ${money(p.price)} • Estoque ${Number(p.stock_quantity||0)}</option>`).join("");
}

async function init(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return;

  const {data:profile}=await supabase
    .from("profiles")
    .select("role")
    .eq("user_id",session.user.id)
    .maybeSingle();

  role=profile?.role||null;
  if(!["admin","reception"].includes(role)) return;

  $("employeeConsumptionBtn")?.addEventListener("click",async()=>{
    $("employeeConsumptionForm").reset();
    $("employeeConsumptionQty").value="1";
    $("employeeConsumptionMessage").textContent="";
    await loadOptions();
    updatePreview();
    openModal();
  });

  document.querySelectorAll("[data-close-employee-consumption]").forEach(el=>{
    el.addEventListener("click",closeModal);
  });

  $("employeeConsumptionProduct")?.addEventListener("change",updatePreview);
  $("employeeConsumptionQty")?.addEventListener("input",updatePreview);

  $("employeeConsumptionForm")?.addEventListener("submit",async e=>{
    e.preventDefault();

    const professionalId=$("employeeConsumptionProfessional").value;
    const productId=Number($("employeeConsumptionProduct").value);
    const qty=Math.max(1,Number($("employeeConsumptionQty").value||1));

    if(!professionalId||!productId){
      $("employeeConsumptionMessage").textContent="Selecione o colaborador e o produto.";
      return;
    }

    $("employeeConsumptionMessage").textContent="Registrando consumo...";

    const {error}=await supabase.rpc("record_employee_consumption",{
      p_professional_id:professionalId,
      p_product_id:productId,
      p_quantity:qty,
      p_notes:$("employeeConsumptionNotes").value.trim()||null
    });

    if(error){
      const message=String(error.message||"");
      $("employeeConsumptionMessage").textContent=message.includes("Estoque insuficiente")
        ?"Estoque insuficiente para registrar este consumo."
        :"Não foi possível registrar o consumo.";
      return;
    }

    closeModal();
    window.dispatchEvent(new Event("c7-employee-consumption-updated"));
  });
}

init();

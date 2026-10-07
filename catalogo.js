import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase=createClient(
  "https://cjtgjqxkyvgjlhylrvas.supabase.co",
  "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE"
);

const $=id=>document.getElementById(id);
const money=v=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(v||0));
let currentRole=null;
let currentUser=null;
let services=[];
let products=[];
let productDepartment="barbershop";

async function loadContext(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return false;
  currentUser=session.user.id;
  const {data}=await supabase.from("profiles").select("role").eq("user_id",currentUser).single();
  currentRole=data?.role||null;
  return true;
}

function canAdmin(){return currentRole==="admin"}

async function loadServices(){
  const {data,error}=await supabase.from("services").select("*").order("sort_order").order("name");
  if(error) return;
  services=data||[];
  renderServices();
}

function groupByCategory(items){
  return items.reduce((acc,item)=>{
    const key=(item.category||"Sem categoria").trim()||"Sem categoria";
    (acc[key] ||= []).push(item);
    return acc;
  },{});
}

function renderServices(){
  const list=$("adminServiceList");
  list.replaceChildren();

  if(!services.length){
    const empty=document.createElement("div");
    empty.className="agenda-empty";
    empty.textContent="Nenhum serviço cadastrado.";
    list.appendChild(empty);
    return;
  }

  const groups=groupByCategory(services);

  Object.entries(groups).forEach(([category,items])=>{
    const section=document.createElement("section");
    section.className="catalog-category";

    const head=document.createElement("div");
    head.className="catalog-category-head";
    head.innerHTML=`<div><span>CATEGORIA</span><h3>${category}</h3></div><strong>${items.length}</strong>`;

    const body=document.createElement("div");
    body.className="catalog-category-body";

    items.forEach(s=>{
    const row=document.createElement("div");
    row.className="catalog-row";

    const main=document.createElement("div");
    main.className="catalog-main";
    const name=document.createElement("strong");
    name.textContent=s.name;
    const meta=document.createElement("span");
    meta.textContent=(s.category||"Sem categoria")+" • "+(s.duration||"Sem duração");
    main.append(name,meta);

    const price=document.createElement("div");
    price.className="catalog-meta";
    const p=document.createElement("strong");
    p.textContent=money(s.price);
    const ps=document.createElement("small");
    ps.textContent="PREÇO";
    price.append(p,ps);

    const status=document.createElement("div");
    status.className="catalog-meta";
    const st=document.createElement("strong");
    st.textContent=s.active?"ATIVO":"INATIVO";
    const sts=document.createElement("small");
    sts.textContent="LINK PÚBLICO";
    status.append(st,sts);

    const actions=document.createElement("div");
    actions.className="catalog-actions";

    if(canAdmin()){
      const edit=document.createElement("button");
      edit.textContent="EDITAR";
      edit.addEventListener("click",()=>openService(s.id));

      const toggle=document.createElement("button");
      toggle.className="active-toggle"+(s.active?"":" off");
      toggle.textContent=s.active?"DESATIVAR":"ATIVAR";
      toggle.addEventListener("click",()=>toggleService(s));

      actions.append(edit,toggle);
    }

    row.append(main,price,status,actions);
    body.appendChild(row);
    });

    section.append(head,body);
    list.appendChild(section);
  });
}

async function toggleService(service){
  await supabase.from("services").update({active:!service.active}).eq("id",service.id);
  await loadServices();
}

function openService(id=null){
  const s=services.find(x=>x.id===id);
  $("serviceAdminForm").reset();
  $("serviceAdminId").value=s?.id||"";
  $("serviceAdminTitle").textContent=s?"Editar serviço":"Novo serviço";
  $("serviceAdminName").value=s?.name||"";
  $("serviceAdminCategory").value=s?.category||"";
  $("serviceAdminDuration").value=s?.duration||"";
  $("serviceAdminPrice").value=s?.price??"";
  $("serviceAdminSort").value=s?.sort_order??0;
  $("serviceAdminActive").checked=s?.active??true;
  $("serviceAdminMessage").textContent="";
  $("serviceAdminModal").classList.remove("hidden");
}

function closeService(){ $("serviceAdminModal").classList.add("hidden") }

async function saveService(e){
  e.preventDefault();
  if(!canAdmin()) return;
  const id=$("serviceAdminId").value;
  const payload={
    name:$("serviceAdminName").value.trim(),
    category:$("serviceAdminCategory").value.trim(),
    duration:$("serviceAdminDuration").value.trim(),
    price:Number($("serviceAdminPrice").value||0),
    sort_order:Number($("serviceAdminSort").value||0),
    active:$("serviceAdminActive").checked
  };
  const result=id
    ? await supabase.from("services").update(payload).eq("id",id)
    : await supabase.from("services").insert(payload);
  if(result.error){
    $("serviceAdminMessage").textContent="Não foi possível salvar o serviço.";
    return;
  }
  closeService();
  await loadServices();
}

async function loadProducts(){
  const {data,error}=await supabase.from("products").select("*").order("sort_order").order("name");
  if(error) return;
  products=data||[];
  renderProducts();
}

function renderProducts(){
  const list=$("adminProductList");
  const active=products.filter(p=>p.active);
  const low=products.filter(p=>Number(p.stock_quantity)<=Number(p.min_stock));
  $("adminProductActiveCount").textContent=active.length;
  $("adminProductLowStockCount").textContent=low.length;
  $("adminProductStockTotal").textContent=products.reduce((sum,p)=>sum+Number(p.stock_quantity||0),0);

  list.replaceChildren();

  if(!products.length){
    const empty=document.createElement("div");
    empty.className="agenda-empty";
    empty.textContent="Nenhum produto cadastrado.";
    list.appendChild(empty);
    return;
  }

  const visibleProducts=products.filter(p=>(p.department||"barbershop")===productDepartment);
  const groups=groupByCategory(visibleProducts);

  Object.entries(groups).forEach(([category,items])=>{
    const section=document.createElement("section");
    section.className="catalog-category";

    const head=document.createElement("div");
    head.className="catalog-category-head";
    head.innerHTML=`<div><span>CATEGORIA</span><h3>${category}</h3></div><strong>${items.length}</strong>`;

    const body=document.createElement("div");
    body.className="catalog-category-body";

    items.forEach(p=>{
      const row=document.createElement("div");
      row.className="catalog-row";

    const main=document.createElement("div");
    main.className="catalog-main";
    const name=document.createElement("strong");
    name.textContent=p.name;
    const stock=document.createElement("span");
    stock.textContent="Estoque: "+Number(p.stock_quantity||0)+" • Mínimo: "+Number(p.min_stock||0);
    if(Number(p.stock_quantity)<=Number(p.min_stock)) stock.className="stock-low";
    main.append(name,stock);

    const price=document.createElement("div");
    price.className="catalog-meta";
    const pv=document.createElement("strong");
    pv.textContent=money(p.price);
    const pl=document.createElement("small");
    pl.textContent="VENDA";
    price.append(pv,pl);

    const status=document.createElement("div");
    status.className="catalog-meta";
    const st=document.createElement("strong");
    const currentStock=Number(p.stock_quantity||0);
    const minStock=Number(p.min_stock||0);
    st.textContent=!p.active
      ?"INATIVO"
      :currentStock<=0
        ?"SEM ESTOQUE"
        :currentStock<=minStock
          ?"ESTOQUE BAIXO"
          :"OK";
    st.className=currentStock<=minStock?"stock-low":"";
    const sl=document.createElement("small");
    sl.textContent="STATUS";
    status.append(st,sl);

    const actions=document.createElement("div");
    actions.className="catalog-actions";
    if(canAdmin()){
      const edit=document.createElement("button");
      edit.textContent="EDITAR";
      edit.addEventListener("click",()=>openProduct(p.id));

      const stockBtn=document.createElement("button");
      stockBtn.textContent="ESTOQUE";
      stockBtn.addEventListener("click",()=>{
        openProduct(p.id);
        setTimeout(()=>{
          $("stockAdjustmentQty")?.focus();
          $("stockAdjustmentArea")?.scrollIntoView({behavior:"smooth",block:"nearest"});
        },60);
      });

      const toggle=document.createElement("button");
      toggle.textContent=p.active?"DESATIVAR":"ATIVAR";
      toggle.className="active-toggle"+(p.active?"":" off");
      toggle.addEventListener("click",()=>toggleProduct(p));
      actions.append(edit,stockBtn,toggle);
    }

      row.append(main,price,status,actions);
      body.appendChild(row);
    });

    section.append(head,body);
    list.appendChild(section);
  });
}

async function toggleProduct(product){
  await supabase.from("products").update({active:!product.active}).eq("id",product.id);
  await loadProducts();
}

function openProduct(id=null){
  const p=products.find(x=>x.id===id);
  $("productAdminForm").reset();
  $("productAdminId").value=p?.id||"";
  $("productAdminTitle").textContent=p?"Editar produto":"Novo produto";
  $("productAdminName").value=p?.name||"";
  $("productAdminCategory").value=p?.category||"Geral";
  $("productAdminPrice").value=p?.price??"";
  $("productAdminCost").value=p?.cost_price??"";
  $("productAdminMinStock").value=p?.min_stock??0;
  $("productAdminDepartment").value=p?.department||productDepartment||"barbershop";
  $("productAdminKind").value=p?.product_kind||"retail";
  $("productAdminSort").value=p?.sort_order??0;
  $("productAdminStock").value=p?.stock_quantity??0;
  $("productAdminActive").checked=p?.active??true;
  $("stockAdjustmentArea").classList.toggle("hidden",!p);
  $("productAdminMessage").textContent="";
  $("productAdminModal").classList.remove("hidden");
}

function closeProduct(){ $("productAdminModal").classList.add("hidden") }

async function saveProduct(e){
  e.preventDefault();
  if(!canAdmin()) return;
  const id=$("productAdminId").value;
  const payload={
    name:$("productAdminName").value.trim(),
    category:$("productAdminCategory").value.trim()||"Geral",
    price:Number($("productAdminPrice").value||0),
    cost_price:$("productAdminCost").value===""?null:Number($("productAdminCost").value),
    min_stock:Number($("productAdminMinStock").value||0),
    department:$("productAdminDepartment").value,
    product_kind:$("productAdminKind").value,
    sort_order:Number($("productAdminSort").value||0),
    active:$("productAdminActive").checked
  };
  const result=id
    ? await supabase.from("products").update(payload).eq("id",id)
    : await supabase.from("products").insert({...payload,stock_quantity:0});
  if(result.error){
    $("productAdminMessage").textContent="Não foi possível salvar o produto.";
    return;
  }
  closeProduct();
  await loadProducts();
}

async function adjustStock(){
  if(!canAdmin()) return;
  const id=Number($("productAdminId").value);
  const qty=Number($("stockAdjustmentQty").value||0);
  if(!id||qty<=0){
    $("productAdminMessage").textContent="Informe uma quantidade válida.";
    return;
  }
  const type=$("stockAdjustmentType").value;
  const {error}=await supabase.from("inventory_movements").insert({
    product_id:id,
    movement_type:type,
    direction:type==="adjustment_in"?"in":"out",
    quantity:qty,
    notes:$("stockAdjustmentNotes").value.trim()||null,
    created_by:currentUser
  });
  if(error){
    $("productAdminMessage").textContent="Não foi possível ajustar o estoque.";
    return;
  }
  await loadProducts();
  const fresh=products.find(p=>p.id===id);
  $("productAdminStock").value=fresh?.stock_quantity??0;
  $("stockAdjustmentQty").value="";
  $("stockAdjustmentNotes").value="";
  $("productAdminMessage").textContent="Estoque atualizado.";
}

async function init(){
  if(!await loadContext()) return;

  $("newServiceBtn")?.classList.toggle("hidden",!canAdmin());
  $("newProductBtn")?.classList.toggle("hidden",!canAdmin());

  document.querySelectorAll('.nav-item[data-section="servicos"]').forEach(btn=>btn.addEventListener("click",loadServices));
  document.querySelectorAll('.nav-item[data-section="produtos"]').forEach(btn=>btn.addEventListener("click",async()=>{
    await loadProducts();
    await loadInventoryHistory();
  }));

  $("newServiceBtn")?.addEventListener("click",()=>openService());
  $("serviceAdminForm")?.addEventListener("submit",saveService);
  document.querySelectorAll("[data-close-service-admin]").forEach(el=>el.addEventListener("click",closeService));

  $("newProductBtn")?.addEventListener("click",()=>openProduct());
  document.querySelectorAll("[data-product-department]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      productDepartment=btn.dataset.productDepartment||"barbershop";
      document.querySelectorAll("[data-product-department]").forEach(el=>{
        el.classList.toggle("active",el===btn);
      });
      renderProducts();
    });
  });
  $("productAdminForm")?.addEventListener("submit",saveProduct);
  $("applyStockAdjustmentBtn")?.addEventListener("click",adjustStock);
  $("refreshInventoryHistoryBtn")?.addEventListener("click",loadInventoryHistory);
  document.querySelectorAll("[data-close-product-admin]").forEach(el=>el.addEventListener("click",closeProduct));
}

init();


async function loadInventoryHistory(){
  const target=$("inventoryHistoryList");
  if(!target) return;

  const {data,error}=await supabase
    .from("inventory_movements")
    .select("id,movement_type,direction,quantity,notes,created_at,product:products(name)")
    .order("created_at",{ascending:false})
    .limit(40);

  if(error){
    target.innerHTML='<div class="agenda-empty">Não foi possível carregar o histórico.</div>';
    return;
  }

  const labels={
    sale:"Venda",
    purchase:"Compra",
    adjustment_in:"Entrada manual",
    adjustment_out:"Saída manual",
    return:"Devolução"
  };

  if(!data?.length){
    target.innerHTML='<div class="agenda-empty">Nenhuma movimentação de estoque registrada.</div>';
    return;
  }

  target.innerHTML=data.map(item=>{
    const when=new Date(item.created_at).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
    const sign=item.direction==="out"?"-":"+";
    return `
      <div class="finance-row">
        <div>
          <strong>${item.product?.name||"Produto"}</strong>
          <span>${labels[item.movement_type]||item.movement_type} • ${when}${item.notes?" • "+item.notes:""}</span>
        </div>
        <div class="finance-value">${sign}${Number(item.quantity||0).toLocaleString("pt-BR")}</div>
      </div>
    `;
  }).join("");
}

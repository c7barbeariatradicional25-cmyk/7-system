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
let customPermissions=null;
const catalogueReceptionDefaults=new Set(["products.view","products.manage","stock.manage","services.manage"]);
let productAuditEntries=[];

async function loadContext(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return false;
  currentUser=session.user.id;
  const {data}=await supabase.from("profiles").select("role").eq("user_id",currentUser).single();
  currentRole=data?.role||null;
  const {data:grant}=await supabase.from("staff_permissions").select("permissions").eq("email",session.user.email.toLowerCase()).maybeSingle();
  customPermissions=grant?.permissions||null;
  return true;
}

function canAdmin(){return currentRole==="admin"}
function can(permission){return canAdmin() || (customPermissions?Boolean(customPermissions[permission]):currentRole==="reception"&&catalogueReceptionDefaults.has(permission))}
function canServices(){return can("services.manage")}
function canProducts(){return can("products.manage")}
function canStock(){return can("stock.manage")}

async function loadServices(){
  const {data,error}=await supabase.from("services").select("*").order("sort_order").order("name");
  if(error) return;
  services=data||[];
  renderServices();
}

function durationToMinutes(value){
  const text=String(value||"").trim();
  if(/^\d+$/.test(text)) return Number(text);
  const hhmm=text.match(/^(\d{1,2}):(\d{2})/);
  if(hhmm) return Number(hhmm[1])*60+Number(hhmm[2]);
  const h=text.match(/(\d+)\s*h\s*(\d+)?/i),m=text.match(/(\d+)\s*min/i);
  return (h?Number(h[1])*60+Number(h[2]||0):0)+(!h&&m?Number(m[1]):0)||null;
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
    const headerText=document.createElement("div");
    const eyebrow=document.createElement("span");eyebrow.textContent="CATEGORIA";
    const categoryTitle=document.createElement("h3");categoryTitle.textContent=category;
    headerText.append(eyebrow,categoryTitle);
    const count=document.createElement("strong");count.textContent=String(items.length);
    head.append(headerText,count);

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
    // A categoria já está no cabeçalho do grupo; aqui só a duração.
    const minutes=durationToMinutes(s.duration);
    meta.textContent=minutes?`${minutes} min`:(s.duration||"Sem duração");
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
    const st=document.createElement("span");
    st.className="c7-status";
    st.dataset.status=s.active?"completed":"cancelled";
    st.textContent=s.active?"No link público":"Oculto";
    status.append(st);

    const actions=document.createElement("div");
    actions.className="catalog-actions";

    if(canServices()){
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
  if(!canServices())return;
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
  if(!canServices()) return;
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
  const available=products.filter(p=>!p.deleted_at);
  const active=available.filter(p=>p.active);
  const low=available.filter(p=>p.active && Number(p.stock_quantity)<=Number(p.min_stock));
  $("adminProductActiveCount").textContent=active.length;
  $("adminProductLowStockCount").textContent=low.length;
  $("adminProductStockTotal").textContent=available.reduce((sum,p)=>sum+Number(p.stock_quantity||0),0);

  list.replaceChildren();

  if(!products.some(p=>productDepartment==="deleted"?Boolean(p.deleted_at):!p.deleted_at&&(p.department||"barbershop")===productDepartment)){
    const empty=document.createElement("div");
    empty.className="agenda-empty";
    empty.textContent=productDepartment==="deleted"?"Nenhum produto excluído.":"Nenhum produto nesta categoria.";
    list.appendChild(empty);
    return;
  }

  const visibleProducts=products.filter(p=>productDepartment==="deleted"?Boolean(p.deleted_at):!p.deleted_at&&(p.department||"barbershop")===productDepartment);
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
    stock.textContent="Estoque: "+Number(p.stock_quantity||0)+" • Mínimo: "+Number(p.min_stock||0)+
      ("commission_percent" in p?(Number(p.commission_percent||0)>0?" • Comissão "+Number(p.commission_percent).toLocaleString("pt-BR")+"%":" • Sem comissão"):"");
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
    const st=document.createElement("span");
    const currentStock=Number(p.stock_quantity||0);
    const minStock=Number(p.min_stock||0);
    st.textContent=p.deleted_at?"Excluído":!p.active
      ?"Inativo"
      :currentStock<=0
        ?"Sem estoque"
        :currentStock<=minStock
          ?"Estoque baixo"
          :"Em estoque";
    st.className="c7-status";
    st.dataset.status=p.deleted_at||!p.active?"cancelled":currentStock<=0?"no_show":currentStock<=minStock?"waiting":"completed";
    status.append(st);

    const actions=document.createElement("div");
    actions.className="catalog-actions";
    if(canAdmin() && p.deleted_at){
      const restore=document.createElement("button");
      restore.type="button";restore.textContent="RESTAURAR";
      restore.addEventListener("click",()=>restoreProduct(p));
      actions.appendChild(restore);
    }else if(!p.deleted_at){
      if(canProducts()){
        const edit=document.createElement("button");
        edit.textContent="EDITAR";edit.addEventListener("click",()=>openProduct(p.id));
        const toggle=document.createElement("button");
        toggle.textContent=p.active?"DESATIVAR":"ATIVAR";
        toggle.className="active-toggle"+(p.active?"":" off");
        toggle.addEventListener("click",()=>toggleProduct(p));
        actions.append(edit,toggle);
      }
      if(canStock()){
        const stockBtn=document.createElement("button");
        stockBtn.textContent="ESTOQUE";
        stockBtn.addEventListener("click",()=>{
          openProduct(p.id);
          setTimeout(()=>{
            $("stockAdjustmentQty")?.focus();
            $("stockAdjustmentArea")?.scrollIntoView({behavior:"smooth",block:"nearest"});
          },60);
        });
        actions.appendChild(stockBtn);
      }
      if(canAdmin()){
        const remove=document.createElement("button");
        remove.type="button";remove.textContent="EXCLUIR";
        remove.className="c7-delete-product";
        remove.addEventListener("click",()=>archiveProduct(p));
        actions.appendChild(remove);
      }
    }
      row.append(main,price,status,actions);
      body.appendChild(row);
    });

    section.append(head,body);
    list.appendChild(section);
  });
}

async function toggleProduct(product){
  if(!canProducts())return;
  const {error}=await supabase.from("products").update({active:!product.active}).eq("id",product.id).is("deleted_at",null);
  if(error){window.C7UX?.notify("Não foi possível atualizar o produto.","error");return;}
  await loadProducts();
}
async function archiveProduct(product){
  if(!canAdmin())return;
  if(!window.confirm('Excluir "'+product.name+'"?\n\nO produto será removido do catálogo, mas o histórico de vendas e estoque será preservado. Você poderá restaurá-lo na aba Excluídos.'))return;
  const {data,error}=await supabase.rpc("c7_archive_product",{p_product_id:product.id,p_restore:false});
  if(error||data!==true){window.C7UX?.notify("Não foi possível excluir o produto.","error");return;}
  await loadProducts();
  await loadProductAudit();
}
async function restoreProduct(product){
  if(!canAdmin())return;
  const {data,error}=await supabase.rpc("c7_archive_product",{p_product_id:product.id,p_restore:true});
  if(error||data!==true){window.C7UX?.notify("Não foi possível restaurar o produto.","error");return;}
  await loadProducts();
  await loadProductAudit();
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
  // Comissão por produto só aparece depois que o SQL de comissões foi aplicado.
  const hasCommission=products.some(x=>"commission_percent" in x);
  $("productAdminCommissionField").classList.toggle("hidden",!hasCommission);
  $("productAdminCommission").value=p?.commission_percent??"";
  $("stockAdjustmentArea").classList.toggle("hidden",!p||!canStock());
  $("productAdminMessage").textContent="";
  $("productAdminForm").querySelectorAll("input:not([readonly]),select").forEach(el=>{if(!el.closest("#stockAdjustmentArea"))el.disabled=!canProducts();});
  $("productAdminForm").querySelector("button[type=submit]")?.classList.toggle("hidden",!canProducts());
  $("productAdminModal").classList.remove("hidden");
}

function closeProduct(){ $("productAdminModal").classList.add("hidden") }

async function saveProduct(e){
  e.preventDefault();
  if(!canProducts()) return;
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
    active:$("productAdminActive").checked,
    ...(!$("productAdminCommissionField").classList.contains("hidden")?{
      commission_percent:$("productAdminCommission").value===""?null:Math.min(100,Math.max(0,Number($("productAdminCommission").value)))
    }:{})
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
  await loadProductAudit();
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
  await loadInventoryHistory();
  await loadProductAudit();
}

async function init(){
  if(!await loadContext()) return;

  $("newServiceBtn")?.classList.toggle("hidden",!canServices());
  $("newProductBtn")?.classList.toggle("hidden",!canProducts());

  document.querySelectorAll('.nav-item[data-section="servicos"]').forEach(btn=>btn.addEventListener("click",loadServices));
  document.querySelectorAll('.nav-item[data-section="produtos"]').forEach(btn=>btn.addEventListener("click",async()=>{
    await loadProducts();
    await loadInventoryHistory();
  }));
  document.querySelectorAll('.nav-item[data-section="historico-produtos"]').forEach(btn=>btn.addEventListener("click",loadProductAudit));

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
  $("refreshProductAuditBtn")?.addEventListener("click",loadProductAudit);
  $("productAuditDepartment")?.addEventListener("change",renderProductAudit);
  $("productAuditAction")?.addEventListener("change",renderProductAudit);
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

/* Audit trail is read-only. Every record is written on the server by a database trigger. */
const c7AuditLabels={
 created:"CADASTRO",updated:"EDIÇÃO",stock:"ESTOQUE",
 activated:"ATIVAÇÃO",deactivated:"DESATIVAÇÃO",
 deleted:"EXCLUSÃO",restored:"RESTAURAÇÃO"
};
const c7FieldLabels={
 name:"Nome",category:"Categoria",department:"Área",product_kind:"Tipo",
 price:"Preço de venda",cost_price:"Custo",stock_quantity:"Quantidade em estoque",
 min_stock:"Estoque mínimo",active:"Ativo",sort_order:"Ordem",deleted_at:"Exclusão"
};
function c7AuditValue(value,key){
 if(value===null||value===undefined)return "—";
 if(typeof value==="boolean")return value?"Sim":"Não";
 if(key==="department")return value==="convenience"?"Bebidas & consumíveis":"Produtos de barbearia";
 if(["price","cost_price"].includes(key))return money(value);
 if(key==="deleted_at")return value?"Registrada":"Sem exclusão";
 return String(value);
}
async function loadProductAudit(){
 const target=$("productAuditList");
 if(!target||!canAdmin())return;
 target.textContent="Carregando histórico...";
 const {data,error}=await supabase.from("product_change_history")
   .select("id,product_id,product_name,department,action,changes,actor_name,occurred_at")
   .order("occurred_at",{ascending:false}).limit(200);
 if(error){
   target.textContent="Não foi possível carregar o histórico. Confira o acesso administrativo.";
   return;
 }
 productAuditEntries=data||[];
 renderProductAudit();
}
function renderProductAudit(){
 const target=$("productAuditList");
 if(!target)return;
 const dep=$("productAuditDepartment")?.value||"all";
 const action=$("productAuditAction")?.value||"all";
 const rows=productAuditEntries.filter(x=>(dep==="all"||x.department===dep)&&(action==="all"||x.action===action));
 target.replaceChildren();
 if(!rows.length){
   const empty=document.createElement("div");empty.className="agenda-empty";
   empty.textContent="Nenhuma alteração encontrada para este filtro.";
   target.appendChild(empty);return;
 }
 for(const item of rows){
   const row=document.createElement("article");row.className="c7-audit-row";
   const summary=document.createElement("div");summary.className="c7-audit-main";
   const title=document.createElement("strong");title.textContent=item.product_name||"Produto";
   const stamp=document.createElement("span");
   const when=new Date(item.occurred_at).toLocaleString("pt-BR",{
     timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",year:"numeric",
     hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false
   });
   stamp.textContent=when+" • "+(item.actor_name||"Sistema / automação");
   summary.append(title,stamp);
   const actionBadge=document.createElement("span");
   actionBadge.className="c7-audit-badge c7-audit-"+item.action;
   actionBadge.textContent=c7AuditLabels[item.action]||item.action;
   row.append(summary,actionBadge);
   const entries=Object.entries(item.changes||{}).filter(([key])=>Boolean(c7FieldLabels[key]));
   if(entries.length){
     const detail=document.createElement("details");detail.className="c7-audit-details";
     const open=document.createElement("summary");open.textContent="Ver o que foi alterado";
     detail.appendChild(open);
     const changes=document.createElement("div");changes.className="c7-audit-changes";
     for(const [key,values] of entries){
       const line=document.createElement("div");
       const field=document.createElement("strong");field.textContent=c7FieldLabels[key]+": ";
       const description=document.createElement("span");
       description.textContent=c7AuditValue(values?.before,key)+" → "+c7AuditValue(values?.after,key);
       line.append(field,description);changes.appendChild(line);
     }
     detail.appendChild(changes);row.appendChild(detail);
   }
   target.appendChild(row);
 }
}

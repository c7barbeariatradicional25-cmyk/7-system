import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase=createClient(
  "https://cjtgjqxkyvgjlhylrvas.supabase.co",
  "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE"
);

const $=id=>document.getElementById(id);
const money=v=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(v||0));

let role=null;

const typeLabels={
  purchase:"Compra",
  expense:"Despesa",
  payment:"Pagamento",
  supplier:"Fornecedor",
  other:"Outro"
};

const methodLabels={
  cash:"Dinheiro",
  pix:"Pix",
  credit:"Crédito",
  debit:"Débito",
  other:"Outro"
};

function monthBounds(){
  const now=new Date();
  return {
    start:new Date(now.getFullYear(),now.getMonth(),1,0,0,0,0),
    end:new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59,999)
  };
}

function closeModal(){
  $("financialExpenseModal")?.classList.add("hidden");
}

async function loadExpenses(){
  if(!["admin","reception"].includes(role)) return;

  const {data,error}=await supabase
    .from("financial_expenses")
    .select("id,expense_type,category,description,supplier_name,amount,payment_method,paid_at,notes")
    .order("paid_at",{ascending:false})
    .limit(120);

  const list=$("financialExpenseList");
  if(!list) return;

  if(error){
    list.innerHTML='<div class="agenda-empty">Não foi possível carregar as saídas.</div>';
    return;
  }

  const rows=data||[];
  const {start,end}=monthBounds();
  const monthRows=rows.filter(x=>{
    const d=new Date(x.paid_at);
    return d>=start&&d<=end;
  });

  const total=monthRows.reduce((s,x)=>s+Number(x.amount||0),0);
  const purchases=monthRows.filter(x=>x.expense_type==="purchase").reduce((s,x)=>s+Number(x.amount||0),0);
  const payments=monthRows.filter(x=>x.expense_type==="payment").reduce((s,x)=>s+Number(x.amount||0),0);
  const other=total-purchases-payments;

  $("financeMonthOut").textContent=money(total);
  $("financeMonthPurchases").textContent=money(purchases);
  $("financeMonthPayments").textContent=money(payments);
  $("financeMonthOther").textContent=money(other);

  if(!rows.length){
    list.innerHTML='<div class="agenda-empty">Nenhuma saída registrada.</div>';
    return;
  }

  list.innerHTML=rows.map(item=>`
    <div class="finance-row">
      <div>
        <strong>${item.description}</strong>
        <span>
          ${typeLabels[item.expense_type]||item.expense_type}
          ${item.category?` • ${item.category}`:""}
          ${item.supplier_name?` • ${item.supplier_name}`:""}
          • ${methodLabels[item.payment_method]||item.payment_method}
          • ${new Date(item.paid_at).toLocaleDateString("pt-BR")}
        </span>
      </div>
      <div class="finance-value out">${money(item.amount)}</div>
    </div>
  `).join("");
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

  document.querySelectorAll('.nav-item[data-section="financeiro"]').forEach(btn=>{
    btn.addEventListener("click",loadExpenses);
  });

  $("refreshFinancialExpensesBtn")?.addEventListener("click",loadExpenses);

  $("newFinancialExpenseBtn")?.addEventListener("click",()=>{
    $("financialExpenseForm").reset();
    $("financialExpenseType").value="purchase";
    $("financialExpenseMethod").value="pix";
    $("financialExpenseMessage").textContent="";
    $("financialExpenseModal").classList.remove("hidden");
  });

  document.querySelectorAll("[data-close-financial-expense]").forEach(el=>{
    el.addEventListener("click",closeModal);
  });

  $("financialExpenseForm")?.addEventListener("submit",async e=>{
    e.preventDefault();

    $("financialExpenseMessage").textContent="Registrando saída...";

    const {error}=await supabase.rpc("record_financial_expense",{
      p_expense_type:$("financialExpenseType").value,
      p_category:$("financialExpenseCategory").value.trim(),
      p_description:$("financialExpenseDescription").value.trim(),
      p_supplier_name:$("financialExpenseSupplier").value.trim(),
      p_amount:Number($("financialExpenseAmount").value||0),
      p_payment_method:$("financialExpenseMethod").value,
      p_notes:$("financialExpenseNotes").value.trim()||null
    });

    if(error){
      const message=String(error.message||"");
      $("financialExpenseMessage").textContent=message.includes("Caixa fechado")
        ?"Abra o Caixa antes de registrar uma saída."
        :"Não foi possível registrar a saída.";
      return;
    }

    closeModal();
    await loadExpenses();
    window.dispatchEvent(new Event("c7-financial-expense-updated"));
  });
}

init();

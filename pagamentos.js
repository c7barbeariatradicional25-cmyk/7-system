/* Formas de pagamento do C7, incluindo recebimentos com pagamento dividido. */
export const PAYMENT_LABELS={cash:"Dinheiro",pix:"Pix",credit:"Crédito",debit:"Débito",other:"Outro"};
export const CARD_METHODS=["credit","debit"];

export function paymentLabel(method){
  return PAYMENT_LABELS[method]||method||"Sem forma de pagamento";
}

/* Busca as partes de cada movimentação dividida. Sem a tabela (SQL ainda não aplicado), segue sem divisão. */
export async function fetchPaymentSplits(db,transactionIds){
  const splits=new Map();
  const ids=[...new Set((transactionIds||[]).filter(Boolean))];
  for(let i=0;i<ids.length;i+=200){
    const {data,error}=await db.from("cash_transaction_payments")
      .select("transaction_id,payment_method,amount,card_fee_percent,card_fee_amount")
      .in("transaction_id",ids.slice(i,i+200))
      .order("amount",{ascending:false});
    if(error){console.warn("C7: divisão de pagamentos indisponível",error.message);return splits;}
    for(const row of data||[]){
      const key=String(row.transaction_id);
      if(!splits.has(key))splits.set(key,[]);
      splits.get(key).push(row);
    }
  }
  return splits;
}

/* Valor líquido por forma de pagamento de uma movimentação: [{method,amount}]. */
export function paymentParts(transaction,splits){
  const parts=splits?.get(String(transaction.id));
  if(!parts?.length)return [{method:transaction.payment_method||"other",amount:Number(transaction.net_amount||0)}];
  return parts.map(p=>({method:p.payment_method,amount:Number(p.amount||0)-Number(p.card_fee_amount||0)}));
}

export function describePayment(transaction,splits,money){
  const parts=splits?.get(String(transaction.id));
  if(!parts?.length)return paymentLabel(transaction.payment_method);
  return parts.map(p=>paymentLabel(p.payment_method)+" "+money(p.amount)).join(" + ");
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  "https://cjtgjqxkyvgjlhylrvas.supabase.co",
  "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE"
);

const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(value||0));

let currentUser = null;
let currentRole = null;
let openSession = null;
let pendingAppointments = [];
let products = [];

async function loadContext(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return false;
  currentUser=session.user.id;
  const {data}=await supabase.from("profiles").select("role").eq("user_id",currentUser).single();
  currentRole=data?.role||null;
  return true;
}

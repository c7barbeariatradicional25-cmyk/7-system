import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  "https://cjtgjqxkyvgjlhylrvas.supabase.co",
  "sb_publishable_q7Qoya_KF0yyjvVdC-ckBQ_Wv6VXaEE"
);

const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(value||0));

let customers = [];
let professionals = [];
let currentRole = null;
let currentUser = null;

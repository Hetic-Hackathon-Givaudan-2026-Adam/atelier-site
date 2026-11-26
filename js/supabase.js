const SUPABASE_URL = "https://msnfmqyuwpalkglhhjqe.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_1dyuMwjewWo-5RBIWpOGaA_Z783Wq11";

const supabaseClient = window.supabase?.createClient(
  window.AtelierRuntime?.supabaseUrl || SUPABASE_URL,
  window.AtelierRuntime?.supabaseKey || SUPABASE_ANON_KEY,
) || null;

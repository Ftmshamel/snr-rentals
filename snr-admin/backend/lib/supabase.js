const { createClient } = require("@supabase/supabase-js");

let _client = null;

function getSupabaseClient() {
  if (!_client) {
    const url = (process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
    const key = (process.env.SUPABASE_SERVICE_KEY || "").trim();
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
    _client = createClient(url, key);
  }
  return _client;
}

module.exports = { getSupabaseClient };

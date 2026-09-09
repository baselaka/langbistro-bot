import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env";

// service_role bypasses RLS. This client is for the trusted Railway bot process only —
// never construct it in browser-facing or untrusted code.
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

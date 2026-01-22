import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const buildClient = () => createClient(supabaseUrl as string, supabaseServiceKey as string, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export const supabaseAdmin = (() => {
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Proxy(
      {},
      {
        get() {
          throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
        },
      }
    ) as ReturnType<typeof buildClient>;
  }
  return buildClient();
})();

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSupabaseUrl, getSupabaseServiceRoleKey } from "../utils/env.ts";

export const supabase = createClient(
  getSupabaseUrl(),
  getSupabaseServiceRoleKey()
);

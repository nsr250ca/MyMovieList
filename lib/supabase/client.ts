"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { assertSupabaseEnv } from "@/lib/env";

export function createClient() {
  const { supabaseUrl, supabasePublishableKey } = assertSupabaseEnv();

  return createBrowserClient<Database>(supabaseUrl, supabasePublishableKey);
}

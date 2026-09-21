export function getPublicEnv() {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  };
}

export function assertSupabaseEnv() {
  const { supabaseUrl, supabasePublishableKey } = getPublicEnv();

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return { supabaseUrl, supabasePublishableKey };
}

export function getTmdbToken() {
  return process.env.TMDB_ACCESS_TOKEN;
}

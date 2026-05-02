export function getSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Supabase environment variables are not configured.");
  }

  if (!supabaseUrl.startsWith("https://")) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a full https URL.");
  }

  return { supabaseUrl, supabasePublishableKey };
}

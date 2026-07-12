import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://dmhslijauxbckmvlpdoh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtaHNsaWphdXhiY2ttdmxwZG9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3ODk3ODQsImV4cCI6MjA5OTM2NTc4NH0.8a-X-xjnhfW4KstmhwtauYm6rot3iy2tWJ40N-35WoM";

export const flSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
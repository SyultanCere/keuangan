/* =========================================================
   KONFIGURASI SUPABASE
   Ganti dua nilai di bawah dengan milik project Supabase-mu.
   Ambil dari: Supabase Dashboard > Project Settings > API
   ========================================================= */

const SUPABASE_URL = "https://ervhnsxetpmptdrrkqkj.supabase.co"; // <-- ganti
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVydmhuc3hldHBtcHRkcnJrcWtqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NzQ2NjAsImV4cCI6MjEwMDQ1MDY2MH0.oTGIEtI5MIjQCdrriW0tnisvA7n8ou8ZS-3OQEaE74w"; // <-- ganti

// Klien Supabase yang dipakai bersama oleh auth.js dan dashboard.js
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

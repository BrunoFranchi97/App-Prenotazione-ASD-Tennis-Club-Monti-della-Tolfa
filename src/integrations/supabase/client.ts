import { createClient } from '@supabase/supabase-js';

// Configurazione per diversi ambienti
const getSupabaseConfig = () => {
  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

  // URL e chiave di fallback (il tuo progetto Supabase)
  const defaultUrl = 'https://nrnyfuqyeqcegnpoetrd.supabase.co';
  const defaultKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ybnlmdXF5ZXFjZWducG9ldHJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzOTYzNDksImV4cCI6MjA4Mzk3MjM0OX0.uzA7TFROakNAPT8cwzmK59aR6UspK9Z_3aHmK-XWlMg';

  let supabaseUrl = defaultUrl;
  let supabaseAnonKey = defaultKey;
  let appDomain = import.meta.env.VITE_APP_DOMAIN;

  // Se abbiamo variabili d'ambiente, usale
  if (import.meta.env.VITE_SUPABASE_URL) {
    supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  }
  
  if (import.meta.env.VITE_SUPABASE_ANON_KEY) {
    supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  }

  // Determina l'URL di reindirizzamento per l'autenticazione
  let redirectToUrl = '';
  if (isLocalhost) {
    // In locale, usiamo l'origine locale
    redirectToUrl = `${window.location.origin}/dashboard`;
  } else if (appDomain) {
    // In produzione, usiamo il dominio Vercel configurato
    redirectToUrl = `${appDomain}/dashboard`;
  } else {
    // Fallback: usa l'origine corrente (dovrebbe essere il dominio Vercel)
    redirectToUrl = `${window.location.origin}/dashboard`;
  }

  console.log('Supabase Config:', {
    environment: isLocalhost ? 'localhost' : 'production',
    redirectTo: redirectToUrl,
  });

  return { supabaseUrl, supabaseAnonKey, redirectToUrl };
};

const { supabaseUrl, supabaseAnonKey, redirectToUrl } = getSupabaseConfig();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    // Configura il redirectTo in base all'ambiente corrente
    redirectTo: redirectToUrl
  }
});
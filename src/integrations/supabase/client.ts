import { createClient } from '@supabase/supabase-js';
import { getAuthRedirectTo } from '@/utils/authRedirect';

// Configurazione per diversi ambienti
const getSupabaseConfig = () => {
  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '192.168.1.3';

  // URL e chiave di fallback (il tuo progetto Supabase)
  const defaultUrl = 'https://nrnyfuqyeqcegnpoetrd.supabase.co';
  const defaultKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ybnlmdXF5ZXFjZWducG9ldHJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzOTYzNDksImV4cCI6MjA4Mzk3MjM0OX0.uzA7TFROakNAPT8cwzmK59aR6UspK9Z_3aHmK-XWlMg';

  let supabaseUrl = defaultUrl;
  let supabaseAnonKey = defaultKey;

  // Se abbiamo variabili d'ambiente, usale
  if (import.meta.env.VITE_SUPABASE_URL) {
    supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  }
  
  if (import.meta.env.VITE_SUPABASE_ANON_KEY) {
    supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  }

  // Determina l'URL di reindirizzamento per l'autenticazione dinamicamente
  const redirectToUrl = getAuthRedirectTo();

  console.log('Supabase Config:', {
    environment: isLocalhost ? 'localhost' : 'production',
    hostname: hostname,
    redirectTo: redirectToUrl,
    baseUrl: window.location.origin,
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
    // Configura il redirectTo dinamicamente in base all'ambiente
    redirectTo: redirectToUrl,
    // Abilita l'uso di URL diversi per sviluppo/produzione
    multiTab: false,
  },
  // Aggiungi altre configurazioni se necessario
  global: {
    headers: {
      'x-application-name': 'tennis-club-booking'
    }
  }
});

// Helper per debug
export const debugAuthConfig = () => {
  console.log('Current Supabase Auth Configuration:');
  console.log('- URL:', supabaseUrl);
  console.log('- Redirect URL:', redirectToUrl);
  console.log('- Current Origin:', window.location.origin);
  console.log('- Hostname:', window.location.hostname);
  console.log('- Full URL:', window.location.href);
};
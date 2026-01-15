/**
 * Utility per ottenere gli URL di autenticazione in base all'ambiente
 * Risolve il problema degli email verification in produzione
 */

export const getAuthRedirectBaseUrl = (): string => {
  // Controlla se siamo in produzione (non localhost)
  const isLocalhost = 
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '192.168.1.3'; // IP locale per testing
  
  if (isLocalhost) {
    // Per sviluppo locale
    return 'http://localhost:8080';
  }
  
  // Per produzione, usa l'origine corrente (dinamica)
  return window.location.origin;
};

export const getAuthRedirectTo = (): string => {
  return `${getAuthRedirectBaseUrl()}/dashboard`;
};

export const getEmailVerificationUrl = (): string => {
  return `${getAuthRedirectBaseUrl()}/auth/verify`;
};

// Funzione per costruire URL di verifica email con token
export const buildEmailVerificationLink = (token: string, email: string): string => {
  const baseUrl = getAuthRedirectBaseUrl();
  return `${baseUrl}/dashboard?token=${token}&email=${encodeURIComponent(email)}`;
};
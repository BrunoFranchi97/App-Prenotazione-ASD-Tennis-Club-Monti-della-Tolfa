// Avviso email all'amministratore via Brevo (stesso canale e mittente di notify-admin-on-signup).
// Usato per anomalie del wallet che richiedono un intervento umano.
const SENDER_EMAIL = 'brunofranchi9@gmail.com';
const SENDER_NAME = 'ASD Tennis Club Monti della Tolfa';
const ADMIN_EMAIL = 'brunofranchi9@gmail.com';

export async function sendAdminAlert(subject: string, htmlContent: string): Promise<boolean> {
  const apiKey = Deno.env.get('BREVO_API_KEY');
  if (!apiKey) {
    console.error('[adminAlert] BREVO_API_KEY non configurata. Avviso non inviato:', subject);
    return false;
  }
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      to: [{ email: ADMIN_EMAIL, name: 'Amministratore' }],
      subject: `[Portafoglio] ${subject}`,
      htmlContent,
    }),
  });
  if (!res.ok) {
    console.error('[adminAlert] Errore Brevo:', await res.text());
    return false;
  }
  return true;
}

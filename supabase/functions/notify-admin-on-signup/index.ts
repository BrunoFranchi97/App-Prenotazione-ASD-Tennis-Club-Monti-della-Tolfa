import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SENDER_EMAIL = 'brunofranchi9@gmail.com';
const SENDER_NAME = 'ASD Tennis Club Monti della Tolfa';
const ADMIN_EMAIL = 'brunofranchi9@gmail.com';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();

    const userEmail = payload.email || 'Email Sconosciuta';
    const newUserName = payload.full_name || userEmail;

    console.log(`[notify-admin-on-signup] Nuovo socio: ${newUserName} (${userEmail})`);

    const emailSubject = `[AZIONE RICHIESTA] Nuovo Socio Registrato: ${newUserName}`;
    const emailBody = `
      <h1>Nuova Registrazione Socio</h1>
      <p>Il socio <strong>${newUserName}</strong> si è appena registrato e attende la tua approvazione per poter prenotare i campi.</p>
      <ul>
        <li><strong>Nome:</strong> ${newUserName}</li>
        <li><strong>Email:</strong> ${userEmail}</li>
        <li><strong>Livello Skill:</strong> ${newProfile.skill_level || 'Non specificato'}</li>
      </ul>
      <p>Per approvare o rifiutare, accedi al pannello di amministrazione:</p>
      <a href="https://app-prenotazione-asd-tennis-club-mo.vercel.app/admin/approvals" style="padding: 10px 20px; background-color: #2E6B3D; color: white; text-decoration: none; border-radius: 5px;">
        Vai a Gestisci Approvazioni
      </a>
    `;

    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': Deno.env.get('BREVO_API_KEY')!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: SENDER_NAME, email: SENDER_EMAIL },
        to: [{ email: ADMIN_EMAIL, name: 'Bruno Franchi' }],
        subject: emailSubject,
        htmlContent: emailBody,
      }),
    });

    if (!brevoResponse.ok) {
      const brevoError = await brevoResponse.text();
      console.error("[notify-admin-on-signup] Brevo Error:", brevoError);
      return new Response(JSON.stringify({ message: 'Profilo creato, ma notifica email fallita.', error: brevoError }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    console.log("[notify-admin-on-signup] Email di notifica inviata con successo.");
    return new Response(JSON.stringify({ message: 'Notifica admin inviata con successo.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("[notify-admin-on-signup] Errore critico:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

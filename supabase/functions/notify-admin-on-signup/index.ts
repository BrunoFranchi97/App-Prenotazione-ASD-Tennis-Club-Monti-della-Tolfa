import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { Resend } from 'https://esm.sh/resend@3.5.0'; // Using Resend for email sending

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client with Service Role Key for admin access
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Initialize Resend client using the secret API key (Must be set in Supabase Secrets: RESEND_API_KEY)
const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

// Define the sender and recipient emails
// SENDER_EMAIL must be a verified domain/email in Resend.
const SENDER_EMAIL = 'onboarding@resend.dev'; 
const ADMIN_EMAIL = 'brunofranchi9@gmail.com'; // Updated Admin Email

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Get the new user data from the request body (sent by the database trigger)
    const payload = await req.json();
    const newProfile = payload.record;
    
    if (!newProfile || !newProfile.id) {
        console.error("[notify-admin-on-signup] Invalid payload received.");
        return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400, headers: corsHeaders });
    }

    // 2. Fetch user email from auth.users (requires service role)
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(newProfile.id);
    if (userError) throw userError;
    
    const userEmail = userData.user?.email || 'Email Sconosciuta';
    const newUserName = newProfile.full_name || userEmail;
    
    console.log(`[notify-admin-on-signup] New user profile created: ${newUserName} (${userEmail})`);

    // 3. Send email notification to admin
    const emailSubject = `[AZIONE RICHIESTA] Nuovo Socio Registrato: ${newUserName}`;
    const emailBody = `
      <h1>Nuova Registrazione Socio</h1>
      <p>Il socio <strong>${newUserName}</strong> si è appena registrato e attende la tua approvazione per poter prenotare i campi.</p>
      <ul>
        <li>Nome: ${newUserName}</li>
        <li>Email: ${userEmail}</li>
        <li>Livello Skill: ${newProfile.skill_level || 'Non specificato'}</li>
      </ul>
      <p>Per approvare o rifiutare, accedi al pannello di amministrazione:</p>
      <a href="https://app-prenotazione-asd-tennis-club-mo.vercel.app/admin/approvals" style="padding: 10px 20px; background-color: #2E6B3D; color: white; text-decoration: none; border-radius: 5px;">Vai a Gestisci Approvazioni</a>
    `;

    try {
      const resendData = await resend.emails.send({
        from: SENDER_EMAIL,
        to: ADMIN_EMAIL,
        subject: emailSubject,
        html: emailBody,
      });

      console.log("[notify-admin-on-signup] Admin notification email sent successfully.", resendData);
    } catch (resendError) {
      console.error("[notify-admin-on-signup] Resend Error:", resendError);
      const errorMessage = resendError?.message || 'Unknown error while sending admin notification.';
      return new Response(JSON.stringify({ message: 'Profile created, but email notification failed.', error: errorMessage }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    return new Response(JSON.stringify({ message: 'Admin notification sent successfully.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("[notify-admin-on-signup] Critical Error processing request:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

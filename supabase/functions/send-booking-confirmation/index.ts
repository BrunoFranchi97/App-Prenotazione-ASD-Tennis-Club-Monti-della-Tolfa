import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { format, parseISO } from 'https://esm.sh/date-fns@3.6.0';
import { it } from 'https://esm.sh/date-fns@3.6.0/locale/it';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userEmail, userName, courtName, reservations, bookedForFirstName, bookedForLastName } = await req.json();

    console.log("[send-booking-confirmation] Received request to send email:", { userEmail, userName, courtName, reservations, bookedForFirstName, bookedForLastName });

    // Sort reservations to get correct start and end times
    const sortedReservations = [...reservations].sort((a: any, b: any) => parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime());
    const firstReservation = sortedReservations[0];
    const lastReservation = sortedReservations[sortedReservations.length - 1];

    const bookingDate = format(parseISO(firstReservation.starts_at), 'EEEE, dd MMMM yyyy', { locale: it });
    const bookingStartTime = format(parseISO(firstReservation.starts_at), 'HH:mm');
    const bookingEndTime = format(parseISO(lastReservation.ends_at), 'HH:mm');

    let emailSubject = 'Conferma Prenotazione Campo da Tennis';
    let emailBody = `
      <h1>Ciao ${userName},</h1>
      <p>La tua prenotazione per il campo da tennis è stata confermata!</p>
    `;

    if (bookedForFirstName && bookedForLastName) {
      emailSubject = `Conferma Prenotazione Campo per ${bookedForFirstName} ${bookedForLastName}`;
      emailBody = `
        <h1>Ciao ${userName},</h1>
        <p>Hai effettuato una prenotazione per conto di <strong>${bookedForFirstName} ${bookedForLastName}</strong>.</p>
        <p>I dettagli della prenotazione sono:</p>
      `;
    } else {
      emailBody = `
        <h1>Ciao ${userName},</h1>
        <p>La tua prenotazione per il campo da tennis è stata confermata!</p>
        <p>I dettagli della prenotazione sono:</p>
      `;
    }

    emailBody += `
      <p><strong>Campo:</strong> ${courtName}</p>
      <p><strong>Data:</strong> ${bookingDate}</p>
      <p><strong>Orario:</strong> ${bookingStartTime} - ${bookingEndTime}</p>
      <p>Grazie per aver prenotato con noi!</p>
    `;

    // --- Email Sending Logic Placeholder ---
    // In un'applicazione reale, qui integreresti un servizio di email come Resend, SendGrid, Mailgun, ecc.
    // Avresti bisogno di una chiave API per il servizio di email, che dovresti configurare come un segreto di Supabase.
    // Esempio con Resend (richiede l'installazione del client Resend e la configurazione della chiave API):
    // import { Resend } from 'https://esm.sh/resend@1.1.0';
    // const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
    // await resend.emails.send({
    //   from: 'onboarding@resend.dev',
    //   to: userEmail,
    //   subject: emailSubject,
    //   html: emailBody,
    // });
    // console.log("[send-booking-confirmation] Simulated email sent to", userEmail);

    console.log(`[send-booking-confirmation] Simulazione invio email a ${userEmail} con oggetto: "${emailSubject}" e corpo: "${emailBody}"`);

    return new Response(JSON.stringify({ message: 'Email confirmation process initiated.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error("[send-booking-confirmation] Error processing request:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
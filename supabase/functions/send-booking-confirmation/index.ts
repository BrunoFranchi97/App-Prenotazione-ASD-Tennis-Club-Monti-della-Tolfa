import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { format, parseISO } from 'https://esm.sh/date-fns@3.6.0';
import { it } from 'https://esm.sh/date-fns@3.6.0/locale/it';
import { Resend } from 'https://esm.sh/resend@3.5.0'; // Import Resend

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Resend client using the secret API key
const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
const SENDER_EMAIL = 'onboarding@resend.dev'; // Use the verified sender email

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userEmail, userName, courtName, reservations, bookedForFirstName, bookedForLastName, matchDetails } = await req.json();

    console.log("[send-booking-confirmation] Received request to send email:", { userEmail, userName, courtName, reservations, bookedForFirstName, bookedForLastName, matchDetails });

    // Sort reservations to get correct start and end times
    const sortedReservations = [...reservations].sort((a: any, b: any) => parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime());
    const firstReservation = sortedReservations[0];
    const lastReservation = sortedReservations[sortedReservations.length - 1];

    const bookingDate = format(parseISO(firstReservation.starts_at), 'EEEE, dd MMMM yyyy', { locale: it });
    const bookingStartTime = format(parseISO(firstReservation.starts_at), 'HH:mm');
    const bookingEndTime = format(parseISO(lastReservation.ends_at), 'HH:mm');

    let emailSubject = 'Conferma Prenotazione Campo da Tennis';
    let emailBody = '';

    if (matchDetails) {
      // Email per match
      emailSubject = `Conferma Partita - ${courtName}`;
      emailBody = `
        <h1>Ciao ${userName},</h1>
        <p>La tua partita è stata confermata!</p>
        <p><strong>Dettagli partita:</strong></p>
        <ul>
          <li><strong>Campo:</strong> ${courtName}</li>
          <li><strong>Data:</strong> ${bookingDate}</li>
          <li><strong>Orario:</strong> ${bookingStartTime} - ${bookingEndTime}</li>
          <li><strong>Avversario:</strong> ${matchDetails.opponentName}</li>
          <li><strong>Tipo partita:</strong> ${matchDetails.matchType === 'doppio' ? 'Doppio' : 'Singolare'}</li>
          <li><strong>Livello:</strong> ${matchDetails.skillLevel}</li>
        </ul>
        <p>Ricordati di contattare il tuo avversario via WhatsApp per confermare tutti i dettagli.</p>
        <p>Buona partita!</p>
      `;
    } else if (bookedForFirstName && bookedForLastName) {
      // Email per conto terzi
      emailSubject = `Conferma Prenotazione Campo per ${bookedForFirstName} ${bookedForLastName}`;
      emailBody = `
        <h1>Ciao ${userName},</h1>
        <p>Hai effettuato una prenotazione per conto di <strong>${bookedForFirstName} ${bookedForLastName}</strong>.</p>
        <p>I dettagli della prenotazione sono:</p>
        <ul>
          <li><strong>Campo:</strong> ${courtName}</li>
          <li><strong>Data:</strong> ${bookingDate}</li>
          <li><strong>Orario:</strong> ${bookingStartTime} - ${bookingEndTime}</li>
        </ul>
        <p>Grazie per aver prenotato con noi!</p>
      `;
    } else {
      // Email normale
      emailBody = `
        <h1>Ciao ${userName},</h1>
        <p>La tua prenotazione per il campo da tennis è stata confermata!</p>
        <p>I dettagli della prenotazione sono:</p>
        <ul>
          <li><strong>Campo:</strong> ${courtName}</li>
          <li><strong>Data:</strong> ${bookingDate}</li>
          <li><strong>Orario:</strong> ${bookingStartTime} - ${bookingEndTime}</li>
        </ul>
        <p>Grazie per aver prenotato con noi!</p>
      `;
    }

    // --- Email Sending Logic using Resend ---
    try {
      const resendData = await resend.emails.send({
        from: SENDER_EMAIL,
        to: userEmail,
        subject: emailSubject,
        html: emailBody,
      });

      console.log("[send-booking-confirmation] Confirmation email sent successfully.", resendData);
    } catch (resendError) {
      console.error("[send-booking-confirmation] Resend Error:", resendError);
      const errorMessage = resendError?.message || 'Unknown error while sending booking confirmation.';
      return new Response(JSON.stringify({ message: 'Booking confirmed, but email notification failed.', error: errorMessage }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    return new Response(JSON.stringify({ message: 'Email confirmation sent successfully.' }), {
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

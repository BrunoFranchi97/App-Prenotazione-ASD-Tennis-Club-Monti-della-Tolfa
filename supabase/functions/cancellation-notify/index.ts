import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { format } from "https://esm.sh/date-fns@3.6.0";
import { it } from "https://esm.sh/date-fns@3.6.0/locale/it";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Il payload arriva dal Supabase Database Webhook (UPDATE su reservations)
    const payload = await req.json();

    // Supabase DB Webhook payload: { type, table, record (new), old_record }
    const newRecord = payload.record;
    const oldRecord = payload.old_record;

    // Processa solo se: il nuovo stato è 'cancelled' e il vecchio non lo era
    if (newRecord?.status !== "cancelled" || oldRecord?.status === "cancelled") {
      return new Response(JSON.stringify({ skipped: true, reason: "Nessuna cancellazione rilevante" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Recupera il nome del campo
    const { data: court } = await supabase
      .from("courts")
      .select("name")
      .eq("id", newRecord.court_id)
      .single();

    const courtName = court?.name || `Campo ${newRecord.court_id}`;
    const startTime = format(new Date(newRecord.starts_at), "HH:mm");
    const endTime = format(new Date(newRecord.ends_at), "HH:mm");
    const dayLabel = format(new Date(newRecord.starts_at), "EEEE d MMMM", { locale: it });
    const dayLabelCap = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);

    const message =
      `🎾 *ASD Tennis Club Monti della Tolfa*\n\n` +
      `🔔 *Slot liberato!*\n\n` +
      `📅 ${dayLabelCap}\n` +
      `🏟️ ${courtName}\n` +
      `⏰ ${startTime}–${endTime}\n\n` +
      `_Questo orario è ora disponibile per la prenotazione._`;

    // Invia via Green API
    const greenApiInstance = Deno.env.get("GREEN_API_INSTANCE_ID");
    const greenApiToken = Deno.env.get("GREEN_API_TOKEN");
    const greenApiGroupId = Deno.env.get("GREEN_API_GROUP_CHAT_ID");

    if (!greenApiInstance || !greenApiToken || !greenApiGroupId) {
      console.log("[cancellation-notify] Green API non configurata.");
      return new Response(JSON.stringify({ message, sent: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const greenApiUrl = `https://api.green-api.com/waInstance${greenApiInstance}/sendMessage/${greenApiToken}`;
    const sendRes = await fetch(greenApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: greenApiGroupId,
        message,
      }),
    });

    if (!sendRes.ok) {
      const errText = await sendRes.text();
      console.error("[cancellation-notify] Green API error:", errText);
      return new Response(JSON.stringify({ message, sent: false, error: errText }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    console.log("[cancellation-notify] Notifica disdetta inviata.");
    return new Response(JSON.stringify({ message, sent: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("[cancellation-notify] Errore:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

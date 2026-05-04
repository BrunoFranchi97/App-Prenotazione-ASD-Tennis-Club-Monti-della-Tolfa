import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { format, addDays, startOfDay, endOfDay } from "https://esm.sh/date-fns@3.6.0";
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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Calcola la data di domani
    const tomorrow = addDays(new Date(), 1);
    const dayStart = startOfDay(tomorrow).toISOString();
    const dayEnd = endOfDay(tomorrow).toISOString();

    // Carica prenotazioni di domani (non cancellate)
    const { data: reservations, error: resError } = await supabase
      .from("reservations")
      .select("*")
      .gte("starts_at", dayStart)
      .lte("ends_at", dayEnd)
      .neq("status", "cancelled")
      .order("court_id")
      .order("starts_at");

    if (resError) throw resError;

    // Carica campi
    const { data: courts, error: courtsError } = await supabase
      .from("courts")
      .select("id, name");

    if (courtsError) throw courtsError;

    // Carica profili degli utenti che hanno prenotato
    const userIds = [...new Set((reservations || []).map((r: any) => r.user_id))];
    let profileMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      profiles?.forEach((p: any) => {
        profileMap[p.id] = p.full_name || "Socio";
      });
    }

    const courtMap: Record<number, string> = {};
    courts?.forEach((c: any) => { courtMap[c.id] = c.name; });

    const dayLabel = format(tomorrow, "EEEE d MMMM", { locale: it });
    const dayLabelCap = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);

    if (!reservations || reservations.length === 0) {
      const message = `🎾 *ASD Tennis Club Monti della Tolfa*\n\n📅 *Prenotazioni ${dayLabelCap}*\n\nNessuna prenotazione per domani.`;
      return new Response(JSON.stringify({ message, count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Raggruppa per campo
    const byCourt: Record<number, any[]> = {};
    reservations.forEach((r: any) => {
      if (!byCourt[r.court_id]) byCourt[r.court_id] = [];
      byCourt[r.court_id].push(r);
    });

    let body = `🎾 *ASD Tennis Club Monti della Tolfa*\n\n📅 *Prenotazioni ${dayLabelCap}*\n`;

    for (const [courtId, recs] of Object.entries(byCourt)) {
      const courtName = courtMap[Number(courtId)] || `Campo ${courtId}`;
      body += `\n🏟️ *${courtName}*\n`;

      recs.forEach((r: any) => {
        const start = format(new Date(r.starts_at), "HH:mm");
        const end = format(new Date(r.ends_at), "HH:mm");
        const name = r.booked_for_first_name && r.booked_for_last_name
          ? `${r.booked_for_first_name} ${r.booked_for_last_name}`
          : profileMap[r.user_id] || "Socio";
        body += `  • ${start}–${end} — ${name}\n`;
      });
    }

    body += `\n_Totale: ${reservations.length} ${reservations.length === 1 ? "ora prenotata" : "ore prenotate"}_`;

    // Invia via Green API se configurato
    const greenApiInstance = Deno.env.get("GREEN_API_INSTANCE_ID");
    const greenApiToken = Deno.env.get("GREEN_API_TOKEN");
    const greenApiGroupId = Deno.env.get("GREEN_API_GROUP_CHAT_ID");

    if (greenApiInstance && greenApiToken && greenApiGroupId) {
      const greenApiUrl = `https://api.green-api.com/waInstance${greenApiInstance}/sendMessage/${greenApiToken}`;
      const sendRes = await fetch(greenApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: greenApiGroupId,
          message: body,
        }),
      });

      if (!sendRes.ok) {
        const errText = await sendRes.text();
        console.error("[daily-summary] Green API error:", errText);
        return new Response(JSON.stringify({ message: body, sent: false, error: errText }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      console.log("[daily-summary] Messaggio inviato con successo.");
    } else {
      console.log("[daily-summary] Green API non configurata, restituisco solo il testo.");
    }

    return new Response(JSON.stringify({ message: body, count: reservations.length, sent: !!greenApiInstance }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("[daily-summary] Errore:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

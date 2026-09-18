// Riceve le notifiche del fornitore di pagamento. È l'UNICO punto che accredita una ricarica.
// Deploy senza verifica JWT (il fornitore non ha un token Supabase):
//   supabase functions deploy payment-webhook --no-verify-jwt
// L'autenticità è verificata dall'adapter (firma Stripe / rilettura del pagamento Mollie).
//
// Idempotenza: ogni evento viene registrato in payment_events; un evento già elaborato
// viene confermato con 200 senza rifare nulla. In caso di errore si risponde 500 così
// il fornitore ritenta, e il nuovo tentativo riprende l'evento non ancora elaborato.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getPaymentProvider, WebhookVerificationError, type TopupEvent } from "../_shared/payments/index.ts";
import { sendAdminAlert } from "../_shared/adminAlert.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" }, status });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const formatEur = (cents: number) => `€${(cents / 100).toFixed(2).replace(".", ",")}`;

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  let provider;
  try {
    provider = getPaymentProvider();
  } catch (error: any) {
    console.error("[payment-webhook] Configurazione mancante:", error?.message ?? error);
    return json({ error: "Funzione non configurata" }, 500);
  }
  const rawBody = await req.text();

  let event: TopupEvent | null;
  try {
    event = await provider.parseWebhook(req, rawBody);
  } catch (error: any) {
    if (error instanceof WebhookVerificationError) {
      console.warn("[payment-webhook] Notifica rifiutata:", error.message);
      return json({ error: "Notifica non valida" }, 400);
    }
    console.error("[payment-webhook] Errore di verifica:", error?.message ?? error);
    return json({ error: "Errore temporaneo" }, 500);
  }

  if (!event || !event.status) return json({ ignored: true });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // La ricarica deve esistere ed essere di questo fornitore
  const topupId = event.topupId && UUID_RE.test(event.topupId) ? event.topupId : null;
  const { data: topup } = topupId
    ? await supabase.from("wallet_topups").select("id, provider, user_id, amount_cents").eq("id", topupId).maybeSingle()
    : { data: null };
  const knownTopup = topup && topup.provider === provider.name ? topup : null;

  // Registrazione evento (idempotenza)
  const { data: existing } = await supabase
    .from("payment_events")
    .select("id, processed_at")
    .eq("provider", provider.name)
    .eq("event_id", event.eventId)
    .maybeSingle();
  if (existing?.processed_at) return json({ duplicate: true });

  let eventRowId = existing?.id as number | undefined;
  if (!eventRowId) {
    const { data: inserted, error: insertError } = await supabase
      .from("payment_events")
      .insert({
        provider: provider.name,
        event_id: event.eventId,
        topup_id: knownTopup?.id ?? null,
        status: event.status,
        payload: JSON.parse(rawBody.startsWith("{") ? rawBody : JSON.stringify({ body: rawBody })),
      })
      .select("id")
      .single();
    if (insertError) {
      // notifica concorrente dello stesso evento: se ne occupa l'altra
      if (insertError.code === "23505") return json({ duplicate: true });
      console.error("[payment-webhook] Registrazione evento fallita:", insertError.message);
      return json({ error: "Errore temporaneo" }, 500);
    }
    eventRowId = inserted.id;
  }

  // processed = true chiude l'evento (anche con una nota di errore); false lo lascia da ritentare
  const markEvent = (processed: boolean, error: string | null) =>
    supabase.from("payment_events")
      .update({ processed_at: processed ? new Date().toISOString() : null, error })
      .eq("id", eventRowId);

  if (!knownTopup) {
    console.warn(`[payment-webhook] Evento ${event.eventId} per ricarica sconosciuta (${event.topupId})`);
    await markEvent(true, "Ricarica sconosciuta");
    return json({ ignored: true });
  }

  try {
    if (event.status === "paid") {
      const { data, error } = await supabase.rpc("wallet_credit_topup", {
        p_topup_id: knownTopup.id,
        p_amount_cents: event.amountCents,
      });
      if (error) throw error;
      console.log(`[payment-webhook] Ricarica ${knownTopup.id}: ${data}`);
    } else if (event.status === "failed" || event.status === "expired") {
      const { error } = await supabase.rpc("wallet_close_topup", { p_topup_id: knownTopup.id, p_status: event.status });
      if (error) throw error;
    } else {
      const { data, error } = await supabase.rpc("wallet_reverse_topup", {
        p_topup_id: knownTopup.id,
        p_status: event.status,
        p_amount_cents: event.amountCents,
      });
      if (error) throw error;
      if (data?.unrecovered_cents > 0) {
        await sendAdminAlert(
          `Storno non recuperato: ${formatEur(data.unrecovered_cents)}`,
          `<p>Una ricarica di ${formatEur(knownTopup.amount_cents)} è stata ${event.status === "chargeback" ? "contestata (chargeback)" : "rimborsata"} dal circuito di pagamento.</p>
           <p>Dal saldo del socio sono stati recuperati ${formatEur(data.taken_cents)}; restano <strong>${formatEur(data.unrecovered_cents)}</strong> da gestire fuori app.</p>
           <p>Socio: ${knownTopup.user_id}<br>Ricarica: ${knownTopup.id}</p>`,
        );
      }
    }
    await markEvent(true, null);
    return json({ ok: true });
  } catch (error: any) {
    console.error(`[payment-webhook] Elaborazione ricarica ${knownTopup.id} fallita:`, error?.message ?? error);
    if (error?.hint === "IMPORTO") {
      // importo incoerente: non ritentare, serve un controllo umano
      await markEvent(true, error.message);
      await sendAdminAlert(
        "Importo ricarica incoerente",
        `<p>Il fornitore ha confermato un pagamento con importo diverso da quello richiesto. Nessun accredito effettuato.</p>
         <p>Ricarica: ${knownTopup.id}<br>Dettaglio: ${error.message}</p>`,
      );
      return json({ error: "Importo incoerente" }, 200);
    }
    await markEvent(false, error?.message ?? "errore");
    return json({ error: "Errore temporaneo" }, 500);
  }
});

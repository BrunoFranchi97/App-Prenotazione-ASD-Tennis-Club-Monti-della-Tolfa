// Crea una ricarica "in attesa" e restituisce il link alla pagina di pagamento del fornitore.
// NON accredita nulla: l'accredito avviene solo in payment-webhook, dopo la conferma verificata.
// Chiamata dall'app con supabase.functions.invoke('wallet-create-checkout', { body: { amount_cents } }).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getPaymentProvider } from "../_shared/payments/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status });

const formatEur = (cents: number) => `€${(cents / 100).toFixed(2).replace(".", ",")}`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Metodo non consentito" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Chi sta ricaricando: verificato dal token di sessione, mai da un id nel body
    const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Devi effettuare l'accesso." }, 401);
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) return json({ error: "Sessione non valida. Effettua di nuovo l'accesso." }, 401);

    const { data: profile } = await supabase.from("profiles").select("approved").eq("id", user.id).single();
    if (!profile?.approved) return json({ error: "Il tuo profilo non è ancora stato approvato." }, 403);

    const provider = getPaymentProvider();
    const { amount_cents } = await req.json().catch(() => ({}));
    const amountCents = Number(amount_cents);
    if (!Number.isInteger(amountCents) || amountCents < provider.minAmountCents) {
      return json({ error: `L'importo minimo di ricarica è ${formatEur(provider.minAmountCents)}.` }, 400);
    }

    const appBaseUrl = (Deno.env.get("APP_BASE_URL") ?? "").replace(/\/$/, "");
    if (!appBaseUrl) throw new Error("APP_BASE_URL non configurata");

    const { data: topup, error: insertError } = await supabase
      .from("wallet_topups")
      .insert({ user_id: user.id, amount_cents: amountCents, provider: provider.name })
      .select("id")
      .single();
    if (insertError || !topup) throw insertError ?? new Error("Creazione ricarica fallita");

    try {
      const checkout = await provider.createCheckout({
        topupId: topup.id,
        amountCents,
        email: user.email,
        successUrl: `${appBaseUrl}/profile?ricarica=in-corso&topup=${topup.id}`,
        cancelUrl: `${appBaseUrl}/profile?ricarica=annullata`,
        webhookUrl: `${supabaseUrl}/functions/v1/payment-webhook`,
      });

      const { error: updateError } = await supabase
        .from("wallet_topups")
        .update({ provider_ref: checkout.providerRef, checkout_url: checkout.checkoutUrl, updated_at: new Date().toISOString() })
        .eq("id", topup.id);
      if (updateError) throw updateError;

      console.log(`[wallet-create-checkout] Ricarica ${topup.id} (${formatEur(amountCents)}) creata per ${user.id}`);
      return json({ topup_id: topup.id, checkout_url: checkout.checkoutUrl });
    } catch (providerError) {
      await supabase.rpc("wallet_close_topup", { p_topup_id: topup.id, p_status: "failed" });
      throw providerError;
    }
  } catch (error: any) {
    console.error("[wallet-create-checkout] Errore:", error?.message ?? error);
    return json({ error: "Non è stato possibile avviare la ricarica. Riprova tra poco." }, 500);
  }
});

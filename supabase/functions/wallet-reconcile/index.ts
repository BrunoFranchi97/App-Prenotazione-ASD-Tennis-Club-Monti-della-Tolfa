// Controllo periodico (pg_cron, ogni ora) del portafoglio:
//  1. recupera le ricariche rimaste "in attesa" (webhook perso) chiedendo lo stato al fornitore;
//  2. chiude le ricariche mai avviate;
//  3. verifica che ogni saldo coincida con la somma dei suoi movimenti.
// In caso di anomalie avvisa l'admin via email.
// Deploy: supabase functions deploy wallet-reconcile --no-verify-jwt
// Protezione: header x-cron-secret uguale alla variabile CRON_SECRET.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getPaymentProvider } from "../_shared/payments/index.ts";
import { sendAdminAlert } from "../_shared/adminAlert.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" }, status });

const PENDING_CHECK_AFTER_MINUTES = 30;
const NEVER_STARTED_AFTER_MINUTES = 60;

serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return json({ error: "Non autorizzato" }, 401);
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const provider = getPaymentProvider();
  const report = { checked: 0, credited: 0, closed: 0, errors: [] as string[], mismatches: 0 };

  try {
    const pendingBefore = new Date(Date.now() - PENDING_CHECK_AFTER_MINUTES * 60_000).toISOString();
    const { data: pending, error } = await supabase
      .from("wallet_topups")
      .select("id, provider, provider_ref, amount_cents, created_at")
      .eq("status", "pending")
      .lt("created_at", pendingBefore)
      .limit(100);
    if (error) throw error;

    for (const topup of pending ?? []) {
      report.checked++;
      try {
        if (!topup.provider_ref) {
          // checkout mai creato presso il fornitore
          if (Date.parse(topup.created_at) < Date.now() - NEVER_STARTED_AFTER_MINUTES * 60_000) {
            await supabase.rpc("wallet_close_topup", { p_topup_id: topup.id, p_status: "failed" });
            report.closed++;
          }
          continue;
        }
        if (topup.provider !== provider.name) continue;

        const status = await provider.getStatus(topup.provider_ref);
        if (status.status === "paid") {
          const { error: rpcError } = await supabase.rpc("wallet_credit_topup", {
            p_topup_id: topup.id,
            p_amount_cents: status.amountCents,
          });
          if (rpcError) throw rpcError;
          report.credited++;
        } else if (status.status === "expired" || status.status === "failed") {
          await supabase.rpc("wallet_close_topup", { p_topup_id: topup.id, p_status: status.status });
          report.closed++;
        }
      } catch (e: any) {
        report.errors.push(`${topup.id}: ${e?.message ?? e}`);
      }
    }

    const { data: mismatches, error: recError } = await supabase.from("wallet_reconciliation").select("*");
    if (recError) throw recError;
    report.mismatches = mismatches?.length ?? 0;

    if (report.mismatches > 0 || report.errors.length > 0) {
      await sendAdminAlert(
        "Anomalie nel controllo periodico",
        `<p>Saldi non coerenti con i movimenti: <strong>${report.mismatches}</strong></p>
         <pre>${JSON.stringify(mismatches ?? [], null, 2)}</pre>
         <p>Errori nel recupero delle ricariche: ${report.errors.length}</p>
         <pre>${report.errors.join("\n")}</pre>`,
      );
    }

    console.log("[wallet-reconcile]", JSON.stringify(report));
    return json(report);
  } catch (error: any) {
    console.error("[wallet-reconcile] Errore:", error?.message ?? error);
    return json({ ...report, error: error?.message ?? "errore" }, 500);
  }
});

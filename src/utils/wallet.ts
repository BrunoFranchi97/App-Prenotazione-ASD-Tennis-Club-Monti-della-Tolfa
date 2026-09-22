import { supabase } from '@/integrations/supabase/client';
import type { WalletLedgerKind } from '@/types/supabase';

export const formatEur = (cents: number) => `€${(Math.abs(cents) / 100).toFixed(2).replace('.', ',')}`;

export const walletKindLabels: Record<WalletLedgerKind, string> = {
  topup_card: 'Ricarica con carta',
  topup_cash: 'Ricarica in contanti',
  booking_charge: 'Prenotazione campo',
  booking_cover: 'Copertura quota socio',
  booking_refund: 'Rimborso prenotazione',
  admin_correction: 'Correzione admin',
  chargeback: 'Storno pagamento',
};

export const startWalletTopup = async (amountCents: number): Promise<{ checkoutUrl?: string; error?: string }> => {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { error: "Importo non valido." };
  }
  const { data, error } = await supabase.functions.invoke('wallet-create-checkout', { body: { amount_cents: amountCents } });
  if (error) {
    let message = "Non è stato possibile avviare la ricarica. Riprova tra poco.";
    try {
      const body = await (error as any).context?.json?.();
      if (body?.error) message = body.error;
    } catch { /* mantiene il messaggio generico */ }
    return { error: message };
  }
  if (!data?.checkout_url) {
    return { error: "Non è stato possibile avviare la ricarica. Riprova tra poco." };
  }
  return { checkoutUrl: data.checkout_url };
};

// Verde (--primary) quando il saldo è "pieno", arancione (--accent / club-orange) quando è
// vicino allo zero — sfumatura HSL continua tra le due, ancorata a saldo_basso_soglia_cents
// (già configurabile dall'admin in app_settings): arancione pieno alla soglia, verde pieno
// al doppio della soglia. Mai rosso: restiamo nella palette societaria.
const WALLET_COLOR_LOW = { h: 23, s: 72, l: 50 };   // --accent
const WALLET_COLOR_HIGH = { h: 138, s: 41, l: 30 }; // --primary

export const walletBalanceColor = (balanceCents: number, lowThresholdCents: number): string => {
  const highThreshold = Math.max(lowThresholdCents * 2, lowThresholdCents + 1);
  const t = Math.min(1, Math.max(0, (balanceCents - lowThresholdCents) / (highThreshold - lowThresholdCents)));
  const h = WALLET_COLOR_LOW.h + (WALLET_COLOR_HIGH.h - WALLET_COLOR_LOW.h) * t;
  const s = WALLET_COLOR_LOW.s + (WALLET_COLOR_HIGH.s - WALLET_COLOR_LOW.s) * t;
  const l = WALLET_COLOR_LOW.l + (WALLET_COLOR_HIGH.l - WALLET_COLOR_LOW.l) * t;
  return `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`;
};

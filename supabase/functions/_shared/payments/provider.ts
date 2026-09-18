// Interfaccia comune dei fornitori di pagamento (Stripe, Mollie).
// Il dominio (wallet, prenotazioni) non conosce il fornitore: cambiarlo significa
// scrivere un nuovo adapter e impostare PAYMENT_PROVIDER, senza toccare altro.
//
// Gli adapter usano solo API web standard (fetch, crypto.subtle), così girano
// sia nelle Edge Function (Deno) sia nei test con Node.

export type TopupEventStatus = 'paid' | 'failed' | 'expired' | 'refunded' | 'chargeback';

// Evento di pagamento già verificato e normalizzato
export interface TopupEvent {
  eventId: string;               // identificativo univoco per l'idempotenza
  topupId: string | null;        // id della riga wallet_topups (dai metadata)
  providerRef: string | null;    // id del pagamento/sessione presso il fornitore
  status: TopupEventStatus | null; // null = evento non rilevante (va solo confermato con 200)
  amountCents: number | null;
}

export interface CheckoutInput {
  topupId: string;
  amountCents: number;
  email?: string | null;
  successUrl: string;
  cancelUrl: string;
  webhookUrl: string;
}

export interface CheckoutResult {
  providerRef: string;
  checkoutUrl: string;
}

export interface ProviderStatus {
  status: TopupEventStatus | 'pending';
  amountCents: number | null;
}

export interface PaymentProvider {
  name: 'stripe' | 'mollie';
  minAmountCents: number;        // minimo tecnico del fornitore (D15: nessun altro limite)
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  // Verifica l'autenticità della notifica e la normalizza.
  // Lancia WebhookVerificationError se la notifica non è autentica.
  parseWebhook(req: Request, rawBody: string): Promise<TopupEvent | null>;
  // Stato attuale di un pagamento, per recuperare webhook persi
  getStatus(providerRef: string): Promise<ProviderStatus>;
}

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

export class ProviderApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ProviderApiError';
    this.status = status;
  }
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

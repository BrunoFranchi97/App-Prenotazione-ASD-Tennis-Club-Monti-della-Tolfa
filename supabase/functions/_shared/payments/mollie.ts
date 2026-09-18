// Adapter Mollie: pagamento ospitato + webhook.
// Mollie non firma i webhook: invia solo l'id del pagamento. La verifica consiste nel
// rileggere il pagamento dalle API con la chiave segreta: si usa solo ciò che risponde Mollie,
// mai il contenuto della notifica.
import {
  ProviderApiError,
  WebhookVerificationError,
  type CheckoutInput,
  type FetchFn,
  type PaymentProvider,
  type ProviderStatus,
  type TopupEvent,
  type TopupEventStatus,
} from './provider.ts';

const API = 'https://api.mollie.com/v2';

export interface MollieConfig {
  apiKey: string;
  fetchFn?: FetchFn;
}

const toCents = (amount: { value?: string } | null | undefined) =>
  amount?.value ? Math.round(Number(amount.value) * 100) : 0;

interface MolliePayment {
  id: string;
  status: string;
  amount: { value: string; currency: string };
  amountRefunded?: { value: string };
  amountChargedBack?: { value: string };
  metadata?: { topup_id?: string } | null;
  _links?: { checkout?: { href: string } };
}

// Stato normalizzato: storni e rimborsi prevalgono sullo stato "paid"
export function mapMolliePayment(p: MolliePayment): { status: TopupEventStatus | 'pending'; amountCents: number } {
  const chargedBack = toCents(p.amountChargedBack);
  const refunded = toCents(p.amountRefunded);
  if (chargedBack > 0) return { status: 'chargeback', amountCents: chargedBack };
  if (refunded > 0) return { status: 'refunded', amountCents: refunded };
  switch (p.status) {
    case 'paid':
      return { status: 'paid', amountCents: toCents(p.amount) };
    case 'failed':
    case 'canceled':
      return { status: 'failed', amountCents: toCents(p.amount) };
    case 'expired':
      return { status: 'expired', amountCents: toCents(p.amount) };
    default:
      return { status: 'pending', amountCents: toCents(p.amount) };
  }
}

export function createMollieProvider(config: MollieConfig): PaymentProvider {
  const fetchFn = config.fetchFn ?? fetch;

  const call = async (path: string, init: RequestInit = {}) => {
    const res = await fetchFn(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${config.apiKey}`, ...(init.headers ?? {}) },
    });
    const body = await res.json();
    if (!res.ok) throw new ProviderApiError(`Mollie ${path}: ${body?.detail ?? res.status}`, res.status);
    return body;
  };

  return {
    name: 'mollie',
    minAmountCents: 100,

    async createCheckout(input: CheckoutInput) {
      const payment: MolliePayment = await call('/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': input.topupId },
        body: JSON.stringify({
          amount: { currency: 'EUR', value: (input.amountCents / 100).toFixed(2) },
          description: 'Ricarica portafoglio - Tennis Club Monti della Tolfa',
          redirectUrl: input.successUrl,
          cancelUrl: input.cancelUrl,
          webhookUrl: input.webhookUrl,
          metadata: { topup_id: input.topupId },
        }),
      });
      const checkoutUrl = payment._links?.checkout?.href;
      if (!checkoutUrl) throw new ProviderApiError('Mollie: link di pagamento mancante', 502);
      return { providerRef: payment.id, checkoutUrl };
    },

    async parseWebhook(_req: Request, rawBody: string): Promise<TopupEvent | null> {
      const id = new URLSearchParams(rawBody).get('id');
      if (!id || !/^tr_[A-Za-z0-9]+$/.test(id)) throw new WebhookVerificationError('Id pagamento Mollie non valido');

      let payment: MolliePayment;
      try {
        payment = await call(`/payments/${encodeURIComponent(id)}`);
      } catch (e) {
        if (e instanceof ProviderApiError && e.status === 404) {
          throw new WebhookVerificationError('Pagamento Mollie inesistente');
        }
        throw e;
      }

      const mapped = mapMolliePayment(payment);
      return {
        // Mollie non ha id evento: lo stato stesso rende l'evento unico
        eventId: `${payment.id}:${payment.status}:${payment.amountRefunded?.value ?? '0'}:${payment.amountChargedBack?.value ?? '0'}`,
        topupId: payment.metadata?.topup_id ?? null,
        providerRef: payment.id,
        status: mapped.status === 'pending' ? null : mapped.status,
        amountCents: mapped.amountCents,
      };
    },

    async getStatus(providerRef: string): Promise<ProviderStatus> {
      const payment: MolliePayment = await call(`/payments/${encodeURIComponent(providerRef)}`);
      return mapMolliePayment(payment);
    },
  };
}

// Adapter Stripe: Checkout Session ospitata + webhook firmato (header Stripe-Signature).
import {
  ProviderApiError,
  WebhookVerificationError,
  type CheckoutInput,
  type FetchFn,
  type PaymentProvider,
  type ProviderStatus,
  type TopupEvent,
} from './provider.ts';

const API = 'https://api.stripe.com/v1';
const SIGNATURE_TOLERANCE_SECONDS = 300;

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  fetchFn?: FetchFn;
  nowSeconds?: () => number;
}

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');

const timingSafeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

export async function computeStripeSignature(secret: string, timestamp: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`)));
}

export async function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSeconds: number,
): Promise<void> {
  if (!header) throw new WebhookVerificationError('Header Stripe-Signature mancante');
  const parts = header.split(',').map((p) => p.trim().split('='));
  const timestamp = parts.find(([k]) => k === 't')?.[1];
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!timestamp || signatures.length === 0) throw new WebhookVerificationError('Header Stripe-Signature non valido');
  if (Math.abs(nowSeconds - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) {
    throw new WebhookVerificationError('Firma Stripe scaduta');
  }
  const expected = await computeStripeSignature(secret, timestamp, rawBody);
  if (!signatures.some((s) => timingSafeEqual(s, expected))) {
    throw new WebhookVerificationError('Firma Stripe non valida');
  }
}

export function createStripeProvider(config: StripeConfig): PaymentProvider {
  const fetchFn = config.fetchFn ?? fetch;
  const nowSeconds = config.nowSeconds ?? (() => Math.floor(Date.now() / 1000));

  const call = async (path: string, init: RequestInit = {}) => {
    const res = await fetchFn(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${config.secretKey}`, ...(init.headers ?? {}) },
    });
    const body = await res.json();
    if (!res.ok) throw new ProviderApiError(`Stripe ${path}: ${body?.error?.message ?? res.status}`, res.status);
    return body;
  };

  // Rimborsi e contestazioni arrivano sul pagamento, non sulla sessione: il topup_id
  // si recupera dai metadata del PaymentIntent (impostati alla creazione).
  const topupIdFromPaymentIntent = async (paymentIntentId: string | null | undefined) => {
    if (!paymentIntentId) return null;
    const pi = await call(`/payment_intents/${encodeURIComponent(paymentIntentId)}`);
    return (pi?.metadata?.topup_id as string | undefined) ?? null;
  };

  return {
    name: 'stripe',
    minAmountCents: 50,

    async createCheckout(input: CheckoutInput) {
      const form = new URLSearchParams({
        mode: 'payment',
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        client_reference_id: input.topupId,
        'metadata[topup_id]': input.topupId,
        'payment_intent_data[metadata][topup_id]': input.topupId,
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'eur',
        'line_items[0][price_data][unit_amount]': String(input.amountCents),
        'line_items[0][price_data][product_data][name]': 'Ricarica portafoglio - Tennis Club Monti della Tolfa',
      });
      if (input.email) form.set('customer_email', input.email);
      const session = await call('/checkout/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': input.topupId },
        body: form.toString(),
      });
      return { providerRef: session.id, checkoutUrl: session.url };
    },

    async parseWebhook(req: Request, rawBody: string): Promise<TopupEvent | null> {
      await verifyStripeSignature(rawBody, req.headers.get('stripe-signature'), config.webhookSecret, nowSeconds());
      const event = JSON.parse(rawBody);
      const obj = event?.data?.object ?? {};
      const base = { eventId: String(event.id) };

      switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded':
          return {
            ...base,
            topupId: obj.metadata?.topup_id ?? obj.client_reference_id ?? null,
            providerRef: obj.id ?? null,
            // pagamenti asincroni (es. bonifico): "completed" arriva prima dell'incasso
            status: obj.payment_status === 'paid' ? 'paid' : null,
            amountCents: obj.amount_total ?? null,
          };
        case 'checkout.session.async_payment_failed':
        case 'checkout.session.expired':
          return {
            ...base,
            topupId: obj.metadata?.topup_id ?? obj.client_reference_id ?? null,
            providerRef: obj.id ?? null,
            status: event.type === 'checkout.session.expired' ? 'expired' : 'failed',
            amountCents: obj.amount_total ?? null,
          };
        case 'charge.refunded':
          return {
            ...base,
            topupId: obj.metadata?.topup_id ?? (await topupIdFromPaymentIntent(obj.payment_intent)),
            providerRef: obj.payment_intent ?? null,
            status: 'refunded',
            amountCents: obj.amount_refunded ?? null,
          };
        case 'charge.dispute.created':
          return {
            ...base,
            topupId: await topupIdFromPaymentIntent(obj.payment_intent),
            providerRef: obj.payment_intent ?? null,
            status: 'chargeback',
            amountCents: obj.amount ?? null,
          };
        default:
          return { ...base, topupId: null, providerRef: null, status: null, amountCents: null };
      }
    },

    async getStatus(providerRef: string): Promise<ProviderStatus> {
      const session = await call(`/checkout/sessions/${encodeURIComponent(providerRef)}`);
      if (session.payment_status === 'paid') return { status: 'paid', amountCents: session.amount_total ?? null };
      if (session.status === 'expired') return { status: 'expired', amountCents: session.amount_total ?? null };
      return { status: 'pending', amountCents: session.amount_total ?? null };
    },
  };
}

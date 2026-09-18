// Test degli adapter di pagamento (nessuna chiamata reale: fetch simulata).
// Esecuzione: node --test supabase/functions/_shared/payments/payments.test.ts  (Node >= 23)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebhookVerificationError } from './provider.ts';
import { computeStripeSignature, createStripeProvider } from './stripe.ts';
import { createMollieProvider, mapMolliePayment } from './mollie.ts';

const SECRET = 'whsec_test_secret';
const NOW = 1_800_000_000;
const TOPUP = '11111111-2222-4333-8444-555555555555';

type Call = { url: string; init?: RequestInit };
const fakeFetch = (responses: Record<string, unknown>, calls: Call[] = []) =>
  async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const key = Object.keys(responses).find((k) => url.endsWith(k));
    if (!key) return new Response(JSON.stringify({ detail: 'not found' }), { status: 404 });
    return new Response(JSON.stringify(responses[key]), { status: 200 });
  };

const stripeRequest = async (body: string, timestamp = NOW, secret = SECRET) => {
  const sig = await computeStripeSignature(secret, String(timestamp), body);
  return new Request('https://example.invalid/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': `t=${timestamp},v1=${sig}` },
    body,
  });
};

const stripe = (fetchFn = fakeFetch({})) =>
  createStripeProvider({ secretKey: 'sk_test', webhookSecret: SECRET, fetchFn, nowSeconds: () => NOW });

const sessionCompleted = JSON.stringify({
  id: 'evt_1',
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_1', payment_status: 'paid', amount_total: 2000, metadata: { topup_id: TOPUP } } },
});

test('Stripe: firma valida → evento "paid" normalizzato', async () => {
  const event = await stripe().parseWebhook(await stripeRequest(sessionCompleted), sessionCompleted);
  assert.deepEqual(event, { eventId: 'evt_1', topupId: TOPUP, providerRef: 'cs_1', status: 'paid', amountCents: 2000 });
});

test('Stripe: corpo manomesso → rifiutato', async () => {
  const req = await stripeRequest(sessionCompleted);
  const tampered = sessionCompleted.replace('2000', '200000');
  await assert.rejects(stripe().parseWebhook(req, tampered), WebhookVerificationError);
});

test('Stripe: firma con segreto sbagliato → rifiutata', async () => {
  const req = await stripeRequest(sessionCompleted, NOW, 'whsec_altro');
  await assert.rejects(stripe().parseWebhook(req, sessionCompleted), WebhookVerificationError);
});

test('Stripe: firma troppo vecchia (replay) → rifiutata', async () => {
  const req = await stripeRequest(sessionCompleted, NOW - 3600);
  await assert.rejects(stripe().parseWebhook(req, sessionCompleted), WebhookVerificationError);
});

test('Stripe: header assente → rifiutato', async () => {
  const req = new Request('https://example.invalid/webhook', { method: 'POST', body: sessionCompleted });
  await assert.rejects(stripe().parseWebhook(req, sessionCompleted), WebhookVerificationError);
});

test('Stripe: checkout completato ma non ancora incassato → nessuna azione', async () => {
  const body = JSON.stringify({
    id: 'evt_2', type: 'checkout.session.completed',
    data: { object: { id: 'cs_2', payment_status: 'unpaid', amount_total: 2000, metadata: { topup_id: TOPUP } } },
  });
  const event = await stripe().parseWebhook(await stripeRequest(body), body);
  assert.equal(event?.status, null);
});

test('Stripe: contestazione → chargeback con topup_id letto dal PaymentIntent', async () => {
  const body = JSON.stringify({
    id: 'evt_3', type: 'charge.dispute.created', data: { object: { payment_intent: 'pi_1', amount: 2000 } },
  });
  const provider = stripe(fakeFetch({ '/payment_intents/pi_1': { id: 'pi_1', metadata: { topup_id: TOPUP } } }));
  const event = await provider.parseWebhook(await stripeRequest(body), body);
  assert.deepEqual(event, { eventId: 'evt_3', topupId: TOPUP, providerRef: 'pi_1', status: 'chargeback', amountCents: 2000 });
});

test('Stripe: evento non gestito → ignorato', async () => {
  const body = JSON.stringify({ id: 'evt_4', type: 'customer.created', data: { object: {} } });
  const event = await stripe().parseWebhook(await stripeRequest(body), body);
  assert.equal(event?.status, null);
});

test('Stripe: creazione checkout con importo, metadata e chiave di idempotenza', async () => {
  const calls: Call[] = [];
  const provider = stripe(fakeFetch({ '/checkout/sessions': { id: 'cs_9', url: 'https://checkout.stripe.test/cs_9' } }, calls));
  const result = await provider.createCheckout({
    topupId: TOPUP, amountCents: 1500, email: 'socio@example.invalid',
    successUrl: 'https://app/ok', cancelUrl: 'https://app/ko', webhookUrl: 'https://fn/webhook',
  });
  assert.deepEqual(result, { providerRef: 'cs_9', checkoutUrl: 'https://checkout.stripe.test/cs_9' });
  const form = new URLSearchParams(String(calls[0].init?.body));
  assert.equal(form.get('line_items[0][price_data][unit_amount]'), '1500');
  assert.equal(form.get('line_items[0][price_data][currency]'), 'eur');
  assert.equal(form.get('metadata[topup_id]'), TOPUP);
  assert.equal(form.get('payment_intent_data[metadata][topup_id]'), TOPUP);
  assert.equal((calls[0].init?.headers as Record<string, string>)['Idempotency-Key'], TOPUP);
});

test('Stripe: stato sessione per la riconciliazione', async () => {
  const provider = stripe(fakeFetch({
    '/checkout/sessions/cs_paid': { payment_status: 'paid', status: 'complete', amount_total: 1000 },
    '/checkout/sessions/cs_exp': { payment_status: 'unpaid', status: 'expired', amount_total: 1000 },
    '/checkout/sessions/cs_open': { payment_status: 'unpaid', status: 'open', amount_total: 1000 },
  }));
  assert.equal((await provider.getStatus('cs_paid')).status, 'paid');
  assert.equal((await provider.getStatus('cs_exp')).status, 'expired');
  assert.equal((await provider.getStatus('cs_open')).status, 'pending');
});

const molliePayment = (over: Record<string, unknown> = {}) => ({
  id: 'tr_abc123', status: 'paid', amount: { value: '20.00', currency: 'EUR' },
  metadata: { topup_id: TOPUP }, ...over,
});

test('Mollie: stato del pagamento normalizzato', () => {
  assert.deepEqual(mapMolliePayment(molliePayment()), { status: 'paid', amountCents: 2000 });
  assert.equal(mapMolliePayment(molliePayment({ status: 'canceled' })).status, 'failed');
  assert.equal(mapMolliePayment(molliePayment({ status: 'expired' })).status, 'expired');
  assert.equal(mapMolliePayment(molliePayment({ status: 'open' })).status, 'pending');
  assert.deepEqual(mapMolliePayment(molliePayment({ amountRefunded: { value: '5.00' } })), { status: 'refunded', amountCents: 500 });
  assert.deepEqual(mapMolliePayment(molliePayment({ amountChargedBack: { value: '20.00' } })), { status: 'chargeback', amountCents: 2000 });
});

test('Mollie: webhook verificato rileggendo il pagamento dalle API', async () => {
  const calls: Call[] = [];
  const provider = createMollieProvider({ apiKey: 'test_x', fetchFn: fakeFetch({ '/payments/tr_abc123': molliePayment() }, calls) });
  const event = await provider.parseWebhook(new Request('https://x', { method: 'POST' }), 'id=tr_abc123');
  assert.equal(calls[0].url, 'https://api.mollie.com/v2/payments/tr_abc123');
  assert.deepEqual(event, {
    eventId: 'tr_abc123:paid:0:0', topupId: TOPUP, providerRef: 'tr_abc123', status: 'paid', amountCents: 2000,
  });
});

test('Mollie: id inesistente o malformato → rifiutato', async () => {
  const provider = createMollieProvider({ apiKey: 'test_x', fetchFn: fakeFetch({}) });
  await assert.rejects(provider.parseWebhook(new Request('https://x'), 'id=tr_nonexistent'), WebhookVerificationError);
  await assert.rejects(provider.parseWebhook(new Request('https://x'), 'id=../../etc'), WebhookVerificationError);
});

test('Mollie: creazione pagamento con importo in euro e webhook', async () => {
  const calls: Call[] = [];
  const provider = createMollieProvider({
    apiKey: 'test_x',
    fetchFn: fakeFetch({ '/payments': { id: 'tr_new1', _links: { checkout: { href: 'https://mollie.test/pay' } } } }, calls),
  });
  const result = await provider.createCheckout({
    topupId: TOPUP, amountCents: 1050, successUrl: 'https://app/ok', cancelUrl: 'https://app/ko', webhookUrl: 'https://fn/webhook',
  });
  assert.deepEqual(result, { providerRef: 'tr_new1', checkoutUrl: 'https://mollie.test/pay' });
  const body = JSON.parse(String(calls[0].init?.body));
  assert.deepEqual(body.amount, { currency: 'EUR', value: '10.50' });
  assert.equal(body.webhookUrl, 'https://fn/webhook');
  assert.equal(body.metadata.topup_id, TOPUP);
});

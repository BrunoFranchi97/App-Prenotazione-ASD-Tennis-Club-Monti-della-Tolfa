// Sceglie il fornitore di pagamento in base alla variabile d'ambiente PAYMENT_PROVIDER.
import type { PaymentProvider } from './provider.ts';
import { createStripeProvider } from './stripe.ts';
import { createMollieProvider } from './mollie.ts';

export * from './provider.ts';

const requireEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variabile d'ambiente ${name} non configurata`);
  return value;
};

export function getPaymentProvider(): PaymentProvider {
  const name = (Deno.env.get('PAYMENT_PROVIDER') ?? '').toLowerCase();
  switch (name) {
    case 'stripe':
      return createStripeProvider({
        secretKey: requireEnv('STRIPE_SECRET_KEY'),
        webhookSecret: requireEnv('STRIPE_WEBHOOK_SECRET'),
      });
    case 'mollie':
      return createMollieProvider({ apiKey: requireEnv('MOLLIE_API_KEY') });
    default:
      throw new Error("PAYMENT_PROVIDER deve essere 'stripe' o 'mollie'");
  }
}

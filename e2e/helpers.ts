import { test as base, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { addDays, format, startOfWeek } from 'date-fns';
import { it } from 'date-fns/locale';
import { AUTH_STORAGE_KEY, SUPABASE_ANON_KEY, SUPABASE_URL, storageStatePath, type Role } from './env';

const BASE_URL = 'http://localhost:8080';

/** Stesso formato dell'app (utils/wallet.ts): €3,00 */
export const eur = (cents: number) => `€${(Math.abs(cents) / 100).toFixed(2).replace('.', ',')}`;

/**
 * Chiamate REST a Supabase fatte DAL BROWSER con la sessione del ruolo (le RLS valgono
 * esattamente come nell'app). Da Node non si può: la rete aziendale ispeziona TLS e
 * Node rifiuta il certificato, il browser invece usa i certificati di Windows.
 */
export class Db {
  constructor(readonly page: Page) {}

  private async call<T>(path: string, method: 'GET' | 'POST' | 'PATCH', body?: unknown): Promise<T> {
    const res = await this.page.evaluate(async ({ url, anonKey, storageKey, method, body }) => {
      const session = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (!session?.access_token) return { status: 0, text: 'sessione assente' };
      const r = await fetch(url, {
        method,
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: r.status, text: await r.text() };
    }, { url: `${SUPABASE_URL}${path}`, anonKey: SUPABASE_ANON_KEY, storageKey: AUTH_STORAGE_KEY, method, body });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`${method} ${path} → HTTP ${res.status}: ${res.text}`);
    }
    return (res.text ? JSON.parse(res.text) : null) as T;
  }

  select<T = Record<string, unknown>>(table: string, query: string) {
    return this.call<T[]>(`/rest/v1/${table}?${query}`, 'GET');
  }

  update(table: string, query: string, values: Record<string, unknown>) {
    return this.call<null>(`/rest/v1/${table}?${query}`, 'PATCH', values);
  }

  rpc<T = unknown>(fn: string, args: Record<string, unknown>) {
    return this.call<T>(`/rest/v1/rpc/${fn}`, 'POST', args);
  }

  async userId(): Promise<string> {
    return this.page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}')?.user?.id, AUTH_STORAGE_KEY);
  }
}

/** Un utente collegato: una scheda del browser con la sua sessione + accesso al DB con le sue RLS. */
export class Actor {
  constructor(readonly role: Role, readonly context: BrowserContext, readonly page: Page, readonly db: Db, readonly id: string) {}

  static async open(browser: Browser, role: Role) {
    const context = await browser.newContext({
      storageState: storageStatePath(role),
      baseURL: BASE_URL,
      locale: 'it-IT',
      timezoneId: 'Europe/Rome',
      viewport: { width: 1400, height: 1000 },
    });
    const page = await context.newPage();
    await page.goto('/dashboard');
    const db = new Db(page);
    const id = await db.userId();
    if (!id) throw new Error(`Sessione di ${role} non valida: rilancia i test (il login viene rifatto).`);
    return new Actor(role, context, page, db, id);
  }
}

type Fixtures = { mario: Actor; luigi: Actor; admin: Actor; scene: Scene };

export type Scene = {
  marioName: string;
  luigiName: string;
  dayRate: number;       // centesimi a persona all'ora, di giorno
  lightsRate: number;    // centesimi a persona all'ora, con luci
  date: Date;            // giorno delle prove (settimana prossima, senza override luci)
  court: { id: number; name: string };
  /** Primo orario libero (di giorno) con anche l'ora successiva libera. */
  hour: number;
};

// ---------------------------------------------------------------------------
// Preparazione dati (sempre come admin, attraverso le RPC ufficiali)
// ---------------------------------------------------------------------------
export async function balance(admin: Actor, userId: string): Promise<number> {
  const rows = await admin.db.select<{ balance_cents: number }>('wallets', `select=balance_cents&user_id=eq.${userId}`);
  return rows[0]?.balance_cents ?? 0;
}

/** Porta il saldo esattamente a `target` con una correzione admin (resta tracciata nello storico). */
export async function setBalance(admin: Actor, userId: string, target: number) {
  const delta = target - await balance(admin, userId);
  if (delta !== 0) {
    await admin.db.rpc('admin_wallet_adjust', { p_user_id: userId, p_amount_cents: delta, p_note: 'Test automatici: preparazione saldo' });
  }
}

/** Annulla (con rimborso) tutte le prenotazioni future dei soci di prova: lascia liberi slot e limiti settimanali. */
export async function cleanup(admin: Actor, userIds: string[]) {
  const rows = await admin.db.select<{ id: string }>('reservations',
    `select=id&user_id=in.(${userIds.join(',')})&status=neq.cancelled&starts_at=gte.${encodeURIComponent(new Date().toISOString())}`);
  if (rows.length) {
    await admin.db.rpc('admin_cancel_reservations', { p_reservation_ids: rows.map(r => r.id), p_note: 'Test automatici: pulizia' });
  }
}

export const slotStart = (date: Date, hour: number) => {
  const d = new Date(date);
  d.setHours(hour, 0, 0, 0);
  return d;
};

async function buildScene(admin: Actor, mario: Actor, luigi: Actor): Promise<Scene> {
  const flag = await admin.db.select<{ value: string }>('app_settings', 'select=value&key=eq.pagamenti_attivi');
  if (flag[0]?.value !== 'true') {
    throw new Error('Su staging i pagamenti in app sono spenti (app_settings.pagamenti_attivi ≠ true): accendili prima dei test.');
  }
  const rates = await admin.db.select<{ rate_day_cents: number; rate_lights_cents: number }>('court_rates',
    `select=rate_day_cents,rate_lights_cents&valid_from=lte.${encodeURIComponent(new Date().toISOString())}&order=valid_from.desc&limit=1`);
  if (!rates[0] || rates[0].rate_day_cents <= 0) {
    throw new Error('Nessuna tariffa di giorno > €0 in vigore su staging: impostala da Portafogli Soci → Tariffe.');
  }
  const names = await admin.db.select<{ id: string; full_name: string }>('profiles',
    `select=id,full_name&id=in.(${mario.id},${luigi.id})`);
  const nameOf = (id: string) => names.find(n => n.id === id)?.full_name ?? '';

  // Settimana prossima (i limiti settimanali di questa non interferiscono), primo giorno
  // da mercoledì in poi senza override luci.
  const nextMonday = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 7);
  let date = addDays(nextMonday, 2);
  for (let i = 0; i < 4; i++) {
    const ov = await admin.db.select('lights_overrides', `select=day&day=eq.${format(date, 'yyyy-MM-dd')}`);
    if (!ov.length) break;
    date = addDays(date, 1);
  }

  const courts = await admin.db.select<{ id: number; name: string }>('courts', 'select=id,name&is_active=eq.true&order=id');
  const dayStart = slotStart(date, 0).toISOString();
  const dayEnd = slotStart(addDays(date, 1), 0).toISOString();
  const taken = await admin.db.select<{ court_id: number; starts_at: string }>('reservations',
    `select=court_id,starts_at&status=neq.cancelled&starts_at=gte.${encodeURIComponent(dayStart)}&starts_at=lt.${encodeURIComponent(dayEnd)}`);
  const isFree = (courtId: number, hour: number) =>
    !taken.some(r => r.court_id === courtId && new Date(r.starts_at).getTime() === slotStart(date, hour).getTime());

  // Solo ore di pieno giorno (9–14): nessuna luce in nessuna stagione
  for (const court of courts) {
    for (let hour = 9; hour <= 13; hour++) {
      if (isFree(court.id, hour) && isFree(court.id, hour + 1)) {
        return { marioName: nameOf(mario.id), luigiName: nameOf(luigi.id), dayRate: rates[0].rate_day_cents, lightsRate: rates[0].rate_lights_cents, date, court, hour };
      }
    }
  }
  throw new Error(`Nessuno slot libero di 2 ore tra le 9 e le 15 il ${format(date, 'dd/MM')}.`);
}

export const test = base.extend<Fixtures>({
  mario: async ({ browser }, use) => { const a = await Actor.open(browser, 'mario'); await use(a); await a.context.close(); },
  luigi: async ({ browser }, use) => { const a = await Actor.open(browser, 'luigi'); await use(a); await a.context.close(); },
  admin: async ({ browser }, use) => { const a = await Actor.open(browser, 'admin'); await use(a); await a.context.close(); },
  // Prima di ogni test: prenotazioni di prova annullate; dopo: di nuovo pulito.
  scene: async ({ admin, mario, luigi }, use) => {
    await cleanup(admin, [mario.id, luigi.id]);
    const scene = await buildScene(admin, mario, luigi);
    await use(scene);
    await cleanup(admin, [mario.id, luigi.id]);
  },
});

export { expect };

// ---------------------------------------------------------------------------
// Azioni sulle pagine
// ---------------------------------------------------------------------------
export const slotLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00 - ${String(hour + 1).padStart(2, '0')}:00`;
export const rangeLabel = (hour: number, hours: number) =>
  `${String(hour).padStart(2, '0')}:00 - ${String(hour + hours).padStart(2, '0')}:00`;

/** Prenota un Campo: sceglie giorno, campo e tipologia (non gli orari). */
export async function openBooking(page: Page, scene: Scene, type: 'Singolare' | 'Doppio' | 'Lezione' = 'Singolare') {
  await page.goto('/book');
  await expect(page.getByRole('heading', { name: 'Prenota un Campo' })).toBeVisible();
  await (await pickDate(page, scene.date)).click();
  await expect(page.getByText(format(scene.date, 'EEEE d MMMM', { locale: it }), { exact: true })).toBeVisible();
  await selectCourt(page, scene.court.name);
  await page.getByRole('button', { name: type, exact: true }).click();
}

/** Aggiunge un socio dalla combobox dei partecipanti. */
export async function addMember(page: Page, fullName: string) {
  await page.getByRole('button', { name: /Cerca o seleziona un socio/ }).click();
  await page.getByPlaceholder('Cerca per nome...').fill(fullName.split(' ')[0]);
  await page.getByRole('option', { name: new RegExp(escapeRe(fullName)) }).click();
}

export async function clickSlot(page: Page, hour: number) {
  await page.getByRole('button', { name: new RegExp(`^${escapeRe(slotLabel(hour))}`) }).click();
}

type BookingOpts = {
  type?: 'singolare' | 'doppio' | 'lezione';
  guests?: string[];               // nomi ospiti (anche 'Da definire')
  date?: Date;
  hour?: number;
  courtId?: number;
  coachName?: string;
};

/** Crea una prenotazione wallet direttamente con la RPC ufficiale del socio (per preparare i test di modifica/disdetta). */
export async function createBookingViaRpc(booker: Actor, scene: Scene, hours: number, otherMemberIds: string[], opts: BookingOpts = {}) {
  const date = opts.date ?? scene.date;
  const hour = opts.hour ?? scene.hour;
  const starts = Array.from({ length: hours }, (_, i) => slotStart(date, hour + i).toISOString());
  return booker.db.rpc<{ booking_id: string }>('create_booking', {
    p_court_id: opts.courtId ?? scene.court.id,
    p_starts: starts,
    p_booking_type: opts.type ?? 'singolare',
    p_participants: [
      { user_id: booker.id },
      ...otherMemberIds.map(id => ({ user_id: id })),
      ...(opts.guests ?? []).map(guest_name => ({ guest_name })),
    ],
    p_coach_name: opts.coachName ?? null,
  });
}

/** Primo slot libero (court + ora di pieno giorno) in una data, con `span` ore consecutive libere. */
export async function findFreeSlot(admin: Actor, date: Date, span = 1): Promise<{ courtId: number; hour: number }> {
  const courts = await admin.db.select<{ id: number }>('courts', 'select=id&is_active=eq.true&order=id');
  const taken = await admin.db.select<{ court_id: number; starts_at: string }>('reservations',
    `select=court_id,starts_at&status=neq.cancelled&starts_at=gte.${encodeURIComponent(slotStart(date, 0).toISOString())}&starts_at=lt.${encodeURIComponent(slotStart(addDays(date, 1), 0).toISOString())}`);
  const free = (c: number, h: number) => !taken.some(r => r.court_id === c && new Date(r.starts_at).getTime() === slotStart(date, h).getTime());
  for (const c of courts) for (let h = 9; h + span - 1 <= 14; h++) {
    if (Array.from({ length: span }, (_, i) => free(c.id, h + i)).every(Boolean)) return { courtId: c.id, hour: h };
  }
  throw new Error(`Nessuno slot libero il ${format(date, 'dd/MM')}.`);
}

export async function setLightsOverride(admin: Actor, date: Date, force: boolean | null) {
  await admin.db.rpc('admin_set_lights_override', { p_day: format(date, 'yyyy-MM-dd'), p_force_lights: force, p_reason: force === null ? null : 'Test automatici' });
}

export async function getSetting(admin: Actor, key: string) {
  const rows = await admin.db.select<{ value: string }>('app_settings', `select=value&key=eq.${key}`);
  return rows[0]?.value;
}

/** Aggiorna app_settings come fa la pagina Luci (UPDATE diretto, permesso dalle RLS admin). */
export async function setSetting(admin: Actor, key: string, value: string) {
  await admin.db.update('app_settings', `key=eq.${key}`, { value });
}

/** Aggiunge un ospite dalla combobox dei partecipanti. */
export async function addGuest(page: Page, name: string) {
  await page.getByRole('button', { name: 'Ospite', exact: true }).click();
  await page.getByPlaceholder('Nome ospite').fill(name);
  await page.getByPlaceholder('Nome ospite').press('Enter');
}

/** Toglie un partecipante (chip con la crocetta). */
export async function removeParticipant(page: Page, label: string) {
  await page.locator('div.rounded-full', { hasText: label }).getByRole('button').click();
}

/** Seleziona una data nel calendario (react-day-picker) della pagina corrente. */
export async function pickDate(page: Page, date: Date) {
  const today = new Date();
  const monthsAhead = (date.getFullYear() - today.getFullYear()) * 12 + date.getMonth() - today.getMonth();
  for (let i = 0; i < monthsAhead; i++) await page.getByRole('button', { name: /next month/i }).click();
  return page.locator('button[name="day"]:not(.day-outside)', { hasText: new RegExp(`^${date.getDate()}$`) });
}

export async function selectCourt(page: Page, courtName: string) {
  await page.locator('button', { has: page.locator('h4', { hasText: new RegExp(`^${escapeRe(courtName)}$`) }) }).click();
}

/** Ledger e saldo coincidono? (controllo di coerenza A-28) */
export async function ledgerSum(admin: Actor, userId: string) {
  const rows = await admin.db.select<{ amount_cents: number }>('wallet_ledger', `select=amount_cents&user_id=eq.${userId}`);
  return rows.reduce((s, r) => s + r.amount_cents, 0);
}

/** La card di "I miei Campi" per il giorno e l'orario dati. */
export function historyCard(page: Page, scene: Scene, hours: number) {
  return page.locator('[class*="rounded-[2rem]"]')
    .filter({ hasText: format(scene.date, 'EEEE d MMMM', { locale: it }) })
    .filter({ hasText: rangeLabel(scene.hour, hours) })
    .last();
}

export function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

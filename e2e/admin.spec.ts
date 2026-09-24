import { differenceInCalendarDays, format } from 'date-fns';
import { it as itLocale } from 'date-fns/locale';
import type { Page } from '@playwright/test';
import {
  test, expect, eur, balance, setBalance, openBooking, addMember, clickSlot, createBookingViaRpc,
  setLightsOverride, getSetting, setSetting, ledgerSum, slotStart, type Scene,
} from './helpers';

// Prove lato ADMIN (foglio "Admin" dell'Excel).

async function openAdminDay(page: Page, scene: Scene) {
  await page.goto('/admin/reservations');
  // header: [indietro] [giorno prima] [giorno dopo]
  const next = page.locator('header button').nth(2);
  for (let i = differenceInCalendarDays(scene.date, new Date()); i > 0; i--) await next.click();
  await expect(page.locator('header').getByText(format(scene.date, 'EEE d MMM', { locale: itLocale }), { exact: true })).toBeVisible();
}

/** Cella della griglia admin per campo e ora. */
function adminSlot(page: Page, scene: Scene, hour: number) {
  const column = page.locator('div.flex-1')
    .filter({ has: page.getByRole('heading', { name: scene.court.name, exact: true }) })
    .last();
  return column.locator('div.h-28').nth(hour - 8);
}

async function openMember(page: Page, fullName: string) {
  await page.goto('/admin/wallets');
  await page.getByPlaceholder('Cerca per nome...').fill(fullName.split(' ')[0]);
  await page.getByRole('button', { name: fullName }).click();
}

test.describe('portafogli soci', () => {
  test('correggi saldo: togliere e aggiungere credito (A-04, A-05)', async ({ luigi, admin, scene }) => {
    await setBalance(admin, luigi.id, 1000);
    const page = admin.page;
    await openMember(page, scene.luigiName);

    for (const [direction, expected] of [['Rimuovi credito', 500], ['Aggiungi credito', 1000]] as const) {
      await page.getByRole('button', { name: /Correggi Saldo/ }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: direction }).click();
      await dialog.getByPlaceholder('5,00').fill('5');
      await dialog.getByPlaceholder(/Errore di addebito/).fill('Test automatici: correzione');
      await dialog.getByRole('button', { name: 'Conferma Correzione' }).click();
      await expect(page.getByText('Correzione saldo registrata.').first()).toBeVisible();
      await expect.poll(() => balance(admin, luigi.id)).toBe(expected);
    }
  });

  test('nota obbligatoria per contanti e correzioni (A-06)', async ({ luigi, admin, scene }) => {
    await setBalance(admin, luigi.id, 1000);
    const page = admin.page;
    await openMember(page, scene.luigiName);

    await page.getByRole('button', { name: /Accredita Contanti/ }).click();
    await page.getByRole('dialog').getByPlaceholder('10,00').fill('5');
    await page.getByRole('dialog').getByRole('button', { name: 'Accredita', exact: true }).click();
    await expect(page.getByText('Aggiungi una nota (es. "Contanti consegnati al circolo").')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Annulla' }).click();

    await page.getByRole('button', { name: /Correggi Saldo/ }).click();
    await page.getByRole('dialog').getByPlaceholder('5,00').fill('5');
    await page.getByRole('dialog').getByRole('button', { name: 'Conferma Correzione' }).click();
    await expect(page.getByText('Indica il motivo della correzione.')).toBeVisible();

    expect(await balance(admin, luigi.id)).toBe(1000);
  });

  test('il saldo non va mai sotto zero (A-07)', async ({ luigi, admin, scene }) => {
    await setBalance(admin, luigi.id, 300);
    const page = admin.page;
    await openMember(page, scene.luigiName);
    await page.getByRole('button', { name: /Correggi Saldo/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Rimuovi credito' }).click();
    await dialog.getByPlaceholder('5,00').fill('10');
    await dialog.getByPlaceholder(/Errore di addebito/).fill('Test automatici: oltre il saldo');
    await dialog.getByRole('button', { name: 'Conferma Correzione' }).click();
    await expect(page.getByText(/Saldo insufficiente per/).first()).toBeVisible();
    expect(await balance(admin, luigi.id)).toBe(300);
  });

  test('nessuna tariffa con decorrenza nel passato (A-11)', async ({ admin }) => {
    const page = admin.page;
    await page.goto('/admin/wallets');
    await page.getByRole('tab', { name: /Tariffe/ }).click();
    await page.locator('input[type="datetime-local"]').fill('2020-01-01T10:00');
    await page.getByPlaceholder('3,00').fill('1');
    await page.getByPlaceholder('5,00').fill('2');
    await page.getByRole('button', { name: 'Salva Nuova Tariffa' }).click();
    await expect(page.getByText('La nuova tariffa deve decorrere da adesso o da una data futura.')).toBeVisible();
  });

  test('i conti tornano: saldo = somma dei movimenti (A-28)', async ({ mario, luigi, admin }) => {
    for (const id of [mario.id, luigi.id]) {
      expect(await ledgerSum(admin, id)).toBe(await balance(admin, id));
    }
  });
});

test.describe('luci', () => {
  test('"Sempre luci" su un giorno cambia il prezzo, poi si rimuove (A-14, A-16)', async ({ mario, luigi, admin, scene }) => {
    test.skip(scene.lightsRate === scene.dayRate, 'tariffa luci uguale a quella di giorno');
    await setBalance(admin, mario.id, 2000);
    await setBalance(admin, luigi.id, 2000);
    const page = admin.page;
    try {
      await page.goto('/admin/wallets');
      await page.getByRole('tab', { name: /Luci/ }).click();
      await page.locator('input[type="date"]').fill(format(scene.date, 'yyyy-MM-dd'));
      await page.getByRole('button', { name: /Sempre luci/ }).click();
      await page.getByRole('button', { name: 'Salva Override' }).click();
      await expect(page.getByText('Override luci salvato per quel giorno.')).toBeVisible();

      await openBooking(mario.page, scene);
      await addMember(mario.page, scene.luigiName);
      await clickSlot(mario.page, scene.hour);
      await mario.page.getByRole('button', { name: /Conferma Prenotazione/ }).click();
      await expect(mario.page.getByRole('dialog').getByText('con luci')).toBeVisible();
      await expect(mario.page.getByRole('dialog').getByRole('button', { name: `Conferma e paga ${eur(scene.lightsRate)}` })).toBeVisible();

      const row = page.locator('div', { hasText: format(scene.date, 'd MMMM yyyy', { locale: itLocale }) })
        .filter({ has: page.getByRole('button') }).last();
      await row.getByRole('button').click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Rimuovi' }).click();
      await expect(page.getByText(/Override rimosso/)).toBeVisible();
      expect(await admin.db.select('lights_overrides', `select=day&day=eq.${format(scene.date, 'yyyy-MM-dd')}`)).toHaveLength(0);
    } finally {
      await setLightsOverride(admin, scene.date, null);
    }
  });
});

test.describe('pannello prenotazioni', () => {
  test('prenotazione da pannello: contanti con €, nessun portafoglio toccato (A-17, A-18, A-22)', async ({ mario, luigi, admin, scene }) => {
    await setBalance(admin, mario.id, 2000);
    await setBalance(admin, luigi.id, 2000);
    const adminBefore = await balance(admin, admin.id);
    const page = admin.page;
    await openAdminDay(page, scene);

    await adminSlot(page, scene, scene.hour).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Nuova Prenotazione')).toBeVisible();
    await dialog.locator('input').nth(0).fill('Pannello');
    await dialog.locator('input').nth(1).fill('Contanti');
    await dialog.getByRole('button', { name: 'Crea' }).click();
    await expect(page.getByText('Prenotazione creata!')).toBeVisible();

    const slot = adminSlot(page, scene, scene.hour);
    await expect(slot).toContainText('Pannello Contanti');
    await slot.locator('button[title^="Non pagata"]').click();
    await expect(page.getByText('Ora segnata come pagata.')).toBeVisible();
    await expect(slot.locator('button[title^="Pagata"]')).toBeVisible();

    await slot.hover();
    await slot.locator('button').last().click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm.getByText("L'azione è definitiva.", { exact: true })).toBeVisible();
    await confirm.getByRole('button', { name: 'Sì, elimina' }).click();
    await expect(page.getByText('Prenotazione annullata.', { exact: true })).toBeVisible();

    expect(await balance(admin, mario.id)).toBe(2000);
    expect(await balance(admin, luigi.id)).toBe(2000);
    expect(await balance(admin, admin.id)).toBe(adminBefore);
  });

  test('annullare una sola ora di una prenotazione da 2 (A-21)', async ({ mario, luigi, admin, scene }) => {
    await setBalance(admin, mario.id, 2000);
    await setBalance(admin, luigi.id, 2000);
    await createBookingViaRpc(mario, scene, 2, [luigi.id]);
    const page = admin.page;
    await openAdminDay(page, scene);

    const second = adminSlot(page, scene, scene.hour + 1);
    await second.hover();
    await second.locator('button').last().click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Sì, elimina' }).click();
    await expect(page.getByText(/Chi aveva pagato è stato rimborsato/)).toBeVisible();

    await expect(adminSlot(page, scene, scene.hour).locator('[title="Pagata col portafoglio in app"]')).toBeVisible();
    expect(await balance(admin, mario.id)).toBe(2000 - scene.dayRate);
    expect(await balance(admin, luigi.id)).toBe(2000 - scene.dayRate);
  });

  test('spostare l\'orario di una prenotazione pagata non muove soldi (A-23)', async ({ mario, luigi, admin, scene }) => {
    await setBalance(admin, mario.id, 2000);
    await setBalance(admin, luigi.id, 2000);
    await createBookingViaRpc(mario, scene, 1, [luigi.id]);
    const page = admin.page;
    await openAdminDay(page, scene);

    const slot = adminSlot(page, scene, scene.hour);
    await slot.hover();
    await slot.locator('button').nth(1).click(); // sulle ore pagate col portafoglio: [occhio] [matita] [cestino] (la badge portafoglio non è un bottone)
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Modifica Match')).toBeVisible();
    await dialog.getByRole('combobox').click();
    const newTime = `${String(scene.hour + 1).padStart(2, '0')}:00`;
    await page.getByRole('option', { name: newTime, exact: true }).click();
    await dialog.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByText('Aggiornata!')).toBeVisible();

    const moved = await admin.db.select('reservations',
      `select=id&user_id=eq.${mario.id}&status=neq.cancelled&starts_at=eq.${encodeURIComponent(slotStart(scene.date, scene.hour + 1).toISOString())}`);
    expect(moved).toHaveLength(1);
    expect(await balance(admin, mario.id)).toBe(2000 - scene.dayRate);
    expect(await balance(admin, luigi.id)).toBe(2000 - scene.dayRate);
  });

  test('l\'admin che prenota dall\'app paga come tutti (A-25)', async ({ mario, admin, scene }) => {
    await setBalance(admin, mario.id, 2000);
    await setBalance(admin, admin.id, 2000);
    const page = admin.page;
    try {
      await openBooking(page, scene);
      await addMember(page, scene.marioName);
      await clickSlot(page, scene.hour);
      await page.getByRole('button', { name: /Conferma Prenotazione/ }).click();
      await page.getByRole('dialog').getByRole('button', { name: `Conferma e paga ${eur(scene.dayRate)}` }).click();
      await expect(page.getByRole('dialog').getByText('Prenotazione Confermata!')).toBeVisible();
      expect(await balance(admin, admin.id)).toBe(2000 - scene.dayRate);
      expect(await balance(admin, mario.id)).toBe(2000 - scene.dayRate);
    } finally {
      // pulizia mirata: solo la prenotazione di questo test (mai le altre dell'admin)
      const rows = await admin.db.select<{ id: string }>('reservations',
        `select=id&user_id=eq.${admin.id}&status=neq.cancelled&court_id=eq.${scene.court.id}&starts_at=eq.${encodeURIComponent(slotStart(scene.date, scene.hour).toISOString())}`);
      if (rows.length) await admin.db.rpc('admin_cancel_reservations', { p_reservation_ids: rows.map(r => r.id), p_note: 'Test automatici: pulizia' });
    }
  });
});

test.describe('anagrafica e impostazioni', () => {
  test('un socio con portafoglio non si elimina (A-26)', async ({ mario, admin, scene }) => {
    // Sicurezza: la prova ha senso (ed è innocua) solo se Mario ha movimenti che bloccano l'eliminazione
    const movements = await admin.db.select('wallet_ledger', `select=id&user_id=eq.${mario.id}&limit=1`);
    test.skip(movements.length === 0, 'Mario non ha movimenti: la prova lo eliminerebbe davvero');
    const page = admin.page;
    await page.goto('/admin/users');
    await page.getByPlaceholder('Cerca per nome o cognome...').fill(scene.marioName);
    await page.getByRole('row', { name: new RegExp(scene.marioName) }).getByRole('button').last().click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Conferma Rimozione' }).click();
    await expect(page.getByText(/Non è possibile eliminare questo socio/)).toBeVisible();
    expect(await admin.db.select('profiles', `select=id&id=eq.${mario.id}`)).toHaveLength(1);
  });

  test('revocare e ridare l\'accesso non tocca il portafoglio (A-27)', async ({ mario, admin, scene }) => {
    await setBalance(admin, mario.id, 1500);
    const page = admin.page;
    try {
      await page.goto('/admin/users');
      await page.getByPlaceholder('Cerca per nome o cognome...').fill(scene.marioName);
      const approval = page.getByRole('row', { name: new RegExp(scene.marioName) }).getByRole('switch').first();
      await approval.click();
      await expect(page.getByText('Accesso socio revocato.')).toBeVisible();
      await approval.click();
      await expect(page.getByText('Socio abilitato alle prenotazioni.')).toBeVisible();
      expect(await balance(admin, mario.id)).toBe(1500);
    } finally {
      await admin.db.update('profiles', `id=eq.${mario.id}`, { approved: true });
    }
  });

  test('pagamenti spenti: nessun addebito (A-29)', async ({ mario, admin, scene }) => {
    await setBalance(admin, mario.id, 2000);
    const previous = await getSetting(admin, 'pagamenti_attivi');
    try {
      await setSetting(admin, 'pagamenti_attivi', 'false');
      await openBooking(mario.page, scene);
      await addMember(mario.page, scene.luigiName);
      await clickSlot(mario.page, scene.hour);
      await mario.page.getByRole('button', { name: /Conferma Prenotazione/ }).click();
      const dialog = mario.page.getByRole('dialog');
      await expect(dialog.getByText('Nessun addebito: i pagamenti in app non sono ancora attivi.')).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Conferma prenotazione', exact: true })).toBeEnabled();
    } finally {
      await setSetting(admin, 'pagamenti_attivi', previous ?? 'true');
    }
    expect(await balance(admin, mario.id)).toBe(2000);
  });
});

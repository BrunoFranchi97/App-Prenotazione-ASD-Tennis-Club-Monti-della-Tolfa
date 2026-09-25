import { format, differenceInCalendarDays } from 'date-fns';
import { it as itLocale } from 'date-fns/locale';
import {
  test, expect, eur, balance, setBalance, openBooking, addMember, clickSlot,
  createBookingViaRpc, historyCard, slotLabel,
} from './helpers';

// Ogni test prepara i saldi di cui ha bisogno e lavora su un giorno della settimana
// prossima; prima e dopo ogni test le prenotazioni di prova vengono annullate (vedi
// fixture `scene` in helpers.ts). Gli ID tra parentesi rimandano all'Excel di test manuale.

test('prenotazione: ognuno paga la propria quota (S-15, S-16)', async ({ mario, luigi, admin, scene }) => {
  await setBalance(admin, mario.id, 2000);
  await setBalance(admin, luigi.id, 2000);
  const page = mario.page;

  await openBooking(page, scene);
  await addMember(page, scene.luigiName);
  await clickSlot(page, scene.hour);
  await page.getByRole('button', { name: /Conferma Prenotazione/ }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Conferma prenotazione' })).toBeVisible();
  await expect(dialog.getByText(`${scene.luigiName} paga la sua quota`)).toBeVisible();
  await dialog.getByRole('button', { name: `Conferma e paga ${eur(scene.dayRate)}` }).click();

  const done = page.getByRole('dialog');
  await expect(done.getByText('Prenotazione Confermata!')).toBeVisible();
  await expect(done.getByText('Hai pagato', { exact: true })).toBeVisible();
  await expect(done.getByText(`${scene.luigiName} ha pagato la sua quota`)).toBeVisible();

  expect(await balance(admin, mario.id)).toBe(2000 - scene.dayRate);
  expect(await balance(admin, luigi.id)).toBe(2000 - scene.dayRate);
});

test('prenotazione: chi prenota copre il socio senza credito (S-17)', async ({ mario, luigi, admin, scene }) => {
  await setBalance(admin, mario.id, 2000);
  await setBalance(admin, luigi.id, 0);
  const page = mario.page;

  await openBooking(page, scene);
  await addMember(page, scene.luigiName);
  await clickSlot(page, scene.hour);
  await page.getByRole('button', { name: /Conferma Prenotazione/ }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/non ha credito sufficiente/)).toBeVisible();
  await dialog.getByRole('button', { name: `Conferma e paga ${eur(2 * scene.dayRate)}` }).click();
  await expect(page.getByRole('dialog').getByText(/Hai coperto tu la quota di/)).toBeVisible();

  expect(await balance(admin, mario.id)).toBe(2000 - 2 * scene.dayRate);
  expect(await balance(admin, luigi.id)).toBe(0); // Luigi non viene toccato
});

test('saldo insufficiente: dettaglio, "Ricarica €X" e ritorno alla prenotazione (S-19, S-20, S-21)', async ({ mario, luigi, admin, scene }) => {
  await setBalance(admin, mario.id, 0);
  await setBalance(admin, luigi.id, 2000);
  const page = mario.page;

  await openBooking(page, scene);
  await addMember(page, scene.luigiName);
  await clickSlot(page, scene.hour);
  await page.getByRole('button', { name: /Conferma Prenotazione/ }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(`Saldo insufficiente per ${scene.marioName}`)).toBeVisible();
  await expect(dialog.getByText('Ti mancano')).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Conferma e paga/ })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Conferma prenotazione' })).toBeDisabled();
  await dialog.getByRole('button', { name: `Ricarica ${eur(scene.dayRate)}` }).click();

  await expect(page).toHaveURL(/\/wallet/);
  await expect(page.getByPlaceholder('Altro importo (€)')).toHaveValue((scene.dayRate / 100).toFixed(2).replace('.', ','));
  await expect(page.getByText(/Hai una prenotazione da completare/)).toBeVisible();
  await page.getByRole('button', { name: /Torna a prenotare/ }).click();
  await expect(page).toHaveURL(/\/book$/);

  expect(await balance(admin, mario.id)).toBe(0); // nessun addebito
});

test('modifica: da 2 ore a 1 il socio riceve un rimborso, senza ambiguità (S-27)', async ({ mario, luigi, admin, scene }) => {
  await setBalance(admin, mario.id, 2000);
  await setBalance(admin, luigi.id, 2000);
  await createBookingViaRpc(mario, scene, 2, [luigi.id]);
  const page = mario.page;

  await page.goto('/history');
  await historyCard(page, scene, 2).getByRole('button', { name: /Modifica/ }).click();
  await expect(page).toHaveURL(/\/edit-booking/);
  await page.getByRole('button', { name: new RegExp(`^${slotLabel(scene.hour + 1)}`) }).click();
  await page.getByRole('button', { name: /Salva Modifiche/ }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Conferma modifica' })).toBeVisible();
  await expect(dialog.getByText(/non paghi nulla: ricevi un rimborso/)).toBeVisible();
  await expect(dialog.getByText('Rimborsi', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Conferma e paga/ })).toHaveCount(0);
  await dialog.getByRole('button', { name: `Conferma e ricevi ${eur(scene.dayRate)}` }).click();

  await expect(page.getByText(`Prenotazione aggiornata: ${eur(scene.dayRate)} rimborsati sul tuo saldo.`)).toBeVisible();
  expect(await balance(admin, mario.id)).toBe(2000 - scene.dayRate);
  expect(await balance(admin, luigi.id)).toBe(2000 - scene.dayRate);
});

test('disdetta del socio: rimborso mostrato prima e dopo, anche agli altri (S-31, S-32)', async ({ mario, luigi, admin, scene }) => {
  await setBalance(admin, mario.id, 2000);
  await setBalance(admin, luigi.id, 2000);
  await createBookingViaRpc(mario, scene, 1, [luigi.id]);
  const page = mario.page;

  await page.goto('/history');
  await historyCard(page, scene, 1).getByRole('button').last().click();

  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByText('Ti verranno rimborsati sul saldo')).toBeVisible();
  await expect(dialog.getByText(`+${eur(scene.dayRate)}`)).toBeVisible();
  await dialog.getByRole('button', { name: 'Elimina' }).click();

  await expect(page.getByText(
    `Prenotazione annullata. ${eur(scene.dayRate)} rimborsati sul tuo saldo. Anche gli altri partecipanti sono stati rimborsati.`,
  )).toBeVisible();
  expect(await balance(admin, mario.id)).toBe(2000);
  expect(await balance(admin, luigi.id)).toBe(2000);
});

test('pannello admin: ora pagata col portafoglio, annullamento con rimborso (A-19, A-20)', async ({ mario, luigi, admin, scene }) => {
  await setBalance(admin, mario.id, 2000);
  await setBalance(admin, luigi.id, 2000);
  await createBookingViaRpc(mario, scene, 1, [luigi.id]);
  const page = admin.page;

  await page.goto('/admin/reservations');
  const dateLabel = format(scene.date, 'EEE d MMM', { locale: itLocale });
  // header: [indietro] [giorno prima] [giorno dopo]
  const next = page.locator('header button').nth(2);
  for (let i = differenceInCalendarDays(scene.date, new Date()); i > 0; i--) await next.click();
  await expect(page.locator('header').getByText(dateLabel, { exact: true })).toBeVisible();

  const slot = page.locator('div.h-28', { hasText: scene.marioName }).first();
  await expect(slot.locator('[title="Pagata col portafoglio in app"]')).toBeVisible();
  await slot.hover();
  await slot.locator('button').last().click();

  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByText(/verrà rimborsato/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Sì, elimina' }).click();
  await expect(page.getByText(/Chi aveva pagato è stato rimborsato sul portafoglio/)).toBeVisible();

  expect(await balance(admin, mario.id)).toBe(2000);
  expect(await balance(admin, luigi.id)).toBe(2000);
});

test('admin: accredito contanti visibile nello storico (A-03)', async ({ luigi, admin, scene }) => {
  await setBalance(admin, luigi.id, 1000);
  const page = admin.page;

  await page.goto('/admin/wallets');
  await page.getByPlaceholder('Cerca per nome...').fill(scene.luigiName.split(' ')[0]);
  await page.getByRole('button', { name: scene.luigiName }).click();
  await page.getByRole('button', { name: /Accredita Contanti/ }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('10,00').fill('5');
  await dialog.getByPlaceholder(/Contanti consegnati/).fill('Test automatici: contanti');
  await dialog.getByRole('button', { name: 'Accredita', exact: true }).click();

  await expect.poll(() => balance(admin, luigi.id)).toBe(1500);
  await expect(page.getByText('Ricarica in contanti').first()).toBeVisible();
});

test('regola invariata: il socio non seleziona più di 2 ore (S-25)', async ({ mario, scene }) => {
  const page = mario.page;
  await openBooking(page, scene);
  await clickSlot(page, scene.hour);
  await clickSlot(page, scene.hour + 1);
  // la terza ora (se libera) viene ignorata
  const third = page.getByRole('button', { name: new RegExp(`^${slotLabel(scene.hour + 2)}`) });
  if (await third.isEnabled()) await third.click();
  await expect(page.getByText('Selezionati: 2 / max 2 ore')).toBeVisible();
});

import { addDays, format } from 'date-fns';
import { it as itLocale } from 'date-fns/locale';
import {
  test, expect, eur, balance, setBalance, openBooking, addMember, addGuest, removeParticipant, clickSlot,
  createBookingViaRpc, historyCard, slotLabel, findFreeSlot, pickDate, selectCourt, setLightsOverride,
} from './helpers';

// Prove lato SOCIO (foglio "Socio" dell'Excel). Stesse regole di wallet.spec.ts: giorno
// della settimana prossima, prenotazioni di prova annullate prima e dopo ogni test.

const confirmBtn = /Conferma Prenotazione/;

test.describe('portafoglio', () => {
  test('riquadro in dashboard e pagina Portafoglio (S-01, S-02)', async ({ mario, admin }) => {
    await setBalance(admin, mario.id, 1234);
    const page = mario.page;
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Il mio Portafoglio' })).toBeVisible();
    await expect(page.getByText(`Saldo disponibile: ${eur(1234)}`)).toBeVisible();
    await page.getByRole('button', { name: /Vai al Portafoglio/ }).click();

    await expect(page).toHaveURL(/\/wallet$/);
    await expect(page.getByText('Saldo disponibile', { exact: true })).toBeVisible();
    await expect(page.getByText(eur(1234), { exact: true })).toBeVisible();
    await expect(page.getByText('Movimenti recenti')).toBeVisible();
    await expect(page.getByPlaceholder('Altro importo (€)')).toBeVisible();
  });

  test('importo di ricarica non valido (S-06)', async ({ mario }) => {
    const page = mario.page;
    await page.goto('/wallet');
    for (const value of ['0', 'abc']) {
      await page.getByPlaceholder('Altro importo (€)').fill(value);
      await page.getByRole('button', { name: 'Ricarica', exact: true }).click();
      await expect(page.getByText('Inserisci un importo valido.').first()).toBeVisible();
      await expect(page).toHaveURL(/\/wallet$/);
    }
  });
});

test.describe('prenotare', () => {
  test('numero di partecipanti richiesto per tipo (S-13)', async ({ mario, scene }) => {
    const page = mario.page;
    await openBooking(page, scene, 'Singolare');
    await clickSlot(page, scene.hour);
    await expect(page.getByText('Seleziona 2 partecipanti per continuare.')).toBeVisible();
    await expect(page.getByRole('button', { name: confirmBtn })).toBeDisabled();

    await page.getByRole('button', { name: 'Doppio', exact: true }).click();
    await addMember(page, scene.luigiName);
    await expect(page.getByText('Seleziona 4 partecipanti per continuare.')).toBeVisible();
    await expect(page.getByRole('button', { name: confirmBtn })).toBeDisabled();
  });

  test('il prenotante è fisso tra i partecipanti (S-10, S-11)', async ({ mario, scene }) => {
    const page = mario.page;
    await openBooking(page, scene);
    const me = page.locator('div.rounded-full', { hasText: scene.marioName });
    await expect(me).toBeVisible();
    await expect(me.getByRole('button')).toHaveCount(0); // nessuna crocetta

    await page.getByRole('button', { name: /Cerca o seleziona un socio/ }).click();
    await expect(page.getByRole('option', { name: new RegExp(scene.luigiName) })).toBeVisible();
    await expect(page.getByRole('option', { name: new RegExp(scene.marioName) })).toHaveCount(0);
  });

  test('lezione: serve il maestro, pagano solo gli allievi (S-14)', async ({ mario, admin, scene }) => {
    await setBalance(admin, mario.id, 2000);
    const page = mario.page;
    await openBooking(page, scene, 'Lezione');
    await clickSlot(page, scene.hour);
    await expect(page.getByText('Indica il nome del maestro per continuare.')).toBeVisible();
    await expect(page.getByRole('button', { name: confirmBtn })).toBeDisabled();

    await page.getByPlaceholder('Nome e cognome del maestro').fill('Maestro Test');
    await page.getByRole('button', { name: confirmBtn }).click();
    await page.getByRole('dialog').getByRole('button', { name: `Conferma e paga ${eur(scene.dayRate)}` }).click();
    await expect(page.getByRole('dialog').getByText('Prenotazione Confermata!')).toBeVisible();
    expect(await balance(admin, mario.id)).toBe(2000 - scene.dayRate);
  });

  test('ospiti e "Da definire" li paga chi prenota (S-12, S-18)', async ({ mario, luigi, admin, scene }) => {
    await setBalance(admin, mario.id, 3000);
    await setBalance(admin, luigi.id, 2000);
    const page = mario.page;
    await openBooking(page, scene, 'Doppio');
    await addMember(page, scene.luigiName);
    await addGuest(page, 'Paolo Ospite');
    await page.getByRole('button', { name: 'Da definire', exact: true }).click();
    await expect(page.locator('div.rounded-full', { hasText: 'Paolo Ospite' })).toContainText('Ospite');
    await expect(page.locator('div.rounded-full', { hasText: 'Da definire' })).toBeVisible();

    await clickSlot(page, scene.hour);
    await page.getByRole('button', { name: confirmBtn }).click();
    const dialog = page.getByRole('dialog');
    // la cifra in evidenza è quanto paga Mario, scomposta: sua quota + ospite + posto da definire
    await expect(dialog.getByText('Paghi tu', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Ospite: Paolo Ospite')).toBeVisible();
    await expect(dialog.getByText('Giocatore da definire')).toBeVisible();
    await expect(dialog.getByText(`${scene.luigiName} paga la sua quota`)).toBeVisible();
    await dialog.getByRole('button', { name: `Conferma e paga ${eur(3 * scene.dayRate)}` }).click();
    await expect(page.getByRole('dialog').getByText('Prenotazione Confermata!')).toBeVisible();

    expect(await balance(admin, mario.id)).toBe(3000 - 3 * scene.dayRate);
    expect(await balance(admin, luigi.id)).toBe(2000 - scene.dayRate);
  });

  test('ora con le luci: dettaglio orario e tariffa luci (S-22)', async ({ mario, luigi, admin, scene }) => {
    test.skip(scene.lightsRate === scene.dayRate, 'tariffa luci uguale a quella di giorno: niente da distinguere');
    await setBalance(admin, mario.id, 2000);
    await setBalance(admin, luigi.id, 2000);
    await setLightsOverride(admin, scene.date, true); // "Sempre luci": ora con luci anche a mezzogiorno
    try {
      const page = mario.page;
      await openBooking(page, scene);
      await addMember(page, scene.luigiName);
      await clickSlot(page, scene.hour);
      await page.getByRole('button', { name: confirmBtn }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('Dettaglio orario')).toBeVisible();
      await expect(dialog.getByText('con luci')).toBeVisible();
      await expect(dialog.getByRole('button', { name: `Conferma e paga ${eur(scene.lightsRate)}` })).toBeVisible();
    } finally {
      await setLightsOverride(admin, scene.date, null);
    }
  });

  test('slot preso da un altro mentre guardavo il riepilogo (S-24)', async ({ mario, luigi, admin, scene }) => {
    await setBalance(admin, mario.id, 2000);
    await setBalance(admin, luigi.id, 2000);
    // Entrambi aprono il riepilogo dello stesso slot, ciascuno con l'altro come partecipante
    for (const [actor, other] of [[mario, scene.luigiName], [luigi, scene.marioName]] as const) {
      await openBooking(actor.page, scene);
      await addMember(actor.page, other);
      await clickSlot(actor.page, scene.hour);
      await actor.page.getByRole('button', { name: confirmBtn }).click();
      await expect(actor.page.getByRole('dialog').getByRole('button', { name: /Conferma e paga/ })).toBeVisible();
    }
    await mario.page.getByRole('dialog').getByRole('button', { name: /Conferma e paga/ }).click();
    await expect(mario.page.getByRole('dialog').getByText('Prenotazione Confermata!')).toBeVisible();

    await luigi.page.getByRole('dialog').getByRole('button', { name: /Conferma e paga/ }).click();
    await expect(luigi.page.getByText(/appena prenotati da qualcun altro/)).toBeVisible();

    // Luigi paga solo la quota della prenotazione di Mario, nulla per il tentativo fallito
    expect(await balance(admin, mario.id)).toBe(2000 - scene.dayRate);
    expect(await balance(admin, luigi.id)).toBe(2000 - scene.dayRate);
  });
});

test.describe('regole invariate', () => {
  test('massimo 2 prenotazioni attive a settimana (S-25)', async ({ mario, luigi, admin, scene }) => {
    await setBalance(admin, mario.id, 5000);
    await setBalance(admin, luigi.id, 5000);
    for (const offset of [1, 2]) {
      const day = addDays(scene.date, offset);
      const slot = await findFreeSlot(admin, day);
      await createBookingViaRpc(mario, scene, 1, [luigi.id], { date: day, hour: slot.hour, courtId: slot.courtId });
    }
    const page = mario.page;
    await openBooking(page, scene);
    await addMember(page, scene.luigiName);
    await clickSlot(page, scene.hour);
    await page.getByRole('button', { name: confirmBtn }).click();
    await expect(page.getByText(/Hai già 2 prenotazioni attive in questo ciclo/)).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('non si prenota oltre 14 giorni (S-25)', async ({ mario }) => {
    const page = mario.page;
    await page.goto('/book');
    await expect(await pickDate(page, addDays(new Date(), 15))).toBeDisabled();
  });

  test('un socio non entra nell\'area admin (S-40)', async ({ mario }) => {
    await mario.page.goto('/admin/wallets');
    await expect(mario.page).toHaveURL(/\/dashboard$/);
  });
});

test.describe('modifica', () => {
  test('allungare di un\'ora: si paga solo l\'ora nuova (S-26)', async ({ mario, luigi, admin, scene }) => {
    await setBalance(admin, mario.id, 2000);
    await setBalance(admin, luigi.id, 2000);
    await createBookingViaRpc(mario, scene, 1, [luigi.id]);
    const page = mario.page;
    await page.goto('/history');
    await historyCard(page, scene, 1).getByRole('button', { name: /Modifica/ }).click();
    await page.getByRole('button', { name: new RegExp(`^${slotLabel(scene.hour + 1)}`) }).click();
    await page.getByRole('button', { name: /Salva Modifiche/ }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Conferma modifica' })).toBeVisible();
    await expect(dialog.getByText('Rimborsi', { exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: `Conferma e paga ${eur(scene.dayRate)}` }).click();
    await expect(page).toHaveURL(/\/history/);
    expect(await balance(admin, mario.id)).toBe(2000 - 2 * scene.dayRate);
    expect(await balance(admin, luigi.id)).toBe(2000 - 2 * scene.dayRate);
  });

  test('sostituire un socio con un ospite: rimborso a chi esce (S-28)', async ({ mario, luigi, admin, scene }) => {
    await setBalance(admin, mario.id, 2000);
    await setBalance(admin, luigi.id, 2000);
    await createBookingViaRpc(mario, scene, 1, [luigi.id]);
    const page = mario.page;
    await page.goto('/history');
    await historyCard(page, scene, 1).getByRole('button', { name: /Modifica/ }).click();
    await removeParticipant(page, scene.luigiName);
    await addGuest(page, 'Carlo Ospite');
    await page.getByRole('button', { name: /Salva Modifiche/ }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(`Rimborso a ${scene.luigiName}`)).toBeVisible();
    await expect(dialog.getByText(`+${eur(scene.dayRate)}`)).toBeVisible();
    await dialog.getByRole('button', { name: `Conferma e paga ${eur(scene.dayRate)}` }).click();
    await expect(page).toHaveURL(/\/history/);
    expect(await balance(admin, mario.id)).toBe(2000 - 2 * scene.dayRate);
    expect(await balance(admin, luigi.id)).toBe(2000);
  });

  test('modifica senza differenze di costo (S-29)', async ({ mario, luigi, admin, scene }) => {
    await setBalance(admin, mario.id, 3000);
    await setBalance(admin, luigi.id, 2000);
    await createBookingViaRpc(mario, scene, 1, [luigi.id], { type: 'doppio', guests: ['Da definire', 'Paolo Ospite'] });
    const page = mario.page;
    await page.goto('/history');
    await historyCard(page, scene, 1).getByRole('button', { name: /Modifica/ }).click();
    await removeParticipant(page, 'Da definire');
    await addGuest(page, 'Carlo Ospite');
    await page.getByRole('button', { name: /Salva Modifiche/ }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Il costo non cambia: nessun addebito e nessun rimborso.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Conferma modifica', exact: true }).click();
    await expect(page).toHaveURL(/\/history/);
    expect(await balance(admin, mario.id)).toBe(3000 - 3 * scene.dayRate);
  });

  test('torna la quota che avevo coperto (S-30)', async ({ mario, luigi, admin, scene }) => {
    await setBalance(admin, mario.id, 2000);
    await setBalance(admin, luigi.id, 0); // Mario copre Luigi
    await createBookingViaRpc(mario, scene, 1, [luigi.id]);
    expect(await balance(admin, mario.id)).toBe(2000 - 2 * scene.dayRate);
    const page = mario.page;
    await page.goto('/history');
    await historyCard(page, scene, 1).getByRole('button', { name: /Modifica/ }).click();
    await removeParticipant(page, scene.luigiName);
    await addGuest(page, 'Carlo Ospite');
    await page.getByRole('button', { name: /Salva Modifiche/ }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(`Ti torna la quota che avevi coperto per ${scene.luigiName}`)).toBeVisible();
    await dialog.getByRole('button', { name: 'Conferma modifica', exact: true }).click();
    await expect(page).toHaveURL(/\/history/);
    expect(await balance(admin, mario.id)).toBe(2000 - 2 * scene.dayRate);
    expect(await balance(admin, luigi.id)).toBe(0);
  });
});

test.describe('conto terzi', () => {
  test('prenotare per un socio senza giocare, max 1 a settimana (S-34, S-35)', async ({ mario, luigi, admin, scene }) => {
    await setBalance(admin, mario.id, 2000);
    await setBalance(admin, luigi.id, 2000);
    const page = mario.page;
    const open = async () => {
      await page.goto('/book-for-third-party');
      await expect(page.getByRole('heading', { name: 'Prenota per un Socio' })).toBeVisible();
      await (await pickDate(page, scene.date)).click();
      await expect(page.getByText(format(scene.date, 'EEEE d MMMM', { locale: itLocale }), { exact: true })).toBeVisible();
      await selectCourt(page, scene.court.name);
      await page.getByRole('button', { name: 'Singolare', exact: true }).click();
    };

    await open();
    await expect(page.locator('div.rounded-full', { hasText: scene.marioName })).toHaveCount(0); // il prenotante non gioca
    await addMember(page, scene.luigiName);
    await addGuest(page, 'Paolo Ospite');
    await clickSlot(page, scene.hour);
    await page.getByRole('button', { name: confirmBtn }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(`${scene.luigiName} paga la sua quota`)).toBeVisible();
    await dialog.getByRole('button', { name: `Conferma e paga ${eur(scene.dayRate)}` }).click();
    const done = page.getByRole('dialog');
    await expect(done.getByText('Prenotazione Confermata!')).toBeVisible();
    await expect(done.getByText(scene.luigiName, { exact: true })).toBeVisible(); // "Per il socio"
    expect(await balance(admin, mario.id)).toBe(2000 - scene.dayRate); // quota dell'ospite
    expect(await balance(admin, luigi.id)).toBe(2000 - scene.dayRate);

    // seconda prenotazione per terzi nella stessa settimana: bloccata
    await open();
    await addMember(page, scene.luigiName);
    await addGuest(page, 'Paolo Ospite');
    await clickSlot(page, scene.hour + 1);
    await page.getByRole('button', { name: confirmBtn }).click();
    await expect(page.getByText('Puoi effettuare al massimo 1 prenotazione per conto di un altro socio a settimana.')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

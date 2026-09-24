# Test automatici (Playwright)

Aprono l'app in Microsoft Edge, entrano come socio o admin, cliccano come una persona e
controllano testi, importi e saldi. Girano **solo sullo staging**: se `.env.local` non
punta al progetto `pihibucdmdvmexxwxvws` si fermano subito.

## Preparazione (una volta sola)

1. Su staging devono esistere due soci approvati (Mario Prova, Luigi Prova) e un admin.
2. Copia `.env.e2e.example` in `.env.e2e.local` e inserisci email e password.
3. Su staging: `pagamenti_attivi = true` e una tariffa di giorno maggiore di €0.

## Lanciarli

```
pnpm test:e2e            # tutti i test (avvia l'app da solo se non è già aperta)
pnpm test:e2e --headed   # guardando il browser mentre lavora
pnpm test:e2e:report     # report con screenshot dei test falliti
```

## Cosa fanno ai dati

- Lavorano su un giorno della **settimana prossima**, in orari di pieno giorno.
- Prima e dopo ogni test **annullano** (con rimborso) tutte le prenotazioni future di Mario e Luigi.
- Portano i saldi di Mario e Luigi ai valori che servono con "Correggi Saldo": nello
  storico compaiono movimenti con nota "Test automatici". Lo storico non si cancella, per scelta.

Le chiamate al database partono dal browser e non da Node: la rete aziendale ispeziona
le connessioni cifrate e Node ne rifiuta il certificato, Edge invece lo accetta.

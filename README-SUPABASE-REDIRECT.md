# Configurazione Redirect URL per Email Verification

## Problema
Quando gli utenti in produzione cliccano sul link di verifica email, vengono reindirizzati a `localhost:3000` invece dell'URL di produzione, causando un errore `ERR_CONNECTION_REFUSED`.

## Soluzione
Devi configurare i Redirect URL nel tuo progetto Supabase per includere sia l'URL di sviluppo che di produzione.

## Istruzioni

### 1. Accedi a Supabase Dashboard
- Vai su [supabase.com](https://supabase.com)
- Accedi al tuo account
- Seleziona il progetto: **nrnyfuqyeqcegnpoetrd**

### 2. Configura Authentication Redirect URLs
1. Nel menu laterale, clicca su **Authentication**
2. Clicca sulla tab **URL Configuration**
3. Nella sezione **Redirect URLs**, aggiungi i seguenti URL:

**Per sviluppo locale:**
```
http://localhost:8080/dashboard
http://localhost:8080/auth/verify
```

**Per produzione (sostituisci con il tuo URL effettivo):**
```
https://dyad-generated-app.vercel.app/dashboard
https://dyad-generated-app.vercel.app/auth/verify
```

### 3. Configura Site URL
Nella stessa sezione **URL Configuration**:
- **Site URL**: Imposta l'URL di produzione (es. `https://dyad-generated-app.vercel.app`)
- **Additional Redirect URLs**: Aggiungi gli URL sopra elencati

### 4. Salva le modifiche
Clicca su **Save** per applicare le modifiche.

### 5. Verifica la configurazione
Per verificare che la configurazione sia corretta:

1. Clicca su **Settings** nel menu laterale
2. Seleziona **API**
3. Controlla che **Project URL** punti all'URL di produzione

### 6. Email Templates (Opzionale)
Se hai personalizzato i template email:
1. Vai su **Authentication** → **Email Templates**
2. Assicurati che il template di conferma usi `{{ .ConfirmationURL }}` invece di URL hardcoded

## Troubleshooting

### Se i link puntano ancora a localhost:3000
1. Controlla che **Site URL** non sia impostato a `http://localhost:3000`
2. Verifica che tutti i Redirect URL siano corretti
3. Pulisci la cache del browser e riprova

### Per testare in sviluppo
1. Assicurati che l'app sia in esecuzione su `localhost:8080`
2. Usa il link di verifica inviato all'email di test
3. Verifica che il reindirizzamento avvenga a `localhost:8080/dashboard`

### Monitoraggio
Dopo la configurazione, monitora i log di autenticazione in Supabase:
1. Vai su **Authentication** → **Logs**
2. Filtra per evento `signup` o `login`
3. Verifica che i redirect URL siano corretti

## Note Importanti
- **Non usare trailing slash** negli URL (es. `/dashboard` non `/dashboard/`)
- **Usa HTTPS** per gli URL di produzione
- **Ricordati** di aggiornare gli URL se cambi dominio o port
- **Testa sempre** in ambiente di sviluppo prima di passare in produzione

## Supporto
Se incontri problemi:
1. Controlla i log della console del browser
2. Verifica i log di Supabase
3. Assicurati che tutte le configurazioni siano state salvate
-- Soglia "saldo basso" (docs/piano-wallet-pagamenti.md §2.1): prevista dal piano originale
-- ma mai effettivamente inserita in app_settings. Serve ora alla card "Il mio Portafoglio"
-- in dashboard per il gradiente colore (verde -> arancione col saldo che si avvicina a 0),
-- così la soglia resta un unico valore configurabile dall'admin invece di un numero fisso
-- nel frontend.
INSERT INTO public.app_settings (key, value) VALUES
  ('saldo_basso_soglia_cents', '500')
ON CONFLICT (key) DO NOTHING;

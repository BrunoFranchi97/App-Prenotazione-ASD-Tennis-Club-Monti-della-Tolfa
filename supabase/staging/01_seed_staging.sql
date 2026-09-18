-- SEED del progetto di STAGING (pihibucdmdvmexxwxvws). NON eseguire in produzione.
-- I 4 campi come in produzione (stessi id, nomi e superfici), per provare l'app in anteprima.
-- Eseguire dopo 00_base_schema.sql e le migration.

INSERT INTO public.courts (id, name, surface, is_active) VALUES
  (1, 'Cemento 3', 'cemento', true),
  (2, 'Cemento 4', 'cemento', true),
  (3, 'Erba sintetica', 'erba_sintetica', true),
  (4, 'Terra sintetica', 'terra_sintetica', true)
ON CONFLICT (id) DO NOTHING;

SELECT setval('public.courts_id_seq', (SELECT MAX(id) FROM public.courts));

-- Pagamenti spenti finché non si decide di provarli (vedi docs/wallet-staging.md §8)
UPDATE public.app_settings SET value = 'false' WHERE key = 'pagamenti_attivi';

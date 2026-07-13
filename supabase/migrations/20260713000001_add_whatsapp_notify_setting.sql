-- Interruttore per le notifiche WhatsApp di cancellazione (cancellation-notify).
-- Disattivate di default: per riattivarle basta
-- UPDATE public.app_settings SET value = 'true' WHERE key = 'notifiche_whatsapp_disdetta_attive';
INSERT INTO public.app_settings (key, value)
VALUES ('notifiche_whatsapp_disdetta_attive', 'false')
ON CONFLICT (key) DO NOTHING;

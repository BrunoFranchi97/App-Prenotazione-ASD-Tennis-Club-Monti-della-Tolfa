import { Tournament } from '@/types/supabase';

/**
 * Calcola se il torneo è effettivamente in corso.
 * - override_mode 'on'  -> sempre attivo (forzato dall'admin)
 * - override_mode 'off' -> sempre disattivo (forzato dall'admin)
 * - override_mode 'auto' -> attivo se la data odierna rientra tra start_date e end_date
 */
export const isTorneoAttivo = (tournament: Tournament | null): boolean => {
  if (!tournament) return false;

  if (tournament.override_mode === 'on') return true;
  if (tournament.override_mode === 'off') return false;

  // auto: in base alle date
  if (!tournament.start_date || !tournament.end_date) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(tournament.start_date + 'T00:00:00');
  const end = new Date(tournament.end_date + 'T00:00:00');

  return today.getTime() >= start.getTime() && today.getTime() <= end.getTime();
};

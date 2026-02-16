import { startOfWeek, endOfWeek, isWithinInterval, parseISO, isSameDay, isAfter, startOfDay } from 'date-fns';
import { it } from 'date-fns/locale';
import type { Reservation } from '@/types/supabase';

export interface BookingLimitsStatus {
  weeklyCount: number;
  weeklyMax: number;
  dailyCount: number;
  dailyMax: number;
  durationMax: number;
  canBookMoreThisWeek: boolean;
  canBookMoreToday: boolean;
}

/**
 * Calcola lo stato dei limiti di prenotazione per un utente in una specifica data.
 * Vengono considerate solo le prenotazioni future (attive).
 */
export const getBookingLimitsStatus = (
  userReservations: Reservation[],
  targetDate: Date
): BookingLimitsStatus => {
  const now = new Date();
  
  // 1. Filtra solo le prenotazioni "attive" (future e non annullate)
  const activeReservations = userReservations.filter(res => {
    const end = parseISO(res.ends_at);
    return res.status !== 'cancelled' && isAfter(end, now);
  });

  // Raggruppiamo le prenotazioni per blocchi orari per contare i "match" e non le singole ore
  // Un blocco è un insieme di ore consecutive nello stesso campo
  const groupedReservations = groupReservationsIntoBlocks(activeReservations);

  // 2. Calcola limiti settimanali (Lunedì - Domenica)
  const weekStart = startOfWeek(targetDate, { locale: it, weekStartsOn: 1 });
  const weekEnd = endOfWeek(targetDate, { locale: it, weekStartsOn: 1 });
  
  const weeklyMatches = groupedReservations.filter(block => {
    const blockDate = block.date;
    return isWithinInterval(blockDate, { start: weekStart, end: weekEnd });
  });

  // 3. Calcola limiti giornalieri
  const dailyMatches = groupedReservations.filter(block => {
    return isSameDay(block.date, targetDate);
  });

  return {
    weeklyCount: weeklyMatches.length,
    weeklyMax: 2,
    dailyCount: dailyMatches.length,
    dailyMax: 1,
    durationMax: 3,
    canBookMoreThisWeek: weeklyMatches.length < 2,
    canBookMoreToday: dailyMatches.length < 1
  };
};

// Funzione interna per raggruppare le singole ore in blocchi di prenotazione (match)
function groupReservationsIntoBlocks(reservations: Reservation[]) {
  if (reservations.length === 0) return [];

  const sorted = [...reservations].sort((a, b) => 
    parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime()
  );

  const blocks: { date: Date; courtId: number }[] = [];
  const processedIds = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    if (processedIds.has(sorted[i].id)) continue;

    const current = sorted[i];
    const currentDate = startOfDay(parseISO(current.starts_at));
    blocks.push({ date: currentDate, courtId: current.court_id });
    processedIds.add(current.id);

    // Cerchiamo prenotazioni consecutive per "chiudere" il blocco
    let lastEnd = parseISO(current.ends_at);
    for (let j = i + 1; j < sorted.length; j++) {
      const next = sorted[j];
      const nextStart = parseISO(next.starts_at);
      
      if (next.court_id === current.court_id && 
          Math.abs(nextStart.getTime() - lastEnd.getTime()) < 1000) {
        processedIds.add(next.id);
        lastEnd = parseISO(next.ends_at);
      }
    }
  }

  return blocks;
}
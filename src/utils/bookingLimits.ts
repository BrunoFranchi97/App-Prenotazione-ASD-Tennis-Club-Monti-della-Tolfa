import { startOfWeek, endOfWeek, isWithinInterval, parseISO, startOfDay, addDays } from 'date-fns';
import { it } from 'date-fns/locale';
import type { Reservation } from '@/types/supabase';

export interface BookingLimitsStatus {
  weeklyCount: number;
  weeklyMax: number;
  durationMax: number;
  canBookMoreThisWeek: boolean;
  nextAvailableDate?: Date;
}

export const getBookingLimitsStatus = (
  userReservations: Reservation[],
  targetDate: Date
): BookingLimitsStatus => {
  // 1. Filtra le prenotazioni non annullate (incluse quelle già passate nella settimana target)
  // NOTA: non si filtra per "future" perché le prenotazioni già effettuate questa settimana
  // devono comunque concorrere al conteggio del limite settimanale
  const activeReservations = userReservations.filter(res => {
    return res.status !== 'cancelled';
  });

  const groupedReservations = groupReservationsIntoBlocks(activeReservations);

  // 2. Calcola limiti settimanali (Lunedì - Domenica) della data TARGET selezionata
  const weekStart = startOfWeek(targetDate, { locale: it, weekStartsOn: 1 });
  const weekEnd = endOfWeek(targetDate, { locale: it, weekStartsOn: 1 });
  
  const weeklyMatches = groupedReservations.filter(block => {
    const blockDate = startOfDay(block.date);
    return isWithinInterval(blockDate, { start: weekStart, end: weekEnd });
  });

  const canBookWeekly = weeklyMatches.length < 2;

  // Calcola la prossima data di sblocco (lunedì della settimana successiva)
  let nextAvailableDate: Date | undefined;
  if (!canBookWeekly) {
    nextAvailableDate = addDays(weekEnd, 1); // lunedì della settimana successiva
  }

  return {
    weeklyCount: weeklyMatches.length,
    weeklyMax: 2,
    durationMax: 3,
    canBookMoreThisWeek: canBookWeekly,
    nextAvailableDate
  };
};

function groupReservationsIntoBlocks(reservations: Reservation[]) {
  if (reservations.length === 0) return [];

  const sorted = [...reservations].sort((a, b) => 
    parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime()
  );

  const blocks: { date: Date; courtId: number; endTime: Date }[] = [];
  const processedIds = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    if (processedIds.has(sorted[i].id)) continue;

    const current = sorted[i];
    const currentDate = parseISO(current.starts_at);
    let lastEnd = parseISO(current.ends_at);
    
    processedIds.add(current.id);

    for (let j = i + 1; j < sorted.length; j++) {
      const next = sorted[j];
      const nextStart = parseISO(next.starts_at);
      
      if (next.court_id === current.court_id && 
          Math.abs(nextStart.getTime() - lastEnd.getTime()) < 1000) {
        processedIds.add(next.id);
        lastEnd = parseISO(next.ends_at);
      }
    }

    blocks.push({ date: currentDate, courtId: current.court_id, endTime: lastEnd });
  }

  return blocks;
}
import { startOfWeek, endOfWeek, isWithinInterval, parseISO, isAfter, startOfDay } from 'date-fns';
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
  const now = new Date();
  
  // 1. Filtra solo le prenotazioni "attive" (future e non annullate)
  const activeReservations = userReservations.filter(res => {
    const end = parseISO(res.ends_at);
    return res.status !== 'cancelled' && isAfter(end, now);
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

  // Calcola la prossima data di sblocco (solo se il settimanale è pieno)
  let nextAvailableDate: Date | undefined;
  if (!canBookWeekly) {
    const sortedMatches = [...weeklyMatches].sort((a, b) => a.endTime.getTime() - b.endTime.getTime());
    if (sortedMatches.length > 0) {
      nextAvailableDate = sortedMatches[0].endTime;
    }
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
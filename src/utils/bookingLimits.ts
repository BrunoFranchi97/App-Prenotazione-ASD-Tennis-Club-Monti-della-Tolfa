import { startOfWeek, endOfWeek, isWithinInterval, parseISO, startOfDay, addDays } from 'date-fns';
import { it } from 'date-fns/locale';
import type { Reservation, MemberType } from '@/types/supabase';

export interface BookingLimitsStatus {
  weeklyCount: number;
  weeklyMax: number;
  durationMax: number;
  canBookMoreThisWeek: boolean;
  nextAvailableDate?: Date;
}

export const getBookingLimitsStatus = (
  userReservations: Reservation[],
  targetDate: Date,
  memberType: MemberType = 'socio_effettivo'
): BookingLimitsStatus => {
  const weeklyMax = memberType === 'frequentatore_occasionale' ? 1 : 2;
  // 1. Filtra le prenotazioni non annullate
  const activeReservations = userReservations.filter(res => {
    return res.status !== 'cancelled';
  });

  const groupedReservations = groupReservationsIntoBlocks(activeReservations);

  // 2. Calcola limiti settimanali (Lunedì - Domenica) della data TARGET selezionata
  const weekStart = startOfWeek(targetDate, { locale: it, weekStartsOn: 1 });
  const weekEnd = endOfWeek(targetDate, { locale: it, weekStartsOn: 1 });

  // SLOT ROTATIVO: nel ciclo settimanale concorrono al limite solo le prenotazioni
  // ancora "attive" (non ancora concluse). Una volta che una prenotazione è terminata
  // (ora di fine già passata) libera nuovamente uno slot disponibile nello stesso ciclo.
  const now = new Date();
  const weeklyMatches = groupedReservations.filter(block => {
    const blockDate = startOfDay(block.date);
    const inWeek = isWithinInterval(blockDate, { start: weekStart, end: weekEnd });
    if (!inWeek) return false;
    return block.endTime.getTime() > now.getTime();
  });

  const canBookWeekly = weeklyMatches.length < weeklyMax;

  // Con lo slot rotativo lo sblocco avviene quando la prima prenotazione attiva
  // del ciclo si conclude (fallback: lunedì della settimana successiva).
  let nextAvailableDate: Date | undefined;
  if (!canBookWeekly) {
    const earliestEnd = weeklyMatches
      .map(block => block.endTime)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    nextAvailableDate = earliestEnd ?? addDays(weekEnd, 1);
  }

  return {
    weeklyCount: weeklyMatches.length,
    weeklyMax,
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
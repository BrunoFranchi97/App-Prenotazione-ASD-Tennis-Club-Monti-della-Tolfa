import { startOfWeek, endOfWeek, isWithinInterval, parseISO, startOfDay, addDays } from 'date-fns';
import { it } from 'date-fns/locale';
import type { Reservation, MemberType } from '@/types/supabase';

export interface BookingLimitsStatus {
  weeklyCount: number;
  weeklyMax: number;
  durationMax: number;
  canBookMoreThisWeek: boolean;
  nextAvailableDate?: Date;
  limitMessage?: string;
}

export const getBookingLimitsStatus = (
  userReservations: Reservation[],
  targetDate: Date,
  memberType: MemberType = 'socio_effettivo'
): BookingLimitsStatus => {
  const isOccasional = memberType === 'frequentatore_occasionale';
  // Quante prenotazioni può avere ATTIVE contemporaneamente (concorrenza)
  const concurrencyMax = isOccasional ? 1 : 2;
  // Tetto TOTALE di prenotazioni nella settimana (solo per il frequentatore:
  // lo slot rotativo vale una volta sola → al massimo 2 prenotazioni a settimana)
  const weeklyTotalMax = isOccasional ? 2 : Infinity;

  // 1. Filtra le prenotazioni non annullate
  const activeReservations = userReservations.filter(res => {
    return res.status !== 'cancelled';
  });

  const groupedReservations = groupReservationsIntoBlocks(activeReservations);

  // 2. Calcola limiti settimanali (Lunedì - Domenica) della data TARGET selezionata
  const weekStart = startOfWeek(targetDate, { locale: it, weekStartsOn: 1 });
  const weekEnd = endOfWeek(targetDate, { locale: it, weekStartsOn: 1 });
  const now = new Date();

  // Tutte le prenotazioni della settimana (attive + già concluse)
  const weekBlocks = groupedReservations.filter(block =>
    isWithinInterval(startOfDay(block.date), { start: weekStart, end: weekEnd })
  );
  const totalCount = weekBlocks.length;

  // SLOT ROTATIVO: concorrono alla "concorrenza" solo le prenotazioni ancora attive
  // (non ancora concluse). Una volta terminata, libera nuovamente uno slot.
  const activeBlocks = weekBlocks.filter(block => block.endTime.getTime() > now.getTime());
  const activeCount = activeBlocks.length;

  const concurrencyOk = activeCount < concurrencyMax;
  const totalOk = totalCount < weeklyTotalMax;
  const canBookWeekly = concurrencyOk && totalOk;

  let nextAvailableDate: Date | undefined;
  let limitMessage: string | undefined;
  if (!canBookWeekly) {
    if (!totalOk) {
      // Tetto settimanale esaurito (caso frequentatore): si riparte la settimana dopo
      nextAvailableDate = addDays(weekEnd, 1);
      limitMessage = `Hai esaurito le ${weeklyTotalMax} prenotazioni disponibili in questa settimana (Lun-Dom). Potrai prenotare di nuovo dalla prossima settimana.`;
    } else {
      // Bloccato dalla concorrenza: una o più prenotazioni sono ancora in corso
      const earliestEnd = activeBlocks
        .map(block => block.endTime)
        .sort((a, b) => a.getTime() - b.getTime())[0];
      nextAvailableDate = earliestEnd ?? addDays(weekEnd, 1);
      limitMessage = concurrencyMax === 1
        ? `Hai già una prenotazione in corso. Potrai prenotarne un'altra quando questa si sarà conclusa.`
        : `Hai già ${concurrencyMax} prenotazioni attive in questo ciclo (Lun-Dom). Potrai prenotare di nuovo quando una si sarà conclusa.`;
    }
  }

  // Dati per la UI: il socio mostra le prenotazioni ATTIVE (rotazione),
  // il frequentatore mostra il consumo TOTALE sul tetto settimanale.
  const weeklyCount = isOccasional ? totalCount : activeCount;
  const weeklyMax = isOccasional ? weeklyTotalMax : concurrencyMax;

  return {
    weeklyCount,
    weeklyMax,
    durationMax: 2,
    canBookMoreThisWeek: canBookWeekly,
    nextAvailableDate,
    limitMessage
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
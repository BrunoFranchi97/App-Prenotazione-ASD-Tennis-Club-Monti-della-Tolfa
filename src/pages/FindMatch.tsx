import { notifyReservationCreated, notifyBookingConflict } from '@/utils/matchNotifications';

// Nel handleSlotSelection, aggiungi dopo il successo:
notifyReservationCreated(
  selectedRequest.profile?.full_name || 'giocatore',
  selectedSlot.courtName,
  `${selectedSlot.startTime} - ${selectedSlot.endTime}`
);

// E nel catch per conflitti:
if (err.code === '23505' || err.message.includes('duplicate key') || err.message.includes('violates unique constraint')) {
  notifyBookingConflict();
  // ... resto del codice
}
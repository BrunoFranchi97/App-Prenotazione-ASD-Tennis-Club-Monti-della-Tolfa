"use client";

import { toast } from "sonner";

/**
 * Notifica l'utente che la sua richiesta di match è stata accettata
 */
export const notifyMatchAccepted = (acceptedBy: string, courtName: string, time: string) => {
  toast.success(`La tua richiesta di partita è stata accettata da ${acceptedBy}!`, {
    description: `Prenotazione confermata per il campo ${courtName} alle ${time}`,
    duration: 10000,
  });
};

/**
 * Notifica l'utente che ha creato una nuova prenotazione da match
 */
export const notifyReservationCreated = (opponentName: string, courtName: string, time: string) => {
  toast.success(`Prenotazione creata con successo!`, {
    description: `Partita con ${opponentName} al campo ${courtName} alle ${time}`,
    duration: 8000,
  });
};

/**
 * Notifica l'utente che ci sono conflitti di prenotazione
 */
export const notifyBookingConflict = () => {
  toast.error("Conflitto di prenotazione", {
    description: "Lo slot selezionato è stato appena prenotato da un altro utente. Per favore seleziona un altro slot.",
    duration: 8000,
  });
};
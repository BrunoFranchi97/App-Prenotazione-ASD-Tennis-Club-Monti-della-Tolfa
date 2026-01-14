"use client";

import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { CheckCircle2, CalendarDays, Clock, MapPin, User } from 'lucide-react'; // Importa l'icona User
import { Reservation } from '@/types/supabase';

interface BookingConfirmationState {
  reservations: Reservation[];
  courtName: string;
  bookedFor?: string; // Aggiungi il campo per il nome del socio terzo
}

const BookingConfirmation = () => {
  const location = useLocation();
  const state = location.state as BookingConfirmationState;

  if (!state || !state.reservations || state.reservations.length === 0 || !state.courtName) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white p-4">
        <Card className="w-full max-w-md shadow-lg rounded-lg text-center">
          <CardHeader>
            <CardTitle className="text-destructive text-3xl font-bold">Errore</CardTitle>
            <CardDescription className="text-gray-600 mt-2">
              Nessun dettaglio di prenotazione trovato.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/book">
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
                Torna a Prenota un Campo
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { reservations, courtName, bookedFor } = state;
  const sortedReservations = [...reservations].sort((a, b) => parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime());

  const firstReservation = sortedReservations[0];
  const lastReservation = sortedReservations[sortedReservations.length - 1];

  const bookingDate = format(parseISO(firstReservation.starts_at), 'EEEE, dd MMMM yyyy', { locale: it });
  const bookingStartTime = format(parseISO(firstReservation.starts_at), 'HH:mm');
  const bookingEndTime = format(parseISO(lastReservation.ends_at), 'HH:mm');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white p-4">
      <Card className="w-full max-w-md shadow-lg rounded-lg text-center">
        <CardHeader>
          <CheckCircle2 className="mx-auto h-16 w-16 text-primary mb-4" />
          <CardTitle className="text-primary text-3xl font-bold">Prenotazione Confermata!</CardTitle>
          <CardDescription className="text-gray-600 mt-2">
            La tua prenotazione è stata effettuata con successo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {bookedFor && (
            <div className="flex items-center justify-center text-lg text-gray-800">
              <User className="mr-2 h-5 w-5 text-club-orange" />
              <span>Prenotato per: <span className="font-semibold">{bookedFor}</span></span>
            </div>
          )}
          <div className="flex items-center justify-center text-lg text-gray-800">
            <MapPin className="mr-2 h-5 w-5 text-club-orange" />
            <span>Campo: <span className="font-semibold">{courtName}</span></span>
          </div>
          <div className="flex items-center justify-center text-lg text-gray-800">
            <CalendarDays className="mr-2 h-5 w-5 text-club-orange" />
            <span>Data: <span className="font-semibold capitalize">{bookingDate}</span></span>
          </div>
          <div className="flex items-center justify-center text-lg text-gray-800">
            <Clock className="mr-2 h-5 w-5 text-club-orange" />
            <span>Orario: <span className="font-semibold">{bookingStartTime} - {bookingEndTime}</span></span>
          </div>
          <p className="text-sm text-gray-500 mt-4">
            Riceverai a breve un'email di conferma con tutti i dettagli.
          </p>
          <Link to="/dashboard">
            <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground mt-6">
              Torna alla Dashboard
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
};

export default BookingConfirmation;
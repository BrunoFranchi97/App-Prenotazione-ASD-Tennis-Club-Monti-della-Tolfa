"use client";

import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { CheckCircle2, CalendarDays, Clock, MapPin, User, ChevronRight } from 'lucide-react';
import { Reservation } from '@/types/supabase';

interface BookingConfirmationState {
  reservations?: Reservation[];
  courtName?: string;
  bookedFor?: string;
}

const BookingConfirmation = () => {
  const location = useLocation();
  const state = location.state as BookingConfirmationState;

  // Se non c'è stato o mancano dati fondamentali, mostriamo comunque una conferma generica
  // dato che se l'utente è arrivato qui, l'operazione di salvataggio è andata a buon fine.
  if (!state || !state.reservations || state.reservations.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white p-4">
        <Card className="w-full max-w-md shadow-lg rounded-lg text-center">
          <CardHeader>
            <CheckCircle2 className="mx-auto h-16 w-16 text-primary mb-4" />
            <CardTitle className="text-primary text-3xl font-bold">Prenotazione Completata!</CardTitle>
            <CardDescription className="text-gray-600 mt-2">
              Il sistema ha confermato la tua richiesta. Puoi visualizzare i dettagli nello storico.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="pt-4 flex flex-col gap-3">
              <Link to="/history">
                <Button className="w-full bg-primary hover:bg-primary/90">
                  Vai ai Miei Campi <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link to="/dashboard">
                <Button variant="outline" className="w-full">
                  Torna alla Dashboard
                </Button>
              </Link>
            </div>
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
          <CardTitle className="text-primary text-3xl font-bold">Confermata!</CardTitle>
          <CardDescription className="text-gray-600 mt-2">
            La tua prenotazione è stata salvata con successo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg space-y-3 text-left">
            {bookedFor && (
              <div className="flex items-center text-gray-800">
                <User className="mr-3 h-5 w-5 text-club-orange shrink-0" />
                <span className="text-sm">Per: <span className="font-semibold">{bookedFor}</span></span>
              </div>
            )}
            <div className="flex items-center text-gray-800">
              <MapPin className="mr-3 h-5 w-5 text-club-orange shrink-0" />
              <span className="text-sm">Campo: <span className="font-semibold">{courtName || 'Selezionato'}</span></span>
            </div>
            <div className="flex items-center text-gray-800">
              <CalendarDays className="mr-3 h-5 w-5 text-club-orange shrink-0" />
              <span className="text-sm capitalize">Data: <span className="font-semibold">{bookingDate}</span></span>
            </div>
            <div className="flex items-center text-gray-800">
              <Clock className="mr-3 h-5 w-5 text-club-orange shrink-0" />
              <span className="text-sm">Orario: <span className="font-semibold">{bookingStartTime} - {bookingEndTime}</span></span>
            </div>
          </div>
          
          <div className="pt-6 flex flex-col gap-3">
            <Link to="/history">
              <Button className="w-full bg-primary hover:bg-primary/90">
                Vedi i Miei Campi
              </Button>
            </Link>
            <Link to="/dashboard">
              <Button variant="ghost" className="w-full text-gray-500">
                Torna alla Dashboard
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BookingConfirmation;
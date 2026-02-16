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

  // Verifichiamo se abbiamo effettivamente dei dati validi da mostrare
  const hasValidData = state && state.reservations && state.reservations.length > 0;

  // Se i dati mancano del tutto (es. refresh della pagina), mostriamo un messaggio di successo semplice
  if (!hasValidData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white p-4">
        <Card className="w-full max-w-md shadow-lg rounded-lg text-center border-t-4 border-t-primary">
          <CardHeader>
            <CheckCircle2 className="mx-auto h-16 w-16 text-primary mb-4" />
            <CardTitle className="text-primary text-3xl font-bold">Prenotazione Confermata!</CardTitle>
            <CardDescription className="text-gray-600 mt-2">
              La tua prenotazione è stata salvata con successo nel sistema.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Non è stato possibile caricare il riepilogo immediato, ma puoi trovare tutti i dettagli nel tuo storico.
            </p>
            <div className="flex flex-col gap-3">
              <Link to="/history">
                <Button className="w-full bg-primary hover:bg-primary/90">
                  Vedi i Miei Campi
                </Button>
              </Link>
              <Link to="/dashboard">
                <Button variant="ghost" className="w-full">
                  Torna alla Dashboard
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Se abbiamo i dati, calcoliamo il riepilogo
  const sortedReservations = [...state.reservations!].sort((a, b) => 
    parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime()
  );

  const firstReservation = sortedReservations[0];
  const lastReservation = sortedReservations[sortedReservations.length - 1];

  const bookingDate = format(parseISO(firstReservation.starts_at), 'EEEE, dd MMMM yyyy', { locale: it });
  const bookingStartTime = format(parseISO(firstReservation.starts_at), 'HH:mm');
  const bookingEndTime = format(parseISO(lastReservation.ends_at), 'HH:mm');
  const courtName = state.courtName || 'Campo Tennis';
  const bookedFor = state.bookedFor;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white p-4">
      <Card className="w-full max-w-md shadow-lg rounded-lg text-center border-t-4 border-t-primary">
        <CardHeader>
          <CheckCircle2 className="mx-auto h-16 w-16 text-primary mb-4" />
          <CardTitle className="text-primary text-3xl font-bold">Confermata!</CardTitle>
          <CardDescription className="text-gray-600 mt-2 text-base">
            La tua prenotazione è stata salvata con successo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-primary/5 border border-primary/10 p-5 rounded-xl space-y-4 text-left shadow-inner">
            {bookedFor && (
              <div className="flex items-center text-gray-800">
                <div className="bg-club-orange/20 p-2 rounded-lg mr-3">
                  <User className="h-5 w-5 text-club-orange shrink-0" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Per il socio</span>
                  <span className="text-sm font-semibold">{bookedFor}</span>
                </div>
              </div>
            )}
            
            <div className="flex items-center text-gray-800">
              <div className="bg-club-orange/20 p-2 rounded-lg mr-3">
                <MapPin className="h-5 w-5 text-club-orange shrink-0" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Campo</span>
                <span className="text-sm font-semibold">{courtName}</span>
              </div>
            </div>

            <div className="flex items-center text-gray-800">
              <div className="bg-club-orange/20 p-2 rounded-lg mr-3">
                <CalendarDays className="h-5 w-5 text-club-orange shrink-0" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Data</span>
                <span className="text-sm font-semibold capitalize">{bookingDate}</span>
              </div>
            </div>

            <div className="flex items-center text-gray-800">
              <div className="bg-club-orange/20 p-2 rounded-lg mr-3">
                <Clock className="h-5 w-5 text-club-orange shrink-0" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Orario</span>
                <span className="text-sm font-semibold">{bookingStartTime} - {bookingEndTime}</span>
              </div>
            </div>
          </div>
          
          <div className="pt-6 flex flex-col gap-3">
            <Link to="/history">
              <Button className="w-full bg-primary hover:bg-primary/90 py-6 text-lg">
                Vedi i Miei Campi
              </Button>
            </Link>
            <Link to="/dashboard">
              <Button variant="ghost" className="w-full text-gray-500 hover:text-primary">
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
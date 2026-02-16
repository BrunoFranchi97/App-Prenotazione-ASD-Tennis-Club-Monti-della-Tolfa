"use client";

import React from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { CheckCircle2, CalendarDays, Clock, MapPin, User, History } from 'lucide-react';
import { Reservation } from '@/types/supabase';

interface BookingConfirmationState {
  reservations?: Reservation[];
  courtName?: string;
  bookedFor?: string;
}

const BookingConfirmation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as BookingConfirmationState;

  // Se non ci sono dati, torniamo alla dashboard
  if (!state || !state.reservations || state.reservations.length === 0) {
    React.useEffect(() => {
      navigate('/dashboard');
    }, [navigate]);
    return null;
  }

  const { reservations, courtName, bookedFor } = state;
  
  const sortedReservations = [...reservations].sort((a, b) => 
    parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime()
  );

  const firstReservation = sortedReservations[0];
  const lastReservation = sortedReservations[sortedReservations.length - 1];

  const bookingDate = format(parseISO(firstReservation.starts_at), 'EEEE dd MMMM yyyy', { locale: it });
  const bookingStartTime = format(parseISO(firstReservation.starts_at), 'HH:mm');
  const bookingEndTime = format(parseISO(lastReservation.ends_at), 'HH:mm');

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-4 sm:p-6">
      <div className="w-full max-w-lg text-center animate-in fade-in zoom-in duration-300">
        {/* Grande Icona di Successo */}
        <div className="mx-auto bg-green-100 w-24 h-24 rounded-full flex items-center justify-center mb-6 shadow-sm border-4 border-white">
          <CheckCircle2 className="h-14 w-14 text-primary" />
        </div>

        <h1 className="text-primary text-3xl sm:text-4xl font-extrabold tracking-tight mb-2">
          Prenotazione Confermata!
        </h1>
        <p className="text-gray-500 text-lg mb-8">
          Il campo è stato riservato correttamente.
        </p>
        
        {/* Box Riepilogo Stile Modal */}
        <Card className="bg-gray-50/50 border-gray-100 shadow-sm rounded-3xl overflow-hidden mb-8">
          <CardContent className="p-8 space-y-6 text-left">
            {bookedFor && (
              <div className="flex items-center text-gray-800">
                <div className="bg-orange-100 p-3 rounded-2xl mr-4">
                  <User className="h-6 w-6 text-club-orange" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Socio</span>
                  <span className="text-lg font-bold text-gray-900">{bookedFor}</span>
                </div>
              </div>
            )}
            
            <div className="flex items-center text-gray-800">
              <div className="bg-orange-100 p-3 rounded-2xl mr-4">
                <MapPin className="h-6 w-6 text-club-orange" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Campo</span>
                <span className="text-lg font-bold text-gray-900">{courtName || 'Campo da Tennis'}</span>
              </div>
            </div>

            <div className="flex items-center text-gray-800">
              <div className="bg-orange-100 p-3 rounded-2xl mr-4">
                <CalendarDays className="h-6 w-6 text-club-orange" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Data</span>
                <span className="text-lg font-bold text-gray-900 capitalize">{bookingDate}</span>
              </div>
            </div>

            <div className="flex items-center text-gray-800">
              <div className="bg-orange-100 p-3 rounded-2xl mr-4">
                <Clock className="h-6 w-6 text-club-orange" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Orario</span>
                <span className="text-lg font-bold text-gray-900">{bookingStartTime} - {bookingEndTime}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Azioni */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
          <Link to="/history" className="w-full sm:w-auto">
            <Button className="w-full bg-primary hover:bg-primary/90 h-14 px-8 text-lg font-bold rounded-2xl shadow-lg shadow-primary/20">
              <History className="mr-2 h-5 w-5" /> Vedi i Miei Campi
            </Button>
          </Link>
          <Link to="/dashboard" className="w-full sm:w-auto">
            <Button variant="ghost" className="text-gray-500 hover:text-primary font-semibold text-lg">
              Torna alla Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default BookingConfirmation;
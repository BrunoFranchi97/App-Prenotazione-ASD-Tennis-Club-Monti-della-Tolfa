"use client";

import React from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { CheckCircle2, CalendarDays, Clock, MapPin, User, ArrowRight } from 'lucide-react';
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

  // Se non ci sono dati (es. accesso diretto alla URL), torniamo alla dashboard
  if (!state || !state.reservations || state.reservations.length === 0) {
    React.useEffect(() => {
      navigate('/dashboard');
    }, [navigate]);
    return null;
  }

  const { reservations, courtName, bookedFor } = state;
  
  // Ordiniamo per sicurezza per avere l'ora di inizio e fine corretta
  const sortedReservations = [...reservations].sort((a, b) => 
    parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime()
  );

  const firstReservation = sortedReservations[0];
  const lastReservation = sortedReservations[sortedReservations.length - 1];

  const bookingDate = format(parseISO(firstReservation.starts_at), 'EEEE dd MMMM yyyy', { locale: it });
  const bookingStartTime = format(parseISO(firstReservation.starts_at), 'HH:mm');
  const bookingEndTime = format(parseISO(lastReservation.ends_at), 'HH:mm');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white p-4">
      <Card className="w-full max-w-md shadow-2xl rounded-2xl border-t-8 border-t-primary overflow-hidden">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mb-4">
            <CheckCircle2 className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-primary text-3xl font-extrabold tracking-tight">Confermata!</CardTitle>
          <CardDescription className="text-gray-600 mt-2 text-base font-medium">
            La tua prenotazione è ora attiva.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6 pt-4">
          {/* Box Riepilogo ASD Tennis Club */}
          <div className="bg-primary/5 border border-primary/10 p-6 rounded-2xl space-y-5 text-left relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <CheckCircle2 className="h-24 w-24 text-primary" />
            </div>

            {bookedFor && (
              <div className="flex items-center text-gray-800 relative z-10">
                <div className="bg-club-orange/20 p-2.5 rounded-xl mr-4 shadow-sm">
                  <User className="h-5 w-5 text-club-orange shrink-0" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Per il socio</span>
                  <span className="text-base font-bold text-gray-900">{bookedFor}</span>
                </div>
              </div>
            )}
            
            <div className="flex items-center text-gray-800 relative z-10">
              <div className="bg-club-orange/20 p-2.5 rounded-xl mr-4 shadow-sm">
                <MapPin className="h-5 w-5 text-club-orange shrink-0" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Campo</span>
                <span className="text-base font-bold text-gray-900">{courtName || 'Campo da Tennis'}</span>
              </div>
            </div>

            <div className="flex items-center text-gray-800 relative z-10">
              <div className="bg-club-orange/20 p-2.5 rounded-xl mr-4 shadow-sm">
                <CalendarDays className="h-5 w-5 text-club-orange shrink-0" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Data</span>
                <span className="text-base font-bold text-gray-900 capitalize">{bookingDate}</span>
              </div>
            </div>

            <div className="flex items-center text-gray-800 relative z-10">
              <div className="bg-club-orange/20 p-2.5 rounded-xl mr-4 shadow-sm">
                <Clock className="h-5 w-5 text-club-orange shrink-0" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Orario</span>
                <span className="text-base font-bold text-gray-900">{bookingStartTime} - {bookingEndTime}</span>
              </div>
            </div>
          </div>
          
          <div className="pt-4 flex flex-col gap-3">
            <Link to="/history">
              <Button className="w-full bg-primary hover:bg-primary/90 py-7 text-lg font-bold shadow-lg shadow-primary/20 transition-all active:scale-95">
                Vedi i Miei Campi <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link to="/dashboard">
              <Button variant="ghost" className="w-full text-gray-500 hover:text-primary font-semibold">
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
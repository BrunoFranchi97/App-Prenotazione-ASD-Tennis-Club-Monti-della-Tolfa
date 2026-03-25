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
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-6 py-10">
      <Card className="w-full max-w-md border-none shadow-[0_8px_30px_rgb(0,0,0,0.06)] rounded-[2rem] overflow-hidden bg-white/80 backdrop-blur-xl">
        <CardHeader className="text-center pt-10 pb-4">
          <div className="mx-auto w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center shadow-inner mb-5">
            <CheckCircle2 className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="text-primary text-3xl font-extrabold tracking-tight">Confermata!</CardTitle>
          <CardDescription className="text-gray-500 mt-2 text-sm font-medium">
            La tua prenotazione è ora attiva.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 px-8 pb-10 pt-4">
          {/* Box Riepilogo */}
          <div className="bg-primary/[0.03] border border-primary/10 p-6 rounded-2xl space-y-5 text-left relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-[0.03]">
              <CheckCircle2 className="h-24 w-24 text-primary" />
            </div>

            {bookedFor && (
              <div className="flex items-center text-gray-800 relative z-10">
                <div className="bg-club-orange/15 p-2.5 rounded-xl mr-4">
                  <User className="h-5 w-5 text-club-orange shrink-0" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-black text-gray-400 tracking-widest">Per il socio</span>
                  <span className="text-base font-bold text-gray-900">{bookedFor}</span>
                </div>
              </div>
            )}

            <div className="flex items-center text-gray-800 relative z-10">
              <div className="bg-club-orange/15 p-2.5 rounded-xl mr-4">
                <MapPin className="h-5 w-5 text-club-orange shrink-0" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-black text-gray-400 tracking-widest">Campo</span>
                <span className="text-base font-bold text-gray-900">{courtName || 'Campo da Tennis'}</span>
              </div>
            </div>

            <div className="flex items-center text-gray-800 relative z-10">
              <div className="bg-club-orange/15 p-2.5 rounded-xl mr-4">
                <CalendarDays className="h-5 w-5 text-club-orange shrink-0" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-black text-gray-400 tracking-widest">Data</span>
                <span className="text-base font-bold text-gray-900 capitalize">{bookingDate}</span>
              </div>
            </div>

            <div className="flex items-center text-gray-800 relative z-10">
              <div className="bg-club-orange/15 p-2.5 rounded-xl mr-4">
                <Clock className="h-5 w-5 text-club-orange shrink-0" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-black text-gray-400 tracking-widest">Orario</span>
                <span className="text-base font-bold text-gray-900">{bookingStartTime} — {bookingEndTime}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <Link to="/history">
              <Button className="w-full h-14 bg-gradient-to-br from-primary to-[#23532f] hover:from-[#357a46] hover:to-[#23532f] text-white rounded-2xl text-base font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all hover:scale-[1.02] active:scale-[0.98]">
                Vedi i Miei Campi <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link to="/dashboard">
              <Button variant="ghost" className="w-full rounded-2xl text-gray-400 hover:text-primary font-semibold">
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
"use client";

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, CalendarDays, Clock, MapPin, User, History, LayoutDashboard } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { Reservation } from '@/types/supabase';

interface BookingSuccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservations: Reservation[] | null;
  courtName: string;
  bookedFor?: string;
}

const BookingSuccessDialog: React.FC<BookingSuccessDialogProps> = ({
  open,
  onOpenChange,
  reservations,
  courtName,
  bookedFor
}) => {
  const navigate = useNavigate();

  if (!reservations || reservations.length === 0) return null;

  const sorted = [...reservations].sort((a, b) => 
    parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime()
  );

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const dateStr = format(parseISO(first.starts_at), 'EEEE dd MMMM yyyy', { locale: it });
  const startTime = format(parseISO(first.starts_at), 'HH:mm');
  const endTime = format(parseISO(last.ends_at), 'HH:mm');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="sm:max-w-md border-t-8 border-t-primary rounded-3xl shadow-2xl"
        onPointerDownOutside={(e) => e.preventDefault()} // Impedisce la chiusura accidentale cliccando fuori
      >
        <DialogHeader className="text-center items-center">
          <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mb-2">
            <CheckCircle2 className="h-10 w-10 text-primary" />
          </div>
          <DialogTitle className="text-2xl font-bold text-primary">Prenotazione Confermata!</DialogTitle>
          <DialogDescription className="text-base font-medium text-gray-600">
            Il campo è stato riservato correttamente.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-gray-50 border border-gray-100 p-6 rounded-2xl space-y-4 text-left my-2">
          {bookedFor && (
            <div className="flex items-center text-gray-800">
              <div className="bg-orange-100 p-2 rounded-xl mr-3">
                <User className="h-5 w-5 text-club-orange shrink-0" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Socio</span>
                <span className="text-sm font-bold">{bookedFor}</span>
              </div>
            </div>
          )}
          
          <div className="flex items-center text-gray-800">
            <div className="bg-orange-100 p-2 rounded-xl mr-3">
              <MapPin className="h-5 w-5 text-club-orange shrink-0" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Campo</span>
              <span className="text-sm font-bold">{courtName}</span>
            </div>
          </div>

          <div className="flex items-center text-gray-800">
            <div className="bg-orange-100 p-2 rounded-xl mr-3">
              <CalendarDays className="h-5 w-5 text-club-orange shrink-0" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Data</span>
              <span className="text-sm font-bold capitalize">{dateStr}</span>
            </div>
          </div>

          <div className="flex items-center text-gray-800">
            <div className="bg-orange-100 p-2 rounded-xl mr-3">
              <Clock className="h-5 w-5 text-club-orange shrink-0" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Orario</span>
              <span className="text-sm font-bold">{startTime} - {endTime}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col gap-3 pt-2">
          <Button 
            className="w-full bg-primary hover:bg-primary/90 h-12 font-bold rounded-xl shadow-lg shadow-primary/20"
            onClick={() => navigate('/history')}
          >
            <History className="mr-2 h-4 w-4" /> Vedi i Miei Campi
          </Button>
          <Button 
            variant="ghost" 
            className="w-full text-gray-500 font-semibold"
            onClick={() => navigate('/dashboard')}
          >
            <LayoutDashboard className="mr-2 h-4 w-4" /> Torna alla Dashboard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BookingSuccessDialog;
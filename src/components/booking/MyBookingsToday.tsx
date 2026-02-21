"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { CalendarCheck, MapPin, Clock, Trash2, ArrowRight } from 'lucide-react';
import { Reservation, Court } from '@/types/supabase';

interface MyBookingsTodayProps {
  reservations: Reservation[];
  courts: Court[];
  currentUserId?: string;
  onCancel: (id: string) => Promise<void>;
  onReserveMore: () => void;
}

const MyBookingsToday: React.FC<MyBookingsTodayProps> = ({
  reservations,
  courts,
  currentUserId,
  onCancel,
  onReserveMore
}) => {
  const myTodayBookings = reservations.filter(r => r.user_id === currentUserId);
  const courtMap = new Map(courts.map(c => [c.id, c]));

  if (myTodayBookings.length === 0) {
    return (
      <Card className="border-none shadow-none bg-primary/5 rounded-[2rem] p-8 text-center">
        <div className="bg-white w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
          <CalendarCheck className="text-primary" size={24} />
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">Nessun match oggi</h3>
        <p className="text-sm text-gray-500 mb-6">Non hai ancora prenotato alcun campo per questa giornata.</p>
        <Button 
          variant="outline" 
          className="rounded-xl border-primary text-primary font-bold hover:bg-primary/5"
          onClick={onReserveMore}
        >
          Prenota ora
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-sm font-black uppercase tracking-widest text-gray-400">Le tue prenotazioni</h3>
        <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
          {myTodayBookings.length} {myTodayBookings.length === 1 ? 'partita' : 'partite'}
        </span>
      </div>
      
      {myTodayBookings.map(res => {
        const court = courtMap.get(res.court_id);
        return (
          <div 
            key={res.id} 
            className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                <Clock size={20} />
              </div>
              <div className="flex flex-col">
                <span className="text-base font-black text-gray-900 leading-tight">
                  {format(parseISO(res.starts_at), 'HH:mm')} - {format(parseISO(res.ends_at), 'HH:mm')}
                </span>
                <div className="flex items-center gap-1 text-[11px] text-gray-500 font-bold uppercase tracking-tighter">
                  <MapPin size={10} className="text-club-orange" /> {court?.name || 'Campo'}
                </div>
              </div>
            </div>
            
            <Button 
              variant="ghost" 
              size="icon" 
              className="rounded-xl text-destructive hover:bg-destructive/5"
              onClick={() => onCancel(res.id)}
            >
              <Trash2 size={18} />
            </Button>
          </div>
        );
      })}
    </div>
  );
};

export default MyBookingsToday;
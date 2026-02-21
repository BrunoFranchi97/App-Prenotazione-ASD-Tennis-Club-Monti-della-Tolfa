"use client";

import React from 'react';
import { format, isAfter, isBefore, parseISO, addHours, startOfHour } from 'date-fns';
import { Badge } from "@/components/ui/badge";
import { Court, Reservation } from '@/types/supabase';
import { cn } from '@/lib/utils';

interface CourtHeroStripProps {
  courts: Court[];
  reservations: Reservation[];
}

const CourtHeroStrip: React.FC<CourtHeroStripProps> = ({ courts, reservations }) => {
  const now = new Date();
  const currentHour = startOfHour(now);

  const getStatus = (courtId: number) => {
    const todayReservations = reservations.filter(r => 
      r.court_id === courtId && 
      format(parseISO(r.starts_at), 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd')
    );

    const isBusyNow = todayReservations.some(r => {
      const start = parseISO(r.starts_at);
      const end = parseISO(r.ends_at);
      return (isEqual(start, currentHour) || isBefore(start, now)) && isAfter(end, now);
    });

    if (isBusyNow) {
      // Trova il prossimo slot libero
      let nextFree = addHours(currentHour, 1);
      while (nextFree.getHours() < 22) {
        const hasBooking = todayReservations.some(r => isEqual(parseISO(r.starts_at), nextFree));
        if (!hasBooking) break;
        nextFree = addHours(nextFree, 1);
      }
      return { 
        isFree: false, 
        label: nextFree.getHours() >= 22 ? "Chiuso" : `Libero alle ${format(nextFree, 'HH:mm')}` 
      };
    }

    return { isFree: true, label: "Libero ora" };
  };

  // Helper locale per isEqual dato che non è importato da date-fns
  function isEqual(d1: Date, d2: Date) {
    return d1.getTime() === d2.getTime();
  }

  return (
    <div className="w-full overflow-x-auto no-scrollbar py-2 -mx-4 px-4 sm:mx-0 sm:px-0">
      <div className="flex gap-3 min-w-max">
        {courts.map(court => {
          const status = getStatus(court.id);
          return (
            <div 
              key={court.id} 
              className="bg-white border border-gray-100 rounded-2xl p-3 flex items-center gap-3 shadow-sm min-w-[160px]"
            >
              <div className={cn(
                "w-2.5 h-2.5 rounded-full animate-pulse",
                status.isFree ? "bg-green-500" : "bg-club-orange"
              )} />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-gray-900 leading-none mb-1">{court.name}</span>
                <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{status.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CourtHeroStrip;
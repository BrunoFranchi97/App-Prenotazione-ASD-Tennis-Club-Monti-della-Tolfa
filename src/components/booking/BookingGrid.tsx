"use client";

import React, { useMemo, useEffect, useRef } from 'react';
import { format, parseISO, startOfHour, addHours, isBefore, isToday as isTodayFn } from 'date-fns';
import { it } from 'date-fns/locale';
import { Court, Reservation } from '@/types/supabase';
import { cn } from '@/lib/utils';
import { Clock } from 'lucide-react';

interface BookingGridProps {
  date: Date;
  courts: Court[];
  reservations: Reservation[];
  currentUserId?: string;
  onSlotClick: (courtId: number, slotTime: string) => void;
  selectedCourtId?: number;
}

const BookingGrid: React.FC<BookingGridProps> = ({ 
  date, 
  courts, 
  reservations, 
  currentUserId,
  onSlotClick,
  selectedCourtId
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const now = new Date();
  const currentHourString = format(now, 'HH:00');
  const isSelectedDayToday = isTodayFn(date);

  const timeSlots = useMemo(() => {
    const slots = [];
    for (let i = 8; i < 22; i++) {
      const d = new Date();
      d.setHours(i, 0, 0, 0);
      slots.push(format(d, 'HH:00'));
    }
    return slots;
  }, []);

  // Auto-scroll all'ora corrente al caricamento
  useEffect(() => {
    if (scrollRef.current && isSelectedDayToday) {
      const currentSlotElement = scrollRef.current.querySelector(`[data-time="${currentHourString}"]`);
      if (currentSlotElement) {
        // Scroll leggermente sopra per dare contesto
        const topPos = (currentSlotElement as HTMLElement).offsetTop - 100;
        scrollRef.current.scrollTo({ top: topPos, behavior: 'smooth' });
      }
    }
  }, [currentHourString, isSelectedDayToday]);

  const getReservation = (courtId: number, slotTime: string) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const slotStartStr = `${dateStr} ${slotTime}`;
    
    return reservations.find(r => {
      const resStartStr = format(parseISO(r.starts_at), 'yyyy-MM-dd HH:00');
      return r.court_id === courtId && resStartStr === slotStartStr;
    });
  };

  return (
    <div className="relative border border-gray-100 rounded-[2rem] bg-white overflow-hidden shadow-sm">
      <div 
        ref={scrollRef}
        className="overflow-auto max-h-[60vh] sm:max-h-[70vh] no-scrollbar relative"
      >
        <table className="w-full border-collapse table-fixed relative">
          <thead className="sticky top-0 z-20 bg-white/95 backdrop-blur-md shadow-sm">
            <tr>
              <th className="w-16 p-3 border-b border-r border-gray-50">
                <Clock size={16} className="text-gray-300 mx-auto" />
              </th>
              {courts.map(court => (
                <th 
                  key={court.id} 
                  className={cn(
                    "p-3 border-b border-gray-50 text-[10px] uppercase tracking-widest font-black text-gray-500",
                    selectedCourtId === court.id && "text-primary bg-primary/5"
                  )}
                >
                  {court.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="relative">
            {timeSlots.map((slot) => {
              const isPast = isSelectedDayToday && isBefore(parseISO(`${format(date, 'yyyy-MM-dd')}T${slot}:00`), startOfHour(now));
              const isCurrentTime = isSelectedDayToday && slot === currentHourString;

              return (
                <tr key={slot} data-time={slot} className="group">
                  <td className="sticky left-0 z-10 bg-white border-r border-gray-50 p-2 text-center">
                    <span className={cn(
                      "text-[11px] font-bold",
                      isCurrentTime ? "text-primary scale-110 block" : "text-gray-400"
                    )}>
                      {slot}
                    </span>
                  </td>
                  {courts.map(court => {
                    const res = getReservation(court.id, slot);
                    const isMyBooking = res?.user_id === currentUserId;

                    return (
                      <td 
                        key={court.id} 
                        className={cn(
                          "relative h-14 border-b border-gray-50 transition-all p-1",
                          isPast && !res && "bg-gray-50/50 grayscale opacity-40",
                          !res && !isPast && "cursor-pointer hover:bg-primary/5"
                        )}
                        onClick={() => !res && !isPast && onSlotClick(court.id, slot)}
                      >
                        {res ? (
                          <div className={cn(
                            "absolute inset-1 rounded-xl p-2 flex flex-col justify-center overflow-hidden shadow-sm z-10",
                            isMyBooking ? "bg-primary text-white" : "bg-gray-100 text-gray-500"
                          )}>
                            <span className="text-[10px] font-black uppercase truncate leading-none mb-1">
                              {res.booked_for_first_name || "Occupato"}
                            </span>
                            <span className="text-[9px] font-bold opacity-70 leading-none">
                              {format(parseISO(res.starts_at), 'HH:mm')} - {format(parseISO(res.ends_at), 'HH:mm')}
                            </span>
                          </div>
                        ) : !isPast && (
                          <div className="w-full h-full rounded-xl border-2 border-dashed border-transparent group-hover:border-primary/20 transition-all flex items-center justify-center">
                            <span className="text-[8px] font-bold text-primary opacity-0 group-hover:opacity-100 uppercase tracking-tighter">Prenota</span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            
            {/* Indicatore ora corrente */}
            {isSelectedDayToday && (
              <div 
                className="absolute left-0 right-0 h-0.5 bg-club-orange z-20 pointer-events-none flex items-center"
                style={{ 
                  top: `${((now.getHours() - 8) * 56) + (now.getMinutes() / 60 * 56)}px`
                }}
              >
                <div className="w-2 h-2 rounded-full bg-club-orange -ml-1 shadow-md" />
                <div className="bg-club-orange text-white text-[8px] px-1 rounded-sm font-bold ml-1 transform -translate-y-1/2">
                  {format(now, 'HH:mm')}
                </div>
              </div>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BookingGrid;
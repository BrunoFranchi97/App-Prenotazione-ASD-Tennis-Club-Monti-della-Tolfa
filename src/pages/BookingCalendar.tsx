"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ChevronRight, CalendarDays, MapPin, Clock, Info, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { format, parseISO, addHours, setHours, setMinutes, isBefore, isEqual, setSeconds, setMilliseconds, addDays, startOfDay, endOfDay, isSameDay, addMinutes, isValid } from 'date-fns';
import { it } from 'date-fns/locale';
import { useApprovalCheck } from '@/hooks/use-approval-check';
import { Court, Reservation, BookingType } from '@/types/supabase';
import { getBookingLimitsStatus } from '@/utils/bookingLimits';
import BookingLimitsBox from '@/components/BookingLimitsBox';
import BookingSuccessDialog from '@/components/BookingSuccessDialog';
import UserNav from '@/components/UserNav';
import { cn } from '@/lib/utils';

const bookingTypeLabels: Record<BookingType, string> = {
  singolare: 'Singolare',
  doppio: 'Doppio',
  lezione: 'Lezione'
};

const BookingCalendar = () => {
  const navigate = useNavigate();
  const { isApproved, loading: approvalLoading } = useApprovalCheck();

  const [date, setDate] = useState<Date | undefined>(new Date());
  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedCourtId, setSelectedCourtId] = useState<string | undefined>(undefined);
  const [allReservations, setAllReservations] = useState<Reservation[]>([]);
  const [userReservations, setUserReservations] = useState<Reservation[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]); 
  const [bookingType, setBookingType] = useState<BookingType>('singolare');
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);
  const [bookerFullName, setBookerFullName] = useState<string | null>(null);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastBookingData, setLastBookingData] = useState<{ reservations: Reservation[], courtName: string } | null>(null);

  const today = useMemo(() => startOfDay(new Date()), []);
  const maxDate = useMemo(() => addDays(today, 14), [today]);

  const fetchUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
    if (profile) setBookerFullName(profile.full_name);

    const { data: myRes } = await supabase.from('reservations').select('*').eq('user_id', user.id).neq('status', 'cancelled');
    setUserReservations(myRes || []);
  };

  const fetchReservations = async () => {
    if (!date || !isValid(date)) return;
    setFetchingData(true);
    try {
      const { data: resData } = await supabase
        .from('reservations')
        .select('*')
        .gte('starts_at', startOfDay(date).toISOString())
        .lte('ends_at', endOfDay(date).toISOString())
        .neq('status', 'cancelled');
      
      const reservations = resData || [];
      setAllReservations(reservations);

      const userIds = Array.from(new Set(reservations.map(r => r.user_id)));
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        
        const map: Record<string, string> = {};
        profiles?.forEach(p => {
          map[p.id] = p.full_name || 'Socio';
        });
        setProfileMap(map);
      }
    } catch (e) { console.error(e); }
    setFetchingData(false);
  };

  useEffect(() => {
    if (isApproved) {
      fetchUserData();
      supabase.from('courts').select('*').eq('is_active', true).order('id').then(({data}) => {
        if (data) setCourts(data);
      });
    }
  }, [isApproved]);

  useEffect(() => {
    if (isApproved && date && isValid(date)) {
      fetchReservations();
      setSelectedSlots([]);
    }
  }, [date, isApproved]);

  const allTimeSlots = useMemo(() => {
    const slots = [];
    for (let i = 8; i < 22; i++) slots.push(format(setMinutes(setHours(new Date(), i), 0), 'HH:mm'));
    return slots;
  }, []);

  const getSlotReservation = (slotTime: string, courtId: number) => {
    if (!date || !isValid(date)) return undefined;
    const [hours, minutes] = slotTime.split(':').map(Number);
    let slotStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date), hours), minutes), 0), 0);
    return allReservations.find(res => res.court_id === courtId && isEqual(parseISO(res.starts_at), slotStart));
  };

  const isSlotAvailable = (slotTime: string, courtId: number): boolean => {
    if (!date || !isValid(date)) return false;
    const [hours, minutes] = slotTime.split(':').map(Number);
    let slotStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date), hours), minutes), 0), 0);
    const slotEnd = addHours(slotStart, 1);
    const now = new Date();
    
    if (isBefore(slotEnd, now)) return false;
    if (isSameDay(date, now) && now > addMinutes(slotStart, 20)) return false;
    
    return !getSlotReservation(slotTime, courtId);
  };

  const getSlotOccupantName = (slotTime: string, courtId: number): string => {
    const res = getSlotReservation(slotTime, courtId);
    if (!res) return '';
    if (res.booked_for_first_name && res.booked_for_last_name) {
      return `${res.booked_for_first_name} ${res.booked_for_last_name}`;
    }
    return profileMap[res.user_id] || 'Socio';
  };

  const handleSlotClick = (slotTime: string) => {
    if (!selectedCourtId || !date || !isValid(date)) return;
    const courtIdNum = parseInt(selectedCourtId);
    if (!isSlotAvailable(slotTime, courtIdNum) && !selectedSlots.includes(slotTime)) return;

    const newSelected = [...selectedSlots];
    if (newSelected.includes(slotTime)) {
      setSelectedSlots(newSelected.filter(s => s !== slotTime));
    } else {
      if (newSelected.length === 0) setSelectedSlots([slotTime]);
      else {
        const sorted = [...newSelected, slotTime].sort();
        const firstIdx = allTimeSlots.indexOf(sorted[0]);
        const lastIdx = allTimeSlots.indexOf(sorted[sorted.length - 1]);
        if (lastIdx - firstIdx + 1 > 3) return;
        const range: string[] = [];
        for (let i = firstIdx; i <= lastIdx; i++) range.push(allTimeSlots[i]);
        setSelectedSlots(range);
      }
    }
  };

  const handleBooking = async () => {
    if (!date || !isValid(date)) return;
    
    // Controllo Policy Settimanale (EFFETTIVO)
    const limitsStatus = getBookingLimitsStatus(userReservations, date);
    if (!limitsStatus.canBookMoreThisWeek) {
      showError("Hai raggiunto il limite massimo di 2 prenotazioni per questa settimana (Lun-Dom).");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    
    const hasOverlap = selectedSlots.some(slotTime => {
      const slotStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date), parseInt(slotTime.split(':')[0])), 0), 0), 0);
      return userReservations.some(r => isEqual(parseISO(r.starts_at), slotStart));
    });

    if (hasOverlap) return showError("Hai già una prenotazione in questo orario su un altro campo.");

    setLoading(true);
    try {
      const courtIdNum = parseInt(selectedCourtId!);
      const courtName = courts.find(c => c.id === courtIdNum)?.name || `Campo ${courtIdNum}`;
      const inserts = selectedSlots.map(t => {
        let start = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date), parseInt(t.split(':')[0])), 0), 0), 0);
        return {
          court_id: courtIdNum, 
          user_id: user?.id,
          starts_at: start.toISOString(), 
          ends_at: addHours(start, 1).toISOString(),
          status: 'confirmed', 
          booking_type: bookingType,
          notes: `${bookingTypeLabels[bookingType]} - Socio: ${bookerFullName}`
        };
      });

      const { data: inserted, error } = await supabase.from('reservations').insert(inserts).select();
      if (error) throw error;
      
      setLastBookingData({ reservations: inserted || [], courtName });
      setShowSuccessModal(true);
      setSelectedSlots([]);
      fetchUserData();
      fetchReservations();
    } catch (e: any) { showError(e.message); }
    finally { setLoading(false); }
  };

  const getCourtAvailability = (courtId: number) => {
    if (!date || !isValid(date)) return 0;
    let availableCount = 0;
    allTimeSlots.forEach(t => {
      if (isSlotAvailable(t, courtId)) availableCount++;
    });
    return availableCount;
  };

  if (approvalLoading) return <div className="p-8 text-center bg-[#F8FAFC]">Caricamento...</div>;

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 sm:p-10 lg:p-12">
      <header className="flex justify-between items-center mb-10 max-w-7xl mx-auto">
        <div className="flex items-center gap-6">
          <Link to="/dashboard">
            <Button variant="outline" size="icon" className="rounded-2xl border-none shadow-sm bg-white text-primary hover:scale-110 active:scale-95 transition-transform">
              <ArrowLeft size={20} />
            </Button>
          </Link>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tighter">Prenota un Campo</h1>
        </div>
        <UserNav />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-7xl mx-auto">
        <div className="lg:col-span-4 space-y-8">
          <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white overflow-hidden">
            <CardHeader className="pb-0 pt-6">
              <CardTitle className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" /> Calendario
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex justify-center">
              <Calendar 
                mode="single" 
                selected={date} 
                onSelect={(d) => { if (d) setDate(d); setSelectedSlots([]); }} 
                locale={it} 
                className="rounded-3xl border-none" 
                fromDate={today}
                toDate={maxDate}
              />
            </CardContent>
          </Card>
          
          <BookingLimitsBox status={getBookingLimitsStatus(userReservations, date && isValid(date) ? date : new Date())} />
        </div>

        <div className="lg:col-span-8">
          <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white min-h-[600px] flex flex-col">
            <CardHeader className="pb-4 border-b border-gray-50 pt-8">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-primary/60">Live Availability</span>
              </div>
              <CardTitle className="text-2xl font-bold text-gray-900 capitalize">
                {format(date && isValid(date) ? date : new Date(), 'EEEE d MMMM', { locale: it })}
              </CardTitle>
            </CardHeader>
            
            <CardContent className="py-8 space-y-10 flex-grow">
              <div className="space-y-6">
                <Label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Selezione Campo</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {courts.map(court => {
                    const isSelected = selectedCourtId === court.id.toString();
                    const availability = getCourtAvailability(court.id);
                    return (
                      <button
                        key={court.id}
                        onClick={() => { setSelectedCourtId(court.id.toString()); setSelectedSlots([]); }}
                        className={cn(
                          "group relative flex flex-col items-center p-4 rounded-2xl border-2 transition-all duration-200",
                          isSelected ? "border-primary bg-primary/[0.08]" : "border-gray-50 bg-white"
                        )}
                      >
                        <h4 className={cn("font-extrabold text-sm mb-2 text-center leading-tight", isSelected ? "text-primary" : "text-gray-700")}>{court.name}</h4>
                        <Badge 
                          variant="outline"
                          className={cn(
                            "text-[9px] font-black uppercase tracking-tighter px-2 py-0 border-none hover:bg-inherit", 
                            availability > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          )}
                        >
                          {availability > 0 ? `${availability} slot` : 'Pieno'}
                        </Badge>
                      </button>
                    );
                  })}
                </div>

                {selectedCourtId && (
                  <div className="flex items-center gap-3 pt-4 animate-in fade-in slide-in-from-top-2">
                    <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tipologia:</Label>
                    <div className="flex gap-2">
                      {(['singolare', 'doppio', 'lezione'] as BookingType[]).map(type => (
                        <button
                          key={type}
                          onClick={() => setBookingType(type)}
                          className={cn(
                            "px-5 py-1.5 rounded-full text-xs font-bold transition-all border-2",
                            bookingType === type 
                              ? "bg-primary border-primary text-white shadow-md shadow-primary/10" 
                              : "bg-white border-gray-100 text-gray-400 hover:border-primary/30 hover:text-primary"
                          )}
                        >
                          {bookingTypeLabels[type]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {selectedCourtId && date && isValid(date) && (
                <div className="space-y-6 pt-8 border-t border-gray-50 animate-in fade-in slide-in-from-bottom-4">
                  <div className="flex justify-between items-end ml-1">
                    <Label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Orario</Label>
                    {selectedSlots.length > 0 && (
                      <span className="text-[10px] text-primary font-black uppercase tracking-widest bg-primary/5 px-2 py-1 rounded">
                        Selezionati: {selectedSlots.length} / max 3 ore
                      </span>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {allTimeSlots.map(t => {
                      const courtIdNum = parseInt(selectedCourtId);
                      const [hours, minutes] = t.split(':').map(Number);
                      const slotStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date), hours), minutes), 0), 0);
                      const slotEnd = addHours(slotStart, 1);
                      const now = new Date();

                      if (now >= slotEnd) return null;

                      const isSelected = selectedSlots.includes(t);
                      const available = isSlotAvailable(t, courtIdNum);
                      const endTime = format(slotEnd, 'HH:mm');
                      const occupantName = getSlotOccupantName(t, courtIdNum);
                      
                      return (
                        <button 
                          key={t} 
                          disabled={!available && !isSelected}
                          onClick={() => available && handleSlotClick(t)} 
                          className={cn(
                            "relative h-20 rounded-2xl flex flex-col items-center justify-center p-3 transition-all duration-150 border-2",
                            isSelected ? "bg-primary border-primary text-white scale-[1.02] shadow-lg shadow-primary/10" : 
                            available ? "bg-gray-50 border-transparent text-gray-700 hover:border-primary/20" : 
                            "bg-red-500 border-red-600 text-white shadow-sm"
                          )}
                        >
                          <span className={cn("text-sm font-black tracking-tight", !available && "mb-1")}>{t} - {endTime}</span>
                          {!available ? (
                            <div className="flex items-center gap-1 overflow-hidden w-full justify-center">
                              <User className="h-3 w-3 shrink-0 opacity-80" />
                              <span className="text-[10px] font-bold uppercase truncate px-1">
                                {occupantName}
                              </span>
                            </div>
                          ) : (
                            <span className={cn("text-[9px] font-black uppercase tracking-tighter mt-0.5", isSelected ? "text-white/60" : "text-primary/30")}>
                              LIBERO
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="pt-8">
                    <Button 
                      onClick={handleBooking} 
                      className={cn(
                        "w-full h-16 rounded-[1.5rem] font-black text-xl shadow-xl transition-all flex items-center justify-center gap-3",
                        selectedSlots.length > 0 ? "bg-gradient-to-br from-primary to-[#23532f] text-white hover:scale-[1.01] active:scale-[0.98] shadow-primary/20" : "bg-gray-100 text-gray-400 cursor-not-allowed shadow-none"
                      )}
                      disabled={selectedSlots.length === 0 || loading}
                    >
                      {loading ? <div className="w-6 h-6 border-3 border-white/20 border-t-white rounded-full animate-spin"></div> : <>Conferma Prenotazione <ChevronRight size={24} /></>}
                    </Button>
                  </div>
                </div>
              )}

              {!selectedCourtId && (
                <div className="flex flex-col items-center justify-center py-20 px-6 bg-gray-50/50 rounded-[2rem] border-2 border-dashed border-gray-100 text-gray-400">
                  <MapPin className="h-10 w-10 mb-4 opacity-20" />
                  <p className="text-sm font-bold uppercase tracking-widest text-center">Seleziona prima un campo per vedere gli orari</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <BookingSuccessDialog 
        open={showSuccessModal} 
        onOpenChange={setShowSuccessModal} 
        reservations={lastBookingData?.reservations || null} 
        courtName={lastBookingData?.courtName || ''} 
      />
    </div>
  );
};

export default BookingCalendar;
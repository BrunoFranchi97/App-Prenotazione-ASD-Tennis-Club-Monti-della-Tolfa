"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Users, User, Clock, MapPin, CalendarDays, ChevronRight, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { format, parseISO, addHours, setHours, setMinutes, isBefore, isEqual, setSeconds, setMilliseconds, addDays, startOfDay, endOfDay, isSameDay, addMinutes } from 'date-fns';
import { it } from 'date-fns/locale';
import { useApprovalCheck } from '@/hooks/use-approval-check';
import { Court, Reservation, BookingType } from '@/types/supabase';
import { getBookingLimitsStatus } from '@/utils/bookingLimits';
import BookingSuccessDialog from '@/components/BookingSuccessDialog';
import UserNav from '@/components/UserNav';
import { cn } from '@/lib/utils';

const bookingTypeLabels: Record<BookingType, string> = {
  singolare: 'Singolare',
  doppio: 'Doppio',
  lezione: 'Lezione'
};

const ThirdPartyBooking = () => {
  const navigate = useNavigate();
  const { isApproved, loading: approvalLoading } = useApprovalCheck();

  const [date, setDate] = useState<Date | undefined>(new Date());
  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedCourtId, setSelectedCourtId] = useState<string | undefined>(undefined);
  const [allReservations, setAllReservations] = useState<Reservation[]>([]);
  const [userReservations, setUserReservations] = useState<Reservation[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [bookingType, setBookingType] = useState<BookingType>('singolare');
  const [bookedForFirstName, setBookedForFirstName] = useState('');
  const [bookedForLastName, setBookedForLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastBookingData, setLastBookingData] = useState<{ reservations: Reservation[], courtName: string, bookedFor: string } | null>(null);

  const today = useMemo(() => startOfDay(new Date()), []);
  const maxDate = useMemo(() => addDays(today, 14), [today]);

  const fetchData = async () => {
    if (!date) return;
    setFetchingData(true);
    try {
      const startRange = startOfDay(date).toISOString();
      const endRange = endOfDay(date).toISOString();
      const { data: resData } = await supabase.from('reservations').select('*').gte('starts_at', startRange).lte('ends_at', endRange).neq('status', 'cancelled');
      setAllReservations(resData || []);
    } catch (e) { console.error(e); }
    setFetchingData(false);
  };

  useEffect(() => {
    if (!isApproved) return;
    const fetchCourtsAndUserRes = async () => {
      const { data: courtsData } = await supabase.from('courts').select('*').eq('is_active', true).order('id');
      if (courtsData) setCourts(courtsData);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: myRes } = await supabase.from('reservations').select('*').eq('user_id', user.id).neq('status', 'cancelled');
        setUserReservations(myRes || []);
      }
    };
    fetchCourtsAndUserRes();
  }, [isApproved]);

  useEffect(() => {
    if (!isApproved || !date) return;
    fetchData();
    setSelectedSlots([]);
  }, [date, isApproved]);

  const allTimeSlots = useMemo(() => {
    const slots: string[] = [];
    // Orario esteso dalle 08:00 alle 22:00 (ultimo slot parte alle 21:00)
    for (let i = 8; i < 22; i++) slots.push(format(setMinutes(setHours(new Date(), i), 0), 'HH:mm'));
    return slots;
  }, []);

  const getSlotReservation = (slotTime: string, courtId: number) => {
    const [hours, minutes] = slotTime.split(':').map(Number);
    let slotStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date!), hours), minutes), 0), 0);
    return allReservations.find(res => res.court_id === courtId && isEqual(parseISO(res.starts_at), slotStart));
  };

  const isSlotAvailable = (slotTime: string, courtId: number): boolean => {
    if (!date) return false;
    const [hours, minutes] = slotTime.split(':').map(Number);
    let slotStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date), hours), minutes), 0), 0);
    const slotEnd = addHours(slotStart, 1);
    const now = new Date();
    if (isBefore(slotEnd, now)) return false;
    if (isSameDay(date, now) && now > addMinutes(slotStart, 20)) return false;
    return !getSlotReservation(slotTime, courtId);
  };

  const handleSlotClick = (slotTime: string) => {
    if (!selectedCourtId) return;
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
    if (!date) return;

    // Controllo Policy Settimanale (identico a BookingCalendar)
    const limitsStatus = getBookingLimitsStatus(userReservations, date);
    if (!limitsStatus.canBookMoreThisWeek) {
      showError("Hai raggiunto il limite massimo di 2 prenotazioni per questa settimana (Lun-Dom).");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const sortedSlots = [...selectedSlots].sort();
      const courtIdNum = parseInt(selectedCourtId!);
      const courtName = courts.find(c => c.id === courtIdNum)?.name || `Campo ${courtIdNum}`;

      const reservationsToInsert = sortedSlots.map(slotTime => {
        let slotStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date!), parseInt(slotTime.split(':')[0])), 0), 0), 0);
        return {
          court_id: courtIdNum, user_id: user?.id,
          starts_at: slotStart.toISOString(), ends_at: addHours(slotStart, 1).toISOString(),
          status: 'confirmed', booking_type: bookingType, 
          notes: `Per ${bookedForFirstName} ${bookedForLastName} (${bookingTypeLabels[bookingType]})`,
          booked_for_first_name: bookedForFirstName, booked_for_last_name: bookedForLastName,
        };
      });

      const { data: inserted, error } = await supabase.from('reservations').insert(reservationsToInsert).select();
      if (error) throw error;
      // Aggiorna userReservations localmente per il controllo limite nella stessa sessione
      setUserReservations(prev => [...prev, ...(inserted || [])]);
      setLastBookingData({ reservations: inserted || reservationsToInsert as any, courtName, bookedFor: `${bookedForFirstName} ${bookedForLastName}` });
      setShowSuccessModal(true);
      setSelectedSlots([]);
      setBookedForFirstName('');
      setBookedForLastName('');
    } catch (e: any) { showError(e.message); }
    finally { setLoading(false); }
  };

  const getCourtAvailability = (courtId: number) => {
    let availableCount = 0;
    allTimeSlots.forEach(t => {
      if (isSlotAvailable(t, courtId)) availableCount++;
    });
    return availableCount;
  };

  if (approvalLoading) return <div className="p-8 text-center bg-[#F8FAFC]">Verifica...</div>;

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 sm:p-10 lg:p-12">
      <header className="flex justify-between items-center mb-10 max-w-7xl mx-auto">
        <div className="flex items-center gap-6">
          <Link to="/dashboard">
            <Button variant="outline" size="icon" className="rounded-2xl border-none shadow-sm bg-white text-primary hover:scale-110 active:scale-95 transition-transform">
              <ArrowLeft size={20} />
            </Button>
          </Link>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tighter">Prenota per un Socio</h1>
        </div>
        <UserNav />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-7xl mx-auto">
        <div className="lg:col-span-4 space-y-8">
          <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white overflow-hidden">
            <CardHeader className="pb-0 pt-6">
              <CardTitle className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" /> Seleziona Data
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex justify-center">
              <Calendar 
                mode="single" 
                selected={date} 
                onSelect={(d) => { setDate(d); setSelectedSlots([]); }} 
                locale={it} 
                className="rounded-3xl border-none" 
                fromDate={today}
                toDate={maxDate}
              />
            </CardContent>
          </Card>
          
          <div className="bg-primary/5 p-8 rounded-[2rem] border border-primary/10">
            <h4 className="text-sm font-bold text-primary mb-3 flex items-center gap-2">
              <Users size={18} /> Prenotazione Libera
            </h4>
            <p className="text-xs text-gray-500 leading-relaxed font-medium">
              Le prenotazioni effettuate per conto di altri soci non concorrono al tuo limite settimanale di 2 match.
            </p>
          </div>
        </div>

        <div className="lg:col-span-8">
          <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white min-h-[600px] flex flex-col">
            <CardHeader className="pb-4 border-b border-gray-50 pt-8">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-primary/60">Disponibilità Tempo Reale</span>
              </div>
              <CardTitle className="text-2xl font-bold text-gray-900 capitalize">
                {format(date || new Date(), 'EEEE d MMMM', { locale: it })}
              </CardTitle>
            </CardHeader>
            
            <CardContent className="py-8 space-y-10 flex-grow">
              <div className="space-y-6">
                <Label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Socio Beneficiario</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Input 
                      placeholder="Nome" 
                      className="h-14 rounded-2xl border-gray-100 bg-gray-50 focus:ring-primary/20 text-base font-medium px-6"
                      value={bookedForFirstName} 
                      onChange={e => setBookedForFirstName(e.target.value)} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Input 
                      placeholder="Cognome" 
                      className="h-14 rounded-2xl border-gray-100 bg-gray-50 focus:ring-primary/20 text-base font-medium px-6"
                      value={bookedForLastName} 
                      onChange={e => setBookedForLastName(e.target.value)} 
                    />
                  </div>
                </div>
              </div>

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
                          isSelected ? "border-primary bg-primary/[0.08]" : "border-gray-50 bg-white hover:border-primary/20 hover:bg-gray-50"
                        )}
                      >
                        <h4 className={cn("font-extrabold text-sm mb-2 text-center leading-tight", isSelected ? "text-primary" : "text-gray-700")}>{court.name}</h4>
                        <Badge className={cn("text-[9px] font-black uppercase tracking-tighter px-2 py-0", availability > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
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

              <div className="space-y-6 pt-8 border-t border-gray-50">
                <div className="flex justify-between items-end ml-1">
                  <Label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Selezione Orario</Label>
                  {selectedSlots.length > 0 && (
                    <span className="text-[10px] text-primary font-black uppercase tracking-widest bg-primary/5 px-2 py-1 rounded">
                      Selezionati: {selectedSlots.length} / max 3 ore
                    </span>
                  )}
                </div>
                
                {!selectedCourtId ? (
                  <div className="flex flex-col items-center justify-center py-16 px-6 bg-gray-50/50 rounded-[2rem] border-2 border-dashed border-gray-100 text-gray-400">
                    <MapPin className="h-8 w-8 mb-3 opacity-20" />
                    <p className="text-xs font-bold uppercase tracking-widest text-center">← Seleziona prima un campo</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 animate-in fade-in slide-in-from-bottom-4">
                    {allTimeSlots.map(t => {
                      const courtIdNum = parseInt(selectedCourtId);
                      const [hours, minutes] = t.split(':').map(Number);
                      const slotStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date!), hours), minutes), 0), 0);
                      const slotEnd = addHours(slotStart, 1);
                      const now = new Date();

                      if (now >= slotEnd) return null;

                      const isSelected = selectedSlots.includes(t);
                      const res = getSlotReservation(t, courtIdNum);
                      const available = isSlotAvailable(t, courtIdNum);
                      const endTime = format(slotEnd, 'HH:mm');
                      
                      return (
                        <button 
                          key={t} 
                          disabled={!available && !isSelected}
                          onClick={() => available && handleSlotClick(t)} 
                          className={cn(
                            "relative h-16 rounded-2xl flex flex-col items-center justify-center p-2 transition-all duration-150 border-2",
                            isSelected ? "bg-primary border-primary text-white scale-[1.02] shadow-lg shadow-primary/10" : 
                            available ? "bg-gray-50 border-transparent text-gray-700 hover:border-primary/20" : 
                            "bg-gray-100 border-transparent text-gray-300 cursor-not-allowed opacity-40"
                          )}
                        >
                          <span className="text-sm font-black tracking-tight">{t} - {endTime}</span>
                          <span className={cn("text-[9px] font-black uppercase tracking-tighter mt-0.5", isSelected ? "text-white/60" : available ? "text-primary/30" : "text-destructive")}>
                            {res ? 'OCCUPATO' : 'LIBERO'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pt-8">
                <Button 
                  onClick={handleBooking} 
                  className={cn(
                    "w-full h-16 rounded-[1.5rem] font-black text-xl shadow-xl transition-all flex items-center justify-center gap-3",
                    (selectedSlots.length > 0 && bookedForFirstName && bookedForLastName) ? "bg-gradient-to-br from-primary to-[#23532f] text-white hover:scale-[1.01] active:scale-[0.98] shadow-primary/20" : "bg-gray-100 text-gray-400 cursor-not-allowed shadow-none"
                  )}
                  disabled={selectedSlots.length === 0 || loading || !bookedForFirstName || !bookedForLastName}
                >
                  {loading ? <div className="w-6 h-6 border-3 border-white/20 border-t-white rounded-full animate-spin"></div> : <>Conferma Prenotazione <ChevronRight size={24} /></>}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <BookingSuccessDialog open={showSuccessModal} onOpenChange={setShowSuccessModal} reservations={lastBookingData?.reservations || null} courtName={lastBookingData?.courtName || ''} bookedFor={lastBookingData?.bookedFor} />
    </div>
  );
};

export default ThirdPartyBooking;
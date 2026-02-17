"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowLeft, LogOut, CalendarDays, Clock, MapPin, AlertCircle, CalendarCheck, History, CalendarRange, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { format, parseISO, addHours, setHours, setMinutes, isBefore, isAfter, isEqual, setSeconds, setMilliseconds, addDays, startOfDay, endOfDay, startOfWeek, endOfWeek } from 'date-fns';
import { it } from 'date-fns/locale';
import { useApprovalCheck } from '@/hooks/use-approval-check';
import { Court, Reservation, BookingType } from '@/types/supabase';
import { getBookingLimitsStatus } from '@/utils/bookingLimits';
import BookingLimitsBox from '@/components/BookingLimitsBox';
import BookingSuccessDialog from '@/components/BookingSuccessDialog';

const bookingTypeLabels: Record<BookingType, string> = {
  singolare: 'Singolare',
  doppio: 'Doppio',
  lezione: 'Lezione con Maestro'
};

const BookingCalendar = () => {
  const navigate = useNavigate();
  const { isApproved, loading: approvalLoading } = useApprovalCheck();

  const [date, setDate] = useState<Date | undefined>(new Date());
  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedCourtId, setSelectedCourtId] = useState<string | undefined>(undefined);
  const [existingReservations, setExistingReservations] = useState<any[]>([]);
  const [userReservations, setUserReservations] = useState<Reservation[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]); 
  const [bookingType, setBookingType] = useState<BookingType>('singolare');
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);
  const [bookerFullName, setBookerFullName] = useState<string | null>(null);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastBookingData, setLastBookingData] = useState<{ reservations: Reservation[], courtName: string } | null>(null);

  const maxDate = useMemo(() => addDays(new Date(), 14), []);

  const limitsStatus = useMemo(() => {
    if (!date) return { weeklyCount: 0, weeklyMax: 2, durationMax: 3, canBookMoreThisWeek: true };
    return getBookingLimitsStatus(userReservations, date);
  }, [userReservations, date]);

  const weekRange = useMemo(() => {
    if (!date) return "";
    const start = startOfWeek(date, { locale: it, weekStartsOn: 1 });
    const end = endOfWeek(date, { locale: it, weekStartsOn: 1 });
    return `dal ${format(start, 'dd MMM')} al ${format(end, 'dd MMM')}`;
  }, [date]);

  const showWeeklyBlock = !limitsStatus.canBookMoreThisWeek;

  useEffect(() => {
    if (!isApproved) return;
    const fetchProfileData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
        if (profile) setBookerFullName(profile.full_name);

        const { data: myRes } = await supabase
          .from('reservations')
          .select('*')
          .eq('user_id', user.id)
          .neq('status', 'cancelled');
        setUserReservations(myRes || []);
      }
    };
    fetchProfileData();
  }, [isApproved]);

  const fetchData = async () => {
    if (!date || !selectedCourtId) return;
    setFetchingData(true);
    try {
      const startRange = startOfDay(date).toISOString();
      const endRange = endOfDay(date).toISOString();
      const { data: resData } = await supabase.from('reservations').select('*').eq('court_id', parseInt(selectedCourtId)).gte('starts_at', startRange).lte('ends_at', endRange).neq('status', 'cancelled');
      setExistingReservations(resData || []);
      if (resData && resData.length > 0) {
        const userIds = [...new Set(resData.map(r => r.user_id))];
        const { data: profData } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
        const profMap: Record<string, string> = {};
        profData?.forEach(p => { profMap[p.id] = p.full_name || 'Socio'; });
        setProfiles(profMap);
      }
    } catch (error: any) { console.error(error); }
    setFetchingData(false);
  };

  useEffect(() => {
    if (!isApproved) return;
    const fetchCourts = async () => {
      const { data } = await supabase.from('courts').select('*').eq('is_active', true);
      if (data) {
        setCourts(data);
        if (data.length > 0 && !selectedCourtId) setSelectedCourtId(data[0].id.toString());
      }
    };
    fetchCourts();
  }, [isApproved]);

  useEffect(() => {
    if (!isApproved || !date || !selectedCourtId) return;
    fetchData();
    setSelectedSlots([]);
  }, [date, selectedCourtId, isApproved]);

  const allTimeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let i = 8; i < 20; i++) slots.push(format(setMinutes(setHours(new Date(), i), 0), 'HH:mm'));
    return slots;
  }, []);

  const getSlotReservation = (slotTime: string) => {
    const [hours, minutes] = slotTime.split(':').map(Number);
    let slotStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date!), hours), minutes), 0), 0);
    return existingReservations.find(res => isEqual(parseISO(res.starts_at), slotStart));
  };

  const isSlotAvailable = (slotTime: string): boolean => {
    if (!date || !selectedCourtId) return false;
    const [hours, minutes] = slotTime.split(':').map(Number);
    let slotStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date), hours), minutes), 0), 0);
    const slotEnd = addHours(slotStart, 1);
    if (isBefore(slotEnd, new Date())) return false;
    return !getSlotReservation(slotTime);
  };

  const handleSlotClick = (slotTime: string) => {
    if (!isSlotAvailable(slotTime) && !selectedSlots.includes(slotTime)) return;
    if (!selectedSlots.includes(slotTime) && !limitsStatus.canBookMoreThisWeek) return;

    const newSelected = [...selectedSlots];
    if (newSelected.includes(slotTime)) {
      setSelectedSlots(newSelected.filter(s => s !== slotTime));
    } else {
      if (newSelected.length === 0) {
        setSelectedSlots([slotTime]);
      } else {
        const sorted = [...newSelected, slotTime].sort();
        const firstIdx = allTimeSlots.indexOf(sorted[0]);
        const lastIdx = allTimeSlots.indexOf(sorted[sorted.length - 1]);
        if (lastIdx - firstIdx + 1 > limitsStatus.durationMax) return;
        const range: string[] = [];
        for (let i = firstIdx; i <= lastIdx; i++) {
          if (!isSlotAvailable(allTimeSlots[i]) && !newSelected.includes(allTimeSlots[i])) return;
          range.push(allTimeSlots[i]);
        }
        setSelectedSlots(range);
      }
    }
  };

  const handleBooking = async () => {
    if (!limitsStatus.canBookMoreThisWeek) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const sortedSlots = [...selectedSlots].sort();
      const courtIdNum = parseInt(selectedCourtId!);
      const currentCourt = courts.find(c => c.id === courtIdNum);
      const courtName = currentCourt?.name || `Campo ${courtIdNum}`;

      const reservationsToInsert = sortedSlots.map(slotTime => {
        let slotStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date!), parseInt(slotTime.split(':')[0])), 0), 0), 0);
        return {
          court_id: courtIdNum, user_id: user?.id,
          starts_at: slotStart.toISOString(), ends_at: addHours(slotStart, 1).toISOString(),
          status: 'confirmed', booking_type: bookingType,
          notes: `${bookingTypeLabels[bookingType]} - Prenotata da: ${bookerFullName || user?.email}`,
        };
      });

      const { data: inserted, error } = await supabase.from('reservations').insert(reservationsToInsert).select();
      if (error) throw error;
      setLastBookingData({ reservations: inserted || reservationsToInsert as any, courtName });
      setShowSuccessModal(true);
    } catch (error: any) { showError(error.message); }
    finally { setLoading(false); }
  };

  if (approvalLoading) return <div className="p-8 text-center bg-[#F8FAFC]">Verifica...</div>;

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 sm:p-10 lg:p-12">
      <header className="flex justify-between items-center mb-12 max-w-7xl mx-auto">
        <div className="flex items-center gap-6">
          <Link to="/dashboard">
            <Button variant="outline" size="icon" className="rounded-2xl border-none shadow-sm bg-white text-primary hover:scale-110 active:scale-95">
              <ArrowLeft size={20} />
            </Button>
          </Link>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tighter">Prenota un Campo</h1>
        </div>
        <div className="flex items-center gap-4">
          <History 
            className="text-gray-400 hover:text-primary cursor-pointer transition-colors hidden sm:block" 
            onClick={() => navigate('/history')}
            size={24}
          />
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-7xl mx-auto">
        <div className="lg:col-span-4 space-y-8">
          <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white overflow-hidden">
            <CardHeader className="pb-0">
              <CardTitle className="text-lg font-bold text-gray-800">Seleziona Data</CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex justify-center">
              <Calendar 
                mode="single" 
                selected={date} 
                onSelect={setDate} 
                locale={it} 
                className="rounded-3xl border-none" 
                disabled={(d) => isBefore(d, startOfDay(new Date())) || isAfter(d, maxDate)} 
              />
            </CardContent>
          </Card>
          {!showWeeklyBlock && <BookingLimitsBox status={limitsStatus} isChecking={fetchingData} />}
        </div>

        <div className="lg:col-span-8">
          <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white min-h-[600px] flex flex-col">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-primary/60">Disponibilità Tempo Reale</span>
              </div>
              <CardTitle className="text-2xl font-bold text-gray-900">Configura la tua partita</CardTitle>
            </CardHeader>
            <CardContent className="space-y-8 flex-grow">
              {showWeeklyBlock ? (
                <div className="flex flex-col items-center justify-center py-20 px-8 text-center space-y-8 animate-in fade-in zoom-in duration-500">
                  <div className="bg-amber-50 p-8 rounded-[2.5rem]">
                    <AlertCircle className="h-20 w-20 text-amber-500" />
                  </div>
                  <div className="space-y-4 max-w-md">
                    <h3 className="text-3xl font-extrabold text-gray-900 tracking-tight">Oops, limite raggiunto!</h3>
                    <p className="text-gray-500 text-lg">Hai già prenotato i tuoi 2 match settimanali per <span className="font-bold text-primary">{weekRange}</span>.</p>
                    <div className="flex flex-col gap-3 pt-6">
                      <Button onClick={() => navigate('/history')} className="premium-button-primary h-14 text-lg">
                        Gestisci le mie prenotazioni
                      </Button>
                      <Button variant="ghost" onClick={() => setDate(addDays(new Date(), 7))} className="text-primary font-bold">
                        Prova la prossima settimana
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <Label className="text-sm font-bold text-gray-700 ml-1">Campo da Gioco</Label>
                      <Select onValueChange={setSelectedCourtId} value={selectedCourtId}>
                        <SelectTrigger className="h-14 rounded-2xl border-gray-100 bg-gray-50/50 focus:ring-primary/20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl">
                          {courts.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-3">
                      <Label className="text-sm font-bold text-gray-700 ml-1">Tipologia</Label>
                      <Select onValueChange={(v) => setBookingType(v as BookingType)} value={bookingType}>
                        <SelectTrigger className="h-14 rounded-2xl border-gray-100 bg-gray-50/50 focus:ring-primary/20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl">
                          <SelectItem value="singolare">Singolare</SelectItem>
                          <SelectItem value="doppio">Doppio</SelectItem>
                          <SelectItem value="lezione">Lezione</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center ml-1">
                      <Label className="text-sm font-bold text-gray-700">Seleziona Orario</Label>
                      <span className="text-[11px] text-gray-400 font-medium italic">Max 3 ore consecutive</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {allTimeSlots.map(t => {
                        const isSelected = selectedSlots.includes(t);
                        const res = getSlotReservation(t);
                        const available = isSlotAvailable(t);
                        const endTime = format(addHours(setMinutes(setHours(new Date(), parseInt(t.split(':')[0])), 0), 1), 'HH:mm');
                        
                        return (
                          <button 
                            key={t} 
                            disabled={!available && !isSelected}
                            onClick={() => available && handleSlotClick(t)} 
                            className={`
                              relative h-20 rounded-2xl flex flex-col items-center justify-center p-2 transition-all duration-300
                              ${isSelected 
                                ? 'bg-gradient-to-br from-accent to-[#b85a20] text-white shadow-lg shadow-accent/20 scale-[0.98]' 
                                : available 
                                  ? 'bg-gray-50 text-gray-700 hover:bg-primary/5 hover:border-primary/20 hover:text-primary border-2 border-transparent' 
                                  : 'bg-gray-100 text-gray-300 cursor-not-allowed opacity-50'
                              }
                            `}
                          >
                            <span className="text-base font-bold tracking-tight">{t} - {endTime}</span>
                            <span className="text-[10px] font-medium opacity-60 uppercase tracking-tighter">
                              {res ? profiles[res.user_id]?.split(' ')[0] : 'Disponibile'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-8 border-t border-gray-50">
                    <Button 
                      onClick={handleBooking} 
                      className="w-full h-16 rounded-[1.5rem] bg-gradient-to-br from-primary to-[#23532f] hover:scale-[1.01] active:scale-[0.98] text-xl font-extrabold shadow-xl shadow-primary/20 flex items-center justify-center gap-3 transition-all"
                      disabled={selectedSlots.length === 0 || loading}
                    >
                      {loading ? (
                        <div className="w-6 h-6 border-3 border-white/20 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <>Conferma Prenotazione <ChevronRight size={24} /></>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <BookingSuccessDialog open={showSuccessModal} onOpenChange={setShowSuccessModal} reservations={lastBookingData?.reservations || null} courtName={lastBookingData?.courtName || ''} />
    </div>
  );
};

export default BookingCalendar;
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, History, AlertCircle, ChevronRight, ChevronLeft, Calendar as CalendarIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { format, parseISO, addHours, setHours, setMinutes, isBefore, isAfter, addDays, startOfDay, endOfDay, startOfWeek, endOfWeek, setSeconds, setMilliseconds, isEqual, subDays } from 'date-fns';
import { it } from 'date-fns/locale';
import { useApprovalCheck } from '@/hooks/use-approval-check';
import { Court, Reservation, BookingType } from '@/types/supabase';
import { getBookingLimitsStatus } from '@/utils/bookingLimits';
import BookingSuccessDialog from '@/components/BookingSuccessDialog';

const bookingTypeLabels: Record<BookingType, string> = {
  singolare: 'Singolare',
  doppio: 'Doppio',
  lezione: 'Lezione con Maestro'
};

interface TimeSlot {
  time: string;
  hour: number;
}

const BookingCalendar = () => {
  const navigate = useNavigate();
  const { isApproved, loading: approvalLoading } = useApprovalCheck();

  const [date, setDate] = useState<Date>(new Date());
  const [courts, setCourts] = useState<Court[]>([]);
  const [existingReservations, setExistingReservations] = useState<Reservation[]>([]);
  const [userReservations, setUserReservations] = useState<Reservation[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [selectedSlot, setSelectedSlot] = useState<{ courtId: number; time: string } | null>(null);
  const [bookingType, setBookingType] = useState<BookingType>('singolare');
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);
  const [bookerFullName, setBookerFullName] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastBookingData, setLastBookingData] = useState<{ reservations: Reservation[], courtName: string } | null>(null);

  const maxDate = useMemo(() => addDays(new Date(), 14), []);
  const minDate = useMemo(() => startOfDay(new Date()), []);

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

  const timeSlots: TimeSlot[] = useMemo(() => {
    const slots: TimeSlot[] = [];
    for (let i = 8; i < 20; i++) {
      slots.push({ time: `${String(i).padStart(2, '0')}:00`, hour: i });
    }
    return slots;
  }, []);

  const canGoBack = useMemo(() => !isBefore(subDays(date, 1), minDate), [date, minDate]);
  const canGoForward = useMemo(() => !isAfter(addDays(date, 1), maxDate), [date, maxDate]);

  useEffect(() => {
    if (!isApproved) return;
    const fetchProfileData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
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
    if (!date) return;
    setFetchingData(true);
    try {
      const startRange = startOfDay(date).toISOString();
      const endRange = endOfDay(date).toISOString();
      const { data: resData } = await supabase
        .from('reservations')
        .select('*')
        .gte('starts_at', startRange)
        .lte('ends_at', endRange)
        .neq('status', 'cancelled');
      
      setExistingReservations(resData || []);
      
      if (resData && resData.length > 0) {
        const userIds = [...new Set(resData.map(r => r.user_id))];
        const { data: profData } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
        const profMap: Record<string, string> = {};
        profData?.forEach(p => { profMap[p.id] = p.full_name || 'Socio'; });
        setProfiles(profMap);
      }
    } catch (error: any) { 
      console.error(error); 
    }
    setFetchingData(false);
  };

  useEffect(() => {
    if (!isApproved) return;
    const fetchCourts = async () => {
      const { data } = await supabase.from('courts').select('*').eq('is_active', true).order('name');
      if (data) setCourts(data);
    };
    fetchCourts();
  }, [isApproved]);

  useEffect(() => {
    if (!isApproved || !date) return;
    fetchData();
    setSelectedSlot(null);
  }, [date, isApproved]);

  const getReservationForSlot = (courtId: number, slotTime: string): Reservation | undefined => {
    const [hours] = slotTime.split(':').map(Number);
    let slotStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date), hours), 0), 0), 0);
    return existingReservations.find(res => 
      res.court_id === courtId && isEqual(parseISO(res.starts_at), slotStart)
    );
  };

  const isSlotAvailable = (courtId: number, slotTime: string): boolean => {
    if (!date) return false;
    const [hours] = slotTime.split(':').map(Number);
    let slotStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date), hours), 0), 0), 0);
    const slotEnd = addHours(slotStart, 1);
    if (isBefore(slotEnd, new Date())) return false;
    return !getReservationForSlot(courtId, slotTime);
  };

  const handleSlotClick = (courtId: number, slotTime: string) => {
    if (!isSlotAvailable(courtId, slotTime)) return;
    if (!limitsStatus.canBookMoreThisWeek) return;
    setSelectedSlot({ courtId, time: slotTime });
  };

  const handleBooking = async () => {
    if (!selectedSlot || !limitsStatus.canBookMoreThisWeek) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const [hours] = selectedSlot.time.split(':').map(Number);
      let slotStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date), hours), 0), 0), 0);
      
      const currentCourt = courts.find(c => c.id === selectedSlot.courtId);
      const courtName = currentCourt?.name || `Campo ${selectedSlot.courtId}`;

      const reservation = {
        court_id: selectedSlot.courtId,
        user_id: user?.id,
        starts_at: slotStart.toISOString(),
        ends_at: addHours(slotStart, 1).toISOString(),
        status: 'confirmed' as const,
        booking_type: bookingType,
        notes: `${bookingTypeLabels[bookingType]} - Prenotata da: ${bookerFullName || user?.email}`,
      };

      const { data: inserted, error } = await supabase.from('reservations').insert([reservation]).select();
      if (error) throw error;
      
      setLastBookingData({ reservations: inserted || [reservation as any], courtName });
      setShowSuccessModal(true);
      fetchData();
      setSelectedSlot(null);
    } catch (error: any) { 
      showError(error.message); 
    } finally { 
      setLoading(false); 
    }
  };

  const handlePreviousDay = () => {
    if (canGoBack) setDate(subDays(date, 1));
  };

  const handleNextDay = () => {
    if (canGoForward) setDate(addDays(date, 1));
  };

  const handleToday = () => {
    setDate(new Date());
  };

  if (approvalLoading) return <div className="p-8 text-center bg-[#F8FAFC]">Verifica...</div>;

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 sm:p-6 lg:p-8">
      <header className="flex justify-between items-center mb-8 max-w-[1600px] mx-auto">
        <div className="flex items-center gap-4">
          <Link to="/dashboard">
            <Button variant="outline" size="icon" className="rounded-2xl border-none shadow-sm bg-white text-primary hover:scale-110 active:scale-95">
              <ArrowLeft size={20} />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Prenota Campo</h1>
            <p className="text-sm text-gray-500 mt-1">Seleziona uno slot libero</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <History 
            className="text-gray-400 hover:text-primary cursor-pointer transition-colors hidden sm:block" 
            onClick={() => navigate('/history')}
            size={24}
          />
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto">
        {showWeeklyBlock ? (
          <Card className="border-none shadow-sm rounded-2xl bg-white p-12 text-center">
            <AlertCircle className="h-16 w-16 text-amber-500 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Limite Settimanale Raggiunto</h3>
            <p className="text-gray-600 mb-6">Hai già prenotato 2 match per {weekRange}</p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => navigate('/history')} className="bg-primary hover:bg-primary/90">
                Gestisci Prenotazioni
              </Button>
              <Button variant="outline" onClick={() => setDate(addDays(new Date(), 7))}>
                Prossima Settimana
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="border-none shadow-sm rounded-2xl bg-white overflow-hidden">
            <CardHeader className="pb-4 bg-gradient-to-r from-primary/5 to-transparent">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-4">
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={handlePreviousDay}
                    disabled={!canGoBack}
                    className="rounded-xl"
                  >
                    <ChevronLeft size={20} />
                  </Button>
                  
                  <div className="text-center">
                    <CardTitle className="text-2xl font-bold text-gray-900 capitalize">
                      {format(date, "EEEE dd MMMM", { locale: it })}
                    </CardTitle>
                    <p className="text-sm text-gray-500 mt-1">
                      {selectedSlot 
                        ? `${courts.find(c => c.id === selectedSlot.courtId)?.name} alle ${selectedSlot.time}` 
                        : "Nessuno slot selezionato"}
                    </p>
                  </div>

                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={handleNextDay}
                    disabled={!canGoForward}
                    className="rounded-xl"
                  >
                    <ChevronRight size={20} />
                  </Button>
                </div>

                <div className="flex items-center gap-3">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleToday}
                    className="rounded-xl"
                  >
                    <CalendarIcon size={16} className="mr-2" />
                    Oggi
                  </Button>

                  {selectedSlot && (
                    <>
                      <Select onValueChange={(v) => setBookingType(v as BookingType)} value={bookingType}>
                        <SelectTrigger className="w-40 h-10 rounded-xl border-gray-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="singolare">Singolare</SelectItem>
                          <SelectItem value="doppio">Doppio</SelectItem>
                          <SelectItem value="lezione">Lezione</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button 
                        onClick={handleBooking} 
                        disabled={loading}
                        className="bg-primary hover:bg-primary/90 text-white h-10 px-6 rounded-xl font-bold"
                      >
                        {loading ? "..." : "Conferma"}
                        <ChevronRight size={18} className="ml-1" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <div className="min-w-[800px]">
                  {/* Header Campi */}
                  <div className="grid grid-cols-[80px_repeat(auto-fit,minmax(150px,1fr))] gap-0 border-b border-gray-200 bg-gray-50">
                    <div className="p-3 text-xs font-bold text-gray-500 uppercase tracking-wider"></div>
                    {courts.map(court => (
                      <div key={court.id} className="p-3 text-center border-l border-gray-200">
                        <p className="font-bold text-sm text-gray-900">{court.name}</p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">{court.surface}</p>
                      </div>
                    ))}
                  </div>

                  {/* Griglia Orari */}
                  <div className="divide-y divide-gray-100">
                    {timeSlots.map(slot => (
                      <div key={slot.time} className="grid grid-cols-[80px_repeat(auto-fit,minmax(150px,1fr))] gap-0 hover:bg-gray-50/50 transition-colors">
                        <div className="p-3 flex items-center justify-center border-r border-gray-100">
                          <span className="text-sm font-semibold text-gray-600">{slot.time}</span>
                        </div>
                        {courts.map(court => {
                          const reservation = getReservationForSlot(court.id, slot.time);
                          const isAvailable = isSlotAvailable(court.id, slot.time);
                          const isUserReservation = reservation?.user_id === currentUserId;
                          const isSelected = selectedSlot?.courtId === court.id && selectedSlot?.time === slot.time;
                          
                          return (
                            <div 
                              key={`${court.id}-${slot.time}`}
                              className="p-2 border-l border-gray-100 min-h-[60px] flex items-center justify-center"
                            >
                              {reservation ? (
                                <div className={`w-full h-full rounded-lg p-2 flex flex-col justify-center ${
                                  isUserReservation 
                                    ? 'bg-primary text-white' 
                                    : 'bg-club-orange text-white'
                                }`}>
                                  <p className="text-xs font-bold truncate">
                                    {isUserReservation ? "Tu" : profiles[reservation.user_id]?.split(' ')[0] || "Prenotato"}
                                  </p>
                                  <p className="text-[10px] opacity-80">
                                    {format(parseISO(reservation.starts_at), 'HH:mm')} - {format(parseISO(reservation.ends_at), 'HH:mm')}
                                  </p>
                                </div>
                              ) : isAvailable ? (
                                <button
                                  onClick={() => handleSlotClick(court.id, slot.time)}
                                  disabled={!limitsStatus.canBookMoreThisWeek}
                                  className={`w-full h-full rounded-lg transition-all ${
                                    isSelected 
                                      ? 'bg-primary text-white shadow-lg scale-105' 
                                      : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
                                  } ${
                                    !limitsStatus.canBookMoreThisWeek 
                                      ? 'opacity-50 cursor-not-allowed' 
                                      : 'cursor-pointer hover:scale-105 active:scale-95'
                                  }`}
                                >
                                  {isSelected && <span className="text-xs font-bold">✓</span>}
                                </button>
                              ) : (
                                <div className="w-full h-full rounded-lg bg-gray-200 opacity-50"></div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
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
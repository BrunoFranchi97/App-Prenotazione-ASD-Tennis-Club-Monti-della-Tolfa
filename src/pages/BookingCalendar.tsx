"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, History, AlertCircle, ChevronRight, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { format, parseISO, addHours, setHours, setMinutes, isBefore, isAfter, addDays, startOfDay, endOfDay, startOfWeek, endOfWeek, setSeconds, setMilliseconds, isEqual } from 'date-fns';
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

interface CourtReservation {
  courtId: number;
  courtName: string;
  surface: string;
  reservations: Reservation[];
}

const BookingCalendar = () => {
  const navigate = useNavigate();
  const { isApproved, loading: approvalLoading } = useApprovalCheck();

  const [date, setDate] = useState<Date | undefined>(new Date());
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
    let slotStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date!), hours), 0), 0), 0);
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
      let slotStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date!), hours), 0), 0), 0);
      
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

  const getSlotColor = (reservation: Reservation | undefined, isSelected: boolean, isUserReservation: boolean): string => {
    if (isSelected) return 'bg-club-orange text-white shadow-lg';
    if (!reservation) return 'bg-gray-50 hover:bg-gray-100 border border-gray-200';
    if (isUserReservation) return 'bg-primary text-white';
    return 'bg-[#8B6F47] text-white'; // Colore terracotta per altri giocatori
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
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Vista Giornaliera</h1>
            <p className="text-sm text-gray-500 mt-1">Tocca uno slot libero per prenotare</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-[1600px] mx-auto">
        {/* Sidebar */}
        <div className="lg:col-span-3 space-y-6">
          <Card className="border-none shadow-sm rounded-2xl bg-white overflow-hidden">
            <CardHeader className="pb-3 bg-primary/5">
              <CardTitle className="text-base font-bold text-gray-800">Seleziona Data</CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <Calendar 
                mode="single" 
                selected={date} 
                onSelect={setDate} 
                locale={it} 
                className="rounded-xl border-none" 
                disabled={(d) => isBefore(d, startOfDay(new Date())) || isAfter(d, maxDate)} 
              />
            </CardContent>
          </Card>

          {/* Legenda */}
          <Card className="border-none shadow-sm rounded-2xl bg-white p-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3">Legenda</h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-primary"></div>
                <span>Le tue prenotazioni</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-[#8B6F47]"></div>
                <span>Altri giocatori</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-gray-100 border border-gray-200"></div>
                <span>Disponibile</span>
              </div>
            </div>
          </Card>

          {/* Stato Campi */}
          <Card className="border-none shadow-sm rounded-2xl bg-white p-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3">Stato Campi</h3>
            <div className="space-y-2">
              {courts.map(court => {
                const courtReservations = existingReservations.filter(r => r.court_id === court.id);
                const isAvailable = courtReservations.length < timeSlots.length;
                return (
                  <div key={court.id} className="flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-gray-800">{court.name}</p>
                      <p className="text-gray-500 uppercase text-[10px]">{court.surface}</p>
                    </div>
                    <Badge variant={isAvailable ? "default" : "secondary"} className={isAvailable ? "bg-green-100 text-green-700 border-none" : "bg-red-100 text-red-700 border-none"}>
                      {isAvailable ? "Libero" : "Occupato"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Griglia Principale */}
        <div className="lg:col-span-9">
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
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-xl font-bold text-gray-900">
                      {date ? format(date, "EEEE dd MMMM yyyy", { locale: it }) : "Seleziona una data"}
                    </CardTitle>
                    <p className="text-sm text-gray-500 mt-1">
                      {selectedSlot ? `Slot selezionato: ${courts.find(c => c.id === selectedSlot.courtId)?.name} alle ${selectedSlot.time}` : "Nessuno slot selezionato"}
                    </p>
                  </div>
                  {selectedSlot && (
                    <div className="flex items-center gap-3">
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
                        className="bg-club-orange hover:bg-club-orange/90 text-white h-10 px-6 rounded-xl font-bold"
                      >
                        {loading ? "..." : "Conferma"}
                        <ChevronRight size={18} className="ml-1" />
                      </Button>
                    </div>
                  )}
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
                                  <div className={`w-full h-full rounded-lg p-2 flex flex-col justify-center ${getSlotColor(reservation, false, isUserReservation)}`}>
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
                                    className={`w-full h-full rounded-lg transition-all ${getSlotColor(undefined, isSelected, false)} ${!limitsStatus.canBookMoreThisWeek ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-105 active:scale-95'}`}
                                  >
                                    {isSelected && <span className="text-xs font-bold">Selezionato</span>}
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
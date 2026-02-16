"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { ArrowLeft, LogOut, CalendarDays, Clock, MapPin, Target, User, Lock, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { format, parseISO, addHours, setHours, setMinutes, isBefore, isAfter, isEqual, setSeconds, setMilliseconds, addDays, startOfDay, endOfDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { useApprovalCheck } from '@/hooks/use-approval-check';
import { Court, Reservation, BookingType } from '@/types/supabase';
import { getBookingLimitsStatus, BookingLimitsStatus } from '@/utils/bookingLimits';
import BookingLimitsBox from '@/components/BookingLimitsBox';

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

  const maxDate = useMemo(() => addDays(new Date(), 14), []);

  const limitsStatus = useMemo(() => {
    if (!date) return { weeklyCount: 0, weeklyMax: 2, dailyCount: 0, dailyMax: 1, durationMax: 3, canBookMoreThisWeek: true, canBookMoreToday: true };
    return getBookingLimitsStatus(userReservations, date);
  }, [userReservations, date]);

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
      
      const { data: resData, error: resError } = await supabase
        .from('reservations')
        .select('*')
        .eq('court_id', parseInt(selectedCourtId))
        .gte('starts_at', startRange)
        .lte('ends_at', endRange)
        .neq('status', 'cancelled');
        
      if (resError) throw resError;
      setExistingReservations(resData || []);

      if (resData && resData.length > 0) {
        const userIds = [...new Set(resData.map(r => r.user_id))];
        const { data: profData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        
        const profMap: Record<string, string> = {};
        profData?.forEach(p => { profMap[p.id] = p.full_name || 'Socio'; });
        setProfiles(profMap);
      }
    } catch (error: any) {
      showError("Impossibile caricare le prenotazioni.");
    } finally {
      setFetchingData(false);
    }
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

    const channel = supabase
      .channel('booking-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => fetchData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
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
    if (!isSlotAvailable(slotTime) && !selectedSlots.includes(slotTime)) {
      showError("Questo slot non è più disponibile.");
      return;
    }

    if (!selectedSlots.includes(slotTime)) {
      if (!limitsStatus.canBookMoreThisWeek) {
        showError("Hai raggiunto il limite di 2 prenotazioni attive per questa settimana.");
        return;
      }
      if (!limitsStatus.canBookMoreToday) {
        showError("Hai già una prenotazione attiva per questo giorno.");
        return;
      }
    }

    const newSelected = [...selectedSlots];
    if (newSelected.includes(slotTime)) {
      const sorted = [...newSelected].sort();
      if (slotTime !== sorted[0] && slotTime !== sorted[sorted.length - 1]) {
        showError("Deseleziona prima gli slot alle estremità.");
        return;
      }
      setSelectedSlots(newSelected.filter(s => s !== slotTime));
    } else {
      if (newSelected.length === 0) {
        setSelectedSlots([slotTime]);
      } else {
        const sorted = [...newSelected, slotTime].sort();
        const firstIdx = allTimeSlots.indexOf(sorted[0]);
        const lastIdx = allTimeSlots.indexOf(sorted[sorted.length - 1]);
        if (lastIdx - firstIdx + 1 > limitsStatus.durationMax) {
          showError(`Massimo ${limitsStatus.durationMax} ore consecutive.`);
          return;
        }
        for (let i = firstIdx; i <= lastIdx; i++) {
          if (!isSlotAvailable(allTimeSlots[i]) && !newSelected.includes(allTimeSlots[i])) {
            showError("Il range contiene slot già occupati.");
            return;
          }
        }
        const range: string[] = [];
        for (let i = firstIdx; i <= lastIdx; i++) range.push(allTimeSlots[i]);
        setSelectedSlots(range);
      }
    }
  };

  const handleBooking = async () => {
    if (!limitsStatus.canBookMoreThisWeek) return showError("Limite settimanale raggiunto.");
    if (!limitsStatus.canBookMoreToday) return showError("Limite giornaliero raggiunto.");

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Utente non autenticato.");

      const sortedSlots = [...selectedSlots].sort();
      const firstStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date!), parseInt(sortedSlots[0].split(':')[0])), 0), 0), 0).toISOString();
      const lastEnd = addHours(setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date!), parseInt(sortedSlots[sortedSlots.length - 1].split(':')[0])), 0), 0), 0), 1).toISOString();

      const { data: courtConflicts } = await supabase.from('reservations').select('id').eq('court_id', parseInt(selectedCourtId!)).lt('starts_at', lastEnd).gt('ends_at', firstStart).neq('status', 'cancelled');

      if (courtConflicts && courtConflicts.length > 0) {
        showError("Spiacente, qualcuno ha appena prenotato questi slot.");
        fetchData();
        setLoading(false);
        return;
      }

      const courtIdNum = parseInt(selectedCourtId!);
      const currentCourt = courts.find(c => c.id === courtIdNum);
      const courtName = currentCourt?.name || `Campo ${courtIdNum}`;

      const reservationsToInsert = sortedSlots.map(slotTime => {
        let slotStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date!), parseInt(slotTime.split(':')[0])), 0), 0), 0);
        return {
          court_id: courtIdNum,
          user_id: user.id,
          starts_at: slotStart.toISOString(),
          ends_at: addHours(slotStart, 1).toISOString(),
          status: 'confirmed',
          booking_type: bookingType,
          notes: `${bookingTypeLabels[bookingType]} - Prenotata da: ${bookerFullName || user.email}`,
        };
      });

      const { data: inserted, error: insertError } = await supabase.from('reservations').insert(reservationsToInsert).select();
      if (insertError) throw insertError;

      const finalReservations = (inserted && inserted.length > 0) ? inserted : (reservationsToInsert as any);

      showSuccess("Prenotazione effettuata!");
      navigate('/booking-confirmation', { 
        state: { 
          reservations: finalReservations, 
          courtName: courtName 
        } 
      });
      
    } catch (error: any) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (approvalLoading) return <div className="p-8 text-center">Verifica...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center">
          <Link to="/dashboard" className="mr-4">
            <Button variant="outline" size="icon" className="text-primary border-primary hover:bg-secondary"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <h1 className="text-3xl font-bold text-primary flex items-center"><CalendarDays className="mr-2 h-7 w-7" /> Prenota un Campo</h1>
        </div>
        <Button variant="outline" className="text-primary border-primary hover:bg-secondary" onClick={() => supabase.auth.signOut().then(() => navigate('/login'))}>
          <LogOut className="mr-2 h-4 w-4" /> Esci
        </Button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-6">
          <Card className="shadow-lg rounded-lg">
            <CardHeader><CardTitle className="text-primary">Seleziona Data</CardTitle></CardHeader>
            <CardContent className="flex justify-center">
              <Calendar mode="single" selected={date} onSelect={setDate} locale={it} className="rounded-md border shadow" disabled={(d) => isBefore(d, startOfDay(new Date())) || isAfter(d, maxDate)} />
            </CardContent>
          </Card>

          <BookingLimitsBox status={limitsStatus} isChecking={fetchingData} />
        </div>

        <div className="lg:col-span-8">
          <Card className="shadow-lg rounded-lg">
            <CardHeader><CardTitle className="text-primary">Dettagli Prenotazione</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="mb-2 block">Campo</Label>
                  {fetchingData ? <Skeleton className="h-10 w-full" /> : (
                    <Select onValueChange={setSelectedCourtId} value={selectedCourtId}>
                      <SelectTrigger><SelectValue placeholder="Seleziona un campo" /></SelectTrigger>
                      <SelectContent>{courts.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </div>

                <div>
                  <Label className="mb-2 block">Tipo di Prenotazione</Label>
                  <Select onValueChange={(v) => setBookingType(v as BookingType)} value={bookingType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="singolare">Singolare</SelectItem>
                      <SelectItem value="doppio">Doppio</SelectItem>
                      <SelectItem value="lezione">Lezione con Maestro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Orario (Max 3 ore)</Label>
                {fetchingData ? <div className="grid grid-cols-2 gap-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div> : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto p-2 border rounded-md bg-gray-50">
                    {allTimeSlots.map(t => {
                      const [hours, minutes] = t.split(':').map(Number);
                      const endTimeLabel = format(setMinutes(setHours(new Date(), hours + 1), minutes), 'HH:mm');
                      const isSelected = selectedSlots.includes(t);
                      const reservation = getSlotReservation(t);
                      const available = isSlotAvailable(t);
                      
                      let occupiedBy = "";
                      let isBlocked = false;
                      if (reservation) {
                        if (reservation.booked_for_first_name === 'SLOT' && reservation.booked_for_last_name === 'BLOCCATO') {
                          occupiedBy = "BLOCCATO";
                          isBlocked = true;
                        } else {
                          occupiedBy = reservation.booked_for_first_name && reservation.booked_for_last_name
                            ? `${reservation.booked_for_first_name} ${reservation.booked_for_last_name}`
                            : profiles[reservation.user_id] || "Socio";
                        }
                      }

                      return (
                        <Button 
                          key={t} 
                          onClick={() => available && handleSlotClick(t)} 
                          variant={isSelected ? "default" : "outline"} 
                          className={`w-full h-auto py-3 flex flex-col gap-1 transition-all ${
                            isSelected 
                              ? 'bg-club-orange text-white hover:bg-club-orange' 
                              : available 
                                ? 'bg-primary text-white hover:bg-primary/90' 
                                : isBlocked 
                                  ? 'bg-amber-100 text-amber-800' 
                                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                          }`}
                          disabled={(!available && !isSelected) || (!available && !isSelected)}
                        >
                          <span className="font-bold text-sm">{t} - {endTimeLabel}</span>
                          {!available && occupiedBy && (
                            <span className="text-[10px] uppercase truncate w-full px-1 flex items-center justify-center opacity-80">
                              {isBlocked ? <Lock className="h-2.5 w-2.5 mr-1" /> : <User className="h-2.5 w-2.5 mr-1" />} {occupiedBy}
                            </span>
                          )}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>

              {(!limitsStatus.canBookMoreThisWeek || !limitsStatus.canBookMoreToday) && (
                <div className="bg-destructive/10 p-4 rounded-lg border border-destructive/20 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-destructive">Limiti Raggiunti</p>
                    <p className="text-xs text-destructive/80">Non puoi procedere con la prenotazione perché hai già raggiunto il massimo consentito per oggi o per questa settimana.</p>
                  </div>
                </div>
              )}

              <Button 
                onClick={handleBooking} 
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12 text-lg" 
                disabled={selectedSlots.length === 0 || loading || fetchingData || !limitsStatus.canBookMoreThisWeek || !limitsStatus.canBookMoreToday}
              >
                {loading ? "Prenotazione in corso..." : "Conferma Prenotazione"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default BookingCalendar;
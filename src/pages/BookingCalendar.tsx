"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, LogOut, CalendarDays, Clock, MapPin, Target, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { format, parseISO, addHours, setHours, setMinutes, isBefore, isAfter, isEqual, setSeconds, setMilliseconds, addDays, startOfDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { useApprovalCheck } from '@/hooks/use-approval-check';
import { Court, Reservation, BookingType } from '@/types/supabase';

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
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]); 
  const [bookingType, setBookingType] = useState<BookingType>('singolare');
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);
  const [bookerFullName, setBookerFullName] = useState<string | null>(null);

  const maxDate = useMemo(() => addDays(new Date(), 14), []);

  useEffect(() => {
    if (!isApproved) return;
    const fetchBookerProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
        if (profile) setBookerFullName(profile.full_name);
      }
    };
    fetchBookerProfile();
  }, [isApproved]);

  const fetchReservations = async () => {
    if (!date || !selectedCourtId) return;
    const startOfDayStr = format(date, "yyyy-MM-dd'T'00:00:00.000'Z'");
    const endOfDayStr = format(date, "yyyy-MM-dd'T'23:59:59.999'Z'");
    
    // Recuperiamo anche le informazioni sul profilo per mostrare chi ha prenotato
    const { data } = await supabase
      .from('reservations')
      .select('*, profiles(full_name)')
      .eq('court_id', parseInt(selectedCourtId))
      .gte('starts_at', startOfDayStr)
      .lte('ends_at', endOfDayStr);
      
    if (data) setExistingReservations(data);
    setFetchingData(false);
  };

  useEffect(() => {
    if (!isApproved) return;
    const fetchCourts = async () => {
      setFetchingData(true);
      const { data } = await supabase.from('courts').select('*').eq('is_active', true);
      if (data) {
        setCourts(data);
        if (data.length > 0 && !selectedCourtId) setSelectedCourtId(data[0].id.toString());
      }
      setFetchingData(false);
    };
    fetchCourts();
  }, [isApproved]);

  useEffect(() => {
    if (!isApproved || !date || !selectedCourtId) return;
    fetchReservations();
    setSelectedSlots([]);

    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reservations',
          filter: `court_id=eq.${selectedCourtId}`
        },
        () => {
          fetchReservations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [date, selectedCourtId, isApproved]);

  const allTimeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let i = 8; i < 20; i++) slots.push(format(setMinutes(setHours(new Date(), i), 0), 'HH:mm'));
    return slots;
  }, []);

  // Funzione che restituisce la prenotazione se lo slot è occupato
  const getSlotReservation = (slotTime: string) => {
    if (!date || !selectedCourtId) return null;
    let slotStart = setMinutes(setHours(date, parseInt(slotTime.split(':')[0])), 0);
    slotStart = setSeconds(setMilliseconds(slotStart, 0), 0);
    
    return existingReservations.find(res => {
      const resStart = parseISO(res.starts_at);
      return isEqual(slotStart, resStart);
    });
  };

  const isSlotAvailable = (slotTime: string): boolean => {
    if (!date || !selectedCourtId) return false;
    let slotStart = setMinutes(setHours(date, parseInt(slotTime.split(':')[0])), 0);
    slotStart = setSeconds(setMilliseconds(slotStart, 0), 0);
    const slotEnd = addHours(slotStart, 1);
    if (isBefore(slotEnd, new Date())) return false;
    
    return !getSlotReservation(slotTime);
  };

  const handleSlotClick = (slotTime: string) => {
    if (!isSlotAvailable(slotTime) && !selectedSlots.includes(slotTime)) {
      showError("Slot non disponibile.");
      return;
    }

    const newSelected = [...selectedSlots];
    if (newSelected.includes(slotTime)) {
      const sorted = [...newSelected].sort();
      if (slotTime !== sorted[0] && slotTime !== sorted[sorted.length - 1]) {
        showError("Deseleziona prima gli slot alle estremità per mantenere la consecutività.");
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
        
        if (lastIdx - firstIdx + 1 > 3) {
          showError("Massimo 3 ore consecutive.");
          return;
        }

        const range: string[] = [];
        for (let i = firstIdx; i <= lastIdx; i++) {
          if (!isSlotAvailable(allTimeSlots[i]) && !newSelected.includes(allTimeSlots[i])) {
            showError("Il range contiene slot occupati.");
            return;
          }
          range.push(allTimeSlots[i]);
        }
        setSelectedSlots(range);
      }
    }
  };

  const handleBooking = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Utente non autenticato.");

      const sortedSlots = selectedSlots.sort();
      const firstStart = setSeconds(setMilliseconds(setMinutes(setHours(date!, parseInt(sortedSlots[0].split(':')[0])), 0), 0), 0).toISOString();
      const lastEnd = addHours(setSeconds(setMilliseconds(setMinutes(setHours(date!, parseInt(sortedSlots[sortedSlots.length - 1].split(':')[0])), 0), 0), 0), 1).toISOString();

      const { data: userConflicts } = await supabase
        .from('reservations')
        .select('id, starts_at, ends_at')
        .eq('user_id', user.id)
        .lt('starts_at', lastEnd)
        .gt('ends_at', firstStart)
        .neq('status', 'cancelled');

      if (userConflicts && userConflicts.length > 0) {
        showError("Hai già un'altra prenotazione in questa fascia oraria su un altro campo.");
        setLoading(false);
        return;
      }

      const courtIdNum = parseInt(selectedCourtId!);
      const reservationsToInsert = sortedSlots.map(slotTime => {
        let slotStart = setSeconds(setMilliseconds(setMinutes(setHours(date!, parseInt(slotTime.split(':')[0])), 0), 0), 0);
        return {
          court_id: courtIdNum,
          user_id: user.id,
          starts_at: slotStart.toISOString(),
          ends_at: addHours(slotStart, 1).toISOString(),
          status: 'confirmed',
          booking_type: bookingType,
          notes: `${bookingTypeLabels[bookingType]} - Socio: ${bookerFullName || user.email}`,
        };
      });

      const { data: inserted, error: insertError } = await supabase.from('reservations').insert(reservationsToInsert).select();
      if (insertError) throw insertError;

      showSuccess("Prenotazione effettuata!");
      navigate('/booking-confirmation', { state: { reservations: inserted, courtName: courts.find(c => c.id === courtIdNum)?.name } });
    } catch (error: any) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      showSuccess("Disconnessione effettuata!");
      navigate('/login');
    } catch (error: any) {
      showError(error.message);
    }
  };

  if (approvalLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
        <header className="flex justify-between items-center mb-8">
          <div className="flex items-center">
            <Skeleton className="h-10 w-10 mr-4" />
            <Skeleton className="h-10 w-64" />
          </div>
          <Skeleton className="h-10 w-24" />
        </header>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="shadow-lg rounded-lg">
            <CardHeader><Skeleton className="h-6 w-32" /></CardHeader>
            <CardContent className="flex justify-center h-[320px]"><Skeleton className="h-full w-full max-w-[300px]" /></CardContent>
          </Card>
          <Card className="shadow-lg rounded-lg">
            <CardHeader><Skeleton className="h-6 w-32" /></CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2"><Skeleton className="h-5 w-24" /><Skeleton className="h-10 w-full" /></div>
              <div className="space-y-2"><Skeleton className="h-5 w-24" /><Skeleton className="h-10 w-full" /></div>
              <div className="space-y-2"><Skeleton className="h-5 w-24" /><div className="grid grid-cols-2 gap-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div></div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center">
          <Link to="/dashboard" className="mr-4">
            <Button variant="outline" size="icon" className="text-primary border-primary hover:bg-secondary">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-primary flex items-center">
            <CalendarDays className="mr-2 h-7 w-7" /> Prenota un Campo
          </h1>
        </div>
        <Button variant="outline" className="text-primary border-primary hover:bg-secondary" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" /> Esci
        </Button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-primary">Seleziona Data</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Calendar 
              mode="single" 
              selected={date} 
              onSelect={setDate} 
              locale={it} 
              className="rounded-md border shadow"
              disabled={(d) => isBefore(d, startOfDay(new Date())) || isAfter(d, maxDate)} 
            />
          </CardContent>
        </Card>

        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-primary">Dettagli Prenotazione</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2 flex items-center">
                <MapPin className="mr-2 h-5 w-5 text-club-orange" /> Campo
              </h3>
              {fetchingData ? <Skeleton className="h-10 w-full" /> : (
                <Select onValueChange={setSelectedCourtId} value={selectedCourtId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleziona un campo" />
                  </SelectTrigger>
                  <SelectContent>
                    {courts.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2 flex items-center">
                <Target className="mr-2 h-5 w-5 text-club-orange" /> Tipo di Prenotazione
              </h3>
              <Select onValueChange={(v) => setBookingType(v as BookingType)} value={bookingType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="singolare">Singolare</SelectItem>
                  <SelectItem value="doppio">Doppio</SelectItem>
                  <SelectItem value="lezione">Lezione con Maestro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2 flex items-center">
                <Clock className="mr-2 h-5 w-5 text-club-orange" /> Orario (Max 3 ore consecutive)
              </h3>
              {fetchingData ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto p-2 border rounded-md bg-gray-50">
                  {allTimeSlots.map(t => {
                    const [hours, minutes] = t.split(':').map(Number);
                    const endTime = format(setMinutes(setHours(new Date(), hours + 1), minutes), 'HH:mm');
                    const isSelected = selectedSlots.includes(t);
                    const reservation = getSlotReservation(t);
                    const available = !reservation && isBefore(new Date(), addHours(setMinutes(setHours(date!, hours), minutes), 1));
                    
                    // Determiniamo il nome da mostrare se occupato
                    let occupiedBy = "";
                    if (reservation) {
                      occupiedBy = reservation.booked_for_first_name && reservation.booked_for_last_name
                        ? `${reservation.booked_for_first_name} ${reservation.booked_for_last_name}`
                        : reservation.profiles?.full_name || "Occupato";
                    }

                    return (
                      <Button 
                        key={t} 
                        onClick={() => available && handleSlotClick(t)} 
                        variant={isSelected ? "default" : "outline"} 
                        className={`w-full h-auto py-3 flex flex-col gap-1 transition-all ${
                          isSelected 
                            ? 'bg-club-orange text-white hover:bg-club-orange/90' 
                            : available 
                              ? 'bg-primary text-white hover:bg-primary/90' 
                              : 'bg-gray-200 text-gray-500 cursor-not-allowed border-gray-300'
                        }`}
                        disabled={!available && !isSelected}
                      >
                        <span className="font-bold text-sm">{t} - {endTime}</span>
                        {!available && occupiedBy && (
                          <span className="text-[10px] uppercase tracking-tight flex items-center justify-center opacity-80">
                            <User className="h-2.5 w-2.5 mr-1" /> {occupiedBy}
                          </span>
                        )}
                        {!available && !occupiedBy && isBefore(addHours(setMinutes(setHours(date!, hours), minutes), 1), new Date()) && (
                          <span className="text-[10px] uppercase opacity-60 italic">Passato</span>
                        )}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>

            <Button 
              onClick={handleBooking} 
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12 text-lg" 
              disabled={selectedSlots.length === 0 || loading || fetchingData}
            >
              {loading ? "Prenotazione in corso..." : "Conferma Prenotazione"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BookingCalendar;
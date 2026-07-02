"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ChevronRight, CalendarDays, MapPin, Clock, Info, User, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { format, parseISO, addHours, setHours, setMinutes, isBefore, isEqual, setSeconds, setMilliseconds, addDays, startOfDay, endOfDay, isValid } from 'date-fns';
import { it } from 'date-fns/locale';
import { useApprovalCheck } from '@/hooks/use-approval-check';
import { Court, Reservation, BookingType, MemberType } from '@/types/supabase';
import { getBookingLimitsStatus } from '@/utils/bookingLimits';
import { isTorneoAttivo } from '@/utils/tournament';
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [memberType, setMemberType] = useState<MemberType>('socio_effettivo');
  const [torneoInCorso, setTorneoInCorso] = useState(false);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastBookingData, setLastBookingData] = useState<{ reservations: Reservation[], courtName: string, hasTorneoWarning: boolean } | null>(null);

  const today = useMemo(() => startOfDay(new Date()), []);
  const maxDate = useMemo(() => {
    // Gli admin non hanno alcun vincolo di orizzonte temporale
    if (isAdmin) return undefined;
    return addDays(today, memberType === 'frequentatore_occasionale' ? 7 : 14);
  }, [today, isAdmin, memberType]);

  const fetchUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data: profile } = await supabase.from('profiles').select('full_name, is_admin, member_type').eq('id', user.id).single();
    if (profile) {
      setBookerFullName(profile.full_name);
      setIsAdmin(profile.is_admin ?? false);
      setMemberType((profile.member_type as MemberType) || 'socio_effettivo');
    }

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
      supabase.from('courts').select('*').eq('is_active', true).order('id').then(({ data, error }) => {
        if (error) { showError("Errore nel caricamento dei campi."); return; }
        if (data) setCourts(data);
      });
      supabase.from('tournaments').select('*').order('updated_at', { ascending: false }).limit(1).maybeSingle().then(({ data }) => {
        setTorneoInCorso(isTorneoAttivo(data));
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

    // Frequentatori occasionali: domenica mattina (< 12:00) non prenotabile su campi in terra sintetica
    if (!isAdmin && memberType === 'frequentatore_occasionale') {
      const isDomenica = date.getDay() === 0;
      if (isDomenica && hours < 12) {
        const court = courts.find(c => c.id === courtId);
        if (court?.surface?.toLowerCase().includes('sintetico') || court?.surface?.toLowerCase().includes('terra')) {
          return false;
        }
      }
    }

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

  // Restituisce true se lo slot è a rischio revoca per il torneo
  const isTorneoSlot = (slotTime: string, slotDate: Date): boolean => {
    if (!torneoInCorso) return false;
    // I campi in cemento sono esclusi: su quelli non si svolgono tornei
    const court = courts.find(c => c.id === parseInt(selectedCourtId));
    if (court?.surface?.toLowerCase().includes('cemento')) return false;
    const hour = parseInt(slotTime.split(':')[0]);
    const dayOfWeek = slotDate.getDay(); // 0=domenica, 6=sabato
    // Fascia serale: 18:00-22:00
    if (hour >= 18 && hour <= 21) return true;
    // Sabato e domenica mattina (< 12:00)
    if ((dayOfWeek === 6 || dayOfWeek === 0) && hour < 12) return true;
    return false;
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
        if (!isAdmin && lastIdx - firstIdx + 1 > 2) return;
        const range: string[] = [];
        for (let i = firstIdx; i <= lastIdx; i++) range.push(allTimeSlots[i]);

        // Verifica che nessuno slot intermedio sia già occupato
        const hasOccupiedIntermediate = range.some(slot =>
          !newSelected.includes(slot) && slot !== slotTime && !isSlotAvailable(slot, courtIdNum)
        );
        if (hasOccupiedIntermediate) {
          showError("Non puoi selezionare un blocco con slot già occupati nel mezzo. Scegli orari consecutivi liberi.");
          return;
        }

        // Notifica se sono stati auto-selezionati slot intermedi per formare un blocco consecutivo
        const autoFilled = range.length - newSelected.length - 1;
        if (autoFilled > 0) {
          showSuccess(
            autoFilled === 1
              ? "Slot intermedio auto-selezionato per completare il blocco."
              : `${autoFilled} slot intermedi auto-selezionati per completare il blocco.`
          );
        }
        setSelectedSlots(range);
      }
    }
  };

  const handleBooking = async () => {
    if (!date || !isValid(date)) return;
    
    // Controllo Policy Settimanale (EFFETTIVO) — bypass per gli admin
    if (!isAdmin) {
      const limitsStatus = getBookingLimitsStatus(userReservations, date, memberType);
      if (!limitsStatus.canBookMoreThisWeek) {
        showError(limitsStatus.limitMessage || "Limite di prenotazione raggiunto per questa settimana.");
        return;
      }
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
      
      const hasTorneoWarning = torneoInCorso && selectedSlots.some(s => isTorneoSlot(s, date));
      setLastBookingData({ reservations: inserted || [], courtName, hasTorneoWarning });
      setShowSuccessModal(true);
      setSelectedSlots([]);
      fetchUserData();
      fetchReservations();
    } catch (e: any) {
      if (e.code === '23505') {
        showError("Uno o più slot sono stati appena prenotati da qualcun altro. Ricarica la pagina e riprova.");
        fetchReservations();
      } else {
        showError(e.message);
      }
    }
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

      <div className="max-w-7xl mx-auto mb-6">
        <BookingLimitsBox status={getBookingLimitsStatus(userReservations, date && isValid(date) ? date : new Date(), memberType)} isAdmin={isAdmin} />
      </div>

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
                  <div className="pt-4 animate-in fade-in slide-in-from-top-2 space-y-2">
                    <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tipologia partita</Label>
                    <div className="flex flex-wrap gap-2">
                      {(['singolare', 'doppio', 'lezione'] as BookingType[]).map(type => (
                        <button
                          key={type}
                          onClick={() => setBookingType(type)}
                          className={cn(
                            "px-5 py-2 rounded-full text-xs font-bold transition-all border-2 flex-shrink-0",
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
                        Selezionati: {selectedSlots.length}{isAdmin ? '' : ' / max 2 ore'}
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
                      const isTorneo = available && isTorneoSlot(t, date);

                      return (
                        <button
                          key={t}
                          disabled={!available && !isSelected}
                          onClick={() => available && handleSlotClick(t)}
                          className={cn(
                            "relative h-20 rounded-2xl flex flex-col items-center justify-center p-3 transition-all duration-150 border-2",
                            isSelected
                              ? "bg-primary border-primary text-white scale-[1.02] shadow-lg shadow-primary/10"
                              : available
                                ? "bg-gray-50 border-transparent text-gray-700 hover:border-primary/20"
                                : "bg-red-500 border-red-600 text-white shadow-sm"
                          )}
                        >
                          {isTorneo && (
                            <AlertTriangle className={cn("absolute top-2 right-2 h-3.5 w-3.5", isSelected ? "text-white/70" : "text-amber-400")} />
                          )}
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

                  {/* Banner avviso torneo */}
                  {selectedSlots.length > 0 && date && isValid(date) && selectedSlots.some(s => isTorneoSlot(s, date)) && (
                    <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
                      <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm font-medium text-amber-800 leading-snug">
                        <span className="font-black">Attenzione:</span> uno o più slot selezionati potrebbero essere revocati dall'amministrazione per garantire lo svolgimento del torneo in corso.
                      </p>
                    </div>
                  )}

                  <div className="pt-4">
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
        hasTorneoWarning={lastBookingData?.hasTorneoWarning || false}
      />
    </div>
  );
};

export default BookingCalendar;
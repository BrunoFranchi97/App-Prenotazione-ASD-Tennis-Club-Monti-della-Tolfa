"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { 
  ArrowLeft, 
  History, 
  ChevronRight, 
  Check, 
  CalendarDays, 
  MapPin, 
  Clock, 
  Users, 
  Zap, 
  Leaf, 
  Trees,
  AlertCircle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { 
  format, 
  parseISO, 
  addHours, 
  setHours, 
  setMinutes, 
  isBefore, 
  isAfter, 
  isEqual, 
  setSeconds, 
  setMilliseconds, 
  addDays, 
  startOfDay, 
  endOfDay, 
  startOfWeek, 
  endOfWeek, 
  addMinutes, 
  isSameDay 
} from 'date-fns';
import { it } from 'date-fns/locale';
import { useApprovalCheck } from '@/hooks/use-approval-check';
import { Court, Reservation, BookingType } from '@/types/supabase';
import { getBookingLimitsStatus } from '@/utils/bookingLimits';
import BookingLimitsBox from '@/components/BookingLimitsBox';
import BookingSuccessDialog from '@/components/BookingSuccessDialog';
import { cn } from '@/lib/utils';

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
  const [allReservations, setAllReservations] = useState<Reservation[]>([]);
  const [userReservations, setUserReservations] = useState<Reservation[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]); 
  const [bookingType, setBookingType] = useState<BookingType>('singolare');
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);
  const [bookerFullName, setBookerFullName] = useState<string | null>(null);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastBookingData, setLastBookingData] = useState<{ reservations: Reservation[], courtName: string } | null>(null);

  const today = useMemo(() => startOfDay(new Date()), []);
  const maxDate = useMemo(() => addDays(today, 14), [today]);

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

  // Step state
  const currentStep = useMemo(() => {
    if (!date) return 1;
    if (!selectedCourtId) return 2;
    return 3;
  }, [date, selectedCourtId]);

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
    if (!date) return;
    setFetchingData(true);
    try {
      const startRange = startOfDay(date).toISOString();
      const endRange = endOfDay(date).toISOString();
      
      // Fetch all reservations for the day to show availability on cards
      const { data: resData } = await supabase
        .from('reservations')
        .select('*')
        .gte('starts_at', startRange)
        .lte('ends_at', endRange)
        .neq('status', 'cancelled');
        
      setAllReservations(resData || []);
      
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
      }
    };
    fetchCourts();
  }, [isApproved]);

  useEffect(() => {
    if (!isApproved || !date) return;
    fetchData();
    setSelectedSlots([]);
  }, [date, isApproved]);

  const allTimeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let i = 8; i < 20; i++) slots.push(format(setMinutes(setHours(new Date(), i), 0), 'HH:mm'));
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
        if (lastIdx - firstIdx + 1 > limitsStatus.durationMax) {
          showError(`Massimo ${limitsStatus.durationMax} ore consecutive`);
          return;
        }
        const range: string[] = [];
        for (let i = firstIdx; i <= lastIdx; i++) {
          if (!isSlotAvailable(allTimeSlots[i], courtIdNum) && !newSelected.includes(allTimeSlots[i])) {
            showError("Slot intermedio non disponibile");
            return;
          }
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
      
      // Reset after booking
      setSelectedSlots([]);
      fetchData();
    } catch (error: any) { showError(error.message); }
    finally { setLoading(false); }
  };

  const getCourtAvailability = (courtId: number) => {
    let availableCount = 0;
    allTimeSlots.forEach(t => {
      if (isSlotAvailable(t, courtId)) availableCount++;
    });
    return availableCount;
  };

  const getCourtIcon = (surface: string) => {
    const s = surface.toLowerCase();
    if (s.includes('erba')) return <Trees className="h-5 w-5" />;
    if (s.includes('terra')) return <Leaf className="h-5 w-5" />;
    return <Zap className="h-5 w-5" />;
  };

  if (approvalLoading) return <div className="p-8 text-center bg-[#F8FAFC]">Verifica...</div>;

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 sm:p-10 lg:p-12">
      {/* Header */}
      <header className="flex justify-between items-center mb-8 max-w-7xl mx-auto">
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

      {/* Stepper Visivo */}
      <div className="max-w-7xl mx-auto mb-10 overflow-x-auto pb-4">
        <div className="flex items-center justify-between min-w-[500px] px-4">
          {[
            { step: 1, label: 'Data', icon: CalendarDays },
            { step: 2, label: 'Campo', icon: MapPin },
            { step: 3, label: 'Orario', icon: Clock }
          ].map((s, idx, arr) => (
            <React.Fragment key={s.step}>
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300",
                  currentStep === s.step ? "bg-primary text-white shadow-lg shadow-primary/20 scale-110" : 
                  currentStep > s.step ? "bg-primary/10 text-primary" : "border-2 border-gray-200 text-gray-400"
                )}>
                  {currentStep > s.step ? <Check size={20} strokeWidth={3} /> : <s.icon size={20} />}
                </div>
                <span className={cn(
                  "text-sm font-bold uppercase tracking-wider",
                  currentStep === s.step ? "text-primary" : 
                  currentStep > s.step ? "text-primary/70" : "text-gray-400"
                )}>
                  {s.step} · {s.label}
                </span>
              </div>
              {idx < arr.length - 1 && (
                <div className={cn(
                  "flex-1 h-0.5 mx-6 transition-colors duration-500",
                  currentStep > s.step ? "bg-primary/30" : "bg-gray-100"
                )} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-7xl mx-auto">
        {/* Colonna Sinistra: Calendario e Policy */}
        <div className="lg:col-span-4 space-y-8">
          <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white overflow-hidden transition-all">
            <CardHeader className="pb-0">
              <CardTitle className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" /> Seleziona Data
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex justify-center">
              <Calendar 
                mode="single" 
                selected={date} 
                onSelect={(d) => {
                  setDate(d);
                  setSelectedCourtId(undefined);
                  setSelectedSlots([]);
                }} 
                locale={it} 
                className="rounded-3xl border-none" 
                fromDate={today}
                toDate={maxDate}
                modifiers={{
                  today: (d) => isSameDay(d, new Date()) && !isEqual(d, date || new Date())
                }}
                modifiersClassNames={{
                  today: "border-2 border-primary/20 rounded-full"
                }}
              />
            </CardContent>
          </Card>
          {!showWeeklyBlock && <BookingLimitsBox status={limitsStatus} isChecking={fetchingData} />}
        </div>

        {/* Colonna Destra: Campi e Orari */}
        <div className="lg:col-span-8 space-y-6">
          <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white overflow-hidden min-h-[600px] flex flex-col transition-all">
            <CardHeader className="pb-4 border-b border-gray-50">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                    <span className="text-[11px] font-bold uppercase tracking-widest text-primary/60">Disponibilità Tempo Reale</span>
                  </div>
                  <CardTitle className="text-2xl font-bold text-gray-900">
                    {format(date || new Date(), 'EEEE d MMMM', { locale: it })}
                  </CardTitle>
                </div>
                {selectedSlots.length > 0 && (
                  <Badge className="bg-primary text-white px-3 py-1 rounded-full text-xs font-bold animate-in fade-in slide-in-from-right-4">
                    {selectedSlots.length} ore selezionate
                  </Badge>
                )}
              </div>
            </CardHeader>
            
            <CardContent className="py-8 space-y-10 flex-grow">
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
                  {/* Step 2: Selezione Campo */}
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-bold text-gray-700 uppercase tracking-wider ml-1">Step 2 · Seleziona il Campo</Label>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {courts.map(court => {
                        const isSelected = selectedCourtId === court.id.toString();
                        const availability = getCourtAvailability(court.id);
                        
                        return (
                          <button
                            key={court.id}
                            onClick={() => {
                              setSelectedCourtId(court.id.toString());
                              setSelectedSlots([]);
                            }}
                            className={cn(
                              "group relative flex flex-col p-5 rounded-2xl border-2 transition-all duration-200 text-left",
                              isSelected 
                                ? "border-primary bg-primary/[0.04] ring-4 ring-primary/5" 
                                : "border-gray-100 bg-white hover:border-primary/20 hover:bg-gray-50"
                            )}
                          >
                            <div className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-colors",
                              isSelected ? "bg-primary text-white" : "bg-gray-100 text-gray-500 group-hover:bg-primary/10 group-hover:text-primary"
                            )}>
                              {getCourtIcon(court.surface)}
                            </div>
                            <h4 className="font-bold text-gray-900 leading-tight mb-1">{court.name}</h4>
                            <p className="text-xs text-gray-500 capitalize mb-4">{court.surface}</p>
                            
                            <Badge className={cn(
                              "w-fit text-[10px] font-bold uppercase tracking-tighter px-2 py-0.5",
                              availability > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                            )}>
                              {availability > 0 ? `${availability} slot liberi` : 'Esaurito'}
                            </Badge>
                            
                            {isSelected && (
                              <div className="absolute top-4 right-4 text-primary animate-in zoom-in">
                                <Check size={18} strokeWidth={4} />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Tipologia Match (Pills) */}
                    {selectedCourtId && (
                      <div className="space-y-3 pt-2 animate-in fade-in slide-in-from-top-2">
                        <Label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest ml-1">Tipologia di Match</Label>
                        <div className="flex gap-2">
                          {(['singolare', 'doppio'] as BookingType[]).map(type => (
                            <button
                              key={type}
                              onClick={() => setBookingType(type)}
                              className={cn(
                                "px-6 py-2.5 rounded-full text-sm font-bold transition-all border-2",
                                bookingType === type 
                                  ? "bg-primary border-primary text-white shadow-md shadow-primary/20" 
                                  : "bg-white border-gray-100 text-gray-500 hover:border-primary/30 hover:text-primary"
                              )}
                            >
                              {bookingTypeLabels[type]}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Step 3: Selezione Orario */}
                  <div className="space-y-6 pt-6 border-t border-gray-50">
                    <div className="flex justify-between items-center ml-1">
                      <Label className="text-sm font-bold text-gray-700 uppercase tracking-wider">Step 3 · Scegli l'Orario</Label>
                      {selectedSlots.length > 0 && (
                        <span className="text-[11px] text-primary font-bold">
                          Selezionati: {selectedSlots.length} / max 3 ore
                        </span>
                      )}
                    </div>
                    
                    {!selectedCourtId ? (
                      <div className="flex flex-col items-center justify-center py-12 px-6 bg-gray-50/50 rounded-[1.5rem] border-2 border-dashed border-gray-100 text-gray-400 animate-pulse">
                        <MapPin className="h-10 w-10 mb-3 opacity-20" />
                        <p className="text-sm font-medium text-center">← Seleziona prima un campo per vedere gli orari disponibili</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
                              onClick={() => handleSlotClick(t)} 
                              className={cn(
                                "relative h-20 rounded-2xl flex flex-col items-center justify-center p-2 transition-all duration-150 border-2",
                                isSelected 
                                  ? "bg-primary/5 border-primary text-primary scale-[1.02] shadow-sm" 
                                  : available 
                                    ? "bg-gray-50 border-transparent text-gray-700 hover:bg-primary/[0.02] hover:border-primary/20" 
                                    : "bg-gray-100 border-transparent text-gray-300 cursor-not-allowed opacity-40"
                              )}
                            >
                              <span className="text-base font-bold tracking-tight">{t} - {endTime}</span>
                              <span className={cn(
                                "text-[10px] font-black uppercase tracking-widest mt-1",
                                isSelected ? "text-primary" : 
                                available ? "text-primary/40" : "text-destructive"
                              )}>
                                {res ? 'OCCUPATO' : 'Disponibile'}
                              </span>
                              
                              {isSelected && (
                                <div className="absolute top-2 right-3">
                                  <div className="w-4 h-4 bg-primary text-white rounded-full flex items-center justify-center">
                                    <Check size={10} strokeWidth={4} />
                                  </div>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Bottone Finale */}
                  <div className="pt-8 border-t border-gray-50">
                    <Button 
                      onClick={handleBooking} 
                      className={cn(
                        "w-full h-16 rounded-[1.5rem] font-extrabold text-xl shadow-xl transition-all flex items-center justify-center gap-3",
                        selectedSlots.length > 0 
                          ? "bg-gradient-to-br from-primary to-[#23532f] text-white hover:scale-[1.01] active:scale-[0.98] shadow-primary/20" 
                          : "bg-gray-100 text-gray-400 cursor-not-allowed shadow-none"
                      )}
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
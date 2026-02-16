"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, LogOut, Users, User, Lock, AlertCircle, CalendarCheck, Clock, History, CalendarRange } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { format, parseISO, addHours, setHours, setMinutes, isBefore, isAfter, isEqual, setSeconds, setMilliseconds, addDays, startOfDay, endOfDay, startOfWeek, endOfWeek } from 'date-fns';
import { it } from 'date-fns/locale';
import { useApprovalCheck } from '@/hooks/use-approval-check';
import { Court, Reservation } from '@/types/supabase';
import { getBookingLimitsStatus, BookingLimitsStatus } from '@/utils/bookingLimits';
import BookingLimitsBox from '@/components/BookingLimitsBox';
import BookingSuccessDialog from '@/components/BookingSuccessDialog';

const ThirdPartyBooking = () => {
  const navigate = useNavigate();
  const { isApproved, loading: approvalLoading } = useApprovalCheck();

  const [date, setDate] = useState<Date | undefined>(new Date());
  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedCourtId, setSelectedCourtId] = useState<string | undefined>(undefined);
  const [existingReservations, setExistingReservations] = useState<any[]>([]);
  const [userReservations, setUserReservations] = useState<Reservation[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [bookedForFirstName, setBookedForFirstName] = useState('');
  const [bookedForLastName, setBookedForLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastBookingData, setLastBookingData] = useState<{ reservations: Reservation[], courtName: string, bookedFor: string } | null>(null);

  const maxDate = useMemo(() => addDays(new Date(), 14), []);

  const limitsStatus = useMemo(() => {
    if (!date) return { weeklyCount: 0, weeklyMax: 2, dailyCount: 0, dailyMax: 1, durationMax: 3, canBookMoreThisWeek: true, canBookMoreToday: true };
    return getBookingLimitsStatus(userReservations, date);
  }, [userReservations, date]);

  const canProceed = limitsStatus.canBookMoreThisWeek && limitsStatus.canBookMoreToday;

  const weekRange = useMemo(() => {
    if (!date) return "";
    const start = startOfWeek(date, { locale: it, weekStartsOn: 1 });
    const end = endOfWeek(date, { locale: it, weekStartsOn: 1 });
    return `dal ${format(start, 'dd MMM')} al ${format(end, 'dd MMM')}`;
  }, [date]);

  useEffect(() => {
    if (!isApproved) return;
    const fetchMyReservations = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('reservations').select('*').eq('user_id', user.id).neq('status', 'cancelled');
        setUserReservations(data || []);
      }
    };
    fetchMyReservations();
  }, [isApproved]);

  const fetchData = async () => {
    if (!date || !selectedCourtId) return;
    setFetchingData(true);
    try {
      const startRange = startOfDay(date).toISOString();
      const endRange = endOfDay(date).toISOString();
      const { data: resData } = await supabase.from('reservations').select('*').eq('court_id', parseInt(selectedCourtId)).gte('starts_at', startRange).lte('ends_at', endRange).neq('status', 'cancelled');
      setExistingReservations(resData || []);
    } catch (e) { console.error(e); }
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

  const isSlotAvailable = (slotTime: string): boolean => {
    if (!date || !selectedCourtId) return false;
    const [hours, minutes] = slotTime.split(':').map(Number);
    let slotStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date), hours), minutes), 0), 0);
    const slotEnd = addHours(slotStart, 1);
    if (isBefore(slotEnd, new Date())) return false;
    return !existingReservations.find(res => isEqual(parseISO(res.starts_at), slotStart));
  };

  const handleSlotClick = (slotTime: string) => {
    if (!isSlotAvailable(slotTime) && !selectedSlots.includes(slotTime)) return;
    const newSelected = [...selectedSlots];
    if (newSelected.includes(slotTime)) {
      setSelectedSlots(newSelected.filter(s => s !== slotTime));
    } else {
      if (newSelected.length === 0) setSelectedSlots([slotTime]);
      else {
        const sorted = [...newSelected, slotTime].sort();
        const firstIdx = allTimeSlots.indexOf(sorted[0]);
        const lastIdx = allTimeSlots.indexOf(sorted[sorted.length - 1]);
        if (lastIdx - firstIdx + 1 > limitsStatus.durationMax) return;
        const range: string[] = [];
        for (let i = firstIdx; i <= lastIdx; i++) range.push(allTimeSlots[i]);
        setSelectedSlots(range);
      }
    }
  };

  const handleBooking = async () => {
    if (!limitsStatus.canBookMoreThisWeek || !limitsStatus.canBookMoreToday) return;
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
          status: 'confirmed', notes: `Per ${bookedForFirstName} ${bookedForLastName}`,
          booked_for_first_name: bookedForFirstName, booked_for_last_name: bookedForLastName,
        };
      });

      const { data: inserted, error } = await supabase.from('reservations').insert(reservationsToInsert).select();
      if (error) throw error;
      setLastBookingData({ reservations: inserted || reservationsToInsert as any, courtName, bookedFor: `${bookedForFirstName} ${bookedForLastName}` });
      setShowSuccessModal(true);
    } catch (e: any) { showError(e.message); }
    finally { setLoading(false); }
  };

  if (approvalLoading) return <div className="p-8 text-center">Verifica...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="flex justify-between items-center mb-8">
        <Link to="/dashboard"><Button variant="outline" size="icon" className="text-primary border-primary hover:bg-secondary"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <h1 className="text-3xl font-bold text-primary flex items-center ml-4"><Users className="mr-2 h-7 w-7" /> Prenota per un Socio</h1>
        <div className="w-10"></div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-6">
          <Card className="shadow-lg"><CardHeader><CardTitle className="text-primary">Data e Socio</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <Calendar mode="single" selected={date} onSelect={setDate} locale={it} className="rounded-md border shadow mx-auto" disabled={(d) => isBefore(d, startOfDay(new Date())) || isAfter(d, maxDate)} />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Nome</Label><Input value={bookedForFirstName} onChange={e => setBookedForFirstName(e.target.value)} /></div>
                <div className="space-y-2"><Label>Cognome</Label><Input value={bookedForLastName} onChange={e => setBookedForLastName(e.target.value)} /></div>
              </div>
            </CardContent>
          </Card>
          {canProceed && <BookingLimitsBox status={limitsStatus} isChecking={fetchingData} />}
        </div>

        <div className="lg:col-span-8">
          <Card className="shadow-lg h-full">
            <CardHeader><CardTitle className="text-primary">Campo e Orario</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              {!canProceed ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center space-y-8 animate-in fade-in zoom-in duration-300">
                  <div className="bg-amber-100 p-6 rounded-full"><AlertCircle className="h-16 w-16 text-amber-600" /></div>
                  <div className="space-y-4 max-w-md">
                    <h3 className="text-2xl font-bold text-gray-800">Limiti Raggiunti</h3>
                    <p className="text-gray-600 leading-relaxed">
                      Hai esaurito gli slot disponibili per la settimana selezionata <span className="font-bold text-primary">{weekRange}</span>.
                    </p>
                    
                    <div className="bg-white p-6 rounded-xl border border-primary/20 shadow-sm space-y-4">
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-primary flex items-center justify-center">
                          <CalendarRange className="mr-2 h-4 w-4" /> Cosa puoi fare ora?
                        </p>
                        <p className="text-xs text-gray-500">
                          Seleziona una data in una <strong>settimana differente</strong> sul calendario, oppure libera uno slot annullando un match esistente.
                        </p>
                      </div>
                      <Link to="/history" className="block">
                        <Button variant="outline" size="sm" className="w-full border-primary text-primary hover:bg-primary hover:text-white">
                          <History className="mr-2 h-4 w-4" /> Gestisci i miei Campi
                        </Button>
                      </Link>
                    </div>
                  </div>
                  {!limitsStatus.canBookMoreThisWeek && limitsStatus.nextAvailableDate && (
                    <div className="bg-primary/5 border border-primary/10 p-6 rounded-2xl w-full max-w-sm">
                      <p className="text-[10px] uppercase font-bold text-gray-400 tracking-widest mb-3">Uno slot in questa settimana si libererà il:</p>
                      <div className="flex items-center justify-center gap-3 text-primary">
                        <CalendarCheck className="h-6 w-6 text-club-orange" /><span className="text-xl font-extrabold capitalize">{format(limitsStatus.nextAvailableDate, "EEEE dd MMMM", { locale: it })}</span>
                      </div>
                      <div className="flex items-center justify-center gap-2 mt-2 text-gray-700 font-medium">
                        <Clock className="h-4 w-4 text-club-orange" /><span>dopo le ore {format(limitsStatus.nextAvailableDate, "HH:mm")}</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <Label className="mb-2 block">Campo</Label>
                  <Select onValueChange={setSelectedCourtId} value={selectedCourtId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{courts.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent></Select>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto p-2 border rounded-md bg-gray-50">
                    {allTimeSlots.map(t => (
                      <Button key={t} onClick={() => isSlotAvailable(t) && handleSlotClick(t)} className={`w-full py-3 h-auto ${selectedSlots.includes(t) ? 'bg-club-orange text-white' : isSlotAvailable(t) ? 'bg-primary text-white' : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`} disabled={!isSlotAvailable(t) && !selectedSlots.includes(t)}>
                        {t}
                      </Button>
                    ))}
                  </div>
                  <Button onClick={handleBooking} className="w-full bg-primary hover:bg-primary/90 h-12 text-lg" disabled={selectedSlots.length === 0 || loading || !bookedForFirstName || !bookedForLastName}>
                    {loading ? "In corso..." : "Conferma"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <BookingSuccessDialog open={showSuccessModal} onOpenChange={setShowSuccessModal} reservations={lastBookingData?.reservations || null} courtName={lastBookingData?.courtName || ''} bookedFor={lastBookingData?.bookedFor} />
    </div>
  );
};

export default ThirdPartyBooking;
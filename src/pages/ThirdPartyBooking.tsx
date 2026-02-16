"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, LogOut, Users, User, Lock, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { format, parseISO, addHours, setHours, setMinutes, isBefore, isAfter, isEqual, setSeconds, setMilliseconds, addDays, startOfDay, endOfDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { useApprovalCheck } from '@/hooks/use-approval-check';
import { Court, Reservation } from '@/types/supabase';
import { getBookingLimitsStatus, BookingLimitsStatus } from '@/utils/bookingLimits';
import BookingLimitsBox from '@/components/BookingLimitsBox';

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

  const maxDate = useMemo(() => addDays(new Date(), 14), []);

  const limitsStatus = useMemo(() => {
    if (!date) return { weeklyCount: 0, weeklyMax: 2, dailyCount: 0, dailyMax: 1, durationMax: 3, canBookMoreThisWeek: true, canBookMoreToday: true };
    return getBookingLimitsStatus(userReservations, date);
  }, [userReservations, date]);

  useEffect(() => {
    if (!isApproved) return;
    const fetchMyReservations = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('reservations')
          .select('*')
          .eq('user_id', user.id)
          .neq('status', 'cancelled');
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
      if (resData && resData.length > 0) {
        const userIds = [...new Set(resData.map(r => r.user_id))];
        const { data: profData } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
        const profMap: Record<string, string> = {};
        profData?.forEach(p => { profMap[p.id] = p.full_name || 'Socio'; });
        setProfiles(profMap);
      }
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
      showError("Slot non disponibile.");
      return;
    }

    if (!selectedSlots.includes(slotTime)) {
      if (!limitsStatus.canBookMoreThisWeek) {
        showError("Hai raggiunto il limite settimanale.");
        return;
      }
      if (!limitsStatus.canBookMoreToday) {
        showError("Hai già una prenotazione per oggi.");
        return;
      }
    }

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
          showError(`Massimo ${limitsStatus.durationMax} ore.`);
          return;
        }
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
    if (!limitsStatus.canBookMoreThisWeek || !limitsStatus.canBookMoreToday) return showError("Limiti superati.");
    if (!date || !selectedCourtId || selectedSlots.length === 0 || !bookedForFirstName || !bookedForLastName) {
      showError("Compila tutti i campi.");
      return;
    }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const sortedSlots = [...selectedSlots].sort();
      const reservationsToInsert = sortedSlots.map(slotTime => {
        let slotStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date!), parseInt(slotTime.split(':')[0])), 0), 0), 0);
        return {
          court_id: parseInt(selectedCourtId),
          user_id: user?.id,
          starts_at: slotStart.toISOString(),
          ends_at: addHours(slotStart, 1).toISOString(),
          status: 'confirmed',
          notes: `Per ${bookedForFirstName} ${bookedForLastName}`,
          booked_for_first_name: bookedForFirstName,
          booked_for_last_name: bookedForLastName,
        };
      });
      const { error } = await supabase.from('reservations').insert(reservationsToInsert);
      if (error) throw error;
      showSuccess("Prenotazione effettuata!");
      navigate('/history');
    } catch (e: any) { showError(e.message); } finally { setLoading(false); }
  };

  if (approvalLoading) return <div className="p-8 text-center">Verifica...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="flex justify-between items-center mb-8">
        <Link to="/dashboard"><Button variant="outline" size="icon" className="text-primary border-primary"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <h1 className="text-3xl font-bold text-primary flex items-center"><Users className="mr-2 h-7 w-7" /> Prenota per un Socio</h1>
        <div className="w-10"></div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-6">
          <Card className="shadow-lg">
            <CardHeader><CardTitle className="text-primary">Data e Socio</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <Calendar mode="single" selected={date} onSelect={setDate} locale={it} className="rounded-md border shadow mx-auto" disabled={(d) => isBefore(d, startOfDay(new Date())) || isAfter(d, maxDate)} />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Nome</Label><Input value={bookedForFirstName} onChange={e => setBookedForFirstName(e.target.value)} /></div>
                <div className="space-y-2"><Label>Cognome</Label><Input value={bookedForLastName} onChange={e => setBookedForLastName(e.target.value)} /></div>
              </div>
            </CardContent>
          </Card>

          <BookingLimitsBox status={limitsStatus} isChecking={fetchingData} />
        </div>

        <div className="lg:col-span-8">
          <Card className="shadow-lg">
            <CardHeader><CardTitle className="text-primary">Campo e Orario</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="mb-2 block">Campo</Label>
                <Select onValueChange={setSelectedCourtId} value={selectedCourtId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{courts.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto p-2 border rounded-md bg-gray-50">
                {allTimeSlots.map(t => {
                  const isSelected = selectedSlots.includes(t);
                  const reservation = getSlotReservation(t);
                  const available = isSlotAvailable(t);
                  let occupiedBy = reservation ? (reservation.booked_for_first_name ? `${reservation.booked_for_first_name} ${reservation.booked_for_last_name}` : profiles[reservation.user_id] || "Socio") : "";
                  
                  return (
                    <Button 
                      key={t} onClick={() => available && handleSlotClick(t)} variant={isSelected ? "default" : "outline"} 
                      className={`w-full h-auto py-3 flex flex-col transition-all ${
                        isSelected 
                          ? 'bg-club-orange text-white hover:bg-club-orange' 
                          : available 
                            ? 'bg-primary text-white hover:bg-primary/90' 
                            : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      }`}
                      disabled={(!available && !isSelected) || !available}
                    >
                      <span className="font-bold text-sm">{t}</span>
                      {!available && occupiedBy && <span className="text-[10px] uppercase truncate w-full px-1 flex items-center justify-center"><User className="h-2.5 w-2.5 mr-1" /> {occupiedBy}</span>}
                    </Button>
                  );
                })}
              </div>

              {(!limitsStatus.canBookMoreThisWeek || !limitsStatus.canBookMoreToday) && (
                <div className="bg-destructive/10 p-4 rounded-lg border border-destructive/20 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive/80 font-medium">Hai raggiunto il massimo delle prenotazioni attive consentite.</p>
                </div>
              )}

              <Button onClick={handleBooking} className="w-full bg-primary hover:bg-primary/90 h-12 text-lg" disabled={selectedSlots.length === 0 || loading || !bookedForFirstName || !bookedForLastName || !limitsStatus.canBookMoreThisWeek || !limitsStatus.canBookMoreToday}>
                {loading ? "In corso..." : "Conferma"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ThirdPartyBooking;
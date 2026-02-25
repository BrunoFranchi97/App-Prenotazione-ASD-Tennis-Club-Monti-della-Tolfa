"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Users, User, Clock, History, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { format, parseISO, addHours, setHours, setMinutes, isBefore, isAfter, isEqual, setSeconds, setMilliseconds, addDays, startOfDay, endOfDay, isSameDay, addMinutes } from 'date-fns';
import { it } from 'date-fns/locale';
import { useApprovalCheck } from '@/hooks/use-approval-check';
import { Court, Reservation } from '@/types/supabase';
import BookingSuccessDialog from '@/components/BookingSuccessDialog';

const ThirdPartyBooking = () => {
  const navigate = useNavigate();
  const { isApproved, loading: approvalLoading } = useApprovalCheck();

  const [date, setDate] = useState<Date | undefined>(new Date());
  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedCourtId, setSelectedCourtId] = useState<string | undefined>(undefined);
  const [existingReservations, setExistingReservations] = useState<any[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [bookedForFirstName, setBookedForFirstName] = useState('');
  const [bookedForLastName, setBookedForLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastBookingData, setLastBookingData] = useState<{ reservations: Reservation[], courtName: string, bookedFor: string } | null>(null);

  const today = useMemo(() => startOfDay(new Date()), []);
  const maxDate = useMemo(() => addDays(today, 14), [today]);

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
    const now = new Date();
    
    // Past slot
    if (isBefore(slotEnd, now)) return false;

    // Rule: if the current hour has started for more than 20 minutes, it's not bookable
    if (isSameDay(date, now) && now > addMinutes(slotStart, 20)) {
      return false;
    }

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
        
        // Manteniamo il limite di 3 ore per singola sessione per coerenza tecnica
        if (lastIdx - firstIdx + 1 > 3) return;
        
        const range: string[] = [];
        for (let i = firstIdx; i <= lastIdx; i++) range.push(allTimeSlots[i]);
        setSelectedSlots(range);
      }
    }
  };

  const handleBooking = async () => {
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
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tighter">Prenota per un Socio</h1>
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
            <CardContent className="p-4 bg-white flex justify-center">
              <Calendar 
                mode="single" 
                selected={date} 
                onSelect={setDate} 
                locale={it} 
                className="rounded-3xl border-none" 
                fromDate={today}
                toDate={maxDate}
              />
            </CardContent>
          </Card>
          
          <div className="bg-primary/5 p-6 rounded-[2rem] border border-primary/10">
            <h4 className="text-sm font-bold text-primary mb-2 flex items-center gap-2">
              <Users size={16} /> Prenotazione Libera
            </h4>
            <p className="text-xs text-gray-500 leading-relaxed">
              Le prenotazioni effettuate per conto di altri soci non concorrono al tuo limite settimanale di 2 match.
            </p>
          </div>
        </div>

        <div className="lg:col-span-8">
          <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white min-h-[600px] flex flex-col">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-primary/60">Prenotazione Esterna</span>
              </div>
              <CardTitle className="text-2xl font-bold text-gray-900">Dettagli del match</CardTitle>
            </CardHeader>
            <CardContent className="space-y-8 flex-grow">
              <div className="space-y-6">
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-4 w-4 text-primary" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-primary/60">Dati del Socio Beneficiario</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-gray-500 uppercase ml-1">Nome</Label>
                    <Input 
                      placeholder="Es: Mario" 
                      className="h-14 rounded-2xl border-gray-100 bg-gray-50 focus:ring-primary/20"
                      value={bookedForFirstName} 
                      onChange={e => setBookedForFirstName(e.target.value)} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-gray-500 uppercase ml-1">Cognome</Label>
                    <Input 
                      placeholder="Es: Rossi" 
                      className="h-14 rounded-2xl border-gray-100 bg-gray-50 focus:ring-primary/20"
                      value={bookedForLastName} 
                      onChange={e => setBookedForLastName(e.target.value)} 
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-gray-50 space-y-6">
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

                <div className="space-y-4">
                  <div className="flex justify-between items-center ml-1">
                    <Label className="text-sm font-bold text-gray-700">Seleziona Orario</Label>
                    <span className="text-[11px] text-gray-400 font-medium italic">Max 3 ore consecutive</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {allTimeSlots.map(t => {
                      const [hours, minutes] = t.split(':').map(Number);
                      const slotStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date!), hours), minutes), 0), 0);
                      const slotEnd = addHours(slotStart, 1);
                      const now = new Date();

                      // Hide past slots
                      if (now >= slotEnd) return null;

                      const isSelected = selectedSlots.includes(t);
                      const available = isSlotAvailable(t);
                      const endTime = format(slotEnd, 'HH:mm');
                      
                      return (
                        <button 
                          key={t} 
                          disabled={!available && !isSelected}
                          onClick={() => available && handleSlotClick(t)} 
                          className={`
                            relative h-16 rounded-2xl flex flex-col items-center justify-center p-2 transition-all duration-300
                            ${isSelected 
                              ? 'bg-gradient-to-br from-accent to-[#b85a20] text-white shadow-lg shadow-accent/20 scale-[0.98]' 
                              : available 
                                ? 'bg-gray-50 text-gray-700 hover:bg-primary/5 hover:border-primary/20 hover:text-primary border-2 border-transparent' 
                                : 'bg-gray-100 text-gray-300 cursor-not-allowed opacity-50'
                            }
                          `}
                        >
                          <span className="text-sm font-bold tracking-tight">{t} - {endTime}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="pt-8">
                <Button 
                  onClick={handleBooking} 
                  className="w-full h-16 rounded-[1.5rem] bg-gradient-to-br from-primary to-[#23532f] hover:scale-[1.01] active:scale-[0.98] text-xl font-extrabold shadow-xl shadow-primary/20 flex items-center justify-center gap-3 transition-all"
                  disabled={selectedSlots.length === 0 || loading || !bookedForFirstName || !bookedForLastName}
                >
                  {loading ? (
                    <div className="w-6 h-6 border-3 border-white/20 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <>Conferma Prenotazione <ChevronRight size={24} /></>
                  )}
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
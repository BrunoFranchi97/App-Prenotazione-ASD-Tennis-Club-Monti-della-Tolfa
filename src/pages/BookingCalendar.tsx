"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ChevronRight, Check, CalendarDays, MapPin, Clock, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { format, parseISO, addHours, setHours, setMinutes, isBefore, isEqual, setSeconds, setMilliseconds, addDays, startOfDay, endOfDay, isSameDay, addMinutes } from 'date-fns';
import { it } from 'date-fns/locale';
import { useApprovalCheck } from '@/hooks/use-approval-check';
import { Court, Reservation, BookingType } from '@/types/supabase';
import { getBookingLimitsStatus } from '@/utils/bookingLimits';
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
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]); 
  const [bookingType, setBookingType] = useState<BookingType>('singolare');
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);
  const [bookerFullName, setBookerFullName] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastBookingData, setLastBookingData] = useState<{ reservations: Reservation[], courtName: string } | null>(null);

  const today = startOfDay(new Date());
  const maxDate = addDays(today, 14);

  const fetchUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
    if (profile) setBookerFullName(profile.full_name);
    const { data: myRes } = await supabase.from('reservations').select('*').eq('user_id', user.id).neq('status', 'cancelled');
    setUserReservations(myRes || []);
  };

  useEffect(() => { if (isApproved) fetchUserData(); }, [isApproved]);

  const fetchData = async () => {
    if (!date) return;
    setFetchingData(true);
    const { data } = await supabase.from('reservations').select('*').gte('starts_at', startOfDay(date).toISOString()).lte('ends_at', endOfDay(date).toISOString()).neq('status', 'cancelled');
    setAllReservations(data || []);
    setFetchingData(false);
  };

  useEffect(() => { if (isApproved) fetchData(); }, [date, isApproved]);
  useEffect(() => { if (isApproved) {
    supabase.from('courts').select('*').eq('is_active', true).order('id').then(({data}) => data && setCourts(data));
  }}, [isApproved]);

  const allTimeSlots = useMemo(() => {
    const slots = [];
    for (let i = 8; i < 20; i++) slots.push(format(setMinutes(setHours(new Date(), i), 0), 'HH:mm'));
    return slots;
  }, []);

  const handleBooking = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    // B02: Validazione prenotazione multipla stessa ora
    const hasOverlap = selectedSlots.some(slotTime => {
      const slotStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date!), parseInt(slotTime.split(':')[0])), 0), 0), 0);
      return userReservations.some(r => isEqual(parseISO(r.starts_at), slotStart));
    });

    if (hasOverlap) return showError("Hai già una prenotazione in questo orario su un altro campo.");

    setLoading(true);
    try {
      const courtIdNum = parseInt(selectedCourtId!);
      const courtName = courts.find(c => c.id === courtIdNum)?.name || `Campo ${courtIdNum}`;
      const inserts = selectedSlots.map(t => {
        let start = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date!), parseInt(t.split(':')[0])), 0), 0), 0);
        return {
          court_id: courtIdNum, user_id: user?.id,
          starts_at: start.toISOString(), ends_at: addHours(start, 1).toISOString(),
          status: 'confirmed', booking_type: bookingType,
          notes: `${bookingTypeLabels[bookingType]} - Socio: ${bookerFullName}`
        };
      });

      const { data: inserted, error } = await supabase.from('reservations').insert(inserts).select();
      if (error) throw error;
      setLastBookingData({ reservations: inserted || [], courtName });
      setShowSuccessModal(true);
      setSelectedSlots([]);
      fetchUserData();
      fetchData();
    } catch (e: any) { showError(e.message); }
    finally { setLoading(false); }
  };

  if (approvalLoading) return null;

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 sm:p-10 lg:p-12">
      <header className="flex justify-between items-center mb-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-6">
          <Link to="/dashboard"><Button variant="outline" size="icon"><ArrowLeft size={20} /></Button></Link>
          <h1 className="text-3xl font-extrabold text-gray-900">Prenota un Campo</h1>
        </div>
        <UserNav />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-7xl mx-auto">
        <div className="lg:col-span-4 space-y-8">
          <Card className="p-4"><Calendar mode="single" selected={date} onSelect={setDate} locale={it} fromDate={today} toDate={maxDate} /></Card>
          <BookingLimitsBox status={getBookingLimitsStatus(userReservations, date || new Date())} />
        </div>

        <div className="lg:col-span-8">
          <Card className="min-h-[500px] flex flex-col p-8">
            <h2 className="text-2xl font-bold mb-6 capitalize">{format(date || new Date(), 'EEEE d MMMM', { locale: it })}</h2>
            
            <div className="space-y-6 mb-8">
              <Label>Seleziona Campo</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {courts.map(c => (
                  <button key={c.id} onClick={() => { setSelectedCourtId(c.id.toString()); setSelectedSlots([]); }} className={cn("p-4 rounded-2xl border-2 transition-all", selectedCourtId === c.id.toString() ? "border-primary bg-primary/10" : "border-gray-50 bg-white")}>
                    <h4 className="font-bold text-sm">{c.name}</h4>
                  </button>
                ))}
              </div>
            </div>

            {selectedCourtId && (
              <div className="space-y-6 animate-in fade-in">
                <Label>Orario</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {allTimeSlots.map(t => {
                    const available = !allReservations.find(r => r.court_id === parseInt(selectedCourtId) && isEqual(parseISO(r.starts_at), setHours(startOfDay(date!), parseInt(t.split(':')[0]))));
                    const isSelected = selectedSlots.includes(t);
                    return (
                      <button key={t} onClick={() => {
                        if (!available && !isSelected) return;
                        setSelectedSlots(prev => prev.includes(t) ? prev.filter(s => s !== t) : (prev.length < 3 ? [...prev, t] : prev));
                      }} className={cn("h-14 rounded-xl border-2 transition-all", isSelected ? "bg-primary border-primary text-white" : available ? "bg-gray-50 border-transparent text-gray-700" : "bg-gray-100 text-gray-300 cursor-not-allowed opacity-50")}>
                        {t}
                      </button>
                    );
                  })}
                </div>
                <Button onClick={handleBooking} disabled={selectedSlots.length === 0 || loading} className="w-full h-14 text-lg font-bold">Prenota Ora</Button>
              </div>
            )}
          </Card>
        </div>
      </div>
      <BookingSuccessDialog open={showSuccessModal} onOpenChange={setShowSuccessModal} reservations={lastBookingData?.reservations || null} courtName={lastBookingData?.courtName || ''} />
    </div>
  );
};

export default BookingCalendar;
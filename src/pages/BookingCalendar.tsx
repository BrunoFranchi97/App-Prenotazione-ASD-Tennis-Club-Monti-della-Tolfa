"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { 
  ArrowLeft, 
  History, 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon,
  RefreshCw
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { format, parseISO, addHours, addDays, isBefore, isAfter, startOfDay, endOfDay, addMinutes, startOfHour } from 'date-fns';
import { it } from 'date-fns/locale';

import { useApprovalCheck } from '@/hooks/use-approval-check';
import { Court, Reservation } from '@/types/supabase';
import { getBookingLimitsStatus } from '@/utils/bookingLimits';

import CourtHeroStrip from '@/components/booking/CourtHeroStrip';
import BookingGrid from '@/components/booking/BookingGrid';
import BookingDialog from '@/components/booking/BookingDialog';
import MyBookingsToday from '@/components/booking/MyBookingsToday';
import BookingLimitsBox from '@/components/BookingLimitsBox';
import BookingSuccessDialog from '@/components/BookingSuccessDialog';
import Footer from '@/components/Footer';

const BookingCalendar = () => {
  const navigate = useNavigate();
  const { isApproved, loading: approvalLoading } = useApprovalCheck();

  // States
  const [date, setDate] = useState<Date>(new Date());
  const [courts, setCourts] = useState<Court[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [userAllReservations, setUserAllReservations] = useState<Reservation[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>();
  const [bookerFullName, setBookerFullName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);

  // Dialog States
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ courtId: number, slotTime: string } | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastBookingData, setLastBookingData] = useState<{ reservations: Reservation[], courtName: string } | null>(null);

  const maxDate = useMemo(() => addDays(new Date(), 14), []);

  const limitsStatus = useMemo(() => {
    return getBookingLimitsStatus(userAllReservations, date);
  }, [userAllReservations, date]);

  const fetchData = async () => {
    if (!date) return;
    setFetchingData(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
        if (profile) setBookerFullName(profile.full_name);

        const { data: allMyRes } = await supabase.from('reservations').select('*').eq('user_id', user.id).neq('status', 'cancelled');
        setUserAllReservations(allMyRes || []);
      }

      const startRange = startOfDay(date).toISOString();
      const endRange = endOfDay(date).toISOString();
      const { data: resData } = await supabase.from('reservations')
        .select('*')
        .gte('starts_at', startRange)
        .lte('ends_at', endRange)
        .neq('status', 'cancelled');
      
      setReservations(resData || []);
    } catch (e) { console.error(e); }
    setFetchingData(false);
  };

  useEffect(() => {
    if (!isApproved) return;
    const fetchCourts = async () => {
      const { data } = await supabase.from('courts').select('*').eq('is_active', true);
      if (data) setCourts(data);
    };
    fetchCourts();
  }, [isApproved]);

  useEffect(() => {
    if (!isApproved) return;
    fetchData();
  }, [date, isApproved]);

  const handleSlotClick = (courtId: number, slotTime: string) => {
    if (!limitsStatus.canBookMoreThisWeek) {
      showError("Hai raggiunto il limite di 2 match per questa settimana.");
      return;
    }
    setSelectedSlot({ courtId, slotTime });
    setBookingDialogOpen(true);
  };

  const handleConfirmBooking = async (formData: any) => {
    if (!selectedSlot || !date) return;
    setLoading(true);
    try {
      const { courtId, slotTime } = selectedSlot;
      const { duration, type, partner } = formData;
      const courtName = courts.find(c => c.id === courtId)?.name || `Campo ${courtId}`;
      
      const startTime = parseISO(`${format(date, 'yyyy-MM-dd')}T${slotTime}:00`);
      const totalMinutes = duration;
      const reservationsToInsert = [];

      // Suddividiamo in blocchi da 1 ora per compatibilità con lo storico esistente
      // Nota: il sistema attuale supporta blocchi orari. Se vogliamo 1.5h, inseriamo 2 blocchi 
      // o gestiamo la durata nel campo ends_at. Useremo il campo ends_at dinamico.
      
      const resToInsert = {
        court_id: courtId,
        user_id: currentUserId,
        starts_at: startTime.toISOString(),
        ends_at: addMinutes(startTime, totalMinutes).toISOString(),
        status: 'confirmed',
        booking_type: type,
        notes: `${partner ? 'Con ' + partner : ''}${bookerFullName ? ' - Prenotato da: ' + bookerFullName : ''}`,
        booked_for_first_name: partner || null
      };

      const { data: inserted, error } = await supabase.from('reservations').insert(resToInsert).select();
      if (error) throw error;

      setLastBookingData({ reservations: inserted || [resToInsert] as any, courtName });
      setShowSuccessModal(true);
      setBookingDialogOpen(false);
      fetchData(); // Refresh griglia
    } catch (e: any) {
      showError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelReservation = async (id: string) => {
    try {
      const { error } = await supabase.from('reservations').delete().eq('id', id);
      if (error) throw error;
      showSuccess("Prenotazione cancellata");
      fetchData();
    } catch (e: any) { showError(e.message); }
  };

  if (approvalLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
      <div className="flex flex-col items-center">
        <RefreshCw className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Preparazione campi...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 sm:p-6 lg:p-10">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Section */}
        <header className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <Link to="/dashboard">
              <Button variant="outline" size="icon" className="rounded-2xl border-none shadow-sm bg-white text-primary">
                <ArrowLeft size={18} />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tighter leading-none mb-1">Prenota Campo</h1>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em]">ASD Tennis Club Tolfa</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
             <Link to="/history">
               <Button variant="ghost" size="icon" className="rounded-xl text-gray-400">
                 <History size={20} />
               </Button>
             </Link>
          </div>
        </header>

        {/* Component A: Hero Strip Stato Campi */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
            <h2 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Stato Live Campi</h2>
          </div>
          <CourtHeroStrip courts={courts} reservations={reservations} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Main Booking Area */}
          <div className="lg:col-span-8 space-y-8">
            {/* Selettore Data Mobile-Optimized */}
            <div className="bg-white p-4 rounded-[2rem] shadow-sm flex items-center justify-between border border-gray-100">
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-xl"
                disabled={isBefore(date, addDays(new Date(), 1)) && format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')}
                onClick={() => setDate(addDays(date, -1))}
              >
                <ChevronLeft size={20} />
              </Button>
              <div className="flex flex-col items-center">
                <span className="text-sm font-black text-gray-900 capitalize">
                  {format(date, 'EEEE dd MMMM', { locale: it })}
                </span>
                <span className="text-[10px] text-primary font-bold uppercase tracking-widest">
                  {format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? 'Oggi' : 'Selezionato'}
                </span>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-xl"
                disabled={isAfter(date, addDays(maxDate, -1))}
                onClick={() => setDate(addDays(date, 1))}
              >
                <ChevronRight size={20} />
              </Button>
            </div>

            {/* Component B: Griglia Prenotazioni */}
            <BookingGrid 
              date={date}
              courts={courts}
              reservations={reservations}
              currentUserId={currentUserId}
              onSlotClick={handleSlotClick}
            />
          </div>

          {/* Sidebar Area */}
          <div className="lg:col-span-4 space-y-8">
            <BookingLimitsBox status={limitsStatus} isChecking={fetchingData} />
            
            {/* Component D: Le Mie Prenotazioni Oggi */}
            <MyBookingsToday 
              reservations={reservations}
              courts={courts}
              currentUserId={currentUserId}
              onCancel={handleCancelReservation}
              onReserveMore={() => {
                const scrollGrid = document.querySelector('.overflow-auto');
                scrollGrid?.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />

            {/* Calendario Classico (Desktop only/Fallback) */}
            <Card className="hidden lg:block border-none shadow-sm rounded-[2rem] overflow-hidden bg-white">
              <CardHeader className="pb-0 pt-6">
                <CardTitle className="text-sm font-bold text-gray-800 flex items-center gap-2">
                  <CalendarIcon size={16} className="text-club-orange" /> Sfoglia Calendario
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <Calendar 
                  mode="single" 
                  selected={date} 
                  onSelect={(d) => d && setDate(d)}
                  locale={it}
                  className="rounded-2xl border-none"
                  disabled={(d) => isBefore(d, startOfDay(new Date())) || isAfter(d, maxDate)}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Footer />

      {/* Component C: Modale di Prenotazione */}
      <BookingDialog 
        open={bookingDialogOpen}
        onOpenChange={setBookingDialogOpen}
        date={date}
        court={selectedSlot ? courts.find(c => c.id === selectedSlot.courtId) || null : null}
        slotTime={selectedSlot?.slotTime || ""}
        allReservations={reservations}
        onConfirm={handleConfirmBooking}
        loading={loading}
      />

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
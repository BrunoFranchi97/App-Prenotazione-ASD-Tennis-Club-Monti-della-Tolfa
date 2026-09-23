"use client";

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardContent } from "@/components/ui/card";
import { ArrowLeft, Users, CheckCircle2, MapPin, Clock, Calendar, ChevronRight, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { getBookingLimitsStatus } from '@/utils/bookingLimits';
import { format, parseISO, setHours, setMinutes, setSeconds, setMilliseconds } from 'date-fns';
import { it } from 'date-fns/locale';
import type { BookingType, BookingParticipantInput, BookingSummary, Reservation } from '@/types/supabase';
import UserNav from '@/components/UserNav';
import ParticipantPicker from '@/components/ParticipantPicker';
import BookingQuoteDialog from '@/components/BookingQuoteDialog';
import BookingSuccessDialog from '@/components/BookingSuccessDialog';

const PARTICIPANT_RANGE: Record<BookingType, { min: number; max: number }> = {
  singolare: { min: 2, max: 2 },
  doppio: { min: 4, max: 4 },
  lezione: { min: 1, max: 4 },
};

const MatchBooking = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { matchRequest, opponentName } = location.state || {};

  const [checking, setChecking] = useState(true);
  const [courtName, setCourtName] = useState('');
  const [bookerId, setBookerId] = useState<string | null>(null);
  const [bookerFullName, setBookerFullName] = useState<string | null>(null);
  const [userReservations, setUserReservations] = useState<Reservation[]>([]);
  const [participants, setParticipants] = useState<BookingParticipantInput[]>([]);
  const [showQuoteDialog, setShowQuoteDialog] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastBookingData, setLastBookingData] = useState<{
    reservations: Pick<Reservation, 'starts_at' | 'ends_at'>[],
    courtName: string,
    quotaCents?: number,
    paymentMode?: BookingSummary['payment_mode'],
    movements?: BookingSummary['movements'],
    hours?: BookingSummary['hours'],
  } | null>(null);

  const bookingType = matchRequest?.match_type as BookingType | undefined;
  const requiredParticipants = bookingType ? PARTICIPANT_RANGE[bookingType] : { min: 2, max: 2 };
  const participantsValid = participants.length >= requiredParticipants.min && participants.length <= requiredParticipants.max;

  useEffect(() => {
    if (!matchRequest) {
      navigate('/find-match');
      return;
    }

    const loadData = async () => {
      setChecking(true);
      try {
        const { data: court } = await supabase.from('courts').select('name').eq('id', matchRequest.court_id).single();
        if (court) setCourtName(court.name);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { navigate('/login'); return; }
        setBookerId(user.id);

        const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
        setBookerFullName(profile?.full_name || 'Tu');
        setParticipants([{ user_id: user.id }, { user_id: matchRequest.user_id }]);

        const { data: myRes } = await supabase.from('reservations').select('*').eq('user_id', user.id).neq('status', 'cancelled');
        setUserReservations(myRes || []);

        // Bounce iniziale se la sfida è ormai palesemente scaduta (UX, non l'unica barriera:
        // quote_booking/create_booking ri-verificano comunque lo slot in modo transazionale).
        const baseDate = parseISO(matchRequest.requested_date);
        const startH = parseInt(matchRequest.preferred_time_start.split(':')[0]);
        const endH = parseInt(matchRequest.preferred_time_end.split(':')[0]);
        const start = setSeconds(setMilliseconds(setMinutes(setHours(baseDate, startH), 0), 0), 0).toISOString();
        const end = setSeconds(setMilliseconds(setMinutes(setHours(baseDate, endH), 0), 0), 0).toISOString();
        const { data: conflicts } = await supabase
          .from('reservations')
          .select('id')
          .eq('court_id', matchRequest.court_id)
          .lt('starts_at', end)
          .gt('ends_at', start)
          .neq('status', 'cancelled');

        if (conflicts && conflicts.length > 0) {
          showError("Spiacente, il campo è stato prenotato nel frattempo.");
          navigate('/find-match');
        }
      } catch (err) {
        console.error("Error loading match booking data:", err);
      } finally {
        setChecking(false);
      }
    };
    loadData();
  }, [matchRequest, navigate]);

  const getSelectedStarts = (): string[] => {
    if (!matchRequest) return [];
    const baseDate = parseISO(matchRequest.requested_date);
    const startH = parseInt(matchRequest.preferred_time_start.split(':')[0]);
    const endH = parseInt(matchRequest.preferred_time_end.split(':')[0]);
    const starts: string[] = [];
    for (let h = startH; h < endH; h++) {
      starts.push(setSeconds(setMilliseconds(setMinutes(setHours(baseDate, h), 0), 0), 0).toISOString());
    }
    return starts;
  };

  const openQuoteDialog = () => {
    if (!matchRequest) return;

    const limitsStatus = getBookingLimitsStatus(userReservations, parseISO(matchRequest.requested_date));
    if (!limitsStatus.canBookMoreThisWeek) {
      showError(limitsStatus.limitMessage || "Hai già raggiunto il limite di prenotazioni per questa settimana.");
      return;
    }

    setShowQuoteDialog(true);
  };

  const handleConfirmed = async (summary: BookingSummary) => {
    // Chiude la sfida sulla bacheca — se fallisce non blocca il flusso (comportamento invariato)
    const { error: updateErr } = await supabase
      .from('match_requests')
      .update({ status: 'matched', matched_with_user_id: bookerId })
      .eq('id', matchRequest.id);
    if (updateErr) {
      console.error('[MatchBooking] Errore aggiornamento status sfida:', updateErr.message);
    }

    setLastBookingData({
      reservations: summary.hours.map(h => ({ starts_at: h.starts_at, ends_at: h.ends_at })),
      courtName,
      quotaCents: summary.quota_cents,
      paymentMode: summary.payment_mode,
      movements: summary.movements,
      hours: summary.hours,
    });
    setShowQuoteDialog(false);
    setShowSuccessModal(true);
    showSuccess("Partita confermata! Lo sfidante vedrà la prenotazione nel suo storico.");
  };

  const opponentFirstName = opponentName?.split(' ')[0] || '';
  const opponentLastName = opponentName?.split(' ').slice(1).join(' ') || '';

  if (checking) return <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]"><div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div></div>;

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 sm:p-10 lg:p-12">
      <header className="flex justify-between items-center mb-10 max-w-4xl mx-auto">
        <div className="flex items-center gap-6">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)} className="rounded-2xl border-none shadow-sm bg-white text-primary hover:scale-110 active:scale-95 transition-transform">
            <ArrowLeft size={20} />
          </Button>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tighter">Conferma Sfida</h1>
        </div>
        <UserNav />
      </header>

      <Card className="max-w-xl mx-auto border-none shadow-[0_20px_40px_rgba(0,0,0,0.04)] rounded-[2.5rem] bg-white overflow-hidden">
        <div className="bg-primary p-10 text-center relative overflow-hidden">
           <Zap className="absolute -top-10 -right-10 h-40 w-40 text-white/10 rotate-12" />
           <div className="bg-white/20 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 backdrop-blur-md">
              <Users className="text-white h-10 w-10" />
           </div>
           <CardTitle className="text-white text-3xl font-black tracking-tight">Accetta il Match</CardTitle>
           <p className="text-white/70 font-medium mt-2">Stai per sfidare {opponentName}</p>
        </div>

        <CardContent className="p-10 space-y-8">
          <div className="bg-gray-50/80 rounded-[2rem] p-8 space-y-6 border border-gray-100">
            <div className="flex items-center gap-5">
              <div className="bg-white p-3 rounded-2xl shadow-sm"><Calendar className="text-club-orange h-6 w-6"/></div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Data della partita</p>
                <p className="text-lg font-bold text-gray-900 capitalize">{format(parseISO(matchRequest.requested_date), 'EEEE d MMMM yyyy', { locale: it })}</p>
              </div>
            </div>

            <div className="flex items-center gap-5">
              <div className="bg-white p-3 rounded-2xl shadow-sm"><Clock className="text-club-orange h-6 w-6"/></div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Orario bloccato</p>
                <p className="text-lg font-bold text-gray-900">{matchRequest.preferred_time_start} - {matchRequest.preferred_time_end}</p>
              </div>
            </div>

            <div className="flex items-center gap-5">
              <div className="bg-white p-3 rounded-2xl shadow-sm"><MapPin className="text-club-orange h-6 w-6"/></div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Campo designato</p>
                <p className="text-lg font-bold text-gray-900">{courtName}</p>
              </div>
            </div>
          </div>

          {bookerId && bookingType && (
            <div className="space-y-2">
              <ParticipantPicker
                bookingType={bookingType}
                bookerId={bookerId}
                bookerName={bookerFullName || 'Tu'}
                extraFixed={{ id: matchRequest.user_id, name: opponentName, badge: 'Sfidante' }}
                value={participants}
                onChange={setParticipants}
              />
              {bookingType === 'doppio' && !participantsValid && (
                <p className="text-xs font-bold text-club-orange text-center">
                  Completa la selezione degli altri 2 giocatori per continuare.
                </p>
              )}
            </div>
          )}

          <div className="bg-primary/5 p-6 rounded-2xl border border-primary/10 flex gap-4">
            <CheckCircle2 className="text-primary h-6 w-6 shrink-0" />
            <p className="text-sm text-primary/80 font-medium leading-relaxed">Confermando, il campo verrà prenotato a tuo nome e la sfida risulterà chiusa. Potrai contattare {opponentName} via WhatsApp.</p>
          </div>

          <Button
            onClick={openQuoteDialog}
            className="w-full h-16 rounded-[1.5rem] bg-gradient-to-br from-primary to-[#23532f] text-xl font-black shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
            disabled={!participantsValid}
          >
            Accetta e Prenota <ChevronRight size={24} />
          </Button>
        </CardContent>
      </Card>

      {bookerId && bookingType && (
        <BookingQuoteDialog
          open={showQuoteDialog}
          onOpenChange={setShowQuoteDialog}
          courtId={matchRequest.court_id}
          courtName={courtName}
          starts={getSelectedStarts()}
          bookingType={bookingType}
          participants={participants}
          bookerId={bookerId}
          bookedForFirstName={opponentFirstName}
          bookedForLastName={opponentLastName}
          bookedForUserId={matchRequest.user_id}
          onConfirmed={handleConfirmed}
        />
      )}
      <BookingSuccessDialog
        open={showSuccessModal}
        onOpenChange={setShowSuccessModal}
        reservations={lastBookingData?.reservations || null}
        courtName={lastBookingData?.courtName || ''}
        quotaCents={lastBookingData?.quotaCents}
        paymentMode={lastBookingData?.paymentMode}
        movements={lastBookingData?.movements}
        hours={lastBookingData?.hours}
        bookerId={bookerId ?? undefined}
      />
    </div>
  );
};

export default MatchBooking;

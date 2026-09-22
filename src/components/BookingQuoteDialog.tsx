"use client";

import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { format, parseISO, addHours } from 'date-fns';
import { it } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { BookingType, BookingParticipantInput, BookingSummary, WalletShortfallDetail } from '@/types/supabase';
import WalletMovementsSummary from '@/components/WalletMovementsSummary';

interface BookingQuoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courtName: string;
  courtId: number;
  starts: string[]; // ISO
  bookingType: BookingType;
  participants: BookingParticipantInput[];
  coachName?: string | null;
  bookerPaysAll?: boolean;
  bookerId: string;
  bookingId?: string;
  expectedVersion?: number;
  // Prenotazione per conto terzi: chi è il socio beneficiario (v. ThirdPartyBooking.tsx).
  // quote_booking li ignora sempre (l'anteprima non li usa), create_booking/update_booking li scrivono.
  bookedForFirstName?: string | null;
  bookedForLastName?: string | null;
  bookedForUserId?: string | null;
  onConfirmed: (summary: BookingSummary) => void;
}

const formatEur = (cents: number) => `€${(Math.abs(cents) / 100).toFixed(2).replace('.', ',')}`;

const BookingQuoteDialog: React.FC<BookingQuoteDialogProps> = ({
  open, onOpenChange, courtName, courtId, starts, bookingType, participants,
  coachName, bookerPaysAll, bookerId, bookingId, expectedVersion,
  bookedForFirstName, bookedForLastName, bookedForUserId, onConfirmed,
}) => {
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [quote, setQuote] = useState<BookingSummary | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteErrorDetail, setQuoteErrorDetail] = useState<WalletShortfallDetail | null>(null);

  useEffect(() => {
    if (!open) { setQuote(null); setQuoteError(null); setQuoteErrorDetail(null); return; }
    setLoading(true);
    setQuote(null);
    setQuoteError(null);
    setQuoteErrorDetail(null);
    supabase.rpc('quote_booking', {
      p_court_id: courtId,
      p_starts: starts,
      p_booking_type: bookingType,
      p_participants: participants,
      p_coach_name: coachName || null,
      p_booker_pays_all: !!bookerPaysAll,
      p_booking_id: bookingId ?? null,
      p_expected_version: expectedVersion ?? null,
    }).then(({ data, error }) => {
      setLoading(false);
      if (error) { setQuoteError(error.message); return; }
      const result = data as BookingSummary;
      if (result.ok === false) {
        setQuoteError(result.error || 'Impossibile calcolare il preventivo.');
        setQuoteErrorDetail(result.detail || null);
        return;
      }
      setQuote(result);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleConfirm = async () => {
    setConfirming(true);
    const rpcName = bookingId ? 'update_booking' : 'create_booking';
    const params = bookingId
      ? {
          p_booking_id: bookingId,
          p_expected_version: expectedVersion,
          p_starts: starts,
          p_booking_type: bookingType,
          p_participants: participants,
          p_coach_name: coachName || null,
          p_booker_pays_all: !!bookerPaysAll,
          p_booked_for_first_name: bookedForFirstName ?? null,
          p_booked_for_last_name: bookedForLastName ?? null,
          p_booked_for_user_id: bookedForUserId ?? null,
        }
      : {
          p_court_id: courtId,
          p_starts: starts,
          p_booking_type: bookingType,
          p_participants: participants,
          p_coach_name: coachName || null,
          p_booker_pays_all: !!bookerPaysAll,
          p_booked_for_first_name: bookedForFirstName ?? null,
          p_booked_for_last_name: bookedForLastName ?? null,
          p_booked_for_user_id: bookedForUserId ?? null,
        };
    const { data, error } = await supabase.rpc(rpcName, params);
    setConfirming(false);
    if (error) {
      if (error.code === '23505') {
        showError("Uno o più slot sono stati appena prenotati da qualcun altro. Ricarica la pagina e riprova.");
      } else {
        showError(error.message);
      }
      return;
    }
    onConfirmed(data as BookingSummary);
  };

  const dateStr = starts.length > 0 ? format(parseISO(starts[0]), 'EEEE dd MMMM yyyy', { locale: it }) : '';
  const timeRange = starts.length > 0
    ? `${format(parseISO(starts[0]), 'HH:mm')} - ${format(addHours(parseISO(starts[starts.length - 1]), 1), 'HH:mm')}`
    : '';

  const movements = quote?.movements || [];
  const bookerTotalCents = movements.filter(m => m.user_id === bookerId).reduce((s, m) => s + m.amount_cents, 0);
  const hasCharge = quote ? quote.quota_cents > 0 : false;

  return (
    <Dialog open={open} onOpenChange={(v) => !confirming && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md border-t-8 border-t-primary rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-gray-900">Conferma prenotazione</DialogTitle>
          <DialogDescription className="text-sm">
            {courtName} · <span className="capitalize">{dateStr}</span> · {timeRange}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="py-10 flex flex-col items-center">
            <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
            <p className="mt-3 text-sm text-gray-400 font-medium">Calcolo in corso...</p>
          </div>
        )}

        {!loading && quoteError && !quoteErrorDetail && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <ShieldAlert className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-xs font-medium text-red-800 leading-snug">{quoteError}</p>
          </div>
        )}

        {!loading && quoteErrorDetail && (
          <div className="bg-red-50 border border-red-200 rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-red-100">
              <ShieldAlert className="h-4 w-4 text-destructive flex-shrink-0" />
              <p className="text-xs font-black text-red-900">Saldo insufficiente per {quoteErrorDetail.full_name}</p>
            </div>
            <div className="px-4 py-3 space-y-1.5">
              {quoteErrorDetail.lines.map((l, i) => (
                <div key={i} className="flex justify-between items-center text-xs text-red-700">
                  <span className="font-medium">{l.label}</span>
                  <span className="font-semibold">{formatEur(l.amount_cents)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center pt-2 mt-1 border-t border-red-200">
                <span className="text-xs font-black text-red-900">Servono in totale</span>
                <span className="text-sm font-black text-red-900">{formatEur(quoteErrorDetail.needed_cents)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-red-700">Disponibili</span>
                <span className="text-xs font-semibold text-red-700">{formatEur(quoteErrorDetail.available_cents)}</span>
              </div>
            </div>
          </div>
        )}

        {!loading && quote && (
          <div className="space-y-3">
            {!hasCharge && (
              <div className="flex items-center gap-3 bg-primary/5 border border-primary/10 rounded-xl px-4 py-3">
                <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                <p className="text-xs font-semibold text-gray-700">Nessun addebito: i pagamenti in app non sono ancora attivi.</p>
              </div>
            )}

            {hasCharge && (
              <div className="space-y-2">
                <WalletMovementsSummary movements={movements} bookerId={bookerId} mode="preview" />
                <div className="flex justify-between items-center px-4 pt-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Saldo dopo l'operazione</span>
                  <span className="text-sm font-bold text-gray-600">
                    {quote.booker_balance_cents != null ? formatEur(quote.booker_balance_cents) : '—'}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="ghost"
            className="w-full text-gray-500"
            onClick={() => onOpenChange(false)}
            disabled={confirming}
          >
            Annulla
          </Button>
          <Button
            className="w-full bg-primary hover:bg-primary/90 font-bold"
            onClick={handleConfirm}
            disabled={loading || confirming || !quote || !!quoteError}
          >
            {confirming
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              : hasCharge
                ? `Conferma e paga ${formatEur(Math.abs(bookerTotalCents))}`
                : 'Conferma prenotazione'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BookingQuoteDialog;

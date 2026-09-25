"use client";

import React from 'react';
import { AlertTriangle, CheckCircle2, Lightbulb, Undo2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { BookingSummary, BookingParticipantInput } from '@/types/supabase';
import { PLACEHOLDER_GUEST_NAME } from '@/components/ParticipantPicker';
import { cn } from '@/lib/utils';

interface WalletMovementsSummaryProps {
  movements: BookingSummary['movements'];
  bookerId: string;
  /** 'preview' = dentro il dialog di anteprima, prima di scrivere nulla.
   *  'confirmed' = dopo la scrittura riuscita: stesso specchietto ma con toni affermativi
   *  ("hai pagato", "ha pagato"), per rassicurare chi controlla che i conti tornano. */
  mode: 'preview' | 'confirmed';
  /** Se presente e almeno un'ora ha le luci, mostra il dettaglio orario prima della
   *  scomposizione per persona: spiega perché il totale è più alto (tariffa con luci). */
  hours?: BookingSummary['hours'];
  /** Partecipanti della prenotazione NUOVA: permettono di scomporre l'addebito del
   *  prenotante in "tua quota" + una riga per ospite/"Da definire" (e di non parlare di
   *  "tua quota" quando il prenotante non gioca, v. ThirdPartyBooking). Da NON passare
   *  nella modifica: lì i movimenti sono solo la differenza e la scomposizione non vale. */
  participants?: BookingParticipantInput[];
  className?: string;
}

const formatEur = (cents: number) => `€${(Math.abs(cents) / 100).toFixed(2).replace('.', ',')}`;

const WalletMovementsSummary: React.FC<WalletMovementsSummaryProps> = ({ movements, bookerId, mode, hours, participants, className }) => {
  const hasLights = !!hours?.some(h => h.lights);
  // Scomposizione (vedi anche wallet_settle_booking):
  // - 'booking_charge' del prenotante = sua quota, comprende ospiti/segnaposto (non hanno un saldo proprio)
  // - 'booking_cover' = quota di un socio reale che il prenotante sta coprendo (D7)
  // - 'booking_charge' di un altro utente = ha pagato la sua quota da solo
  // - 'booking_refund' = rimborso (caso modifica)
  const ownCharge = movements.find(m => m.user_id === bookerId && m.kind === 'booking_charge');
  const coverLines = movements.filter(m => m.kind === 'booking_cover');
  const othersOwnLines = movements.filter(m => m.kind === 'booking_charge' && m.user_id !== bookerId);
  const refundLines = movements.filter(m => m.kind === 'booking_refund');

  // Quanto esce davvero dal saldo del prenotante: è la cifra in evidenza (feedback test
  // direttivo: prima risaltava la sola "tua quota" e sembrava di pagare meno del vero).
  const bookerPaidCents = (ownCharge ? Math.abs(ownCharge.amount_cents) : 0)
    + coverLines.reduce((s, m) => s + Math.abs(m.amount_cents), 0);

  const confirmed = mode === 'confirmed';

  // Righe della scomposizione dell'addebito del prenotante. Ogni partecipante paga la
  // stessa quota intera, quindi l'addebito si divide in parti uguali tra lui (se gioca)
  // e i suoi ospiti/"Da definire".
  type Line = { key: string; label: React.ReactNode; cents: number; cover?: boolean };
  const lines: Line[] = [];
  if (ownCharge) {
    const guests = participants?.filter((p): p is { guest_name: string } => 'guest_name' in p) ?? [];
    const bookerPlays = !!participants?.some(p => 'user_id' in p && p.user_id === bookerId);
    const shares = (bookerPlays ? 1 : 0) + guests.length;
    const ownCents = Math.abs(ownCharge.amount_cents);
    if (participants && shares > 0) {
      const shareCents = Math.round(ownCents / shares);
      if (bookerPlays) lines.push({ key: 'me', label: 'La tua quota', cents: ownCents - shareCents * guests.length });
      guests.forEach((g, i) => lines.push({
        key: `guest-${i}`,
        label: g.guest_name === PLACEHOLDER_GUEST_NAME ? 'Giocatore da definire' : <>Ospite: {g.guest_name}</>,
        cents: shareCents,
      }));
    } else {
      lines.push({ key: 'me', label: <>La tua quota <span className="font-medium text-gray-400">(comprende eventuali ospiti)</span></>, cents: ownCents });
    }
  }
  coverLines.forEach((m, i) => lines.push({
    key: `cover-${i}`,
    cover: true,
    label: confirmed
      ? <>Hai coperto tu la quota di <span className="font-black">{m.covers_full_name}</span>: non aveva credito</>
      : <>Quota di <span className="font-black">{m.covers_full_name}</span>: non ha credito, la paghi tu</>,
    cents: Math.abs(m.amount_cents),
  }));

  return (
    <div className={cn('space-y-2', className)}>
      {hasLights && (
        <div className="space-y-1 px-1 pb-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Dettaglio orario</p>
          {hours!.map(h => (
            <div key={h.reservation_id} className="flex justify-between items-center text-xs">
              <span className="text-gray-500 font-medium">
                {format(parseISO(h.starts_at), 'HH:mm')}–{format(parseISO(h.ends_at), 'HH:mm')}
              </span>
              <span className="font-semibold text-gray-600 flex items-center gap-1">
                {formatEur(h.unit_price_cents ?? 0)}
                {h.lights && (
                  <span className="inline-flex items-center gap-0.5 text-club-orange font-bold">
                    <Lightbulb className="h-3 w-3" /> con luci
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      {bookerPaidCents > 0 && (
        <div className={cn(
          'rounded-xl border-2 px-4 py-3',
          confirmed ? 'bg-green-50 border-green-200' : 'bg-primary/5 border-primary/15'
        )}>
          <div className="flex justify-between items-center">
            <span className={cn('text-sm font-black flex items-center gap-1.5', confirmed ? 'text-green-800' : 'text-gray-900')}>
              {confirmed && <CheckCircle2 className="h-4 w-4 shrink-0" />}
              {confirmed ? 'Hai pagato' : 'Paghi tu'}
            </span>
            <span className={cn('text-2xl font-black tracking-tight shrink-0', confirmed ? 'text-green-800' : 'text-primary')}>
              {formatEur(bookerPaidCents)}
            </span>
          </div>
          {/* Scomposizione solo se c'è davvero qualcosa da spiegare: se paghi solo la tua
              quota basta la cifra in evidenza (feedback test direttivo: riepilogo più snello). */}
          {(lines.length > 1 || (lines.length === 1 && lines[0].key !== 'me')) && (
            <div className="mt-2 pt-2 border-t border-black/5 space-y-1.5">
              {lines.map(l => (
                <div key={l.key} className="flex justify-between items-start gap-3 text-xs">
                  <span className={cn('font-semibold leading-snug flex items-start gap-1.5', l.cover ? 'text-amber-800' : 'text-gray-600')}>
                    {l.cover && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-px" />}
                    <span>{l.label}</span>
                  </span>
                  <span className={cn('font-bold shrink-0', l.cover ? 'text-amber-800' : 'text-gray-600')}>{formatEur(l.cents)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {othersOwnLines.map((m, i) => (
        // Una sola riga compatta: chi ha credito paga da sé, al prenotante basta saperlo.
        <div key={`own-${i}`} className="flex justify-between items-center gap-3 px-4 py-1">
          <span className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>
              {m.full_name} {confirmed ? 'ha pagato la sua quota' : 'paga la sua quota'}{' '}
              <span className="font-medium text-gray-400">con il suo credito</span>
            </span>
          </span>
          <span className="text-xs font-bold text-gray-400 shrink-0">{formatEur(m.amount_cents)}</span>
        </div>
      ))}
      {refundLines.length > 0 && (
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 px-1 pt-1">Rimborsi</p>
      )}
      {refundLines.map((m, i) => (
        // Stile volutamente diverso dalle righe "ha pagato" (sfondo verde pieno): bordo e
        // segno "+" dicono a colpo d'occhio che qui i soldi TORNANO sul saldo.
        <div key={`refund-${i}`} className="flex justify-between items-center bg-white border-2 border-primary/15 rounded-xl px-4 py-3">
          <span className="text-xs font-bold text-primary flex items-center gap-1.5">
            <Undo2 className="h-3.5 w-3.5 shrink-0" />
            {m.covers_full_name
              ? <>{confirmed ? 'Ti è tornata' : 'Ti torna'} la quota che avevi coperto per {m.covers_full_name}</>
              : m.user_id === bookerId
                ? (confirmed ? 'Rimborsato sul tuo saldo' : 'Rimborso sul tuo saldo')
                : <>{confirmed ? 'Rimborsato a' : 'Rimborso a'} {m.full_name}</>}
          </span>
          <span className="text-sm font-black text-primary shrink-0">+{formatEur(m.amount_cents)}</span>
        </div>
      ))}
    </div>
  );
};

export default WalletMovementsSummary;

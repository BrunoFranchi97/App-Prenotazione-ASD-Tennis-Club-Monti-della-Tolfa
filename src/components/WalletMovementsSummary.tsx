"use client";

import React from 'react';
import { AlertTriangle, CheckCircle2, Lightbulb } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { BookingSummary } from '@/types/supabase';
import { cn } from '@/lib/utils';

interface WalletMovementsSummaryProps {
  movements: BookingSummary['movements'];
  bookerId: string;
  /** 'preview' = dentro il dialog di anteprima, prima di scrivere nulla.
   *  'confirmed' = dopo la scrittura riuscita: stesso specchietto ma con toni affermativi
   *  ("hai pagato", "ha pagato"), per rassicurare chi controlla che i conti tornino. */
  mode: 'preview' | 'confirmed';
  /** Se presente e almeno un'ora ha le luci, mostra il dettaglio orario prima della
   *  scomposizione per persona: spiega perché il totale è più alto (tariffa con luci). */
  hours?: BookingSummary['hours'];
  className?: string;
}

const formatEur = (cents: number) => `€${(Math.abs(cents) / 100).toFixed(2).replace('.', ',')}`;

const WalletMovementsSummary: React.FC<WalletMovementsSummaryProps> = ({ movements, bookerId, mode, hours, className }) => {
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

  // Totale realmente movimentato per questa prenotazione: ogni quota (propria, coperta o
  // pagata da altri) genera esattamente una riga di addebito — sommandole si ottiene il
  // valore totale della prenotazione, un modo semplice per verificare "i conti tornano".
  const totalCents = movements
    .filter(m => m.kind === 'booking_charge' || m.kind === 'booking_cover')
    .reduce((s, m) => s + Math.abs(m.amount_cents), 0);

  const confirmed = mode === 'confirmed';

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
      {ownCharge && (
        <div className={cn(
          'flex justify-between items-center rounded-xl px-4 py-3',
          confirmed ? 'bg-green-50' : 'bg-gray-50'
        )}>
          <span className={cn('text-xs font-bold flex items-center gap-1.5', confirmed ? 'text-green-800' : 'text-gray-600')}>
            {confirmed && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
            {confirmed ? 'Hai pagato la tua quota' : 'Tua quota'}{' '}
            <span className={cn('font-medium', confirmed ? 'text-green-700/70' : 'text-gray-400')}>(comprende eventuali ospiti)</span>
          </span>
          <span className={cn('text-sm font-black shrink-0', confirmed ? 'text-green-800' : 'text-gray-900')}>
            {formatEur(ownCharge.amount_cents)}
          </span>
        </div>
      )}
      {coverLines.map((m, i) => (
        <div key={`cover-${i}`} className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs font-semibold text-amber-800 leading-snug flex-1">
            {confirmed ? (
              <>Hai coperto tu la quota di <span className="font-black">{m.covers_full_name}</span> ({formatEur(m.amount_cents)}): non aveva credito sufficiente.</>
            ) : (
              <><span className="font-black">{m.covers_full_name}</span> non ha credito sufficiente → i {formatEur(m.amount_cents)} verranno scalati dal <span className="font-black">TUO</span> saldo.</>
            )}
          </p>
        </div>
      ))}
      {othersOwnLines.map((m, i) => (
        <div key={`own-${i}`} className="flex justify-between items-center bg-green-50 rounded-xl px-4 py-3">
          <span className="text-xs font-bold text-green-800 flex items-center gap-1.5">
            {confirmed && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
            {m.full_name} {confirmed ? 'ha pagato la sua quota' : 'paga la sua quota'}
          </span>
          <span className="text-sm font-black text-green-800 shrink-0">{formatEur(m.amount_cents)}</span>
        </div>
      ))}
      {refundLines.map((m, i) => (
        <div key={`refund-${i}`} className="flex justify-between items-center bg-green-50 rounded-xl px-4 py-3">
          <span className="text-xs font-bold text-green-800">Rimborso a {m.full_name}</span>
          <span className="text-sm font-black text-green-800">{formatEur(m.amount_cents)}</span>
        </div>
      ))}
      {totalCents > 0 && (
        <div className="flex justify-between items-center px-4 pt-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
            {confirmed ? 'Totale pagato da tutti' : 'Totale prenotazione'}
          </span>
          <span className="text-xs font-bold text-gray-500">{formatEur(totalCents)}</span>
        </div>
      )}
    </div>
  );
};

export default WalletMovementsSummary;

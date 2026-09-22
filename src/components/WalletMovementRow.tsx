"use client";

import React from 'react';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { formatEur, walletKindLabels } from '@/utils/wallet';
import type { WalletLedgerEntry } from '@/types/supabase';

interface WalletMovementRowProps {
  movement: WalletLedgerEntry;
  coverNamesById: Record<string, string>;
}

const WalletMovementRow: React.FC<WalletMovementRowProps> = ({ movement, coverNamesById }) => {
  const isCredit = movement.amount_cents > 0;
  const label = movement.kind === 'booking_cover' && movement.covers_user_id
    ? `Copertura quota di ${coverNamesById[movement.covers_user_id] || 'un socio'}`
    : walletKindLabels[movement.kind];

  return (
    <div className="flex justify-between items-center px-4 py-3 rounded-xl bg-gray-50/50">
      <div className="flex flex-col">
        <span className="text-sm font-bold text-gray-700">{label}</span>
        <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">
          {format(parseISO(movement.created_at), "d MMM yyyy 'alle' HH:mm", { locale: it })}
        </span>
      </div>
      <span className={cn("text-sm font-black shrink-0", isCredit ? "text-primary" : "text-gray-700")}>
        {isCredit ? '+' : '−'}{formatEur(movement.amount_cents)}
      </span>
    </div>
  );
};

export default WalletMovementRow;

"use client";

import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Wallet as WalletIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatEur, walletBalanceColor } from '@/utils/wallet';

const DEFAULT_SALDO_BASSO_SOGLIA_CENTS = 500;

// Saldo sempre a portata di mano accanto all'avatar (feedback test direttivo: il tile in
// dashboard da solo era "sconnesso" dagli altri). Legge solo il saldo, non i movimenti:
// compare in ogni header, deve restare leggero. Canale Realtime con nome proprio per non
// scontrarsi con quello di useWallet (tile/pagina portafoglio aperti nella stessa pagina).
const WalletNavChip = () => {
  const location = useLocation();
  const [userId, setUserId] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [soglia, setSoglia] = useState(DEFAULT_SALDO_BASSO_SOGLIA_CENTS);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null));
    supabase.from('app_settings').select('value').eq('key', 'saldo_basso_soglia_cents').maybeSingle().then(({ data }) => {
      const n = data ? parseInt(data.value, 10) : NaN;
      if (Number.isInteger(n) && n > 0) setSoglia(n);
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    const fetchBalance = () => {
      supabase.from('wallets').select('balance_cents').eq('user_id', userId).maybeSingle().then(({ data }) => {
        setBalance(data?.balance_cents ?? 0);
      });
    };
    fetchBalance();
    const channel = supabase
      .channel(`wallet-chip-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets', filter: `user_id=eq.${userId}` }, fetchBalance)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  // Nella pagina del portafoglio il saldo è già in grande: il chip sarebbe un doppione
  if (balance === null || location.pathname === '/wallet') return null;

  return (
    <Link
      to="/wallet"
      title="Il mio Portafoglio"
      className="flex items-center gap-1.5 h-10 px-3 rounded-full bg-white shadow-sm border border-gray-100 hover:border-primary/20 hover:bg-primary/5 active:scale-95 transition-all"
    >
      <WalletIcon className="h-4 w-4 text-primary shrink-0" />
      <span className="text-sm font-black" style={{ color: walletBalanceColor(balance, soglia) }}>
        {formatEur(balance)}
      </span>
    </Link>
  );
};

export default WalletNavChip;

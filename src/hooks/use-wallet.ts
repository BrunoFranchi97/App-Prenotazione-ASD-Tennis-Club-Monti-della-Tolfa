import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Wallet, WalletLedgerEntry } from '@/types/supabase';

const DEFAULT_RICARICA_TAGLI = [1000, 2000, 5000];
const DEFAULT_SALDO_BASSO_SOGLIA_CENTS = 500;

// Dati del portafoglio del socio corrente: saldo, ultimi movimenti, tagli di ricarica
// suggeriti e soglia "saldo basso" (per il gradiente colore). Si aggiorna da solo via
// Realtime quando il saldo cambia (ricarica, prenotazione, ecc.) — nessun polling.
// Riusato da MyProfile.tsx e dal tile "Il mio Portafoglio" in dashboard.
export function useWallet(userId: string | null) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [movements, setMovements] = useState<WalletLedgerEntry[]>([]);
  const [coverNamesById, setCoverNamesById] = useState<Record<string, string>>({});
  const [ricaricaTagli, setRicaricaTagli] = useState<number[]>(DEFAULT_RICARICA_TAGLI);
  const [saldoBassoSogliaCents, setSaldoBassoSogliaCents] = useState<number>(DEFAULT_SALDO_BASSO_SOGLIA_CENTS);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!userId) return;
    const [{ data: walletData }, { data: ledgerData }] = await Promise.all([
      supabase.from('wallets').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('wallet_ledger').select('*').eq('user_id', userId).order('id', { ascending: false }).limit(15),
    ]);
    setWallet(walletData);
    const rows = (ledgerData || []) as WalletLedgerEntry[];
    setMovements(rows);

    const coverIds = Array.from(new Set(rows.map(m => m.covers_user_id).filter((id): id is string => !!id)));
    if (coverIds.length > 0) {
      const { data: names } = await supabase.from('member_names').select('id, full_name').in('id', coverIds);
      const map: Record<string, string> = {};
      names?.forEach(n => { map[n.id] = n.full_name || 'Socio'; });
      setCoverNamesById(map);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { refetch(); }, [refetch]);

  // Impostazioni globali (configurabili dall'admin), lette una sola volta
  useEffect(() => {
    supabase.from('app_settings').select('key, value').in('key', ['ricarica_tagli', 'saldo_basso_soglia_cents']).then(({ data }) => {
      data?.forEach(row => {
        if (row.key === 'ricarica_tagli') {
          try {
            const parsed = JSON.parse(row.value);
            if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((n: unknown) => Number.isInteger(n))) {
              setRicaricaTagli(parsed);
            }
          } catch { /* mantiene i tagli di default */ }
        } else if (row.key === 'saldo_basso_soglia_cents') {
          const n = parseInt(row.value, 10);
          if (Number.isInteger(n) && n > 0) setSaldoBassoSogliaCents(n);
        }
      });
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`wallet-balance-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets', filter: `user_id=eq.${userId}` }, () => {
        refetch();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, refetch]);

  return { wallet, movements, coverNamesById, ricaricaTagli, saldoBassoSogliaCents, loading, refetch };
}

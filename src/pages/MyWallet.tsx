"use client";

import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Wallet as WalletIcon, History } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { formatEur, startWalletTopup, walletBalanceColor } from '@/utils/wallet';
import { useWallet } from '@/hooks/use-wallet';
import WalletMovementRow from '@/components/WalletMovementRow';
import UserNav from '@/components/UserNav';

const MyWallet = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [userId, setUserId] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [customAmount, setCustomAmount] = useState('');
  const [topupSubmitting, setTopupSubmitting] = useState(false);
  // true se si torna dal checkout con ?ricarica=in-corso: sparisce da sola non appena la
  // Realtime subscription dedicata (sotto) segnala l'accredito fatto da payment-webhook.
  const [ricaricaPending, setRicaricaPending] = useState(searchParams.get('ricarica') === 'in-corso');

  const { wallet, movements, coverNamesById, ricaricaTagli, saldoBassoSogliaCents, loading } = useWallet(userId);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { navigate('/login'); return; }
      setUserId(user.id);
      setCheckingSession(false);
    });
  }, [navigate]);

  useEffect(() => {
    if (searchParams.get('ricarica') === 'annullata') {
      showError("Ricarica annullata.");
      setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('ricarica'); return next; }, { replace: true });
    }
  }, []);

  // Conferma visiva della ricarica: attiva solo mentre ricaricaPending è true, si smonta da
  // sola non appena il saldo cambia (payment-webhook ha accreditato).
  useEffect(() => {
    if (!userId || !ricaricaPending) return;
    const clearPending = () => {
      setRicaricaPending(false);
      showSuccess("Ricarica completata! Saldo aggiornato.");
      setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('ricarica'); next.delete('topup'); return next; }, { replace: true });
    };

    const channel = supabase
      .channel(`wallet-confirm-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets', filter: `user_id=eq.${userId}` }, clearPending)
      .subscribe();

    // Controllo immediato: se il webhook ha già accreditato prima che questo canale si
    // collegasse (finestra tipica tra redirect e sottoscrizione Realtime), l'evento non
    // arriverebbe mai. Un solo controllo all'avvio, non polling.
    const topupId = searchParams.get('topup');
    if (topupId) {
      supabase.from('wallet_topups').select('status').eq('id', topupId).maybeSingle().then(({ data }) => {
        if (data && data.status !== 'pending') clearPending();
      });
    }

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, ricaricaPending]);

  const handleTopup = async (amountCents: number) => {
    setTopupSubmitting(true);
    const res = await startWalletTopup(amountCents);
    setTopupSubmitting(false);
    if (res.error) { showError(res.error); return; }
    window.location.href = res.checkoutUrl!;
  };

  const handleCustomTopup = () => {
    const euros = parseFloat(customAmount.replace(',', '.'));
    if (!euros || euros <= 0) {
      showError("Inserisci un importo valido.");
      return;
    }
    handleTopup(Math.round(euros * 100));
  };

  if (checkingSession || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  const balance = wallet?.balance_cents ?? 0;
  const balanceColor = walletBalanceColor(balance, saldoBassoSogliaCents);

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 sm:p-10 lg:p-12">
      <header className="flex justify-between items-center mb-10 max-w-4xl mx-auto">
        <div className="flex items-center gap-6">
          <Link to="/dashboard">
            <Button variant="outline" size="icon" className="rounded-2xl border-none shadow-sm bg-white text-primary hover:scale-110 active:scale-95 transition-transform">
              <ArrowLeft size={20} />
            </Button>
          </Link>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tighter">Il mio Portafoglio</h1>
        </div>
        <UserNav />
      </header>

      <div className="max-w-4xl mx-auto space-y-6">
        {ricaricaPending && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
            <Loader2 className="h-4 w-4 text-amber-600 animate-spin shrink-0" />
            <p className="text-sm font-medium text-amber-800">Pagamento in verifica: il saldo si aggiornerà automaticamente non appena confermato.</p>
          </div>
        )}

        <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white overflow-hidden">
          <CardContent className="p-8 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black text-primary/70 uppercase tracking-widest mb-1">Saldo disponibile</p>
              <p className="text-4xl font-black" style={{ color: balanceColor }}>{formatEur(balance)}</p>
            </div>
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <WalletIcon className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white">
          <CardHeader className="px-8 pt-8 pb-4">
            <CardTitle className="text-lg font-extrabold text-gray-900">Ricarica</CardTitle>
          </CardHeader>
          <CardContent className="px-8 pb-8 space-y-4">
            <div className="flex flex-wrap gap-2">
              {ricaricaTagli.map(cents => (
                <button
                  key={cents}
                  type="button"
                  onClick={() => handleTopup(cents)}
                  disabled={topupSubmitting}
                  className="px-5 py-2.5 rounded-xl border-2 border-gray-100 text-sm font-bold text-gray-700 hover:border-primary/30 hover:text-primary transition-all disabled:opacity-50"
                >
                  {formatEur(cents)}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={customAmount}
                onChange={e => setCustomAmount(e.target.value)}
                placeholder="Altro importo (€)"
                inputMode="decimal"
                className="h-11 rounded-xl border-gray-100 text-sm max-w-[200px]"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleCustomTopup}
                disabled={topupSubmitting || !customAmount}
                className="h-11 rounded-xl font-bold border-2 border-primary/20 text-primary hover:bg-primary/5"
              >
                {topupSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ricarica'}
              </Button>
            </div>
            <p className="text-[11px] text-gray-400 font-medium leading-snug px-1">
              Il saldo si usa per pagare automaticamente le tue prenotazioni dei campi. Con "Ricarica" vieni portato su una pagina di pagamento sicura: il saldo si aggiorna da solo appena il pagamento è confermato, anche se nel frattempo chiudi la pagina. Per ricariche in contanti, rivolgiti alla segreteria del circolo.
            </p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white">
          <CardHeader className="px-8 pt-8 pb-4">
            <CardTitle className="text-lg font-extrabold text-gray-900">Movimenti recenti</CardTitle>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            {movements.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-6 bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-100 text-gray-400">
                <History className="h-8 w-8 mb-2 opacity-20" />
                <p className="text-xs font-bold uppercase tracking-widest text-center">Nessun movimento</p>
              </div>
            ) : (
              <div className="space-y-2">
                {movements.map(m => (
                  <WalletMovementRow key={m.id} movement={m} coverNamesById={coverNamesById} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MyWallet;

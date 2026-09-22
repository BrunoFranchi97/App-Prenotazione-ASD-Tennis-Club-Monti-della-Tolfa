"use client";

import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet as WalletIcon, ChevronRight } from 'lucide-react';
import { formatEur, walletBalanceColor } from '@/utils/wallet';
import { useWallet } from '@/hooks/use-wallet';

interface WalletDashboardTileProps {
  userId: string | null;
}

// Stessa forma/dimensioni esatte degli altri tile della dashboard (vedi renderCard in
// MemberDashboard.tsx): icona, titolo, una riga al posto della descrizione, un bottone che
// porta alla pagina dedicata /wallet — nessun contenuto extra (niente tagli di ricarica
// rapidi o dialog qui: si vedono solo dentro la pagina dedicata).
const WalletDashboardTile: React.FC<WalletDashboardTileProps> = ({ userId }) => {
  const { wallet, saldoBassoSogliaCents } = useWallet(userId);
  const balance = wallet?.balance_cents ?? 0;
  const balanceColor = walletBalanceColor(balance, saldoBassoSogliaCents);

  return (
    <Card className="group relative border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] rounded-[1.5rem] transition-all duration-500 overflow-hidden bg-white hover:-translate-y-2">
      <div className="h-1.5 w-full bg-primary"></div>
      <CardHeader className="pb-2">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-2 bg-primary/10 text-primary">
          <WalletIcon size={24} />
        </div>
        <CardTitle className="text-xl font-bold tracking-tight text-gray-900">Il mio Portafoglio</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-gray-500 text-sm mb-6 leading-relaxed">
          Saldo disponibile: <span className="font-black" style={{ color: balanceColor }}>{formatEur(balance)}</span>
        </p>
        <Link to="/wallet" className="block">
          <Button className="w-full h-12 rounded-xl font-bold transition-all flex items-center justify-between px-5 bg-white border-2 border-gray-100 text-gray-700 hover:border-primary/20 hover:bg-primary/5 hover:text-primary" variant="outline">
            Vai al Portafoglio
            <ChevronRight size={18} className="transition-transform group-hover:translate-x-1" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
};

export default WalletDashboardTile;

"use client";

import React from 'react';
import { Wallet as WalletIcon } from 'lucide-react';
import { formatEur, walletBalanceColor } from '@/utils/wallet';
import { useWallet } from '@/hooks/use-wallet';
import DashboardRow from '@/components/DashboardRow';

interface WalletDashboardTileProps {
  userId: string | null;
}

// Riga compatta della sezione "Area personale": il saldo è sempre visibile anche nel chip
// accanto all'avatar, qui basta un collegamento alla pagina /wallet con il saldo come
// sottotitolo (niente tagli di ricarica rapidi o dialog: si vedono solo nella pagina dedicata).
const WalletDashboardTile: React.FC<WalletDashboardTileProps> = ({ userId }) => {
  const { wallet, saldoBassoSogliaCents } = useWallet(userId);
  const balance = wallet?.balance_cents ?? 0;
  const balanceColor = walletBalanceColor(balance, saldoBassoSogliaCents);

  return (
    <DashboardRow
      to="/wallet"
      icon={WalletIcon}
      title="Il mio Portafoglio"
      subtitle={<>Saldo disponibile: <span className="font-black" style={{ color: balanceColor }}>{formatEur(balance)}</span></>}
    />
  );
};

export default WalletDashboardTile;

import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DashboardRowTone = 'neutral' | 'attention' | 'admin';

interface DashboardRowProps {
  to: string;
  icon: LucideIcon;
  title: string;
  subtitle: React.ReactNode;
  tone?: DashboardRowTone;
  badge?: string;
  disabled?: boolean;
}

// Riga compatta della dashboard per le funzioni secondarie: tutta la superficie porta alla
// pagina dedicata (niente azioni dirette), alta abbastanza per il pollice. Ambra solo quando
// c'è qualcosa che richiede il socio, arancione per l'amministrazione.
const DashboardRow: React.FC<DashboardRowProps> = ({ to, icon: Icon, title, subtitle, tone = 'neutral', badge, disabled = false }) => {
  const content = (
    <>
      <div className={cn(
        "w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center",
        tone === 'attention' && "bg-amber-100 text-amber-600",
        tone === 'admin' && "bg-club-orange/10 text-club-orange",
        tone === 'neutral' && "bg-gray-50 text-gray-400",
      )}>
        <Icon size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className={cn("text-base font-bold tracking-tight truncate", tone === 'admin' ? "text-club-orange" : "text-gray-900")}>
            {title}
          </h3>
          {badge && (
            <span className="shrink-0 bg-amber-500 text-white text-[9px] font-black uppercase tracking-tighter px-2 py-0.5 rounded-full animate-pulse">
              {badge}
            </span>
          )}
        </div>
        <div className="text-gray-500 text-sm truncate">{subtitle}</div>
      </div>
      {!disabled && (
        <ChevronRight size={18} className="shrink-0 text-gray-300 transition-transform group-hover:translate-x-1 group-hover:text-primary" />
      )}
    </>
  );

  const className = cn(
    "group flex items-center gap-4 min-h-16 px-4 py-3 rounded-[1.5rem] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-all duration-300",
    disabled
      ? "opacity-60 cursor-not-allowed"
      : "active:scale-[0.98] md:hover:-translate-y-1 md:hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)]",
  );

  if (disabled) {
    return <div className={className} aria-disabled="true">{content}</div>;
  }
  return <Link to={to} className={className}>{content}</Link>;
};

export default DashboardRow;

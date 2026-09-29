"use client";

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CalendarDays, History, LogOut, Users, Settings, Search, FileText, AlertTriangle, ShieldCheck, ChevronRight, LayoutGrid, type LucideIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { format, parseISO, isToday, isTomorrow } from 'date-fns';
import { it } from 'date-fns/locale';
import Footer from '@/components/Footer';
import UserNav from '@/components/UserNav';
import WalletDashboardTile from '@/components/WalletDashboardTile';
import DashboardRow from '@/components/DashboardRow';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardHighlights } from '@/hooks/use-dashboard-highlights';
import { cn } from '@/lib/utils';

interface CoreTile {
  path: string;
  title: string;
  icon: LucideIcon;
  description: string;
  /** Descrizione breve per i riquadri affiancati sul telefono */
  shortDescription?: string;
  /** Riga viva che sostituisce la descrizione (es. la prossima partita) */
  liveLine?: React.ReactNode;
  buttonText: string;
  isPrimary?: boolean;
}

const MemberDashboard = () => {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isApproved, setIsApproved] = useState(true);
  const [isSocioEffettivo, setIsSocioEffettivo] = useState(true);
  const [loading, setLoading] = useState(true);
  const [openChallengesCount, setOpenChallengesCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const { nextBooking, certificate, loading: highlightsLoading } = useDashboardHighlights(loading ? null : userId, fullName);

  useEffect(() => {
    let isMounted = true;
    let localUserId: string | null = null;

    const fetchOpenChallenges = async (uid: string) => {
      const { count } = await supabase
        .from('match_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open')
        .neq('user_id', uid)
        .gte('requested_date', format(new Date(), 'yyyy-MM-dd'));
      if (isMounted) setOpenChallengesCount(count || 0);
    };

    const initialize = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        localUserId = user.id;
        setUserId(user.id);
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('full_name, is_admin, status, member_type')
          .eq('id', user.id)
          .single();

        if (error) {
          setFullName(user.email);
        } else if (profile) {
          setFullName(profile.full_name);
          setIsAdmin(profile.is_admin);
          setIsApproved(profile.status === 'approved');
          setIsSocioEffettivo(profile.member_type === 'socio_effettivo');
        } else {
          setFullName(user.email);
        }

        // Non blocca la pagina: il numero di sfide arriva quando arriva
        fetchOpenChallenges(user.id);
      }
      if (isMounted) setLoading(false);
    };

    initialize();

    const channel = supabase
      .channel('schema-match-requests-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_requests' }, () => {
        if (localUserId) fetchOpenChallenges(localUserId);
      })
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // Estrai solo il primo nome
  const firstName = fullName ? fullName.split(' ')[0] : 'Socio';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-500 font-medium">Caricamento Club...</p>
        </div>
      </div>
    );
  }

  // Le tre funzioni più usate, sempre in cima e in quest'ordine
  const bookCourt: CoreTile = {
    path: "/book",
    title: "Prenota un Campo",
    icon: CalendarDays,
    description: "Riserva il tuo slot orario per giocare.",
    buttonText: "Vai al Calendario",
    isPrimary: true
  };
  const weeklyView: CoreTile = {
    path: "/weekly-view",
    title: "Vista Settimanale",
    icon: LayoutGrid,
    description: "Guarda la situazione dei campi settimana per settimana, come il foglio in bacheca.",
    shortDescription: "La griglia dei campi",
    buttonText: "Vedi la Griglia"
  };
  const nextBookingLabel = (startsAt: string) => {
    const d = parseISO(startsAt);
    const day = isToday(d) ? 'Oggi' : isTomorrow(d) ? 'Domani' : format(d, 'EEE d MMM', { locale: it });
    return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${format(d, 'HH:mm')}`;
  };

  const myBookings: CoreTile = {
    path: "/history",
    title: "I miei Campi",
    icon: History,
    description: "Visualizza i tuoi impegni passati e futuri.",
    shortDescription: "Le tue prenotazioni",
    liveLine: highlightsLoading ? (
      <div className="space-y-1.5 py-0.5">
        <Skeleton className="h-3 w-20 rounded-md" />
        <Skeleton className="h-4 w-28 rounded-md" />
      </div>
    ) : nextBooking ? (
      <>
        <span className="block text-gray-500">Prossima partita</span>
        <span className="block font-bold text-primary">{nextBookingLabel(nextBooking.starts_at)}</span>
      </>
    ) : (
      <span className="block text-gray-500">Nessuna partita in programma</span>
    ),
    buttonText: "Vedi Prenotazioni"
  };

  const canBookForOthers = isAdmin || isSocioEffettivo;
  const hasOpenChallenges = openChallengesCount > 0;

  const formatDate = (iso: string) => format(parseISO(iso), 'dd/MM/yyyy');
  const certificateTone = certificate?.status === 'expiring' || certificate?.status === 'expired' ? 'attention' : 'neutral';
  const certificateSubtitle: React.ReactNode = highlightsLoading
    ? <Skeleton className="h-4 w-40 mt-1 rounded-md" />
    : certificate?.status === 'valid' && certificate.expiry_date
      ? `Valido fino al ${formatDate(certificate.expiry_date)}`
      : certificate?.status === 'expiring'
        ? <span className="font-bold text-amber-700">{certificate.days_left === 1 ? 'Scade domani' : `Scade tra ${certificate.days_left} giorni`}</span>
        : certificate?.status === 'expired' && certificate.expiry_date
          ? <span className="font-bold text-amber-700">Scaduto il {formatDate(certificate.expiry_date)}</span>
          : "Carica e verifica l'idoneità sportiva.";

  // Tutta la superficie porta alla pagina: bersaglio pieno per il pollice. Sul telefono
  // Prenota occupa la riga intera, Vista e I miei Campi stanno affiancati (senza bottone,
  // con la descrizione breve); da desktop tornano tre riquadri uguali con il bottone.
  const renderCoreTile = (item: CoreTile, disabled: boolean) => {
    const Icon = item.icon;
    const isCompactOnMobile = !item.isPrimary;
    const card = (
      <Card className={cn(
        "h-full flex flex-col border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] rounded-[1.5rem] transition-all duration-500 overflow-hidden bg-white",
        disabled ? "opacity-60 cursor-not-allowed" : "active:scale-[0.98] md:hover:-translate-y-2 md:hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
      )}>
        <div className={cn("h-1.5 w-full", item.isPrimary ? "bg-primary" : "bg-primary/15")}></div>
        <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center mb-2 bg-primary/10 text-primary">
            <Icon size={22} />
          </div>
          <CardTitle className="text-lg sm:text-xl font-bold tracking-tight text-gray-900 leading-tight">
            {item.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col p-4 pt-0 sm:p-6 sm:pt-0">
          {item.liveLine ? (
            <div className="text-sm leading-snug lg:mb-6">{item.liveLine}</div>
          ) : isCompactOnMobile ? (
            <>
              <p className="text-gray-500 text-sm leading-snug lg:hidden">{item.shortDescription}</p>
              <p className="text-gray-500 text-sm leading-relaxed hidden lg:block lg:mb-6">{item.description}</p>
            </>
          ) : (
            <p className="text-gray-500 text-sm mb-4 sm:mb-6 leading-relaxed">{item.description}</p>
          )}
          <span className={cn(
            "w-full h-12 mt-auto rounded-xl font-bold items-center justify-between px-5 transition-all",
            isCompactOnMobile ? "hidden lg:flex" : "flex",
            item.isPrimary
              ? "bg-primary group-hover:bg-[#357a46] text-white shadow-lg shadow-primary/10"
              : "bg-white border-2 border-gray-100 text-gray-700 group-hover:border-primary/20 group-hover:bg-primary/5 group-hover:text-primary"
          )}>
            {item.buttonText}
            <ChevronRight size={18} className={cn("transition-transform group-hover:translate-x-1", disabled && "opacity-0")} />
          </span>
        </CardContent>
      </Card>
    );

    const wrapperClass = cn("group block", item.isPrimary && "col-span-2 lg:col-span-1");
    if (disabled) {
      return <div key={item.path} className={wrapperClass} aria-disabled="true">{card}</div>;
    }
    return <Link key={item.path} to={item.path} className={wrapperClass}>{card}</Link>;
  };

  const renderSection = (label: string, rows: React.ReactNode, isAdminSection: boolean = false) => (
    <section>
      <h2 className={cn("text-xs font-black uppercase tracking-[0.2em] mb-3 ml-1", isAdminSection ? "text-club-orange" : "text-gray-400")}>
        {label}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {rows}
      </div>
    </section>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      <div className="flex-grow p-6 sm:p-10 lg:p-12 max-w-7xl mx-auto w-full">
        <header className="flex justify-between items-center gap-4 mb-8 sm:mb-12">
          <div className="min-w-0 space-y-1">
            <p className="text-xs sm:text-sm font-bold text-primary uppercase tracking-[0.2em] mb-1">Bentornato</p>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tighter truncate">Ciao, {firstName}!</h1>
          </div>
          <div className="shrink-0">
            <UserNav />
          </div>
        </header>

        {!isApproved && (
          <Alert className="mb-8 sm:mb-10 border-none bg-amber-50 rounded-[1.5rem] p-6 shadow-sm">
            <AlertTriangle className="h-6 w-6 text-amber-600 mt-1" />
            <div className="ml-4">
              <AlertTitle className="text-amber-800 font-bold text-lg">In attesa di approvazione</AlertTitle>
              <AlertDescription className="text-amber-700 mt-1">
                La segreteria sta verificando il tuo profilo. Presto potrai prenotare i campi!
              </AlertDescription>
            </div>
          </Alert>
        )}

        <div className="space-y-8 sm:space-y-10">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
            {renderCoreTile(bookCourt, !isApproved)}
            {renderCoreTile(weeklyView, !isApproved)}
            {renderCoreTile(myBookings, false)}
          </div>

          {renderSection("Gioca con altri", <>
            <DashboardRow
              to="/book-for-third-party"
              icon={Users}
              title="Prenota per Socio"
              subtitle={canBookForOthers ? "Gestisci la prenotazione per un altro socio." : "Funzione riservata ai Soci Effettivi."}
              disabled={!isApproved || !canBookForOthers}
            />
            <DashboardRow
              to="/find-match"
              icon={Search}
              title="Cerco Partita"
              subtitle={hasOpenChallenges
                ? `${openChallengesCount} ${openChallengesCount === 1 ? 'sfida aspetta' : 'sfide aspettano'} un avversario`
                : "Trova nuovi avversari e organizza sfide."}
              tone={hasOpenChallenges ? 'attention' : 'neutral'}
              badge={hasOpenChallenges ? "Sfide aperte" : undefined}
              disabled={!isApproved}
            />
          </>)}

          {renderSection("Area personale", <>
            <WalletDashboardTile userId={userId} />
            <DashboardRow
              to="/medical-certificates"
              icon={FileText}
              title="Certificato Medico"
              subtitle={certificateSubtitle}
              tone={certificateTone}
            />
          </>)}

          {isAdmin && renderSection("Amministrazione", (
            <DashboardRow
              to="/admin"
              icon={ShieldCheck}
              title="Pannello Admin"
              subtitle="Strumenti di gestione per l'amministrazione del club."
              tone="admin"
            />
          ), true)}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default MemberDashboard;

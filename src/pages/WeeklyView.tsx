"use client";

import { useEffect, useMemo, useState, memo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  eachDayOfInterval,
  format,
  isToday,
  getHours,
  parseISO,
  isSameWeek,
  startOfDay,
  endOfDay,
} from 'date-fns';
import { it } from 'date-fns/locale';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import UserNav from '@/components/UserNav';
import { supabase } from '@/integrations/supabase/client';
import { Court, Reservation, BookingType } from '@/types/supabase';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 14 }, (_, i) => i + 8); // 08..21

const BOOKING_TYPE_META: Record<BookingType, { bg: string; label: string }> = {
  singolare: { bg: 'bg-primary',     label: 'Singolare' },
  doppio:    { bg: 'bg-teal-700',    label: 'Doppio'    },
  lezione:   { bg: 'bg-club-orange', label: 'Lezione'   },
};

// ─────────────────────────────────────────────────────────────
// BookingCell (memoized)
// ─────────────────────────────────────────────────────────────

interface BookingCellProps {
  reservation?: Reservation;
  displayName: string;
  isCurrentHour: boolean;
  isCurrentDay: boolean;
  ariaLabel: string;
}

const BookingCell = memo(function BookingCell({
  reservation,
  displayName,
  isCurrentHour,
  isCurrentDay,
  ariaLabel,
}: BookingCellProps) {
  const isNowCell = isCurrentHour && isCurrentDay;

  if (!reservation) {
    return (
      <div
        role="gridcell"
        aria-label={ariaLabel + ', libero'}
        className={cn(
          'h-14 rounded-xl border border-gray-100 bg-white',
          'transition-colors duration-150 hover:bg-gray-50',
          isCurrentDay && 'bg-secondary/40',
          isNowCell && 'ring-2 ring-primary/40',
        )}
      />
    );
  }

  const meta = BOOKING_TYPE_META[reservation.booking_type];

  return (
    <div
      role="gridcell"
      title={`${meta.label} — ${displayName}`}
      aria-label={`${ariaLabel}, ${meta.label} di ${displayName}`}
      className={cn(
        'h-14 rounded-xl px-2.5 py-1.5',
        'flex flex-col justify-between',
        'text-white shadow-[0_1px_4px_rgba(0,0,0,0.08)]',
        'transition-transform duration-150 hover:scale-[1.02] cursor-default',
        meta.bg,
        isNowCell && 'ring-2 ring-offset-2 ring-primary/40',
      )}
    >
      <span className="text-[9px] font-black uppercase tracking-tighter opacity-90">
        {meta.label}
      </span>
      <span className="truncate text-xs font-semibold leading-tight">
        {displayName}
      </span>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// DayHeader (memoized)
// ─────────────────────────────────────────────────────────────

const DayHeader = memo(function DayHeader({ day }: { day: Date }) {
  const today = isToday(day);
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-0.5',
        'h-14 rounded-2xl px-2 transition-colors duration-200',
        today
          ? 'bg-primary text-white shadow-lg shadow-primary/20'
          : 'bg-white text-gray-700 border border-gray-100',
      )}
    >
      <span className="text-[9px] font-black uppercase tracking-[0.15em] opacity-80">
        {format(day, 'EEE', { locale: it })}
      </span>
      <span className="text-sm font-extrabold leading-none">
        {format(day, 'd', { locale: it })}
      </span>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────
// WeeklyView
// ─────────────────────────────────────────────────────────────

export default function WeeklyView() {
  const navigate = useNavigate();

  const [currentWeek, setCurrentWeek] = useState<Date>(new Date());
  const [courts, setCourts] = useState<Court[]>([]);
  const [courtId, setCourtId] = useState<number | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(new Date());

  // Aggiorna "now" ogni minuto per l'highlight ora corrente
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Carica campi attivi al mount
  useEffect(() => {
    supabase
      .from('courts')
      .select('*')
      .eq('is_active', true)
      .order('id')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setCourts(data);
          setCourtId(data[0].id);
        }
      });
  }, []);

  // Settimana corrente
  const weekStart = useMemo(
    () => startOfWeek(currentWeek, { weekStartsOn: 1 }),
    [currentWeek],
  );
  const weekEnd = useMemo(
    () => endOfWeek(currentWeek, { weekStartsOn: 1 }),
    [currentWeek],
  );
  const weekDays = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart, weekEnd],
  );
  const isViewingCurrentWeek = useMemo(
    () => isSameWeek(now, currentWeek, { weekStartsOn: 1 }),
    [now, currentWeek],
  );

  // Label settimana: "13 – 19 maggio 2026" oppure cross-mese "27 apr – 3 mag 2026"
  const weekLabel = useMemo(() => {
    const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
    if (sameMonth) {
      return `${format(weekStart, 'd', { locale: it })} – ${format(weekEnd, 'd MMMM yyyy', { locale: it })}`;
    }
    return `${format(weekStart, 'd MMM', { locale: it })} – ${format(weekEnd, 'd MMM yyyy', { locale: it })}`;
  }, [weekStart, weekEnd]);

  // Fetch prenotazioni della settimana per il campo selezionato
  useEffect(() => {
    if (courtId === null) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      const { data, error: err } = await supabase
        .from('reservations')
        .select('*')
        .eq('court_id', courtId)
        .neq('status', 'cancelled')
        .gte('starts_at', startOfDay(weekStart).toISOString())
        .lte('starts_at', endOfDay(weekEnd).toISOString())
        .order('starts_at', { ascending: true });

      if (cancelled) return;

      if (err) {
        setError('Impossibile caricare le prenotazioni. Riprova.');
        setReservations([]);
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as Reservation[];
      setReservations(rows);

      // Carica nomi utenti (solo per prenotazioni non per terzi)
      const userIds = Array.from(
        new Set(
          rows
            .filter(r => !r.booked_for_first_name)
            .map(r => r.user_id),
        ),
      );
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        if (!cancelled && profiles) {
          const map: Record<string, string> = {};
          profiles.forEach(p => { map[p.id] = p.full_name || 'Socio'; });
          setProfileMap(map);
        }
      } else {
        setProfileMap({});
      }

      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [courtId, weekStart, weekEnd]);

  // Indice O(1): "yyyy-MM-dd_HH" → Reservation
  const reservationIndex = useMemo(() => {
    const map = new Map<string, Reservation>();
    for (const r of reservations) {
      const d = parseISO(r.starts_at);
      const key = `${format(d, 'yyyy-MM-dd')}_${getHours(d)}`;
      map.set(key, r);
    }
    return map;
  }, [reservations]);

  // Naviga settimana
  const goPrev  = useCallback(() => setCurrentWeek(d => subWeeks(d, 1)), []);
  const goNext  = useCallback(() => setCurrentWeek(d => addWeeks(d, 1)), []);
  const goToday = useCallback(() => setCurrentWeek(new Date()), []);

  const currentHour = getHours(now);
  const selectedCourt = courts.find(c => c.id === courtId);

  // Calcola nome visualizzato per una prenotazione
  const getDisplayName = useCallback((r: Reservation): string => {
    if (r.booked_for_first_name) {
      return `${r.booked_for_first_name} ${r.booked_for_last_name ?? ''}`.trim();
    }
    return profileMap[r.user_id] || 'Socio';
  }, [profileMap]);

  if (courts.length === 0 && !loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-500 font-medium">Caricamento...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-28 md:pb-12">
      {/* Header sticky */}
      <header className="sticky top-0 z-20 bg-[#F8FAFC]/90 backdrop-blur border-b border-gray-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-8">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigate(-1)}
              aria-label="Indietro"
              className="rounded-2xl border-none shadow-sm bg-white text-primary hover:scale-110 active:scale-95 transition-transform"
            >
              <ArrowLeft size={20} />
            </Button>
            <div>
              <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] hidden sm:block">
                Solo lettura
              </p>
              <h1 className="text-xl font-extrabold text-gray-900 tracking-tighter sm:text-2xl">
                Vista Settimanale
              </h1>
            </div>
          </div>
          <UserNav />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-5 sm:px-8">

        {/* Toolbar */}
        <section className="rounded-[1.5rem] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] p-3 sm:p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Navigatore settimana */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={goPrev}
              aria-label="Settimana precedente"
              className="rounded-2xl border-none shadow-sm bg-white text-primary hover:scale-110 active:scale-95 transition-transform"
            >
              <ChevronLeft size={18} />
            </Button>

            <div className="flex items-center gap-1.5 px-2 min-w-[170px] justify-center">
              <CalendarDays size={15} className="text-gray-400 shrink-0" />
              <span className="text-sm font-bold text-gray-800 tabular-nums">
                {weekLabel}
              </span>
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={goNext}
              aria-label="Settimana successiva"
              className="rounded-2xl border-none shadow-sm bg-white text-primary hover:scale-110 active:scale-95 transition-transform"
            >
              <ChevronRight size={18} />
            </Button>

            {!isViewingCurrentWeek && (
              <Button
                variant="ghost"
                size="sm"
                onClick={goToday}
                className="ml-1 rounded-full text-primary hover:bg-primary/10 font-bold text-xs"
              >
                Oggi
              </Button>
            )}
          </div>

          {/* Selettore campo */}
          {courts.length > 0 && courtId !== null && (
            <Tabs
              value={String(courtId)}
              onValueChange={v => setCourtId(Number(v))}
            >
              <TabsList className="rounded-2xl bg-gray-100 p-1">
                {courts.map(c => (
                  <TabsTrigger
                    key={c.id}
                    value={String(c.id)}
                    className={cn(
                      'rounded-xl px-4 text-sm font-bold',
                      'data-[state=active]:bg-primary data-[state=active]:text-white',
                      'data-[state=active]:shadow-sm',
                    )}
                  >
                    {c.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
        </section>

        {/* Griglia */}
        <section
          className="mt-4 rounded-[2rem] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] p-3 sm:p-5"
          aria-busy={loading}
          aria-label={`Prenotazioni ${weekLabel}${selectedCourt ? ` – ${selectedCourt.name}` : ''}`}
        >
          {/* Banner errore */}
          {error && (
            <div className="mb-3 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0" />
              {error}
              <button
                onClick={() => setCurrentWeek(w => new Date(w))}
                className="ml-auto underline font-semibold text-xs"
              >
                Riprova
              </button>
            </div>
          )}

          {/* Tabella scorrevole orizzontalmente su mobile */}
          <div className="relative overflow-x-auto" role="grid">
            <div className="min-w-[620px]">

              {/* Riga header giorni */}
              <div
                className="grid gap-2 mb-2"
                style={{ gridTemplateColumns: '52px repeat(7, minmax(0,1fr))' }}
              >
                <div /> {/* angolo vuoto */}
                {weekDays.map(day => (
                  <DayHeader key={day.toISOString()} day={day} />
                ))}
              </div>

              {/* Righe orarie */}
              <div className="flex flex-col gap-1.5">
                {HOURS.map(hour => {
                  const isCurrentHour = isViewingCurrentWeek && hour === currentHour;
                  const hourLabel = `${String(hour).padStart(2, '0')}:00`;

                  return (
                    <div
                      key={hour}
                      role="row"
                      className={cn(
                        'grid gap-2 items-stretch rounded-xl',
                        isCurrentHour && 'bg-primary/5',
                      )}
                      style={{ gridTemplateColumns: '52px repeat(7, minmax(0,1fr))' }}
                    >
                      {/* Etichetta ora */}
                      <div
                        className={cn(
                          'sticky left-0 z-10 flex items-center justify-end pr-2',
                          'text-[11px] font-black tabular-nums tracking-tighter',
                          'bg-white md:bg-transparent',
                          isCurrentHour ? 'text-primary' : 'text-gray-400',
                        )}
                      >
                        {hourLabel}
                      </div>

                      {/* Celle giorni */}
                      {weekDays.map(day => {
                        const key = `${format(day, 'yyyy-MM-dd')}_${hour}`;
                        const res = reservationIndex.get(key);
                        const name = res ? getDisplayName(res) : '';
                        const dayStr = format(day, 'EEEE d MMMM', { locale: it });

                        return (
                          <BookingCell
                            key={key}
                            reservation={res}
                            displayName={name}
                            isCurrentHour={isCurrentHour}
                            isCurrentDay={isToday(day)}
                            ariaLabel={`${dayStr} ore ${hourLabel}`}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {/* Overlay loading */}
              {loading && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/60 rounded-[1.5rem]">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <p className="text-xs text-gray-500 font-medium">Caricamento...</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Legenda */}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-gray-500 border-t border-gray-100 pt-4">
            {(['singolare', 'doppio', 'lezione'] as BookingType[]).map(t => (
              <span key={t} className="flex items-center gap-1.5">
                <span className={cn('inline-block h-3 w-3 rounded', BOOKING_TYPE_META[t].bg)} />
                <span className="font-semibold">{BOOKING_TYPE_META[t].label}</span>
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded border border-gray-200 bg-white" />
              <span className="font-semibold">Libero</span>
            </span>
          </div>
        </section>

        {/* CTA desktop */}
        <div className="mt-6 hidden md:flex md:justify-end md:items-center gap-3">
          <p className="text-sm text-gray-400 font-medium">
            Vuoi prenotare uno slot?
          </p>
          <Link to="/book">
            <Button className="rounded-[1.5rem] bg-gradient-to-br from-primary to-[#23532f] text-white font-black px-6 py-5 shadow-lg shadow-primary/20 hover:scale-[1.01] active:scale-[0.98]">
              Prenota ora <ChevronRight size={18} />
            </Button>
          </Link>
        </div>
      </main>

      {/* CTA mobile fisso in fondo */}
      <div className="fixed bottom-0 left-0 right-0 z-30 md:hidden border-t border-gray-100 bg-white/95 backdrop-blur px-4 py-3">
        <Link to="/book">
          <Button className="w-full h-14 rounded-[1.5rem] bg-gradient-to-br from-primary to-[#23532f] text-white font-black text-base shadow-lg shadow-primary/20 hover:scale-[1.01] active:scale-[0.98]">
            Prenota ora <ChevronRight size={20} />
          </Button>
        </Link>
      </div>
    </div>
  );
}

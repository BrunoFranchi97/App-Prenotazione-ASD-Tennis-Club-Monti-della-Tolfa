"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { addDays, addWeeks, format, setHours, setMinutes, setSeconds, setMilliseconds, startOfWeek } from 'date-fns';
import { it } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, LogOut, CalendarPlus, Clock, AlertCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { cn } from '@/lib/utils';
import { Court, BlockType } from '@/types/supabase';
import { BLOCK_TYPE_META, BLOCK_TYPE_OPTIONS } from '@/utils/blockType';

const DAY_LABELS_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

// Orario esteso fino alle 23:00 (ora fine, per bloccare anche lo slot 22:00-23:00)
const timeSlots = [
  "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00"
];

interface ConflictInfo {
  date: Date;
  startTime: string;
  endTime: string;
  occupantName: string;
}

const jsDayToMondayIndex = (d: Date) => (d.getDay() + 6) % 7;

const AdminBlockSlots = () => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [courts, setCourts] = useState<Court[]>([]);

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedCourt, setSelectedCourt] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("08:00");
  const [endTime, setEndTime] = useState<string>("09:00");
  const [blockType, setBlockType] = useState<BlockType>('manutenzione');
  const [reason, setReason] = useState<string>("");

  const [selectedDays, setSelectedDays] = useState<number[]>(() => [jsDayToMondayIndex(new Date())]);
  const [numberOfWeeks, setNumberOfWeeks] = useState<string>("1");

  const [conflicts, setConflicts] = useState<ConflictInfo[] | null>(null);

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        showError(error.message);
      } else {
        showSuccess("Disconnessione effettuata con successo!");
        navigate('/login');
      }
    } catch (error: any) {
      showError(error.message || "Errore durante la disconnessione.");
    }
  };

  const fetchAdminStatus = async (): Promise<boolean> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate('/login');
      return false;
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (error || !profile?.is_admin) {
      showError("Accesso negato. Non sei un amministratore.");
      navigate('/dashboard');
      return false;
    }

    return true;
  };

  const fetchCourts = async () => {
    try {
      const { data, error } = await supabase
        .from('courts')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;

      setCourts(data || []);

      if (data && data.length > 0) {
        setSelectedCourt(String(data[0].id));
      }
    } catch (err: any) {
      showError("Errore nel caricamento dei campi: " + err.message);
    }
  };

  useEffect(() => {
    const initialize = async () => {
      setLoading(true);
      try {
        const adminOk = await fetchAdminStatus();
        if (adminOk) {
          setIsAdmin(true);
          await fetchCourts();
        } else {
          setIsAdmin(false);
        }
      } catch (err: any) {
        showError("Errore durante l'inizializzazione: " + err.message);
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, [navigate]);

  const createDateTime = (date: Date, time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    let result = setHours(new Date(date), hours);
    result = setMinutes(result, minutes);
    result = setSeconds(result, 0);
    result = setMilliseconds(result, 0);
    return result;
  };

  const toggleDay = (day: number) => {
    setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort());
  };

  const weeksCount = Math.max(1, Math.min(52, parseInt(numberOfWeeks, 10) || 1));

  const hoursPerSlot = useMemo(() => {
    const startIdx = timeSlots.indexOf(startTime);
    const endIdx = timeSlots.indexOf(endTime);
    return startIdx >= 0 && endIdx > startIdx ? endIdx - startIdx : 0;
  }, [startTime, endTime]);

  const totalSlots = hoursPerSlot * selectedDays.length * weeksCount;

  const handleBlockSlots = async () => {
    if (!selectedDate || !selectedCourt || !startTime || !endTime) {
      showError("Compila tutti i campi obbligatori.");
      return;
    }

    if (timeSlots.indexOf(startTime) >= timeSlots.indexOf(endTime)) {
      showError("L'ora di fine deve essere successiva all'ora di inizio.");
      return;
    }

    if (selectedDays.length === 0) {
      showError("Seleziona almeno un giorno della settimana da bloccare.");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        showError("Utente non autenticato.");
        return;
      }

      const courtIdNum = Number(selectedCourt);
      const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });

      // Le prenotazioni sono sempre slot da 1 ora (vincolo DB reservations_duration_60):
      // per bloccare un intervallo di più ore inseriamo una riga per ogni ora coinvolta,
      // ripetuta per ogni giorno selezionato e per ogni settimana da ripetere.
      const generatedSlots: { starts_at: Date; ends_at: Date }[] = [];
      for (let w = 0; w < weeksCount; w++) {
        const currentWeekStart = addWeeks(weekStart, w);
        for (const day of selectedDays) {
          const dayDate = addDays(currentWeekStart, day);
          let slotStart = createDateTime(dayDate, startTime);
          const rowEnd = createDateTime(dayDate, endTime);
          while (slotStart < rowEnd) {
            const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);
            generatedSlots.push({ starts_at: slotStart, ends_at: slotEnd });
            slotStart = slotEnd;
          }
        }
      }

      if (generatedSlots.length === 0) {
        showError("Nessuno slot da bloccare con la configurazione attuale.");
        setSaving(false);
        return;
      }

      const rangeStart = generatedSlots.reduce((min, s) => (s.starts_at < min ? s.starts_at : min), generatedSlots[0].starts_at);
      const rangeEnd = generatedSlots.reduce((max, s) => (s.ends_at > max ? s.ends_at : max), generatedSlots[0].ends_at);

      const [{ data: existingRes, error: resError }, { data: profilesData }] = await Promise.all([
        supabase
          .from('reservations')
          .select('*')
          .eq('court_id', courtIdNum)
          .gte('starts_at', rangeStart.toISOString())
          .lt('starts_at', rangeEnd.toISOString())
          .neq('status', 'cancelled'),
        supabase.from('profiles').select('id, full_name'),
      ]);

      if (resError) throw resError;

      const profileMap = new Map((profilesData || []).map(p => [p.id, p.full_name || "Socio"]));
      const existingMap = new Map((existingRes || []).map(r => [new Date(r.starts_at).getTime(), r]));

      const foundConflicts: ConflictInfo[] = [];
      for (const slot of generatedSlots) {
        const existing = existingMap.get(slot.starts_at.getTime());
        if (existing) {
          const occupantName = existing.booked_for_first_name && existing.booked_for_last_name
            ? `${existing.booked_for_first_name} ${existing.booked_for_last_name}`
            : profileMap.get(existing.user_id) || "Socio";
          foundConflicts.push({
            date: slot.starts_at,
            startTime: format(slot.starts_at, 'HH:mm'),
            endTime: format(slot.ends_at, 'HH:mm'),
            occupantName,
          });
        }
      }

      if (foundConflicts.length > 0) {
        setConflicts(foundConflicts.sort((a, b) => a.date.getTime() - b.date.getTime()));
        setSaving(false);
        return;
      }

      const rowsToInsert = generatedSlots.map(slot => ({
        court_id: courtIdNum,
        user_id: user.id,
        starts_at: slot.starts_at.toISOString(),
        ends_at: slot.ends_at.toISOString(),
        status: 'confirmed' as const,
        booking_type: 'lezione' as const,
        block_type: blockType,
        notes: `BLOCCATO (${BLOCK_TYPE_META[blockType].label}): ${reason.trim() || 'Nessun motivo specificato'}`,
        booked_for_first_name: 'SLOT',
        booked_for_last_name: 'BLOCCATO',
      }));

      const CHUNK_SIZE = 200;
      for (let i = 0; i < rowsToInsert.length; i += CHUNK_SIZE) {
        const chunk = rowsToInsert.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase.from('reservations').insert(chunk);
        if (error) throw error;
      }

      showSuccess(`${rowsToInsert.length} slot bloccati con successo!`);
      setReason("");
    } catch (err: any) {
      showError("Errore durante il blocco degli slot: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 sm:p-10 lg:p-12">
      <header className="flex justify-between items-end mb-10 max-w-7xl mx-auto">
        <div className="flex items-center gap-6">
          <Link to="/admin">
            <Button variant="outline" size="icon" className="rounded-2xl border-none shadow-sm bg-white text-primary hover:scale-110 active:scale-95 transition-transform">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <p className="text-sm font-bold text-club-orange uppercase tracking-[0.2em] mb-1">Amministrazione</p>
            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tighter">Blocca Slot Orari</h1>
          </div>
        </div>
        <Button variant="ghost" onClick={handleLogout} className="rounded-2xl text-gray-400 hover:text-primary font-bold">
          <LogOut className="mr-2 h-4 w-4" /> Esci
        </Button>
      </header>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white">
          <CardHeader className="px-8 pt-8 pb-4">
            <CardTitle className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-primary" /> Seleziona Data e Campo
            </CardTitle>
            <CardDescription className="text-gray-400 text-sm">La data scelta determina la settimana di partenza del blocco</CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8 space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-semibold ml-1 text-gray-700">Campo</Label>
              <Select value={selectedCourt} onValueChange={setSelectedCourt}>
                <SelectTrigger className="rounded-xl border-gray-200">
                  <SelectValue placeholder="Seleziona un campo" />
                </SelectTrigger>
                <SelectContent>
                  {courts.length === 0 ? (
                    <SelectItem value="no-courts" disabled>Nessun campo disponibile</SelectItem>
                  ) : (
                    courts.map((court) => (
                      <SelectItem key={court.id} value={String(court.id)}>{court.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold ml-1 text-gray-700">Data di partenza</Label>
              <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  locale={it}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  className="rounded-2xl"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white">
          <CardHeader className="px-8 pt-8 pb-4">
            <CardTitle className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" /> Orario, Tipo e Motivo
            </CardTitle>
            <CardDescription className="text-gray-400 text-sm">Definisci la fascia oraria e la tipologia di blocco</CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold ml-1 text-gray-700">Ora inizio</Label>
                <Select value={startTime} onValueChange={setStartTime}>
                  <SelectTrigger className="rounded-xl border-gray-200">
                    <SelectValue placeholder="Inizio" />
                  </SelectTrigger>
                  <SelectContent>
                    {timeSlots.map((time) => (
                      <SelectItem key={time} value={time}>{time}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold ml-1 text-gray-700">Ora fine</Label>
                <Select value={endTime} onValueChange={setEndTime}>
                  <SelectTrigger className="rounded-xl border-gray-200">
                    <SelectValue placeholder="Fine" />
                  </SelectTrigger>
                  <SelectContent>
                    {timeSlots.map((time) => (
                      <SelectItem key={time} value={time}>{time}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold ml-1 text-gray-700">Tipo di blocco</Label>
              <Select value={blockType} onValueChange={(v) => setBlockType(v as BlockType)}>
                <SelectTrigger className="rounded-xl border-gray-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BLOCK_TYPE_OPTIONS.map((type) => (
                    <SelectItem key={type} value={type}>
                      <span className="flex items-center gap-2">
                        <span className={cn("h-2.5 w-2.5 rounded-full", BLOCK_TYPE_META[type].bg)} />
                        {BLOCK_TYPE_META[type].label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold ml-1 text-gray-700">Note aggiuntive (opzionale)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Es. Irrigazione automatica, sostituzione rete..."
                rows={2}
                className="rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary resize-none"
              />
            </div>

            <div className="space-y-2 pt-2 border-t border-gray-50">
              <Label className="text-sm font-semibold ml-1 text-gray-700">Ripeti su questi giorni</Label>
              <div className="flex flex-wrap gap-2">
                {DAY_LABELS_SHORT.map((label, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleDay(idx)}
                    className={cn(
                      "px-4 py-2 rounded-full text-xs font-bold transition-all border-2",
                      selectedDays.includes(idx)
                        ? "bg-primary border-primary text-white shadow-md shadow-primary/10"
                        : "bg-white border-gray-100 text-gray-400 hover:border-primary/30 hover:text-primary"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold ml-1 text-gray-700">Per quante settimane</Label>
              <Input
                type="number"
                min={1}
                max={52}
                value={numberOfWeeks}
                onChange={(e) => setNumberOfWeeks(e.target.value)}
                className="rounded-xl border-gray-200 h-12"
              />
            </div>

            <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4">
              <p className="text-sm font-bold text-primary">
                Bloccherai {totalSlots} slot da 1 ora
              </p>
            </div>

            <div className="bg-amber-50/80 border border-amber-200/60 rounded-2xl p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-amber-700 font-medium leading-relaxed">
                  Gli slot bloccati non saranno prenotabili dai soci. Verranno visualizzati come non disponibili nel calendario.
                </p>
              </div>
            </div>

            <Button
              onClick={handleBlockSlots}
              disabled={saving || !selectedDate || !selectedCourt || !startTime || !endTime || selectedDays.length === 0}
              className="w-full h-12 bg-gradient-to-br from-primary to-[#23532f] hover:from-[#357a46] hover:to-[#23532f] text-white rounded-2xl font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.01] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {saving ? "Bloccaggio in corso..." : "Blocca Slot"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!conflicts} onOpenChange={(open) => !open && setConflicts(null)}>
        <AlertDialogContent className="rounded-[2rem] max-w-lg">
          <AlertDialogHeader>
            <div className="mx-auto w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mb-2">
              <AlertTriangle className="h-7 w-7 text-destructive" />
            </div>
            <AlertDialogTitle className="text-center text-xl font-extrabold text-gray-900">
              Impossibile completare il blocco
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-gray-500">
              Alcuni slot sono già occupati o già bloccati. Nessun blocco è stato creato. Contatta gli utenti indicati per liberare gli slot, poi riprova.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-64 overflow-y-auto space-y-2 px-1">
            {conflicts?.map((c, idx) => (
              <div key={idx} className="bg-destructive/5 border border-destructive/10 rounded-xl p-3 text-sm">
                <p className="font-bold text-gray-900 capitalize">
                  {format(c.date, 'EEEE d MMMM', { locale: it })} · {c.startTime}-{c.endTime}
                </p>
                <p className="text-gray-500">Occupato da: <span className="font-semibold text-gray-700">{c.occupantName}</span></p>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogAction className="rounded-xl bg-primary hover:bg-[#357a46] w-full" onClick={() => setConflicts(null)}>
              Ho capito
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminBlockSlots;

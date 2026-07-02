"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ArrowLeft, GraduationCap, Plus, Trash2, AlertTriangle, CalendarRange } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { format, addDays, addWeeks, startOfWeek, setHours, setMinutes, setSeconds, setMilliseconds, isBefore } from 'date-fns';
import { it } from 'date-fns/locale';
import type { Court } from '@/types/supabase';
import UserNav from '@/components/UserNav';

const DAY_LABELS = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

// Orario esteso dalle 08:00 alle 22:00
const TIME_SLOTS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"];

interface TemplateRow {
  id: string;
  day: number; // 0 = Lunedì ... 6 = Domenica
  courtId: number | null;
  startTime: string;
  endTime: string;
}

interface ConflictInfo {
  date: Date;
  startTime: string;
  endTime: string;
  courtName: string;
  occupantName: string;
}

let rowIdCounter = 0;
const makeRow = (defaultCourtId: number | null): TemplateRow => ({
  id: `row-${++rowIdCounter}`,
  day: 0,
  courtId: defaultCourtId,
  startTime: "08:00",
  endTime: "09:00",
});

const buildDateTime = (date: Date, time: string) => {
  const [h, m] = time.split(':').map(Number);
  let d = setHours(date, h);
  d = setMinutes(d, m);
  d = setSeconds(d, 0);
  d = setMilliseconds(d, 0);
  return d;
};

const AdminBulkBooking = () => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [courts, setCourts] = useState<Court[]>([]);
  const [rows, setRows] = useState<TemplateRow[]>([]);

  const [startWeekDate, setStartWeekDate] = useState<Date | undefined>(new Date());
  const [numberOfWeeks, setNumberOfWeeks] = useState<string>("1");

  const [beneficiaryFirstName, setBeneficiaryFirstName] = useState("Scuola");
  const [beneficiaryLastName, setBeneficiaryLastName] = useState("Tennis");
  const [notes, setNotes] = useState("");

  const [conflicts, setConflicts] = useState<ConflictInfo[] | null>(null);

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

    setAdminId(user.id);
    return true;
  };

  const fetchCourts = async () => {
    const { data, error } = await supabase.from('courts').select('*').eq('is_active', true).order('name');
    if (error) {
      showError("Errore nel caricamento dei campi: " + error.message);
      return;
    }
    setCourts(data || []);
    if (data && data.length > 0) {
      setRows([makeRow(data[0].id)]);
    }
  };

  useEffect(() => {
    const initialize = async () => {
      setLoading(true);
      const adminOk = await fetchAdminStatus();
      if (adminOk) {
        setIsAdmin(true);
        await fetchCourts();
      }
      setLoading(false);
    };
    initialize();
  }, [navigate]);

  const addRow = () => {
    setRows(prev => [...prev, makeRow(courts[0]?.id ?? null)]);
  };

  const removeRow = (id: string) => {
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const updateRow = (id: string, patch: Partial<TemplateRow>) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  };

  // Quanti slot da 1 ora genera il modello in UNA settimana
  const slotsPerWeek = useMemo(() => {
    let count = 0;
    for (const row of rows) {
      const startIdx = TIME_SLOTS.indexOf(row.startTime);
      const endIdx = TIME_SLOTS.indexOf(row.endTime);
      if (startIdx >= 0 && endIdx > startIdx) count += endIdx - startIdx;
    }
    return count;
  }, [rows]);

  const weeksCount = Math.max(1, parseInt(numberOfWeeks, 10) || 1);
  const totalSlots = slotsPerWeek * weeksCount;

  const handleVerifyAndBook = async () => {
    if (!startWeekDate) {
      showError("Seleziona la settimana di partenza.");
      return;
    }
    if (rows.length === 0) {
      showError("Aggiungi almeno una riga al modello settimanale.");
      return;
    }
    for (const row of rows) {
      if (!row.courtId) {
        showError("Ogni riga deve avere un campo selezionato.");
        return;
      }
      if (TIME_SLOTS.indexOf(row.startTime) >= TIME_SLOTS.indexOf(row.endTime)) {
        showError(`Riga "${DAY_LABELS[row.day]}": l'ora di fine deve essere successiva all'ora di inizio.`);
        return;
      }
    }
    if (weeksCount < 1 || weeksCount > 52) {
      showError("Il numero di settimane deve essere tra 1 e 52.");
      return;
    }
    if (!beneficiaryFirstName.trim() || !beneficiaryLastName.trim()) {
      showError("Inserisci nome e cognome del beneficiario.");
      return;
    }
    if (!adminId) {
      showError("Utente non autenticato.");
      return;
    }

    setSaving(true);
    try {
      const weekStart = startOfWeek(startWeekDate, { locale: it, weekStartsOn: 1 });

      // Genera tutti gli slot orari (1 riga = 1 ora, coerente col vincolo DB reservations_duration_60)
      const generatedSlots: { court_id: number; starts_at: Date; ends_at: Date }[] = [];
      const seen = new Set<string>();
      for (let w = 0; w < weeksCount; w++) {
        const currentWeekStart = addWeeks(weekStart, w);
        for (const row of rows) {
          const dayDate = addDays(currentWeekStart, row.day);
          let slotStart = buildDateTime(dayDate, row.startTime);
          const rowEnd = buildDateTime(dayDate, row.endTime);
          while (isBefore(slotStart, rowEnd)) {
            const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);
            const key = `${row.courtId}|${slotStart.getTime()}`;
            if (!seen.has(key)) {
              seen.add(key);
              generatedSlots.push({ court_id: row.courtId as number, starts_at: slotStart, ends_at: slotEnd });
            }
            slotStart = slotEnd;
          }
        }
      }

      if (generatedSlots.length === 0) {
        showError("Nessuno slot da generare con la configurazione attuale.");
        setSaving(false);
        return;
      }

      const involvedCourtIds = Array.from(new Set(generatedSlots.map(s => s.court_id)));
      const rangeStart = generatedSlots.reduce((min, s) => (s.starts_at < min ? s.starts_at : min), generatedSlots[0].starts_at);
      const rangeEnd = generatedSlots.reduce((max, s) => (s.ends_at > max ? s.ends_at : max), generatedSlots[0].ends_at);

      const [{ data: existingRes, error: resError }, { data: profilesData, error: profError }] = await Promise.all([
        supabase
          .from('reservations')
          .select('*')
          .in('court_id', involvedCourtIds)
          .gte('starts_at', rangeStart.toISOString())
          .lt('starts_at', rangeEnd.toISOString())
          .neq('status', 'cancelled'),
        supabase.from('profiles').select('id, full_name'),
      ]);

      if (resError) throw resError;
      if (profError) throw profError;

      const profileMap = new Map((profilesData || []).map(p => [p.id, p.full_name || "Socio"]));
      const existingMap = new Map(
        (existingRes || []).map(r => [`${r.court_id}|${new Date(r.starts_at).getTime()}`, r])
      );

      const foundConflicts: ConflictInfo[] = [];
      for (const slot of generatedSlots) {
        const key = `${slot.court_id}|${slot.starts_at.getTime()}`;
        const existing = existingMap.get(key);
        if (existing) {
          const courtName = courts.find(c => c.id === slot.court_id)?.name || `Campo ${slot.court_id}`;
          const occupantName =
            existing.booked_for_first_name && existing.booked_for_last_name
              ? `${existing.booked_for_first_name} ${existing.booked_for_last_name}`
              : profileMap.get(existing.user_id) || "Socio";
          foundConflicts.push({
            date: slot.starts_at,
            startTime: format(slot.starts_at, 'HH:mm'),
            endTime: format(slot.ends_at, 'HH:mm'),
            courtName,
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
        court_id: slot.court_id,
        user_id: adminId,
        starts_at: slot.starts_at.toISOString(),
        ends_at: slot.ends_at.toISOString(),
        status: 'confirmed' as const,
        booking_type: 'lezione' as const,
        notes: notes.trim() || `Scuola Tennis: ${beneficiaryFirstName} ${beneficiaryLastName}`,
        booked_for_first_name: beneficiaryFirstName.trim(),
        booked_for_last_name: beneficiaryLastName.trim(),
      }));

      // Inserimento in batch per non superare i limiti della singola richiesta
      const CHUNK_SIZE = 200;
      for (let i = 0; i < rowsToInsert.length; i += CHUNK_SIZE) {
        const chunk = rowsToInsert.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase.from('reservations').insert(chunk);
        if (error) throw error;
      }

      showSuccess(`${rowsToInsert.length} prenotazioni create con successo!`);
    } catch (err: any) {
      showError("Errore durante la creazione delle prenotazioni: " + err.message);
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

  if (!isAdmin) return null;

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
            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tighter">Prenotazione Scuola Tennis</h1>
          </div>
        </div>
        <UserNav />
      </header>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white lg:col-span-2">
          <CardHeader className="px-8 pt-8 pb-4">
            <CardTitle className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" /> Modello Settimanale
            </CardTitle>
            <CardDescription className="text-gray-400 text-sm">
              Definisci giorno, campo e orario di ogni lezione: verrà ripetuto ogni settimana selezionata.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8 space-y-4">
            {courts.length === 0 ? (
              <p className="text-sm text-gray-400 font-medium">Nessun campo attivo disponibile.</p>
            ) : (
              <>
                <div className="space-y-3">
                  {rows.map(row => (
                    <div key={row.id} className="grid grid-cols-1 sm:grid-cols-[1.2fr_1.2fr_1fr_1fr_auto] gap-3 items-center bg-gray-50/60 rounded-2xl p-3">
                      <Select value={String(row.day)} onValueChange={(v) => updateRow(row.id, { day: Number(v) })}>
                        <SelectTrigger className="rounded-xl border-gray-200 bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DAY_LABELS.map((label, idx) => (
                            <SelectItem key={idx} value={String(idx)}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select value={row.courtId ? String(row.courtId) : ""} onValueChange={(v) => updateRow(row.id, { courtId: Number(v) })}>
                        <SelectTrigger className="rounded-xl border-gray-200 bg-white">
                          <SelectValue placeholder="Campo" />
                        </SelectTrigger>
                        <SelectContent>
                          {courts.map(c => (
                            <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select value={row.startTime} onValueChange={(v) => updateRow(row.id, { startTime: v })}>
                        <SelectTrigger className="rounded-xl border-gray-200 bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIME_SLOTS.map(t => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select value={row.endTime} onValueChange={(v) => updateRow(row.id, { endTime: v })}>
                        <SelectTrigger className="rounded-xl border-gray-200 bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIME_SLOTS.map(t => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRow(row.id)}
                        className="rounded-xl text-gray-400 hover:text-destructive hover:bg-destructive/5 justify-self-end"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                <Button
                  variant="outline"
                  onClick={addRow}
                  className="rounded-xl border-2 border-dashed border-gray-200 text-gray-500 hover:border-primary/30 hover:text-primary font-bold"
                >
                  <Plus className="mr-2 h-4 w-4" /> Aggiungi riga
                </Button>

                <p className="text-xs font-bold text-primary/70 uppercase tracking-widest pt-2">
                  {slotsPerWeek} slot da 1 ora a settimana
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white">
          <CardHeader className="px-8 pt-8 pb-4">
            <CardTitle className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
              <CalendarRange className="h-5 w-5 text-primary" /> Applica su più Settimane
            </CardTitle>
            <CardDescription className="text-gray-400 text-sm">Scegli da quale settimana partire e per quante ripetere il modello</CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8 space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-semibold ml-1 text-gray-700">Settimana di partenza</Label>
              <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden flex justify-center">
                <Calendar
                  mode="single"
                  selected={startWeekDate}
                  onSelect={setStartWeekDate}
                  locale={it}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  className="rounded-2xl"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold ml-1 text-gray-700">Numero di settimane</Label>
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
                Genererai {totalSlots} prenotazioni totali
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white">
          <CardHeader className="px-8 pt-8 pb-4">
            <CardTitle className="text-lg font-extrabold text-gray-900">Beneficiario e Note</CardTitle>
            <CardDescription className="text-gray-400 text-sm">Comparirà nel tabellone prenotazioni</CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold ml-1 text-gray-700">Nome</Label>
                <Input value={beneficiaryFirstName} onChange={(e) => setBeneficiaryFirstName(e.target.value)} className="rounded-xl border-gray-200 h-12" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold ml-1 text-gray-700">Cognome</Label>
                <Input value={beneficiaryLastName} onChange={(e) => setBeneficiaryLastName(e.target.value)} className="rounded-xl border-gray-200 h-12" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold ml-1 text-gray-700">Note (opzionale)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Es. Corso principianti, Maestro Rossi..."
                rows={3}
                className="rounded-xl border-gray-200 resize-none"
              />
            </div>

            <Button
              onClick={handleVerifyAndBook}
              disabled={saving || courts.length === 0 || rows.length === 0}
              className="w-full h-12 bg-gradient-to-br from-primary to-[#23532f] hover:from-[#357a46] hover:to-[#23532f] text-white rounded-2xl font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.01] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {saving ? "Verifica in corso..." : "Verifica e Prenota"}
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
              Impossibile completare la prenotazione
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-gray-500">
              Alcuni slot sono già occupati. Nessuna prenotazione è stata creata. Contatta gli utenti indicati per liberare gli slot, poi riprova.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-64 overflow-y-auto space-y-2 px-1">
            {conflicts?.map((c, idx) => (
              <div key={idx} className="bg-destructive/5 border border-destructive/10 rounded-xl p-3 text-sm">
                <p className="font-bold text-gray-900 capitalize">
                  {format(c.date, 'EEEE d MMMM', { locale: it })} · {c.startTime}-{c.endTime} · {c.courtName}
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

export default AdminBulkBooking;

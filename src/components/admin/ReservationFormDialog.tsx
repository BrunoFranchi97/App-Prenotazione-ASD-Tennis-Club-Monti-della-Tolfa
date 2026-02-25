"use client";

import React, { useEffect, useMemo, useState } from "react";
import { format, setHours, setMinutes, setSeconds, setMilliseconds, addHours, addDays, isBefore, isAfter } from "date-fns";
import { it } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarDays, Clock, MapPin, Users, User, ChevronRight } from "lucide-react";

import type { Court, Reservation } from "@/types/supabase";

type ProfileLite = { id: string; full_name: string | null };

type FormValues = {
  id?: string;
  user_id: string;
  court_id: number;
  starts_at: string;
  ends_at: string;
  booked_for_first_name?: string | null;
  booked_for_last_name?: string | null;
  notes?: string | null;
};

function makeOnTheHour(baseDate: Date, hhmm: string) {
  const [h, m] = hhmm.split(":").map((x) => Number(x));
  let d = setHours(baseDate, h);
  d = setMinutes(d, m);
  d = setSeconds(d, 0);
  d = setMilliseconds(d, 0);
  return d;
}

export default function ReservationFormDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  loading?: boolean;
  courts: Court[];
  profiles: ProfileLite[];
  initial?: Reservation | null;
  onSubmit: (values: FormValues) => Promise<void>;
}) {
  const { open, onOpenChange, mode, loading = false, courts, profiles, initial, onSubmit } = props;

  const [date, setDate] = useState<Date | undefined>(new Date());
  const [courtId, setCourtId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("08:00");
  const [durationHours, setDurationHours] = useState<string>("1");
  const [bookedForFirstName, setBookedForFirstName] = useState("");
  const [bookedForLastName, setBookedForLastName] = useState("");
  const [notes, setNotes] = useState("");

  const timeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let h = 8; h < 20; h++) slots.push(`${String(h).padStart(2, "0")}:00`);
    return slots;
  }, []);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      const start = new Date(initial.starts_at);
      const end = new Date(initial.ends_at);
      setDate(start);
      setCourtId(String(initial.court_id));
      setUserId(initial.user_id);
      setStartTime(format(start, "HH:mm"));
      const dur = Math.max(1, Math.min(3, Math.round((end.getTime() - start.getTime()) / (60 * 60 * 1000))));
      setDurationHours(String(dur));
      setBookedForFirstName(initial.booked_for_first_name || "");
      setBookedForLastName(initial.booked_for_last_name || "");
      setNotes((initial.notes as string) || "");
    } else {
      setDate(new Date());
      setCourtId(courts[0] ? String(courts[0].id) : "");
      setUserId("");
      setStartTime("08:00");
      setDurationHours("1");
      setBookedForFirstName("");
      setBookedForLastName("");
      setNotes("");
    }
  }, [open, mode, initial, courts]);

  const handleSubmit = async () => {
    if (!date || !courtId || !userId) return;
    const start = makeOnTheHour(date, startTime);
    const end = addHours(start, Number(durationHours));
    await onSubmit({
      id: initial?.id,
      user_id: userId,
      court_id: Number(courtId),
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      booked_for_first_name: bookedForFirstName.trim() || null,
      booked_for_last_name: bookedForLastName.trim() || null,
      notes: notes.trim() || null
    });
  };

  const selectedCourt = courts.find(c => c.id === Number(courtId));
  const selectedProfile = profiles.find(p => p.id === userId);
  const today = new Date();
  const maxDate = addDays(today, 14);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] border-t-8 border-t-primary rounded-[2.5rem] overflow-hidden p-0">
        <DialogHeader className="bg-primary text-primary-foreground p-8 text-center">
          <div className="mx-auto w-20 h-20 rounded-3xl bg-white/20 flex items-center justify-center mb-4 backdrop-blur-sm">
            <CalendarDays className="h-10 w-10 text-white" />
          </div>
          <DialogTitle className="text-3xl font-extrabold tracking-tight">
            {mode === "create" ? "Nuova Prenotazione" : "Modifica Prenotazione"}
          </DialogTitle>
          <DialogDescription className="text-white/80 font-medium text-base">
            {mode === "create" 
              ? "Crea una nuova prenotazione per un socio" 
              : "Modifica i dettagli della prenotazione esistente"}
          </DialogDescription>
        </DialogHeader>

        <div className="p-8 space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Colonna sinistra: Selezione data e campo */}
            <div className="space-y-6">
              <div className="space-y-3">
                <Label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Socio</Label>
                <Select value={userId} onValueChange={setUserId}>
                  <SelectTrigger className="h-14 rounded-2xl border-gray-100 bg-gray-50/50 focus:ring-primary/20 focus:border-primary text-base font-medium">
                    <SelectValue placeholder="Scegli socio" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    {profiles.map(p => (
                      <SelectItem key={p.id} value={p.id} className="py-3 text-base">
                        {p.full_name || "Socio senza nome"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Campo</Label>
                <Select value={courtId} onValueChange={setCourtId}>
                  <SelectTrigger className="h-14 rounded-2xl border-gray-100 bg-gray-50/50 focus:ring-primary/20 focus:border-primary text-base font-medium">
                    <SelectValue placeholder="Scegli campo" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    {courts.map(c => (
                      <SelectItem key={c.id} value={String(c.id)} className="py-3 text-base">
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Data</Label>
                <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white overflow-hidden">
                  <CardContent className="p-4 flex justify-center">
                    <Calendar 
                      mode="single" 
                      selected={date} 
                      onSelect={setDate} 
                      locale={it} 
                      className="rounded-3xl border-none" 
                      fromDate={today}
                      toDate={maxDate}
                    />
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Colonna destra: Orari e dettagli */}
            <div className="space-y-6">
              <div className="space-y-3">
                <Label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Orario</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Select value={startTime} onValueChange={setStartTime}>
                      <SelectTrigger className="h-14 rounded-2xl border-gray-100 bg-gray-50/50 focus:ring-primary/20 focus:border-primary text-base font-medium">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl">
                        {timeSlots.map(t => (
                          <SelectItem key={t} value={t} className="py-3 text-base">
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Select value={durationHours} onValueChange={setDurationHours}>
                      <SelectTrigger className="h-14 rounded-2xl border-gray-100 bg-gray-50/50 focus:ring-primary/20 focus:border-primary text-base font-medium">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl">
                        <SelectItem value="1" className="py-3 text-base">1 ora</SelectItem>
                        <SelectItem value="2" className="py-3 text-base">2 ore</SelectItem>
                        <SelectItem value="3" className="py-3 text-base">3 ore</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Prenotazione per Terzi (opzionale)</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Input 
                      maxLength={50} 
                      value={bookedForFirstName} 
                      onChange={e => setBookedForFirstName(e.target.value)}
                      className="h-14 rounded-2xl border-gray-100 bg-gray-50/50 focus:ring-primary/20 focus:border-primary text-base font-medium px-6"
                      placeholder="Nome"
                    />
                  </div>
                  <div className="space-y-2">
                    <Input 
                      maxLength={50} 
                      value={bookedForLastName} 
                      onChange={e => setBookedForLastName(e.target.value)}
                      className="h-14 rounded-2xl border-gray-100 bg-gray-50/50 focus:ring-primary/20 focus:border-primary text-base font-medium px-6"
                      placeholder="Cognome"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Note (opzionale)</Label>
                <Textarea 
                  maxLength={500} 
                  value={notes} 
                  onChange={e => setNotes(e.target.value)} 
                  rows={4} 
                  className="rounded-2xl border-gray-100 bg-gray-50/50 focus:ring-primary/20 focus:border-primary text-base font-medium p-6"
                  placeholder="Aggiungi note sulla prenotazione..."
                />
              </div>
            </div>
          </div>

          {/* Riepilogo */}
          {(selectedCourt || selectedProfile || date) && (
            <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-primary/[0.03] overflow-hidden">
              <CardContent className="p-6">
                <h3 className="text-sm font-bold text-primary mb-4 flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Riepilogo Prenotazione
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {selectedProfile && (
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/10 p-2.5 rounded-xl">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Socio</p>
                        <p className="text-sm font-bold text-gray-900">{selectedProfile.full_name}</p>
                      </div>
                    </div>
                  )}
                  
                  {selectedCourt && (
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/10 p-2.5 rounded-xl">
                        <MapPin className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Campo</p>
                        <p className="text-sm font-bold text-gray-900">{selectedCourt.name}</p>
                      </div>
                    </div>
                  )}
                  
                  {date && (
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/10 p-2.5 rounded-xl">
                        <CalendarDays className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Data</p>
                        <p className="text-sm font-bold text-gray-900 capitalize">
                          {format(date, 'EEEE d MMMM', { locale: it })}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="px-8 pb-8 pt-0 gap-3">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)} 
            className="h-14 rounded-2xl border-gray-200 text-gray-700 font-bold text-base hover:bg-gray-50"
          >
            Annulla
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={loading || !date || !courtId || !userId}
            className={`
              h-14 rounded-[1.5rem] font-black text-lg shadow-xl transition-all flex items-center justify-center gap-3
              ${loading || !date || !courtId || !userId 
                ? "bg-gray-100 text-gray-400 cursor-not-allowed shadow-none" 
                : "bg-gradient-to-br from-primary to-[#23532f] text-white hover:scale-[1.01] active:scale-[0.98] shadow-primary/20"
              }
            `}
          >
            {loading ? (
              <div className="w-6 h-6 border-3 border-white/20 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                {mode === "create" ? "Crea Prenotazione" : "Salva Modifiche"} 
                <ChevronRight size={20} />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
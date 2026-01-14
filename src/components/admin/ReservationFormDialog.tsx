"use client";

import React, { useEffect, useMemo, useState } from "react";
import { format, setHours, setMinutes, setSeconds, setMilliseconds, addHours } from "date-fns";
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

  const filteredProfiles = useMemo(() => {
    return profiles
      .filter((p) => (p.full_name || "").trim().length > 0)
      .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
  }, [profiles]);

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
      return;
    }

    // create defaults
    setDate(new Date());
    setCourtId(courts[0] ? String(courts[0].id) : "");
    setUserId(filteredProfiles[0] ? filteredProfiles[0].id : "");
    setStartTime("08:00");
    setDurationHours("1");
    setBookedForFirstName("");
    setBookedForLastName("");
    setNotes("");
  }, [open, mode, initial, courts, filteredProfiles]);

  const computed = useMemo(() => {
    if (!date || !startTime) return null;
    const start = makeOnTheHour(date, startTime);
    const end = addHours(start, Number(durationHours || "1"));
    return { start, end };
  }, [date, startTime, durationHours]);

  const endTimeLabel = computed ? format(computed.end, "HH:mm") : "--:--";

  const handleSubmit = async () => {
    if (!date || !computed) return;
    if (!courtId) return;
    if (!userId) return;

    const payload: FormValues = {
      id: initial?.id,
      user_id: userId,
      court_id: Number(courtId),
      starts_at: computed.start.toISOString(),
      ends_at: computed.end.toISOString(),
      booked_for_first_name: bookedForFirstName.trim() ? bookedForFirstName.trim() : null,
      booked_for_last_name: bookedForLastName.trim() ? bookedForLastName.trim() : null,
      notes: notes.trim() ? notes.trim() : null,
    };

    await onSubmit(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Crea Prenotazione" : "Modifica Prenotazione"}</DialogTitle>
          <DialogDescription>
            Seleziona socio, campo e fascia oraria. La durata è in ore (max 3) e gli orari sono “sull’ora”.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="grid gap-2">
            <Label>Socio (prenotato da)</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona un socio" />
              </SelectTrigger>
              <SelectContent>
                {filteredProfiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Suggerimento: i soci appaiono se hanno un “full_name” in profilo.</p>
          </div>

          <div className="grid gap-2">
            <Label>Campo</Label>
            <Select value={courtId} onValueChange={setCourtId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona un campo" />
              </SelectTrigger>
              <SelectContent>
                {courts.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Data</Label>
              <div className="rounded-md border bg-white">
                <Calendar mode="single" selected={date} onSelect={setDate} locale={it} initialFocus />
              </div>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Ora inizio</Label>
                <Select value={startTime} onValueChange={setStartTime}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona ora inizio" />
                  </SelectTrigger>
                  <SelectContent>
                    {timeSlots.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Durata</Label>
                <Select value={durationHours} onValueChange={setDurationHours}>
                  <SelectTrigger>
                    <SelectValue placeholder="Durata" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 ora</SelectItem>
                    <SelectItem value="2">2 ore</SelectItem>
                    <SelectItem value="3">3 ore</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Orario finale: <span className="font-medium text-foreground">{endTimeLabel}</span>
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Nome (conto terzi)</Label>
                  <Input value={bookedForFirstName} onChange={(e) => setBookedForFirstName(e.target.value)} placeholder="Nome" />
                </div>
                <div className="grid gap-2">
                  <Label>Cognome (conto terzi)</Label>
                  <Input value={bookedForLastName} onChange={(e) => setBookedForLastName(e.target.value)} placeholder="Cognome" />
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Note</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note (opzionali)" />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Annulla
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !userId || !courtId || !computed}>
            {loading ? "Salvataggio..." : mode === "create" ? "Crea" : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
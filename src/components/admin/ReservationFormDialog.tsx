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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Nuova Prenotazione" : "Modifica Prenotazione"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Socio</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger><SelectValue placeholder="Scegli socio" /></SelectTrigger>
                <SelectContent>{profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Campo</Label>
              <Select value={courtId} onValueChange={setCourtId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{courts.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Calendar mode="single" selected={date} onSelect={setDate} locale={it} className="border rounded-xl" />
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label>Inizio</Label><Select value={startTime} onValueChange={setStartTime}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{timeSlots.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1"><Label>Ore</Label><Select value={durationHours} onValueChange={setDurationHours}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">1h</SelectItem><SelectItem value="2">2h</SelectItem><SelectItem value="3">3h</SelectItem></SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label>Nome (Terzi)</Label><Input maxLength={50} value={bookedForFirstName} onChange={e => setBookedForFirstName(e.target.value)} /></div>
              <div className="space-y-1"><Label>Cognome (Terzi)</Label><Input maxLength={50} value={bookedForLastName} onChange={e => setBookedForLastName(e.target.value)} /></div>
            </div>
            <div className="space-y-1"><Label>Note</Label><Textarea maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} rows={4} /></div>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button><Button onClick={handleSubmit} disabled={loading}>{loading ? "Salvataggio..." : "Conferma"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
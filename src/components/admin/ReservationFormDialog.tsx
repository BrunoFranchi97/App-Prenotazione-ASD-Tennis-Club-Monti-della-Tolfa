"use client";

import React, { useEffect, useMemo, useState } from "react";
import { format, setHours, setMinutes, setSeconds, setMilliseconds, addHours, addDays, isBefore, isAfter, startOfDay, isSameDay, addMinutes } from "date-fns";
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
import { CalendarDays, Clock, MapPin, Users, User, ChevronRight, Plus } from "lucide-react";

import type { Court, Reservation } from "@/types/supabase";
import { cn } from "@/lib/utils";

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
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
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
      
      // Per la modifica, seleziona solo lo slot iniziale
      const startTime = format(start, "HH:mm");
      setSelectedSlots([startTime]);
      
      setBookedForFirstName(initial.booked_for_first_name || "");
      setBookedForLastName(initial.booked_for_last_name || "");
      setNotes((initial.notes as string) || "");
    } else {
      setDate(new Date());
      setCourtId(courts[0] ? String(courts[0].id) : "");
      setUserId("");
      setSelectedSlots([]);
      setBookedForFirstName("");
      setBookedForLastName("");
      setNotes("");
    }
  }, [open, mode, initial, courts]);

  const handleSlotClick = (slotTime: string) => {
    if (!courtId || !date) return;
    
    const newSelected = [...selectedSlots];
    if (newSelected.includes(slotTime)) {
      setSelectedSlots(newSelected.filter(s => s !== slotTime));
    } else {
      if (newSelected.length === 0) {
        setSelectedSlots([slotTime]);
      } else {
        const sorted = [...newSelected, slotTime].sort();
        const firstIdx = timeSlots.indexOf(sorted[0]);
        const lastIdx = timeSlots.indexOf(sorted[sorted.length - 1]);
        
        // Limite massimo di 3 ore (3 slot)
        if (lastIdx - firstIdx + 1 > 3) return;
        
        const range: string[] = [];
        for (let i = firstIdx; i <= lastIdx; i++) range.push(timeSlots[i]);
        setSelectedSlots(range);
      }
    }
  };

  const handleSubmit = async () => {
    if (!date || !courtId || !userId || selectedSlots.length === 0) return;
    
    const sortedSlots = [...selectedSlots].sort();
    const firstSlot = sortedSlots[0];
    const lastSlot = sortedSlots[sortedSlots.length - 1];
    
    const start = makeOnTheHour(date, firstSlot);
    const end = addHours(makeOnTheHour(date, lastSlot), 1);
    
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

  // Verifica se uno slot è disponibile (solo per visualizzazione)
  const isSlotAvailable = (slotTime: string): boolean => {
    if (!date || !courtId) return true;
    const [hours, minutes] = slotTime.split(':').map(Number);
    let slotStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date), hours), minutes), 0), 0);
    const slotEnd = addHours(slotStart, 1);
    const now = new Date();
    
    if (isBefore(slotEnd, now)) return false;
    if (isSameDay(date, now) && now > addMinutes(slotStart, 20)) return false;
    
    return true;
  };

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
                <div className="flex justify-between items-end ml-1">
                  <Label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Selezione Orario</Label>
                  {selectedSlots.length > 0 && (
                    <span className="text-[10px] text-primary font-black uppercase tracking-widest bg-primary/5 px-2 py-1 rounded">
                      Selezionati: {selectedSlots.length} / max 3 ore
                    </span>
                  )}
                </div>
                
                {!courtId || !date ? (
                  <div className="flex flex-col items-center justify-center py-16 px-6 bg-gray-50/50 rounded-[2rem] border-2 border-dashed border-gray-100 text-gray-400">
                    <MapPin className="h-8 w-8 mb-3 opacity-20" />
                    <p className="text-xs font-bold uppercase tracking-widest text-center">← Seleziona prima campo e data</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 animate-in fade-in slide-in-from-bottom-4">
                    {timeSlots.map(t => {
                      const [hours, minutes] = t.split(':').map(Number);
                      const slotStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date!), hours), minutes), 0), 0);
                      const slotEnd = addHours(slotStart, 1);
                      const now = new Date();

                      if (now >= slotEnd) return null;

                      const isSelected = selectedSlots.includes(t);
                      const available = isSlotAvailable(t);
                      const endTime = format(slotEnd, 'HH:mm');
                      
                      return (
                        <button 
                          key={t} 
                          disabled={!available && !isSelected}
                          onClick={() => available && handleSlotClick(t)} 
                          className={cn(
                            "relative h-16 rounded-2xl flex flex-col items-center justify-center p-2 transition-all duration-150 border-2",
                            isSelected ? "bg-primary border-primary text-white scale-[1.02] shadow-lg shadow-primary/10" : 
                            available ? "bg-gray-50 border-transparent text-gray-700 hover:border-primary/20" : 
                            "bg-gray-100 border-transparent text-gray-300 cursor-not-allowed opacity-40"
                          )}
                        >
                          <span className="text-sm font-black tracking-tight">{t} - {endTime}</span>
                          <span className={cn("text-[9px] font-black uppercase tracking-tighter mt-0.5", isSelected ? "text-white/60" : available ? "text-primary/30" : "text-destructive")}>
                            {available ? 'LIBERO' : 'NON DISP.'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
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
                  
                  {date && selectedSlots.length > 0 && (
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/10 p-2.5 rounded-xl">
                        <CalendarDays className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Orario</p>
                        <p className="text-sm font-bold text-gray-900">
                          {selectedSlots.sort()[0]} - {format(addHours(makeOnTheHour(date, selectedSlots.sort()[selectedSlots.length - 1]), 1), 'HH:mm')}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div<dyad-write path="src/components/admin/ReservationFormDialog.tsx" description="Completamento del popup di creazione prenotazione admin con footer">
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
            disabled={loading || !date || !courtId || !userId || selectedSlots.length === 0}
            className={`
              h-14 rounded-[1.5rem] font-black text-lg shadow-xl transition-all flex items-center justify-center gap-3
              ${loading || !date || !courtId || !userId || selectedSlots.length === 0
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
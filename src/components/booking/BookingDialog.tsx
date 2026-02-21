"use client";

import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { format, parseISO, addMinutes, isAfter, isBefore, isEqual } from 'date-fns';
import { it } from 'date-fns/locale';
import { MapPin, Clock, CalendarDays, AlertTriangle, ChevronRight } from 'lucide-react';
import { Court, Reservation, BookingType } from '@/types/supabase';

interface BookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date;
  court: Court | null;
  slotTime: string;
  allReservations: Reservation[];
  onConfirm: (data: any) => Promise<void>;
  loading: boolean;
}

const BookingDialog: React.FC<BookingDialogProps> = ({
  open,
  onOpenChange,
  date,
  court,
  slotTime,
  allReservations,
  onConfirm,
  loading
}) => {
  const [duration, setDuration] = useState<string>("60");
  const [type, setType] = useState<BookingType>("singolare");
  const [partner, setPartner] = useState("");
  const [conflict, setConflict] = useState<boolean>(false);

  const startTime = parseISO(`${format(date, 'yyyy-MM-dd')}T${slotTime}:00`);
  const endTime = addMinutes(startTime, parseInt(duration));

  useEffect(() => {
    if (!court) return;
    
    const hasConflict = allReservations.some(res => {
      if (res.court_id !== court.id) return false;
      const resStart = parseISO(res.starts_at);
      const resEnd = parseISO(res.ends_at);
      
      return (
        (isBefore(startTime, resEnd) && isAfter(endTime, resStart)) ||
        isEqual(startTime, resStart)
      );
    });
    
    setConflict(hasConflict);
  }, [duration, court, startTime, endTime, allReservations]);

  const handleConfirm = () => {
    if (conflict) return;
    
    // Generiamo slot orari di 1 ora per il sistema esistente (che lavora a blocchi di 1h)
    // Se la durata è 1.5h o 2h, il sistema esistente nel genitore gestirà i blocchi.
    // Passo i parametri necessari alla funzione genitore
    onConfirm({
      duration: parseInt(duration),
      type,
      partner
    });
  };

  if (!court) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-t-[2rem] sm:rounded-[2rem] border-none shadow-2xl p-0 overflow-hidden">
        <div className="bg-primary p-6 text-white">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-2 opacity-80">
              <Badge variant="outline" className="text-white border-white/20 uppercase text-[10px] tracking-widest">
                Nuova Prenotazione
              </Badge>
            </div>
            <DialogTitle className="text-2xl font-black tracking-tighter">
              {court.name}
            </DialogTitle>
            <DialogDescription className="text-white/70 font-medium">
              Completa i dettagli del tuo match
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-6 space-y-8 bg-white">
          {/* Info Contesto */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">
                <CalendarDays size={18} className="text-club-orange" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-gray-400">Data</span>
                <span className="text-sm font-bold text-gray-900 capitalize">
                  {format(date, 'dd MMM', { locale: it })}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">
                <Clock size={18} className="text-club-orange" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-gray-400">Orario</span>
                <span className="text-sm font-bold text-gray-900">
                  {slotTime} - {format(endTime, 'HH:mm')}
                </span>
              </div>
            </div>
          </div>

          {/* Durata */}
          <div className="space-y-3">
            <Label className="text-xs font-black uppercase tracking-widest text-gray-400 ml-1">Durata Partita</Label>
            <ToggleGroup 
              type="single" 
              value={duration} 
              onValueChange={(v) => v && setDuration(v)}
              className="justify-start gap-2"
            >
              <ToggleGroupItem value="60" className="flex-1 h-12 rounded-xl border-2 data-[state=on]:border-primary data-[state=on]:bg-primary/5 data-[state=on]:text-primary font-bold">1h</ToggleGroupItem>
              <ToggleGroupItem value="90" className="flex-1 h-12 rounded-xl border-2 data-[state=on]:border-primary data-[state=on]:bg-primary/5 data-[state=on]:text-primary font-bold">1.5h</ToggleGroupItem>
              <ToggleGroupItem value="120" className="flex-1 h-12 rounded-xl border-2 data-[state=on]:border-primary data-[state=on]:bg-primary/5 data-[state=on]:text-primary font-bold">2h</ToggleGroupItem>
            </ToggleGroup>
            
            {conflict && (
              <div className="flex items-center gap-2 text-destructive bg-destructive/5 p-3 rounded-xl animate-in fade-in slide-in-from-top-2">
                <AlertTriangle size={16} />
                <span className="text-xs font-bold">Attenzione: lo slot selezionato si sovrappone a un'altra prenotazione.</span>
              </div>
            )}
          </div>

          {/* Tipo e Partner */}
          <div className="space-y-6 pt-4 border-t border-gray-50">
            <div className="space-y-3">
              <Label className="text-xs font-black uppercase tracking-widest text-gray-400 ml-1">Tipo di Gioco</Label>
              <ToggleGroup 
                type="single" 
                value={type} 
                onValueChange={(v) => v && setType(v as BookingType)}
                className="justify-start gap-2"
              >
                <ToggleGroupItem value="singolare" className="flex-1 h-12 rounded-xl border-2 data-[state=on]:border-primary data-[state=on]:bg-primary/5 data-[state=on]:text-primary font-bold">Singolo</ToggleGroupItem>
                <ToggleGroupItem value="doppio" className="flex-1 h-12 rounded-xl border-2 data-[state=on]:border-primary data-[state=on]:bg-primary/5 data-[state=on]:text-primary font-bold">Doppio</ToggleGroupItem>
                <ToggleGroupItem value="lezione" className="flex-1 h-12 rounded-xl border-2 data-[state=on]:border-primary data-[state=on]:bg-primary/5 data-[state=on]:text-primary font-bold">Lezione</ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-black uppercase tracking-widest text-gray-400 ml-1">Avversario / Note</Label>
              <Input 
                placeholder="Es: Nome del partner o avversario..."
                className="h-12 rounded-xl border-gray-200 bg-gray-50 focus:ring-primary/20"
                value={partner}
                onChange={(e) => setPartner(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="p-6 bg-gray-50 mt-0">
          <Button 
            className="w-full h-14 rounded-2xl bg-primary hover:bg-[#357a46] text-white font-black text-lg shadow-xl shadow-primary/20 flex items-center justify-center gap-3 transition-all active:scale-95"
            disabled={loading || conflict}
            onClick={handleConfirm}
          >
            {loading ? "Prenotazione..." : "Conferma Prenotazione"}
            {!loading && <ChevronRight size={20} />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BookingDialog;
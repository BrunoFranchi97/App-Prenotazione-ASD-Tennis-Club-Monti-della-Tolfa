"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Save, Clock, MapPin, CalendarDays, User, ChevronRight, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { format, parseISO, addHours, setHours, setMinutes, isBefore, isAfter, isEqual, setSeconds, setMilliseconds, addMinutes, isSameDay, startOfDay, endOfDay } from 'date-fns';
import { it } from 'date-fns/locale';
import type { Court, Reservation, BookingType } from '@/types/supabase';
import { cn } from '@/lib/utils';
import UserNav from '@/components/UserNav';
import { Input } from "@/components/ui/input";

interface ReservationGroup {
  id: string;
  courtId: number;
  courtName: string;
  date: Date;
  reservations: Reservation[];
  startTime: string;
  endTime: string;
  totalHours: number;
  status: string;
  bookedForName: string;
  notes?: string;
  bookingType?: BookingType;
}

const bookingTypeLabels: Record<BookingType, string> = {
  singolare: 'Singolare',
  doppio: 'Doppio',
  lezione: 'Lezione'
};

const EditBookingGroup = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const group = location.state?.group as ReservationGroup;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [courts, setCourts] = useState<Court[]>([]);
  const [existingReservations, setExistingReservations] = useState<Reservation[]>([]);
  
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]); 
  const [bookingType, setBookingType] = useState<BookingType>('singolare');
  const [notes, setNotes] = useState('');
  const [bookedForFirstName, setBookedForFirstName] = useState('');
  const [bookedForLastName, setBookedForLastName] = useState('');

  const allTimeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let i = 8; i < 20; i++) slots.push(format(setMinutes(setHours(new Date(), i), 0), 'HH:mm'));
    return slots;
  }, []);

  const originalSlots = useMemo(() => {
    return group?.reservations.map(res => format(parseISO(res.starts_at), 'HH:mm')) || [];
  }, [group]);

  useEffect(() => {
    if (!group) {
      showError("Nessuna prenotazione selezionata.");
      navigate('/history');
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const { data: courtsData } = await supabase.from('courts').select('*').eq('is_active', true);
        setCourts(courtsData || []);

        const startDay = startOfDay(group.date).toISOString();
        const endDay = endOfDay(group.date).toISOString();

        const { data: resData } = await supabase
          .from('reservations')
          .select('*')
          .eq('court_id', group.courtId)
          .gte('starts_at', startDay)
          .lte('ends_at', endDay)
          .neq('status', 'cancelled')
          .not('id', 'in', `(${group.reservations.map(r => r.id).join(',')})`);

        setExistingReservations(resData || []);
        setSelectedSlots(originalSlots);
        setBookingType(group.bookingType || 'singolare');
        setNotes(group.notes || '');
        
        if (group.reservations[0].booked_for_first_name) {
          setBookedForFirstName(group.reservations[0].booked_for_first_name);
          setBookedForLastName(group.reservations[0].booked_for_last_name || '');
        }
      } catch (err: any) { showError(err.message); }
      finally { setLoading(false); }
    };
    fetchData();
  }, [group]);

  const isSlotAvailable = (slotTime: string): boolean => {
    if (!group?.date) return false;
    const [hours, minutes] = slotTime.split(':').map(Number);
    let slotStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(group.date), hours), minutes), 0), 0);
    const slotEnd = addHours(slotStart, 1);
    const now = new Date();
    
    if (isBefore(slotEnd, now)) return false;
    if (isSameDay(group.date, now) && now > addMinutes(slotStart, 20)) return false;
    
    return !existingReservations.find(res => isEqual(parseISO(res.starts_at), slotStart));
  };

  const handleSlotClick = (slotTime: string) => {
    const available = isSlotAvailable(slotTime) || originalSlots.includes(slotTime);
    if (!available && !selectedSlots.includes(slotTime)) return;

    const newSelected = [...selectedSlots];
    if (newSelected.includes(slotTime)) {
      setSelectedSlots(newSelected.filter(s => s !== slotTime));
    } else {
      if (newSelected.length === 0) setSelectedSlots([slotTime]);
      else {
        const sorted = [...newSelected, slotTime].sort();
        const firstIdx = allTimeSlots.indexOf(sorted[0]);
        const lastIdx = allTimeSlots.indexOf(sorted[sorted.length - 1]);
        if (lastIdx - firstIdx + 1 > 3) return;
        const range: string[] = [];
        for (let i = firstIdx; i <= lastIdx; i++) range.push(allTimeSlots[i]);
        setSelectedSlots(range);
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const slotsToAdd = selectedSlots.filter(s => !originalSlots.includes(s));
      const slotsToRemove = originalSlots.filter(s => !selectedSlots.includes(s));
      const slotsToKeep = selectedSlots.filter(s => originalSlots.includes(s));

      if (slotsToRemove.length > 0) {
        const idsToRemove = group.reservations.filter(r => slotsToRemove.includes(format(parseISO(r.starts_at), 'HH:mm'))).map(r => r.id);
        await supabase.from('reservations').delete().in('id', idsToRemove);
      }

      if (slotsToKeep.length > 0) {
        const idsToUpdate = group.reservations.filter(r => slotsToKeep.includes(format(parseISO(r.starts_at), 'HH:mm'))).map(r => r.id);
        await supabase.from('reservations').update({
          booking_type: bookingType, notes: notes.trim() || null,
          booked_for_first_name: bookedForFirstName.trim() || null,
          booked_for_last_name: bookedForLastName.trim() || null
        }).in('id', idsToUpdate);
      }

      if (slotsToAdd.length > 0) {
        const inserts = slotsToAdd.map(t => {
          let start = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(group.date), parseInt(t.split(':')[0])), 0), 0), 0);
          return {
            court_id: group.courtId, user_id: user?.id,
            starts_at: start.toISOString(), ends_at: addHours(start, 1).toISOString(),
            status: 'confirmed', booking_type: bookingType, notes: notes.trim() || null,
            booked_for_first_name: bookedForFirstName.trim() || null,
            booked_for_last_name: bookedForLastName.trim() || null
          };
        });
        await supabase.from('reservations').insert(inserts);
      }

      showSuccess("Modifiche salvate!");
      navigate('/history');
    } catch (e: any) { showError(e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="p-8 text-center bg-[#F8FAFC]">Caricamento...</div>;

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 sm:p-10 lg:p-12">
      <header className="flex justify-between items-center mb-10 max-w-7xl mx-auto">
        <div className="flex items-center gap-6">
          <Link to="/history">
            <Button variant="outline" size="icon" className="rounded-2xl border-none shadow-sm bg-white text-primary hover:scale-110 active:scale-95 transition-transform">
              <ArrowLeft size={20} />
            </Button>
          </Link>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tighter">Modifica Prenotazione</h1>
        </div>
        <UserNav />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-7xl mx-auto">
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white overflow-hidden p-6">
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="bg-primary/10 p-3 rounded-2xl"><MapPin className="text-primary" /></div>
                <div><p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Campo</p><p className="font-bold text-gray-900">{group.courtName}</p></div>
              </div>
              <div className="flex items-center gap-4">
                <div className="bg-primary/10 p-3 rounded-2xl"><CalendarDays className="text-primary" /></div>
                <div><p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Data</p><p className="font-bold text-gray-900 capitalize">{format(group.date, 'EEEE d MMMM', { locale: it })}</p></div>
              </div>
            </div>
          </Card>
          
          <div className="bg-amber-50 p-8 rounded-[2rem] border border-amber-100 flex gap-4">
             <AlertTriangle className="text-amber-600 shrink-0" size={24} />
             <p className="text-xs text-amber-800 leading-relaxed font-medium">Stai modificando una prenotazione esistente. Puoi aggiungere slot liberi o rimuovere quelli attuali (max 3 ore).</p>
          </div>
        </div>

        <div className="lg:col-span-8">
          <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white overflow-hidden">
             <CardContent className="p-8 space-y-10">
                <div className="space-y-6">
                  <Label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Nuovo Orario</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {allTimeSlots.map(t => {
                      const isSelected = selectedSlots.includes(t);
                      const isOriginal = originalSlots.includes(t);
                      const available = isSlotAvailable(t) || isOriginal;
                      const endTime = format(addHours(setMinutes(setHours(new Date(), parseInt(t.split(':')[0])), 0), 1), 'HH:mm');

                      if (isBefore(addHours(setHours(startOfDay(group.date), parseInt(t.split(':')[0])), 1), new Date())) return null;

                      return (
                        <button 
                          key={t} 
                          onClick={() => handleSlotClick(t)}
                          disabled={!available && !isSelected}
                          className={cn(
                            "relative h-16 rounded-2xl flex flex-col items-center justify-center p-2 transition-all duration-150 border-2",
                            isSelected ? "bg-primary border-primary text-white shadow-lg" : 
                            available ? "bg-gray-50 border-transparent text-gray-700 hover:border-primary/20" : 
                            "bg-gray-100 text-gray-300 cursor-not-allowed opacity-40"
                          )}
                        >
                          <span className="text-sm font-black">{t} - {endTime}</span>
                          <span className="text-[9px] font-bold uppercase tracking-tighter opacity-60">
                            {isOriginal && !isSelected ? 'DA RIMUOVERE' : isOriginal ? 'ORIGINALE' : isSelected ? 'AGGIUNTO' : 'LIBERO'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-6 border-t border-gray-50">
                   <div className="space-y-3">
                      <Label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Tipologia</Label>
                      <Select value={bookingType} onValueChange={(v) => setBookingType(v as BookingType)}>
                        <SelectTrigger className="h-14 rounded-2xl border-gray-100 bg-gray-50/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl">
                          {Object.entries(bookingTypeLabels).map(([val, label]) => <SelectItem key={val} value={val}>{label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                   </div>
                   <div className="space-y-3">
                      <Label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Note</Label>
                      <Input 
                        value={notes} 
                        onChange={e => setNotes(e.target.value)} 
                        className="h-14 rounded-2xl border-gray-100 bg-gray-50/50" 
                        placeholder="Aggiungi note..."
                      />
                   </div>
                </div>

                <div className="pt-8">
                  <Button 
                    onClick={handleSave} 
                    className={cn(
                      "w-full h-16 rounded-[1.5rem] font-black text-xl shadow-xl transition-all flex items-center justify-center gap-3",
                      selectedSlots.length > 0 ? "bg-gradient-to-br from-primary to-[#23532f] text-white" : "bg-gray-100 text-gray-400"
                    )}
                    disabled={saving || selectedSlots.length === 0}
                  >
                    {saving ? <div className="w-6 h-6 border-3 border-white/20 border-t-white rounded-full animate-spin"></div> : <>Salva Modifiche <ChevronRight size={24} /></>}
                  </Button>
                </div>
             </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default EditBookingGroup;
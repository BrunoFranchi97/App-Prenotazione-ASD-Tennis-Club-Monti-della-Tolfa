"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save, Clock, MapPin, CalendarDays, User, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { format, parseISO, addHours, setHours, setMinutes, isBefore, isAfter, isEqual, setSeconds, setMilliseconds } from 'date-fns';
import { it } from 'date-fns/locale';
import type { Court, Reservation, BookingType } from '@/types/supabase';

const bookingTypeLabels: Record<BookingType, string> = {
  singolare: 'Singolare',
  doppio: 'Doppio',
  lezione: 'Lezione con Maestro'
};

const AdminEditBooking = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const group = location.state?.group;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [courts, setCourts] = useState<Court[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [existingReservations, setExistingReservations] = useState<Reservation[]>([]);
  
  // Form states
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedCourtId, setSelectedCourtId] = useState('');
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [bookingType, setBookingType] = useState<BookingType>('singolare');
  const [notes, setNotes] = useState('');
  const [bookedForFirstName, setBookedForFirstName] = useState('');
  const [bookedForLastName, setBookedForLastName] = useState('');

  const originalSlots = useMemo(() => {
    return group?.reservations.map((res: any) => format(parseISO(res.starts_at), 'HH:mm')) || [];
  }, [group]);

  const allTimeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let i = 8; i < 20; i++) slots.push(format(setMinutes(setHours(new Date(), i), 0), 'HH:mm'));
    return slots;
  }, []);

  useEffect(() => {
    if (!group) {
      navigate('/admin/reservations');
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const [courtsRes, profilesRes] = await Promise.all([
          supabase.from('courts').select('*').order('name'),
          supabase.from('profiles').select('id, full_name').order('full_name')
        ]);

        setCourts(courtsRes.data || []);
        setProfiles(profilesRes.data || []);

        // Fetch existing reservations for this day/court (excluding current group)
        const startOfDay = format(new Date(group.date), "yyyy-MM-dd'T'00:00:00.000'Z'");
        const endOfDay = format(new Date(group.date), "yyyy-MM-dd'T'23:59:59.999'Z'");

        const { data: resData } = await supabase
          .from('reservations')
          .select('*')
          .eq('court_id', group.court_id)
          .gte('starts_at', startOfDay)
          .lte('ends_at', endOfDay)
          .not('id', 'in', `(${group.reservations.map((r: any) => r.id).join(',')})`);

        setExistingReservations(resData || []);

        // Set initial values
        setSelectedUserId(group.user_id);
        setSelectedCourtId(String(group.court_id));
        setSelectedSlots(originalSlots);
        setBookingType(group.bookingType || 'singolare');
        setNotes(group.notes || '');
        const first = group.reservations[0];
        setBookedForFirstName(first.booked_for_first_name || '');
        setBookedForLastName(first.booked_for_last_name || '');

      } catch (err: any) {
        showError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [group, navigate, originalSlots]);

  const isSlotAvailable = (slotTime: string): boolean => {
    if (!group.date) return false;
    let slotStart = setSeconds(setMilliseconds(setMinutes(setHours(new Date(group.date), parseInt(slotTime.split(':')[0])), 0), 0), 0);
    const slotEnd = addHours(slotStart, 1);

    return !existingReservations.some(res => {
      const resStart = parseISO(res.starts_at);
      const resEnd = parseISO(res.ends_at);
      return (isBefore(slotStart, resEnd) && isAfter(slotEnd, resStart)) || isEqual(slotStart, resStart);
    });
  };

  const handleSlotClick = (slotTime: string) => {
    if (!isSlotAvailable(slotTime) && !selectedSlots.includes(slotTime)) {
      showError("Slot occupato.");
      return;
    }

    const newSelected = [...selectedSlots];
    if (newSelected.includes(slotTime)) {
      setSelectedSlots(newSelected.filter(s => s !== slotTime));
    } else {
      const sorted = [...newSelected, slotTime].sort();
      const firstIdx = allTimeSlots.indexOf(sorted[0]);
      const lastIdx = allTimeSlots.indexOf(sorted[sorted.length - 1]);
      
      // Gli admin possono fare anche più di 3 ore se necessario? Teniamo 3 per ora o aumentiamo a 4?
      // Lasciamo la flessibilità all'admin ma con avviso se > 3.
      if (lastIdx - firstIdx + 1 > 4) {
        showError("L'intervallo selezionato è molto lungo.");
      }

      const range: string[] = [];
      for (let i = firstIdx; i <= lastIdx; i++) range.push(allTimeSlots[i]);
      setSelectedSlots(range);
    }
  };

  const handleSave = async () => {
    if (selectedSlots.length === 0) return showError("Seleziona almeno un orario.");
    setSaving(true);
    try {
      // 1. Elimina vecchi slot del gruppo
      for (const res of group.reservations) {
        await supabase.from('reservations').delete().eq('id', res.id);
      }

      // 2. Inserisci nuovi slot
      const toInsert = selectedSlots.map(slotTime => {
        let slotStart = setSeconds(setMilliseconds(setMinutes(setHours(new Date(group.date), parseInt(slotTime.split(':')[0])), 0), 0), 0);
        return {
          court_id: parseInt(selectedCourtId),
          user_id: selectedUserId,
          starts_at: slotStart.toISOString(),
          ends_at: addHours(slotStart, 1).toISOString(),
          status: 'confirmed',
          booking_type: bookingType,
          notes: notes.trim() || null,
          booked_for_first_name: bookedForFirstName.trim() || null,
          booked_for_last_name: bookedForLastName.trim() || null,
        };
      });

      const { error } = await supabase.from('reservations').insert(toInsert);
      if (error) throw error;

      showSuccess("Prenotazione aggiornata!");
      navigate('/admin/reservations');
    } catch (err: any) {
      showError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Caricamento dati modifica...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6">
      <header className="flex items-center mb-8">
        <Link to="/admin/reservations" className="mr-4">
          <Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <h1 className="text-2xl font-bold text-primary">Modifica Prenotazione Admin</h1>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl mx-auto">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-primary flex items-center"><Users className="mr-2 h-5 w-5" /> Dati Socio e Campo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Socio che prenota</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name || 'Socio'}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Campo</Label>
              <Select value={selectedCourtId} onValueChange={setSelectedCourtId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {courts.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <Label>Nome (conto terzi)</Label>
                <Input value={bookedForFirstName} onChange={e => setBookedForFirstName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Cognome (conto terzi)</Label>
                <Input value={bookedForLastName} onChange={e => setBookedForLastName(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-primary flex items-center"><Clock className="mr-2 h-5 w-5" /> Orari e Note</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {allTimeSlots.map(t => {
                const isSelected = selectedSlots.includes(t);
                const isOriginal = originalSlots.includes(t);
                const available = isSlotAvailable(t) || isOriginal;
                
                return (
                  <Button 
                    key={t} onClick={() => available && handleSlotClick(t)} 
                    variant={isSelected ? "default" : "outline"}
                    className={`h-12 ${isSelected ? 'bg-club-orange text-white hover:bg-club-orange' : available ? 'bg-primary text-white' : 'bg-gray-200 text-gray-500'}`}
                    disabled={!available && !isSelected}
                  >
                    {t}
                  </Button>
                );
              })}
            </div>

            <div className="space-y-2">
              <Label>Tipo Prenotazione</Label>
              <Select value={bookingType} onValueChange={v => setBookingType(v as BookingType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(bookingTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Note</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
            </div>

            <Button onClick={handleSave} className="w-full bg-primary h-12" disabled={saving}>
              {saving ? "Salvataggio..." : "Applica Modifiche"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminEditBooking;
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save, Clock, MapPin, CalendarDays, User, Users, AlertTriangle, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { format, parseISO, addHours, setHours, setMinutes, isBefore, isAfter, isEqual, setSeconds, setMilliseconds, startOfDay } from 'date-fns';
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

        const dateISO = format(new Date(group.date), "yyyy-MM-dd");
        const startRange = `${dateISO}T00:00:00.000Z`;
        const endRange = `${dateISO}T23:59:59.999Z`;

        const { data: resData } = await supabase
          .from('reservations')
          .select('*')
          .eq('court_id', group.court_id)
          .gte('starts_at', startRange)
          .lte('ends_at', endRange)
          .not('id', 'in', `(${group.reservations.map((r: any) => r.id).join(',')})`);

        setExistingReservations(resData || []);

        // Init values
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
  }, [group, navigate]);

  const isSlotAvailable = (slotTime: string): boolean => {
    if (!group.date) return false;
    const [h] = slotTime.split(':').map(Number);
    let slotStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(new Date(group.date)), h), 0), 0), 0);
    const slotEnd = addHours(slotStart, 1);

    return !existingReservations.some(res => {
      const resStart = parseISO(res.starts_at);
      const resEnd = parseISO(res.ends_at);
      return (isBefore(slotStart, resEnd) && isAfter(slotEnd, resStart)) || isEqual(slotStart, resStart);
    });
  };

  const handleSlotClick = (slotTime: string) => {
    const isAlreadySelected = selectedSlots.includes(slotTime);
    
    if (!isSlotAvailable(slotTime) && !isAlreadySelected) {
      showError("Questo slot è occupato da un'altra prenotazione.");
      return;
    }

    if (isAlreadySelected) {
      setSelectedSlots(prev => prev.filter(s => s !== slotTime));
    } else {
      // Gli admin possono selezionare slot non consecutivi? 
      // Per coerenza con il sistema e semplicità, permettiamo selezione libera per l'admin.
      setSelectedSlots(prev => [...prev, slotTime].sort());
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
        const [h] = slotTime.split(':').map(Number);
        let slotStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(new Date(group.date)), h), 0), 0), 0);
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

      showSuccess("Prenotazione aggiornata con successo!");
      navigate('/admin/reservations');
    } catch (err: any) {
      showError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h2 className="text-xl font-bold text-primary animate-pulse">Caricamento Hub Modifica...</h2>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 pb-24">
      <header className="flex items-center mb-8 max-w-6xl mx-auto">
        <Link to="/admin/reservations" className="mr-4">
          <Button variant="outline" size="icon" className="text-primary border-primary">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-primary">Modifica Prenotazione</h1>
          <p className="text-sm text-gray-500">
            {format(new Date(group.date), 'EEEE dd MMMM yyyy', { locale: it })} - {group.courtName}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl mx-auto">
        {/* Sinistra: Gestione Slot (Hub) */}
        <Card className="shadow-lg border-none">
          <CardHeader>
            <CardTitle className="text-primary flex items-center">
              <Clock className="mr-2 h-5 w-5" /> Selettore Orari
            </CardTitle>
            <CardDescription>Clicca per aggiungere o rimuovere le ore dalla prenotazione.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {allTimeSlots.map(t => {
                const isSelected = selectedSlots.includes(t);
                const isOriginal = originalSlots.includes(t);
                const available = isSlotAvailable(t);
                
                const [h] = t.split(':').map(Number);
                const tEnd = format(setHours(new Date(), h + 1), 'HH:mm');

                let variant: "default" | "outline" | "secondary" = "outline";
                let customClass = "h-14 flex flex-col items-center justify-center gap-0.5 transition-all ";

                if (isSelected) {
                  variant = "default";
                  customClass += "bg-club-orange text-white border-none shadow-md hover:bg-club-orange";
                } else if (!available) {
                  customClass += "bg-gray-100 text-gray-400 cursor-not-allowed opacity-50";
                } else {
                  customClass += "hover:bg-primary/10 text-primary border-primary/20";
                }

                return (
                  <Button 
                    key={t} 
                    variant={variant}
                    disabled={!available && !isSelected}
                    onClick={() => handleSlotClick(t)}
                    className={customClass}
                  >
                    <span className="font-bold text-sm">{t} - {tEnd}</span>
                    {isOriginal && isSelected && <span className="text-[9px] uppercase font-medium opacity-80">Originale</span>}
                  </Button>
                );
              })}
            </div>
            
            <div className="mt-6 p-4 bg-primary/5 rounded-lg border border-primary/10">
              <div className="flex items-center text-sm text-primary font-medium">
                <AlertTriangle className="mr-2 h-4 w-4" />
                Info Admin
              </div>
              <p className="text-xs text-gray-600 mt-1">
                Come amministratore puoi selezionare qualsiasi slot libero. Se deselezioni tutti gli slot originali e ne scegli altri, la prenotazione verrà spostata.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Destra: Dati e Note */}
        <div className="space-y-6">
          <Card className="shadow-lg border-none">
            <CardHeader>
              <CardTitle className="text-primary flex items-center">
                <Users className="mr-2 h-5 w-5" /> Socio e Campo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Socio che ha effettuato l'ordine</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name || 'Socio'}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Campo</Label>
                <Select value={selectedCourtId} onValueChange={setSelectedCourtId}>
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {courts.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="space-y-2">
                  <Label>Nome (conto terzi)</Label>
                  <Input value={bookedForFirstName} onChange={e => setBookedForFirstName(e.target.value)} placeholder="Nome" className="bg-white" />
                </div>
                <div className="space-y-2">
                  <Label>Cognome (conto terzi)</Label>
                  <Input value={bookedForLastName} onChange={e => setBookedForLastName(e.target.value)} placeholder="Cognome" className="bg-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-none">
            <CardHeader>
              <CardTitle className="text-primary flex items-center">
                <Edit className="mr-2 h-5 w-5" /> Dettagli Extra
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Tipo Prenotazione</Label>
                <Select value={bookingType} onValueChange={v => setBookingType(v as BookingType)}>
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(bookingTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Note Amministrative</Label>
                <Textarea 
                  value={notes} 
                  onChange={e => setNotes(e.target.value)} 
                  rows={4} 
                  placeholder="Aggiungi dettagli o motivazioni della modifica..."
                  className="bg-white"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <Button 
                  onClick={handleSave} 
                  className="flex-1 bg-primary hover:bg-primary/90 text-white font-bold h-12" 
                  disabled={saving || selectedSlots.length === 0}
                >
                  {saving ? "Salvataggio..." : <><Save className="mr-2 h-4 w-4" /> Salva Modifiche</>}
                </Button>
                <Link to="/admin/reservations" className="flex-1">
                  <Button variant="outline" className="w-full h-12 border-gray-300 text-gray-600">Annulla</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AdminEditBooking;
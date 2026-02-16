"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowLeft, Save, AlertTriangle, Clock, MapPin, CalendarDays, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { format, parseISO, addHours, setHours, setMinutes, isBefore, isAfter, isEqual, setSeconds, setMilliseconds, differenceInMinutes } from 'date-fns';
import { it } from 'date-fns/locale';
import type { Court, Reservation, BookingType } from '@/types/supabase';

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

  const selectedCourt = useMemo(() => {
    return courts.find(court => court.id === group.courtId);
  }, [courts, group.courtId]);

  const allTimeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let i = 8; i < 20; i++) {
      slots.push(format(setMinutes(setHours(new Date(), i), 0), 'HH:mm'));
    }
    return slots;
  }, []);

  const originalSlots = useMemo(() => {
    return group.reservations.map(res => {
      const start = parseISO(res.starts_at);
      return format(start, 'HH:mm');
    });
  }, [group.reservations]);

  useEffect(() => {
    if (!group) {
      showError("Nessuna prenotazione selezionata per la modifica.");
      navigate('/history');
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const { data: courtsData, error: courtsError } = await supabase
          .from('courts')
          .select('*')
          .eq('is_active', true);

        if (courtsError) throw courtsError;
        setCourts(courtsData || []);

        const startOfDay = format(group.date, "yyyy-MM-dd'T'00:00:00.000'Z'");
        const endOfDay = format(group.date, "yyyy-MM-dd'T'23:59:59.999'Z'");

        const { data: reservationsData, error: reservationsError } = await supabase
          .from('reservations')
          .select('*')
          .eq('court_id', group.courtId)
          .gte('starts_at', startOfDay)
          .lte('ends_at', endOfDay)
          .not('id', 'in', `(${group.reservations.map(r => r.id).join(',')})`);

        if (reservationsError) throw reservationsError;
        setExistingReservations(reservationsData || []);

        setSelectedSlots(originalSlots);
        setBookingType(group.bookingType || 'singolare');
        setNotes(group.notes || '');
        
        const firstReservation = group.reservations[0];
        if (firstReservation.booked_for_first_name && firstReservation.booked_for_last_name) {
          setBookedForFirstName(firstReservation.booked_for_first_name);
          setBookedForLastName(firstReservation.booked_for_last_name);
        }

      } catch (err: any) {
        showError("Errore nel caricamento dei dati: " + err.message);
        navigate('/history');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [group, navigate, originalSlots]);

  const isSlotAvailable = (slotTime: string): boolean => {
    if (!group.date) return false;

    let slotStart = setMinutes(setHours(group.date, parseInt(slotTime.split(':')[0])), parseInt(slotTime.split(':')[1]));
    slotStart = setSeconds(slotStart, 0);
    slotStart = setMilliseconds(slotStart, 0);
    const slotEnd = addHours(slotStart, 1);

    if (isBefore(slotEnd, new Date())) {
      return false;
    }

    const isBooked = existingReservations.some(res => {
      const resStart = parseISO(res.starts_at);
      const resEnd = parseISO(res.ends_at);

      return (
        (isBefore(slotStart, resEnd) && isAfter(slotEnd, resStart)) ||
        isEqual(slotStart, resStart)
      );
    });

    return !isBooked;
  };

  const handleSlotClick = (slotTime: string) => {
    if (!group.date) {
      showError("Data non valida.");
      return;
    }

    if (!isSlotAvailable(slotTime) && !selectedSlots.includes(slotTime) && !originalSlots.includes(slotTime)) {
      showError("Questo slot non è disponibile.");
      return;
    }

    const newSelectedSlots = [...selectedSlots];

    if (newSelectedSlots.includes(slotTime)) {
      setSelectedSlots(newSelectedSlots.filter(s => s !== slotTime));
    } else {
      if (newSelectedSlots.length === 0) {
        setSelectedSlots([slotTime]);
      } else {
        const sortedSelectedSlots = [...newSelectedSlots, slotTime].sort();
        const firstSelected = sortedSelectedSlots[0];
        const lastSelected = sortedSelectedSlots[sortedSelectedSlots.length - 1];

        const firstIndex = allTimeSlots.indexOf(firstSelected);
        const lastIndex = allTimeSlots.indexOf(lastSelected);

        let consecutiveAndAvailable = true;
        for (let i = firstIndex; i <= lastIndex; i++) {
          const s = allTimeSlots[i];
          if (!newSelectedSlots.includes(s) && s !== slotTime && !isSlotAvailable(s) && !originalSlots.includes(s)) {
            consecutiveAndAvailable = false;
            break;
          }
        }

        if (!consecutiveAndAvailable) {
          showError("Puoi selezionare solo slot consecutivi. Alcuni slot intermedi non sono disponibili.");
          return;
        }

        if (sortedSelectedSlots.length > 3) {
          showError("Puoi prenotare un massimo di 3 ore consecutive.");
          return;
        }

        const finalSlots: string[] = [];
        for (let i = firstIndex; i <= lastIndex; i++) {
          finalSlots.push(allTimeSlots[i]);
        }
        setSelectedSlots(finalSlots);
      }
    }
  };

  const handleSave = async () => {
    if (selectedSlots.length === 0) {
      showError("Devi selezionare almeno uno slot.");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showError("Utente non autenticato.");
        navigate('/login');
        return;
      }

      const slotsToAdd = selectedSlots.filter(slot => !originalSlots.includes(slot));
      const slotsToRemove = originalSlots.filter(slot => !selectedSlots.includes(slot));
      const slotsToKeep = selectedSlots.filter(slot => originalSlots.includes(slot));

      if (slotsToRemove.length > 0) {
        const reservationsToRemove = group.reservations.filter(res => {
          const startTime = format(parseISO(res.starts_at), 'HH:mm');
          return slotsToRemove.includes(startTime);
        });

        for (const reservation of reservationsToRemove) {
          const { error } = await supabase.from('reservations').delete().eq('id', reservation.id);
          if (error) throw error;
        }
      }

      if (slotsToKeep.length > 0) {
        const reservationsToUpdate = group.reservations.filter(res => {
          const startTime = format(parseISO(res.starts_at), 'HH:mm');
          return slotsToKeep.includes(startTime);
        });

        for (const reservation of reservationsToUpdate) {
          const { error } = await supabase
            .from('reservations')
            .update({
              booking_type: bookingType,
              notes: notes.trim() || null,
              booked_for_first_name: bookedForFirstName.trim() || null,
              booked_for_last_name: bookedForLastName.trim() || null,
              updated_at: new Date().toISOString()
            })
            .eq('id', reservation.id);

          if (error) throw error;
        }
      }

      if (slotsToAdd.length > 0) {
        const reservationsToInsert = slotsToAdd.map(slotTime => {
          let slotStart = setMinutes(setHours(group.date, parseInt(slotTime.split(':')[0])), parseInt(slotTime.split(':')[1]));
          slotStart = setSeconds(slotStart, 0);
          slotStart = setMilliseconds(slotStart, 0);
          const slotEnd = addHours(slotStart, 1);

          return {
            court_id: group.courtId,
            user_id: user.id,
            starts_at: slotStart.toISOString(),
            ends_at: slotEnd.toISOString(),
            status: 'confirmed',
            booking_type: bookingType,
            notes: notes.trim() || null,
            booked_for_first_name: bookedForFirstName.trim() || null,
            booked_for_last_name: bookedForLastName.trim() || null,
          };
        });

        const { error } = await supabase.from('reservations').insert(reservationsToInsert);
        if (error) throw error;
      }

      showSuccess("Prenotazione modificata con successo!");
      navigate('/history');

    } catch (err: any) {
      showError("Errore durante il salvataggio: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreOriginal = () => {
    setSelectedSlots(originalSlots);
    showSuccess("Slot originali ripristinati.");
  };

  if (loading) return <div className="p-8 text-center">Caricamento...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center">
          <Link to="/history" className="mr-4">
            <Button variant="outline" size="icon" className="text-primary border-primary hover:bg-secondary">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-primary">Modifica Prenotazione</h1>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-primary flex items-center">
              <AlertTriangle className="mr-2 h-5 w-5 text-amber-500" /> Prenotazione Originale
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center"><MapPin className="mr-2 h-4 w-4 text-club-orange" /><span className="font-semibold">Campo:</span><span className="ml-2">{group.courtName}</span></div>
              <div className="flex items-center"><CalendarDays className="mr-2 h-4 w-4 text-club-orange" /><span className="font-semibold">Data:</span><span className="ml-2 capitalize">{format(group.date, 'EEEE, dd MMMM yyyy', { locale: it })}</span></div>
              <div className="flex items-center"><Clock className="mr-2 h-4 w-4 text-club-orange" /><span className="font-semibold">Orario:</span><span className="ml-2">{group.startTime} - {group.endTime}</span></div>
            </div>
            <Button variant="outline" onClick={handleRestoreOriginal} className="w-full border-amber-300 text-amber-700">Ripristina slot originali</Button>
          </CardContent>
        </Card>

        <Card className="shadow-lg rounded-lg">
          <CardHeader><CardTitle className="text-primary">Seleziona Slot</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-60 overflow-y-auto p-2 border rounded-md bg-gray-50">
              {allTimeSlots.map((slotTime) => {
                const isSelected = selectedSlots.includes(slotTime);
                const isOriginal = originalSlots.includes(slotTime);
                const available = isSlotAvailable(slotTime) || isOriginal;
                
                let btnClasses = "px-3 py-2 rounded-md text-sm font-medium transition-none ";
                if (isSelected) {
                  btnClasses += "bg-club-orange text-white hover:bg-club-orange shadow-none";
                } else if (available) {
                  btnClasses += isOriginal ? "bg-primary/70 text-white hover:bg-primary/80" : "bg-primary text-white hover:bg-primary/90";
                } else {
                  btnClasses += "bg-gray-300 text-gray-600 cursor-not-allowed hover:bg-gray-300";
                }

                return (
                  <Button
                    key={slotTime}
                    onClick={() => available && handleSlotClick(slotTime)}
                    disabled={!available && !isSelected}
                    className={btnClasses}
                  >
                    {slotTime}
                  </Button>
                );
              })}
            </div>

            <div className="space-y-4">
              <div>
                <Label>Tipo di Prenotazione</Label>
                <Select value={bookingType} onValueChange={(v) => setBookingType(v as BookingType)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="singolare">Singolare</SelectItem><SelectItem value="doppio">Doppio</SelectItem><SelectItem value="lezione">Lezione</SelectItem></SelectContent>
                </Select>
              </div>

              {group.bookedForName !== "Te stesso" && (
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Nome</Label><input className="w-full px-3 py-2 border rounded-md" value={bookedForFirstName} onChange={e => setBookedForFirstName(e.target.value)} /></div>
                  <div><Label>Cognome</Label><input className="w-full px-3 py-2 border rounded-md" value={bookedForLastName} onChange={e => setBookedForLastName(e.target.value)} /></div>
                </div>
              )}

              <div><Label>Note</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} /></div>

              <div className="pt-4 border-t flex gap-3">
                <Link to="/history" className="flex-1"><Button variant="outline" className="w-full">Annulla</Button></Link>
                <Button onClick={handleSave} disabled={saving || selectedSlots.length === 0} className="flex-1 bg-primary hover:bg-primary/90">
                  {saving ? "Salvataggio..." : "Salva Modifiche"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default EditBookingGroup;
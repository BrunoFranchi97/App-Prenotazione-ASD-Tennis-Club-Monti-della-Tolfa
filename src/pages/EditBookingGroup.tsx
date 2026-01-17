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

const bookingTypeLabels: Record<BookingType, string> = {
  singolare: 'Singolare',
  doppio: 'Doppio',
  lezione: 'Lezione con Maestro'
};

const EditBookingGroup = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const group = location.state?.group as ReservationGroup;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [courts, setCourts] = useState<Court[]>([]);
  const [existingReservations, setExistingReservations] = useState<Reservation[]>([]);
  
  // Stato per i slot selezionati
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]); // ['08:00', '09:00', '10:00']
  const [bookingType, setBookingType] = useState<BookingType>('singolare');
  const [notes, setNotes] = useState('');
  const [bookedForFirstName, setBookedForFirstName] = useState('');
  const [bookedForLastName, setBookedForLastName] = useState('');

  const selectedCourt = useMemo(() => {
    return courts.find(court => court.id === group.courtId);
  }, [courts, group.courtId]);

  // Slot orari disponibili (8:00 - 20:00)
  const allTimeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let i = 8; i < 20; i++) {
      slots.push(format(setMinutes(setHours(new Date(), i), 0), 'HH:mm'));
    }
    return slots;
  }, []);

  // Slot originali del gruppo
  const originalSlots = useMemo(() => {
    return group.reservations.map(res => {
      const start = parseISO(res.starts_at);
      return format(start, 'HH:mm');
    });
  }, [group.reservations]);

  // Carica i dati iniziali
  useEffect(() => {
    if (!group) {
      showError("Nessuna prenotazione selezionata per la modifica.");
      navigate('/history');
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch courts attivi
        const { data: courtsData, error: courtsError } = await supabase
          .from('courts')
          .select('*')
          .eq('is_active', true);

        if (courtsError) throw courtsError;
        setCourts(courtsData || []);

        // Fetch prenotazioni esistenti per questa data e campo (escluso il gruppo corrente)
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

        // Imposta i valori iniziali dal gruppo
        setSelectedSlots(originalSlots);
        setBookingType(group.bookingType || 'singolare');
        setNotes(group.notes || '');
        
        // Estrai nome e cognome per conto terzi (se presenti)
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

  // Verifica se uno slot è disponibile
  const isSlotAvailable = (slotTime: string): boolean => {
    if (!group.date) return false;

    let slotStart = setMinutes(setHours(group.date, parseInt(slotTime.split(':')[0])), parseInt(slotTime.split(':')[1]));
    slotStart = setSeconds(slotStart, 0);
    slotStart = setMilliseconds(slotStart, 0);
    const slotEnd = addHours(slotStart, 1);

    // Controlla se lo slot è nel passato
    if (isBefore(slotEnd, new Date())) {
      return false;
    }

    // Controlla sovrapposizioni con prenotazioni esistenti (altri utenti)
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

  // Gestione click sugli slot
  const handleSlotClick = (slotTime: string) => {
    if (!group.date) {
      showError("Data non valida.");
      return;
    }

    // Se lo slot non è disponibile e non è già selezionato, non permettere la selezione
    if (!isSlotAvailable(slotTime) && !selectedSlots.includes(slotTime) && !originalSlots.includes(slotTime)) {
      showError("Questo slot non è disponibile.");
      return;
    }

    const currentSlotIndex = allTimeSlots.indexOf(slotTime);
    const newSelectedSlots = [...selectedSlots];

    if (newSelectedSlots.includes(slotTime)) {
      // Deseleziona slot
      setSelectedSlots(newSelectedSlots.filter(s => s !== slotTime));
    } else {
      // Seleziona nuovo slot
      if (newSelectedSlots.length === 0) {
        // Prima selezione
        setSelectedSlots([slotTime]);
      } else {
        // Verifica consecutività e max 3 ore
        const sortedSelectedSlots = [...newSelectedSlots, slotTime].sort();
        const firstSelected = sortedSelectedSlots[0];
        const lastSelected = sortedSelectedSlots[sortedSelectedSlots.length - 1];

        const firstIndex = allTimeSlots.indexOf(firstSelected);
        const lastIndex = allTimeSlots.indexOf(lastSelected);

        // Verifica che tutti gli slot tra first e last siano selezionabili
        let consecutiveAndAvailable = true;
        for (let i = firstIndex; i <= lastIndex; i++) {
          const s = allTimeSlots[i];
          // Uno slot può essere selezionato se:
          // 1. È già selezionato
          // 2. È disponibile
          // 3. È parte degli slot originali (anche se ora non disponibile, perché lo stiamo modificando)
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

        // Aggiungi tutti gli slot tra first e last
        const finalSlots: string[] = [];
        for (let i = firstIndex; i <= lastIndex; i++) {
          finalSlots.push(allTimeSlots[i]);
        }
        setSelectedSlots(finalSlots);
      }
    }
  };

  // Calcola le ore totali selezionate
  const totalSelectedHours = selectedSlots.length;

  // Salva le modifiche
  const handleSave = async () => {
    if (selectedSlots.length === 0) {
      showError("Devi selezionare almeno uno slot.");
      return;
    }

    if (totalSelectedHours > 3) {
      showError("Non puoi prenotare più di 3 ore consecutive.");
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

      // Determina quali slot mantenere, aggiungere e rimuovere
      const slotsToKeep = selectedSlots.filter(slot => originalSlots.includes(slot));
      const slotsToAdd = selectedSlots.filter(slot => !originalSlots.includes(slot));
      const slotsToRemove = originalSlots.filter(slot => !selectedSlots.includes(slot));

      console.log('Operazioni:', {
        keep: slotsToKeep.length,
        add: slotsToAdd.length,
        remove: slotsToRemove.length
      });

      // Verifica disponibilità per i nuovi slot
      for (const slotTime of slotsToAdd) {
        if (!isSlotAvailable(slotTime)) {
          showError(`Lo slot ${slotTime} non è più disponibile.`);
          setSaving(false);
          return;
        }
      }

      // 1. Rimuovi gli slot eliminati
      if (slotsToRemove.length > 0) {
        const reservationsToRemove = group.reservations.filter(res => {
          const startTime = format(parseISO(res.starts_at), 'HH:mm');
          return slotsToRemove.includes(startTime);
        });

        for (const reservation of reservationsToRemove) {
          const { error } = await supabase
            .from('reservations')
            .delete()
            .eq('id', reservation.id);

          if (error) throw error;
        }
      }

      // 2. Aggiorna gli slot mantenuti (tipo prenotazione e note)
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
              updated_at: new Date().toISOString() // AGGIUNTO: aggiorna il timestamp
            })
            .eq('id', reservation.id);

          if (error) throw error;
        }
      }

      // 3. Aggiungi nuovi slot
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

        const { error } = await supabase
          .from('reservations')
          .insert(reservationsToInsert);

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

  // Ripristina tutti gli slot originali
  const handleRestoreOriginal = () => {
    setSelectedSlots(originalSlots);
    showSuccess("Slot originali ripristinati.");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white p-4">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4 text-primary">Caricamento...</h1>
          <p className="text-xl text-gray-600">Preparazione modifica prenotazione.</p>
        </div>
      </div>
    );
  }

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
        {/* Riepilogo originale */}
        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-primary flex items-center">
              <AlertTriangle className="mr-2 h-5 w-5 text-amber-500" /> Prenotazione Originale
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center">
                <MapPin className="mr-2 h-4 w-4 text-club-orange" />
                <span className="font-semibold">Campo:</span>
                <span className="ml-2">{group.courtName}</span>
              </div>
              <div className="flex items-center">
                <CalendarDays className="mr-2 h-4 w-4 text-club-orange" />
                <span className="font-semibold">Data:</span>
                <span className="ml-2 capitalize">{format(group.date, 'EEEE, dd MMMM yyyy', { locale: it })}</span>
              </div>
              <div className="flex items-center">
                <Clock className="mr-2 h-4 w-4 text-club-orange" />
                <span className="font-semibold">Orario originale:</span>
                <span className="ml-2">{group.startTime} - {group.endTime}</span>
                <span className="ml-2 text-sm text-gray-500">({group.totalHours}h)</span>
              </div>
              {group.bookedForName !== "Te stesso" && (
                <div className="flex items-center">
                  <User className="mr-2 h-4 w-4 text-club-orange" />
                  <span className="font-semibold">Prenotato per:</span>
                  <span className="ml-2">{group.bookedForName}</span>
                </div>
              )}
            </div>

            <Alert className="border-amber-200 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800">Modifica in corso</AlertTitle>
              <AlertDescription className="text-amber-700">
                Puoi rimuovere slot specifici o aggiungerne di nuovi (se disponibili).
                Ricorda: massimo 3 ore consecutive.
              </AlertDescription>
            </Alert>

            <Button 
              variant="outline" 
              onClick={handleRestoreOriginal}
              className="w-full border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              Ripristina slot originali
            </Button>
          </CardContent>
        </Card>

        {/* Modifica slot */}
        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-primary">Seleziona Slot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">Slot disponibili per {format(group.date, 'dd/MM/yyyy')}</h3>
              <p className="text-sm text-gray-600 mb-3">
                Seleziona gli slot che vuoi mantenere. Gli slot non disponibili sono bloccati.
              </p>
              
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-60 overflow-y-auto p-2 border rounded-md bg-gray-50">
                {allTimeSlots.map((slotTime) => {
                  const isSelected = selectedSlots.includes(slotTime);
                  const isOriginal = originalSlots.includes(slotTime);
                  const available = isSlotAvailable(slotTime) || isOriginal;
                  
                  const [hours, minutes] = slotTime.split(':').map(Number);
                  const endTime = format(setMinutes(setHours(new Date(), hours + 1), minutes), 'HH:mm');

                  let slotClasses = "px-3 py-2 rounded-md text-sm font-medium ";
                  
                  if (!available) {
                    slotClasses += "bg-gray-300 text-gray-600 cursor-not-allowed opacity-70";
                  } else if (isSelected) {
                    slotClasses += "bg-club-orange text-club-orange-foreground hover:bg-club-orange/90";
                  } else if (isOriginal) {
                    slotClasses += "bg-primary/70 text-primary-foreground hover:bg-primary/80";
                  } else {
                    slotClasses += "bg-primary text-primary-foreground hover:bg-primary/90";
                  }

                  return (
                    <Button
                      key={slotTime}
                      onClick={() => available && handleSlotClick(slotTime)}
                      disabled={!available}
                      className={slotClasses}
                      title={!available ? "Non disponibile" : isOriginal ? "Slot originale" : "Disponibile"}
                    >
                      {slotTime} - {endTime}
                    </Button>
                  );
                })}
              </div>

              <div className="mt-3 flex justify-between items-center">
                <div className="text-sm text-gray-600">
                  Slot selezionati: <span className="font-semibold">{selectedSlots.length}</span> / 3 max
                </div>
                <div className="text-sm">
                  {selectedSlots.length === 0 ? (
                    <span className="text-red-500">Seleziona almeno uno slot</span>
                  ) : (
                    <span className="text-green-600">OK</span>
                  )}
                </div>
              </div>
            </div>

            {/* Tipo prenotazione e note */}
            <div>
              <Label>Tipo di Prenotazione</Label>
              <Select value={bookingType} onValueChange={(v) => setBookingType(v as BookingType)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="singolare">Singolare</SelectItem>
                  <SelectItem value="doppio">Doppio</SelectItem>
                  <SelectItem value="lezione">Lezione con Maestro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Campi per conto terzi (solo se originale era per conto terzi) */}
            {group.bookedForName !== "Te stesso" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Nome (conto terzi)</Label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border rounded-md"
                    value={bookedForFirstName}
                    onChange={(e) => setBookedForFirstName(e.target.value)}
                    placeholder="Nome"
                  />
                </div>
                <div>
                  <Label>Cognome (conto terzi)</Label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border rounded-md"
                    value={bookedForLastName}
                    onChange={(e) => setBookedForLastName(e.target.value)}
                    placeholder="Cognome"
                  />
                </div>
              </div>
            )}

            <div>
              <Label>Note (opzionali)</Label>
              <Textarea
                className="mt-1"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Note sulla prenotazione..."
                rows={3}
              />
            </div>

            <div className="pt-4 border-t border-gray-200">
              <div className="flex flex-col sm:flex-row gap-3">
                <Link to="/history" className="flex-1">
                  <Button variant="outline" className="w-full">
                    Annulla
                  </Button>
                </Link>
                <Button
                  onClick={handleSave}
                  disabled={saving || selectedSlots.length === 0}
                  className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {saving ? (
                    <>
                      <span className="animate-spin mr-2">⟳</span> Salvataggio...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" /> Salva Modifiche
                    </>
                  )}
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
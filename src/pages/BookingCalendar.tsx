"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, LogOut } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { format, parseISO, addHours, setHours, setMinutes, isBefore, isAfter, isEqual } from 'date-fns';
import { it } from 'date-fns/locale'; // Import Italian locale

// Import types
import { Court, Reservation } from '@/types/supabase';

const BookingCalendar = () => {
  const navigate = useNavigate();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedCourtId, setSelectedCourtId] = useState<string | undefined>(undefined);
  const [existingReservations, setExistingReservations] = useState<Reservation[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]); // e.g., ['08:00', '09:00']
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        showError(error.message);
      } else {
        showSuccess("Disconnessione effettuata con successo!");
        navigate('/login');
      }
    } catch (error: any) {
      showError(error.message || "Errore durante la disconnessione.");
    }
  };

  // Fetch courts on component mount
  useEffect(() => {
    const fetchCourts = async () => {
      setFetchingData(true);
      const { data, error } = await supabase
        .from('courts')
        .select('*')
        .eq('is_active', true);

      if (error) {
        showError("Errore nel caricamento dei campi: " + error.message);
      } else {
        setCourts(data || []);
        if (data && data.length > 0 && !selectedCourtId) {
          setSelectedCourtId(data[0].id.toString()); // Select the first court by default
        }
      }
      setFetchingData(false);
    };
    fetchCourts();
  }, []);

  // Fetch existing reservations when date or selectedCourtId changes
  useEffect(() => {
    const fetchReservations = async () => {
      if (!date || !selectedCourtId) return;

      setFetchingData(true);
      const startOfDay = format(date, 'yyyy-MM-ddT00:00:00.000Z');
      const endOfDay = format(date, 'yyyy-MM-ddT23:59:59.999Z');

      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .eq('court_id', parseInt(selectedCourtId))
        .gte('starts_at', startOfDay)
        .lte('ends_at', endOfDay);

      if (error) {
        showError("Errore nel caricamento delle prenotazioni: " + error.message);
      } else {
        setExistingReservations(data || []);
      }
      setFetchingData(false);
    };
    fetchReservations();
    setSelectedSlots([]); // Clear selected slots when date or court changes
  }, [date, selectedCourtId]);

  // Generate all possible 1-hour time slots for the day (8:00 to 20:00)
  const allTimeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let i = 8; i < 20; i++) { // From 8 AM to 7 PM (last slot starts at 19:00)
      slots.push(format(setMinutes(setHours(new Date(), i), 0), 'HH:mm'));
    }
    return slots;
  }, []);

  // Determine if a specific slot is available
  const isSlotAvailable = (slotTime: string): boolean => {
    if (!date || !selectedCourtId) return false;

    const slotStart = setMinutes(setHours(date, parseInt(slotTime.split(':')[0])), parseInt(slotTime.split(':')[1]));
    const slotEnd = addHours(slotStart, 1);

    // Check if the slot is in the past
    if (isBefore(slotEnd, new Date())) {
      return false;
    }

    // Check against existing reservations
    const isBooked = existingReservations.some(res => {
      const resStart = parseISO(res.starts_at);
      const resEnd = parseISO(res.ends_at);

      // A slot is unavailable if it overlaps with an existing reservation
      return (
        (isBefore(slotStart, resEnd) && isAfter(slotEnd, resStart)) ||
        isEqual(slotStart, resStart)
      );
    });

    return !isBooked;
  };

  // Handle clicking on a time slot
  const handleSlotClick = (slotTime: string) => {
    if (!date || !selectedCourtId) {
      showError("Seleziona una data e un campo prima.");
      return;
    }

    if (!isSlotAvailable(slotTime) && !selectedSlots.includes(slotTime)) {
      showError("Questo slot non è disponibile.");
      return;
    }

    const currentSlotIndex = allTimeSlots.indexOf(slotTime);
    const newSelectedSlots = [...selectedSlots];

    if (newSelectedSlots.includes(slotTime)) {
      // Deselecting an already selected slot
      setSelectedSlots(newSelectedSlots.filter(s => s !== slotTime));
    } else {
      // Selecting a new slot
      if (newSelectedSlots.length === 0) {
        // First selection
        setSelectedSlots([slotTime]);
      } else {
        // Check for consecutiveness and max 3 hours
        const sortedSelectedSlots = [...newSelectedSlots, slotTime].sort();
        const firstSelected = sortedSelectedSlots[0];
        const lastSelected = sortedSelectedSlots[sortedSelectedSlots.length - 1];

        const firstIndex = allTimeSlots.indexOf(firstSelected);
        const lastIndex = allTimeSlots.indexOf(lastSelected);

        // Check if all slots between first and last are selected and available
        let consecutiveAndAvailable = true;
        for (let i = firstIndex; i <= lastIndex; i++) {
          const s = allTimeSlots[i];
          if (!newSelectedSlots.includes(s) && s !== slotTime && !isSlotAvailable(s)) {
            consecutiveAndAvailable = false;
            break;
          }
        }

        if (!consecutiveAndAvailable) {
          showError("Puoi selezionare solo slot consecutivi.");
          return;
        }

        if (sortedSelectedSlots.length > 3) {
          showError("Puoi prenotare un massimo di 3 ore consecutive.");
          return;
        }

        // If it's consecutive and within limits, add all slots in between
        const finalSlots: string[] = [];
        for (let i = firstIndex; i <= lastIndex; i++) {
          finalSlots.push(allTimeSlots[i]);
        }
        setSelectedSlots(finalSlots);
      }
    }
  };

  const handleBooking = async () => {
    if (!date || !selectedCourtId || selectedSlots.length === 0) {
      showError("Seleziona una data, un campo e almeno un orario.");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showError("Utente non autenticato. Effettua il login.");
        navigate('/login');
        return;
      }

      const courtIdNum = parseInt(selectedCourtId);
      const reservationsToInsert = selectedSlots.sort().map((slotTime, index) => {
        const slotStart = setMinutes(setHours(date, parseInt(slotTime.split(':')[0])), parseInt(slotTime.split(':')[1]));
        const slotEnd = addHours(slotStart, 1);

        return {
          court_id: courtIdNum,
          user_id: user.id,
          starts_at: slotStart.toISOString(),
          ends_at: slotEnd.toISOString(),
          status: 'confirmed', // Assuming instant confirmation for now
          notes: `Prenotazione per ${user.email} - Slot ${index + 1}/${selectedSlots.length}`,
        };
      });

      // Check for overlapping with existing reservations one last time before inserting
      for (const newRes of reservationsToInsert) {
        const newResStart = parseISO(newRes.starts_at);
        const newResEnd = parseISO(newRes.ends_at);

        const overlap = existingReservations.some(res => {
          const resStart = parseISO(res.starts_at);
          const resEnd = parseISO(res.ends_at);
          return (isBefore(newResStart, resEnd) && isAfter(newResEnd, resStart)) || isEqual(newResStart, resStart);
        });

        if (overlap) {
          showError("Uno o più slot selezionati sono stati appena prenotati. Riprova.");
          setLoading(false);
          setSelectedSlots([]); // Clear selection
          // Re-fetch reservations to update UI
          const startOfDay = format(date, 'yyyy-MM-ddT00:00:00.000Z');
          const endOfDay = format(date, 'yyyy-MM-ddT23:59:59.999Z');
          const { data, error } = await supabase
            .from('reservations')
            .select('*')
            .eq('court_id', courtIdNum)
            .gte('starts_at', startOfDay)
            .lte('ends_at', endOfDay);
          if (!error) setExistingReservations(data || []);
          return;
        }
      }

      const { error: insertError } = await supabase
        .from('reservations')
        .insert(reservationsToInsert);

      if (insertError) {
        showError("Errore durante la prenotazione: " + insertError.message);
      } else {
        showSuccess("Prenotazione effettuata con successo!");
        setSelectedSlots([]); // Clear selected slots
        // Re-fetch reservations to update UI
        const startOfDay = format(date, 'yyyy-MM-ddT00:00:00.000Z');
        const endOfDay = format(date, 'yyyy-MM-ddT23:59:59.999Z');
        const { data, error } = await supabase
          .from('reservations')
          .select('*')
          .eq('court_id', courtIdNum)
          .gte('starts_at', startOfDay)
          .lte('ends_at', endOfDay);
        if (!error) setExistingReservations(data || []);
      }
    } catch (error: any) {
      showError(error.message || "Errore inaspettato durante la prenotazione.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center">
          <Link to="/dashboard" className="mr-4">
            <Button variant="outline" size="icon" className="text-primary border-primary hover:bg-secondary">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-primary">Prenota un Campo</h1>
        </div>
        <Button variant="outline" className="text-primary border-primary hover:bg-secondary" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" /> Esci
        </Button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-primary">Seleziona Data</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              initialFocus
              locale={it} // Use Italian locale for calendar
              className="rounded-md border shadow"
              disabled={(date) => isBefore(date, new Date())} // Disable past dates
            />
          </CardContent>
        </Card>

        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-primary">Dettagli Prenotazione</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">Campo</h3>
              <Select onValueChange={setSelectedCourtId} value={selectedCourtId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleziona un campo" />
                </SelectTrigger>
                <SelectContent>
                  {courts.map((court) => (
                    <SelectItem key={court.id} value={court.id.toString()}>{court.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">Orario (Max 3 ore consecutive)</h3>
              {fetchingData ? (
                <p className="text-gray-500">Caricamento disponibilità...</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-60 overflow-y-auto p-2 border rounded-md bg-gray-50">
                  {allTimeSlots.map((slotTime) => {
                    const isSelected = selectedSlots.includes(slotTime);
                    const available = isSlotAvailable(slotTime);
                    const slotClasses = `
                      px-3 py-2 rounded-md text-sm font-medium
                      ${isSelected
                        ? 'bg-club-orange text-club-orange-foreground hover:bg-club-orange/90'
                        : available
                          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                          : 'bg-gray-300 text-gray-600 cursor-not-allowed opacity-70'
                      }
                    `;
                    return (
                      <Button
                        key={slotTime}
                        onClick={() => handleSlotClick(slotTime)}
                        disabled={!available && !isSelected} // Can only click if available or already selected
                        className={slotClasses}
                      >
                        {slotTime}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>

            <Button
              onClick={handleBooking}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={!date || !selectedCourtId || selectedSlots.length === 0 || loading || fetchingData}
            >
              {loading ? "Prenotazione in corso..." : "Conferma Prenotazione"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BookingCalendar;
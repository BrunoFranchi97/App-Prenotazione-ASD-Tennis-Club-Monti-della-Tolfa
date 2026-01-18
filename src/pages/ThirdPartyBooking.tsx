"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, LogOut, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { format, parseISO, addHours, setHours, setMinutes, isBefore, isAfter, isEqual, setSeconds, setMilliseconds, addDays } from 'date-fns';
import { it } from 'date-fns/locale';
import { useApprovalCheck } from '@/hooks/use-approval-check'; // Import the new hook

// Import types
import { Court, Reservation } from '@/types/supabase';

const ThirdPartyBooking = () => {
  const navigate = useNavigate();
  const { isApproved, loading: approvalLoading } = useApprovalCheck(); // Use the approval check hook

  const [date, setDate] = useState<Date | undefined>(new Date());
  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedCourtId, setSelectedCourtId] = useState<string | undefined>(undefined);
  const [existingReservations, setExistingReservations] = useState<Reservation[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [bookedForFirstName, setBookedForFirstName] = useState('');
  const [bookedForLastName, setBookedForLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);
  const [bookerFullName, setBookerFullName] = useState<string | null>(null); // Nuovo stato per il nome completo del prenotante

  const selectedCourt = useMemo(() => {
    return courts.find(court => court.id.toString() === selectedCourtId);
  }, [courts, selectedCourtId]);

  // Calcola la data massima prenotabile (2 settimane da oggi)
  const maxDate = useMemo(() => addDays(new Date(), 14), []);

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

  // Fetch booker's full name on component mount
  useEffect(() => {
    if (!isApproved) return; // Skip fetching if not approved

    const fetchBookerProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error("[ThirdPartyBooking] Error fetching profile:", error.message);
        } else if (profile) {
          setBookerFullName(profile.full_name);
        }
      }
    };
    fetchBookerProfile();
  }, [isApproved]);

  useEffect(() => {
    if (!isApproved) return; // Skip fetching if not approved

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
          setSelectedCourtId(data[0].id.toString());
        }
      }
      setFetchingData(false);
    };
    fetchCourts();
  }, [isApproved]);

  useEffect(() => {
    if (!isApproved) return; // Skip fetching if not approved

    const fetchReservations = async () => {
      if (!date || !selectedCourtId) return;

      setFetchingData(true);
      const startOfDay = format(date, "yyyy-MM-dd'T'00:00:00.000'Z'");
      const endOfDay = format(date, "yyyy-MM-dd'T'23:59:59.999'Z'");

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
    setSelectedSlots([]);
  }, [date, selectedCourtId, isApproved]);

  const allTimeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let i = 8; i < 20; i++) {
      slots.push(format(setMinutes(setHours(new Date(), i), 0), 'HH:mm'));
    }
    return slots;
  }, []);

  const isSlotAvailable = (slotTime: string): boolean => {
    if (!date || !selectedCourtId) return false;

    let slotStart = setMinutes(setHours(date, parseInt(slotTime.split(':')[0])), parseInt(slotTime.split(':')[1]));
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
    if (!selectedCourt) {
      showError("Campo selezionato non trovato.");
      return;
    }
    if (!bookedForFirstName || !bookedForLastName) {
      showError("Inserisci nome e cognome del socio per cui stai prenotando.");
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
      const sortedSlots = selectedSlots.sort();
      
      // Calcola l'orario di inizio del primo slot e di fine dell'ultimo slot
      const firstSlotTime = sortedSlots[0];
      const lastSlotTime = sortedSlots[sortedSlots.length - 1];
      
      let firstSlotStart = setMinutes(setHours(date, parseInt(firstSlotTime.split(':')[0])), parseInt(firstSlotTime.split(':')[1]));
      firstSlotStart = setSeconds(firstSlotStart, 0);
      firstSlotStart = setMilliseconds(firstSlotStart, 0);
      
      let lastSlotEnd = setMinutes(setHours(date, parseInt(lastSlotTime.split(':')[0])), parseInt(lastSlotTime.split(':')[1]));
      lastSlotEnd = setSeconds(lastSlotEnd, 0);
      lastSlotEnd = setMilliseconds(lastSlotEnd, 0);
      lastSlotEnd = addHours(lastSlotEnd, 1);
      
      // Crea una nota unica per tutte le prenotazioni consecutive
      const uniqueNote = `Prenotazione per ${bookedForFirstName} ${bookedForLastName} (effettuata da ${bookerFullName || 'Socio Sconosciuto'}) dalle ${format(firstSlotStart, 'HH:mm')} alle ${format(lastSlotEnd, 'HH:mm')}`;
      
      const reservationsToInsert = sortedSlots.map((slotTime, index) => {
        let slotStart = setMinutes(setHours(date, parseInt(slotTime.split(':')[0])), parseInt(slotTime.split(':')[1]));
        slotStart = setSeconds(slotStart, 0);
        slotStart = setMilliseconds(slotStart, 0);
        const slotEnd = addHours(slotStart, 1);

        return {
          court_id: courtIdNum,
          user_id: user.id, // The logged-in user is making the booking
          starts_at: slotStart.toISOString(),
          ends_at: slotEnd.toISOString(),
          status: 'confirmed',
          notes: uniqueNote, // Usa la nota unica per tutte le prenotazioni
          booked_for_first_name: bookedForFirstName,
          booked_for_last_name: bookedForLastName,
        };
      });

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
          setSelectedSlots([]);
          const startOfDay = format(date, "yyyy-MM-dd'T'00:00:00.000'Z'");
          const endOfDay = format(date, "yyyy-MM-dd'T'23:59:59.999'Z'");
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

      const { data: insertedReservations, error: insertError } = await supabase
        .from('reservations')
        .insert(reservationsToInsert)
        .select();

      if (insertError) {
        showError("Errore durante la prenotazione: " + insertError.message);
      } else if (insertedReservations) {
        showSuccess("Prenotazione effettuata con successo per conto terzi!");
        setSelectedSlots([]);

        // *** FIRE-AND-FORGET: Invoke Edge Function for email confirmation without waiting ***
        supabase.functions.invoke('send-booking-confirmation', {
          body: {
            userEmail: user.email, // Email del socio che prenota
            userName: bookerFullName || user.email,
            courtName: selectedCourt.name,
            reservations: insertedReservations,
            bookedForFirstName: bookedForFirstName,
            bookedForLastName: bookedForLastName,
          },
        }).catch(e => console.error("Error invoking confirmation email function (async):", e));
        // *********************************************************************************

        navigate('/booking-confirmation', {
          state: {
            reservations: insertedReservations,
            courtName: selectedCourt.name,
            bookedFor: `${bookedForFirstName} ${bookedForLastName}`, // Passa il nome del terzo per la conferma
          },
        });
      }
    } catch (error: any) {
      showError(error.message || "Errore inaspettato durante la prenotazione.");
    } finally {
      setLoading(false);
    }
  };

  if (approvalLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white p-4">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4 text-primary">Verifica...</h1>
          <p className="text-xl text-gray-600">Stato approvazione utente.</p>
        </div>
      </div>
    );
  }

  if (!isApproved) {
    return null; 
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center">
          <Link to="/dashboard" className="mr-4">
            <Button variant="outline" size="icon" className="text-primary border-primary hover:bg-secondary">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-primary flex items-center">
            <Users className="mr-2 h-7 w-7" /> Prenota per un Socio
          </h1>
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
              locale={it}
              className="rounded-md border shadow"
              disabled={(date) => isBefore(date, new Date()) || isAfter(date, maxDate)}
            />
          </CardContent>
        </Card>

        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-primary">Dettagli Prenotazione</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">Socio per cui prenoti</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bookedForFirstName">Nome</Label>
                  <Input
                    id="bookedForFirstName"
                    type="text"
                    placeholder="Nome del socio"
                    value={bookedForFirstName}
                    onChange={(e) => setBookedForFirstName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bookedForLastName">Cognome</Label>
                  <Input
                    id="bookedForLastName"
                    type="text"
                    placeholder="Cognome del socio"
                    value={bookedForLastName}
                    onChange={(e) => setBookedForLastName(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

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
                    
                    const [hours, minutes] = slotTime.split(':').map(Number);
                    const endTime = format(setMinutes(setHours(new Date(), hours + 1), minutes), 'HH:mm');

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
                        disabled={!available && !isSelected}
                        className={slotClasses}
                      >
                        {slotTime} - {endTime}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>

            <Button
              onClick={handleBooking}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={!date || !selectedCourtId || selectedSlots.length === 0 || loading || fetchingData || !bookedForFirstName || !bookedForLastName}
            >
              {loading ? "Prenotazione in corso..." : "Conferma Prenotazione per Socio"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ThirdPartyBooking;
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowLeft, LogOut, Users, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { format, parseISO, addHours, setHours, setMinutes, isBefore, isAfter, isEqual, setSeconds, setMilliseconds } from 'date-fns';
import { it } from 'date-fns/locale';
import { useApprovalCheck } from '@/hooks/use-approval-check';
import type { Court, Reservation, MatchRequest, SkillLevel, MatchType } from '@/types/supabase';

interface LocationState {
  matchRequest: MatchRequest;
  opponentName: string;
}

const skillLevelLabels: Record<SkillLevel, string> = {
  'principiante': 'Principiante',
  'intermedio': 'Intermedio',
  'avanzato': 'Avanzato',
  'agonista': 'Agonista'
};

const matchTypeLabels: Record<MatchType, string> = {
  'singolare': 'Singolare',
  'doppio': 'Doppio'
};

const sendMatchConfirmationEmail = async (
  requesterEmail: string,
  requesterName: string,
  acceptorName: string,
  courtName: string,
  reservations: any[],
  matchDetails: { matchType: string; skillLevel: string; opponentName: string }
) => {
  try {
    await supabase.functions.invoke('send-booking-confirmation', {
      body: {
        userEmail: requesterEmail,
        userName: requesterName,
        courtName: courtName,
        reservations: reservations,
        matchDetails: {
          ...matchDetails,
          opponentName: acceptorName
        }
      },
    });
  } catch (e) {
    console.error("Error sending match confirmation email:", e);
  }
};

const MatchBooking = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isApproved, loading: approvalLoading } = useApprovalCheck();
  
  const { matchRequest, opponentName } = location.state as LocationState || {};

  const [date, setDate] = useState<Date | undefined>(() => {
    if (matchRequest?.requested_date) {
      return parseISO(matchRequest.requested_date + 'T00:00:00');
    }
    return new Date();
  });
  
  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedCourtId, setSelectedCourtId] = useState<string | undefined>(undefined);
  const [existingReservations, setExistingReservations] = useState<Reservation[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);
  const [profiles, setProfiles] = useState<{ [key: string]: string }>({});

  const selectedCourt = useMemo(() => {
    return courts.find(court => court.id.toString() === selectedCourtId);
  }, [courts, selectedCourtId]);

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

  // Fetch profiles for user names
  useEffect(() => {
    const fetchProfiles = async () => {
      const { data: profilesData, error } = await supabase
        .from('profiles')
        .select('id, full_name');
      
      if (error) {
        console.error("Error fetching profiles:", error);
        return;
      }
      
      const profileMap: { [key: string]: string } = {};
      profilesData?.forEach(p => {
        profileMap[p.id] = p.full_name || 'Socio Sconosciuto';
      });
      setProfiles(profileMap);
    };
    
    fetchProfiles();
  }, []);

  // Fetch courts on component mount
  useEffect(() => {
    if (!isApproved) return;

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

  // Fetch existing reservations when date or selectedCourtId changes
  useEffect(() => {
    if (!isApproved || !date || !selectedCourtId) return;
    
    const fetchReservations = async () => {
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

  // Generate all possible 1-hour time slots for the day (8:00 to 20:00)
  const allTimeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let i = 8; i < 20; i++) {
      slots.push(format(setMinutes(setHours(new Date(), i), 0), 'HH:mm'));
    }
    return slots;
  }, []);

  // Determine if a specific slot is available
  const isSlotAvailable = (slotTime: string): boolean => {
    if (!date || !selectedCourtId) return false;

    let slotStart = setMinutes(setHours(date, parseInt(slotTime.split(':')[0])), parseInt(slotTime.split(':')[1]));
    slotStart = setSeconds(slotStart, 0);
    slotStart = setMilliseconds(slotStart, 0);
    const slotEnd = addHours(slotStart, 1);

    // Check if the slot is in the past
    if (isBefore(slotEnd, new Date())) {
      return false;
    }

    // Check against existing reservations
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

  const handleFinalizeBooking = async () => {
    if (!matchRequest || !selectedCourtId || selectedSlots.length === 0) {
      showError("Devi selezionare un campo e almeno uno slot.");
      return;
    }

    const totalSelectedHours = selectedSlots.length;
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

      const courtIdNum = parseInt(selectedCourtId);
      const requestDate = parseISO(matchRequest.requested_date + 'T00:00:00');
      const sortedSlots = selectedSlots.sort();
      
      // Crea una nota per la prenotazione
      const note = `[MATCH] Partita ${matchRequest.match_type} con ${opponentName}. Livello: ${matchRequest.skill_level}. Richiesta match ID: ${matchRequest.id}`;
      
      const reservationsToInsert = sortedSlots.map(slotTime => {
        let slotStart = setMinutes(setHours(requestDate, parseInt(slotTime.split(':')[0])), parseInt(slotTime.split(':')[1]));
        slotStart = setSeconds(slotStart, 0);
        slotStart = setMilliseconds(slotStart, 0);
        const slotEnd = addHours(slotStart, 1);

        return {
          court_id: courtIdNum,
          user_id: user.id,
          starts_at: slotStart.toISOString(),
          ends_at: slotEnd.toISOString(),
          status: 'confirmed',
          booking_type: matchRequest.match_type === 'doppio' ? 'doppio' : 'singolare',
          notes: note,
          booked_for_first_name: opponentName?.split(' ')[0] || '',
          booked_for_last_name: opponentName?.split(' ').slice(1).join(' ') || '',
        };
      });

      // Verifica ultima volta la disponibilità
      for (const newRes of reservationsToInsert) {
        const newResStart = parseISO(newRes.starts_at);
        const newResEnd = parseISO(newRes.ends_at);

        const courtReservations = existingReservations.filter(r => r.court_id === courtIdNum);
        const overlap = courtReservations.some(res => {
          const resStart = parseISO(res.starts_at);
          const resEnd = parseISO(res.ends_at);
          return (isBefore(newResStart, resEnd) && isAfter(newResEnd, resStart)) || isEqual(newResStart, resStart);
        });

        if (overlap) {
          showError("Uno o più slot selezionati sono stati appena prenotati. Riprova.");
          setSaving(false);
          // Refresh disponibilità
          const startOfDay = format(requestDate, "yyyy-MM-dd'T'00:00:00.000'Z'");
          const endOfDay = format(requestDate, "yyyy-MM-dd'T'23:59:59.999'Z'");
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

      // Inserisci le prenotazioni
      const { data: insertedReservations, error: insertError } = await supabase
        .from('reservations')
        .insert(reservationsToInsert)
        .select();

      if (insertError) throw insertError;

      // Aggiorna il match request come "matched"
      const { error: updateError } = await supabase
        .from('match_requests')
        .update({ 
          status: 'matched',
          matched_with_user_id: user.id,
          matched_reservation_id: insertedReservations[0]?.id
        })
        .eq('id', matchRequest.id);

      if (updateError) throw updateError;

      // Invia email di conferma al richiedente originale
      const { data: requesterData } = await supabase.auth.admin.getUserById(matchRequest.user_id);
      if (requesterData?.user?.email) {
        const requesterEmail = requesterData.user.email;
        const requesterName = profiles[matchRequest.user_id] || 'Socio';
        const court = courts.find(c => c.id === courtIdNum);
        
        await sendMatchConfirmationEmail(
          requesterEmail,
          requesterName,
          profiles[user.id] || 'Socio',
          court?.name || `Campo ${courtIdNum}`,
          insertedReservations,
          {
            matchType: matchRequest.match_type,
            skillLevel: matchRequest.skill_level,
            opponentName: opponentName
          }
        );
      }

      showSuccess("Prenotazione creata con successo! Ricorda di avvisare l'altro giocatore via WhatsApp.");
      navigate('/history');

    } catch (err: any) {
      showError("Errore durante la creazione della prenotazione: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!matchRequest) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white p-4">
        <Card className="w-full max-w-md shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-destructive text-3xl font-bold">Errore</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Nessuna richiesta di match trovata</AlertTitle>
              <AlertDescription>
                Devi selezionare una richiesta di match dalla pagina "Cerco Partita" prima di poter prenotare.
              </AlertDescription>
            </Alert>
            <Link to="/find-match">
              <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
                Torna a Cerco Partita
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

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

  const totalSelectedHours = selectedSlots.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center">
          <Link to="/find-match" className="mr-4">
            <Button variant="outline" size="icon" className="text-primary border-primary hover:bg-secondary">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-primary flex items-center">
            <Users className="mr-2 h-7 w-7" /> Prenota Partita
          </h1>
        </div>
        <Button variant="outline" className="text-primary border-primary hover:bg-secondary" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" /> Esci
        </Button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Match Request Details */}
        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-primary flex items-center">
              <Users className="mr-2 h-5 w-5" /> Dettagli Richiesta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-bold text-lg text-blue-800 mb-2">Avversario: {opponentName}</h3>
              <div className="space-y-2 text-sm text-blue-700">
                <div className="flex items-center">
                  <span className="font-medium w-32">Data preferita:</span>
                  <span>{format(parseISO(matchRequest.requested_date + 'T00:00:00'), 'dd/MM/yyyy', { locale: it })}</span>
                </div>
                <div className="flex items-center">
                  <span className="font-medium w-32">Fascia oraria:</span>
                  <span>{matchRequest.preferred_time_start} - {matchRequest.preferred_time_end}</span>
                </div>
                <div className="flex items-center">
                  <span className="font-medium w-32">Livello:</span>
                  <span>{skillLevelLabels[matchRequest.skill_level]}</span>
                </div>
                <div className="flex items-center">
                  <span className="font-medium w-32">Tipo partita:</span>
                  <span>{matchTypeLabels[matchRequest.match_type]}</span>
                </div>
                {matchRequest.notes && (
                  <div>
                    <span className="font-medium w-32">Note:</span>
                    <span className="ml-2">{matchRequest.notes}</span>
                  </div>
                )}
              </div>
            </div>

            <Alert className="border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-800">Avvertenza</AlertTitle>
              <AlertDescription className="text-green-700">
                Dopo aver prenotato, contatta l'altro giocatore via WhatsApp per confermare tutti i dettagli della partita.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Booking Form */}
        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-primary">Seleziona Campo e Orario</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">Data</h3>
              <div className="flex justify-center p-4 border rounded-lg bg-white">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  initialFocus
                  locale={it}
                  disabled={(date) => {
                    // Allow only the requested date
                    const matchDate = parseISO(matchRequest.requested_date + 'T00:00:00');
                    const calendarDate = new Date(date.setHours(0, 0, 0, 0));
                    const matchDateOnly = new Date(matchDate.setHours(0, 0, 0, 0));
                    return calendarDate.getTime() !== matchDateOnly.getTime();
                  }}
                  className="rounded-md"
                />
              </div>
              <p className="text-sm text-gray-600 mt-2">
                Data selezionata: {date ? format(date, 'dd/MM/yyyy', { locale: it }) : 'Nessuna'}
              </p>
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
                <>
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
                  <p className="text-sm text-gray-600 mt-2">
                    Slot selezionati: {totalSelectedHours} / 3 max
                  </p>
                </>
              )}
            </div>

            <Button
              onClick={handleFinalizeBooking}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={!date || !selectedCourtId || selectedSlots.length === 0 || saving || fetchingData}
            >
              {saving ? "Prenotazione in corso..." : "Conferma Prenotazione Partita"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MatchBooking;
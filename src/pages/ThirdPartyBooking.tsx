"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, LogOut, Users, User, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { format, parseISO, addHours, setHours, setMinutes, isBefore, isAfter, isEqual, setSeconds, setMilliseconds, addDays, startOfDay, endOfDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { useApprovalCheck } from '@/hooks/use-approval-check';

import { Court, Reservation } from '@/types/supabase';

const ThirdPartyBooking = () => {
  const navigate = useNavigate();
  const { isApproved, loading: approvalLoading } = useApprovalCheck();

  const [date, setDate] = useState<Date | undefined>(new Date());
  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedCourtId, setSelectedCourtId] = useState<string | undefined>(undefined);
  const [existingReservations, setExistingReservations] = useState<any[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [bookedForFirstName, setBookedForFirstName] = useState('');
  const [bookedForLastName, setBookedForLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(true);
  const [bookerFullName, setBookerFullName] = useState<string | null>(null);

  const selectedCourt = useMemo(() => {
    return courts.find(court => court.id.toString() === selectedCourtId);
  }, [courts, selectedCourtId]);

  const maxDate = useMemo(() => addDays(new Date(), 14), []);

  useEffect(() => {
    if (!isApproved) return;
    const fetchBookerProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
        if (profile) setBookerFullName(profile.full_name);
      }
    };
    fetchBookerProfile();
  }, [isApproved]);

  useEffect(() => {
    if (!isApproved) return;
    const fetchCourts = async () => {
      setFetchingData(true);
      const { data } = await supabase.from('courts').select('*').eq('is_active', true);
      if (data) {
        setCourts(data);
        if (data.length > 0 && !selectedCourtId) setSelectedCourtId(data[0].id.toString());
      }
      setFetchingData(false);
    };
    fetchCourts();
  }, [isApproved]);

  const fetchReservations = async () => {
    if (!date || !selectedCourtId) return;
    setFetchingData(true);
    
    const startRange = startOfDay(date).toISOString();
    const endRange = endOfDay(date).toISOString();

    const { data } = await supabase
      .from('reservations')
      .select('*, profiles(full_name)')
      .eq('court_id', parseInt(selectedCourtId))
      .gte('starts_at', startRange)
      .lte('ends_at', endRange)
      .neq('status', 'cancelled');

    if (data) setExistingReservations(data);
    setFetchingData(false);
  };

  useEffect(() => {
    if (!isApproved || !date || !selectedCourtId) return;
    fetchReservations();
    setSelectedSlots([]);
  }, [date, selectedCourtId, isApproved]);

  const allTimeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let i = 8; i < 20; i++) slots.push(format(setMinutes(setHours(new Date(), i), 0), 'HH:mm'));
    return slots;
  }, []);

  const getSlotReservation = (slotTime: string) => {
    if (!date || !selectedCourtId) return null;
    
    const [hours, minutes] = slotTime.split(':').map(Number);
    let slotStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date), hours), minutes), 0), 0);
    
    return existingReservations.find(res => {
      const resStart = parseISO(res.starts_at);
      return resStart.getTime() === slotStart.getTime();
    });
  };

  const isSlotAvailable = (slotTime: string): boolean => {
    if (!date || !selectedCourtId) return false;
    
    const [hours, minutes] = slotTime.split(':').map(Number);
    let slotStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date), hours), minutes), 0), 0);
    const slotEnd = addHours(slotStart, 1);
    
    if (isBefore(slotEnd, new Date())) return false;
    
    return !getSlotReservation(slotTime);
  };

  const handleSlotClick = (slotTime: string) => {
    if (!isSlotAvailable(slotTime) && !selectedSlots.includes(slotTime)) {
      showError("Slot non disponibile.");
      return;
    }

    const newSelected = [...selectedSlots];
    if (newSelected.includes(slotTime)) {
      setSelectedSlots(newSelected.filter(s => s !== slotTime));
    } else {
      if (newSelected.length === 0) {
        setSelectedSlots([slotTime]);
      } else {
        const sorted = [...newSelected, slotTime].sort();
        const firstIdx = allTimeSlots.indexOf(sorted[0]);
        const lastIdx = allTimeSlots.indexOf(sorted[sorted.length - 1]);
        if (lastIdx - firstIdx + 1 > 3) {
          showError("Massimo 3 ore consecutive.");
          return;
        }
        const range: string[] = [];
        for (let i = firstIdx; i <= lastIdx; i++) {
          if (!isSlotAvailable(allTimeSlots[i]) && !newSelected.includes(allTimeSlots[i])) {
            showError("Il range contiene slot occupati.");
            return;
          }
          range.push(allTimeSlots[i]);
        }
        setSelectedSlots(range);
      }
    }
  };

  const handleBooking = async () => {
    if (!date || !selectedCourtId || selectedSlots.length === 0 || !bookedForFirstName || !bookedForLastName) {
      showError("Compila tutti i campi.");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Autenticazione necessaria.");

      const sortedSlots = [...selectedSlots].sort();
      const courtIdNum = parseInt(selectedCourtId);
      
      const reservationsToInsert = sortedSlots.map(slotTime => {
        let slotStart = setSeconds(setMilliseconds(setMinutes(setHours(startOfDay(date!), parseInt(slotTime.split(':')[0])), 0), 0), 0);
        return {
          court_id: courtIdNum,
          user_id: user.id,
          starts_at: slotStart.toISOString(),
          ends_at: addHours(slotStart, 1).toISOString(),
          status: 'confirmed',
          notes: `Prenotazione per ${bookedForFirstName} ${bookedForLastName} (da ${bookerFullName || user.email})`,
          booked_for_first_name: bookedForFirstName,
          booked_for_last_name: bookedForLastName,
        };
      });

      const { data: inserted, error: insertError } = await supabase.from('reservations').insert(reservationsToInsert).select();
      if (insertError) throw insertError;

      showSuccess("Prenotazione socio effettuata!");
      
      supabase.functions.invoke('send-booking-confirmation', {
        body: {
          userEmail: user.email,
          userName: bookerFullName || user.email,
          courtName: selectedCourt?.name,
          reservations: inserted,
          bookedForFirstName,
          bookedForLastName,
        },
      }).catch(e => console.error(e));

      navigate('/booking-confirmation', {
        state: {
          reservations: inserted,
          courtName: selectedCourt?.name,
          bookedFor: `${bookedForFirstName} ${bookedForLastName}`,
        },
      });
    } catch (error: any) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (approvalLoading) return <div className="p-8 text-center">Verifica...</div>;
  if (!isApproved) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center">
          <Link to="/dashboard" className="mr-4">
            <Button variant="outline" size="icon" className="text-primary border-primary hover:bg-secondary"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <h1 className="text-3xl font-bold text-primary flex items-center"><Users className="mr-2 h-7 w-7" /> Prenota per un Socio</h1>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-lg rounded-lg">
          <CardHeader><CardTitle className="text-primary">Data e Socio</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <Calendar mode="single" selected={date} onSelect={setDate} locale={it} className="rounded-md border shadow mx-auto" disabled={(d) => isBefore(d, startOfDay(new Date())) || isAfter(d, maxDate)} />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome Socio</Label>
                <Input placeholder="Nome" value={bookedForFirstName} onChange={e => setBookedForFirstName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Cognome Socio</Label>
                <Input placeholder="Cognome" value={bookedForLastName} onChange={e => setBookedForLastName(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg rounded-lg">
          <CardHeader><CardTitle className="text-primary">Campo e Orario</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="mb-2 block">Campo</Label>
              <Select onValueChange={setSelectedCourtId} value={selectedCourtId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Seleziona un campo" /></SelectTrigger>
                <SelectContent>{courts.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-2 block">Orario (Max 3 ore)</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto p-2 border rounded-md bg-gray-50">
                {allTimeSlots.map(t => {
                  const [hours, minutes] = t.split(':').map(Number);
                  const endTimeLabel = format(setMinutes(setHours(new Date(), hours + 1), minutes), 'HH:mm');
                  const isSelected = selectedSlots.includes(t);
                  const reservation = getSlotReservation(t);
                  const available = isSlotAvailable(t);
                  
                  let occupiedBy = "";
                  let isBlocked = false;
                  if (reservation) {
                    if (reservation.booked_for_first_name === 'SLOT' && reservation.booked_for_last_name === 'BLOCCATO') {
                      occupiedBy = "BLOCCATO";
                      isBlocked = true;
                    } else {
                      occupiedBy = reservation.booked_for_first_name && reservation.booked_for_last_name
                        ? `${reservation.booked_for_first_name} ${reservation.booked_for_last_name}`
                        : reservation.profiles?.full_name || "Socio";
                    }
                  }

                  return (
                    <Button 
                      key={t} 
                      onClick={() => available && handleSlotClick(t)} 
                      variant={isSelected ? "default" : "outline"} 
                      className={`w-full h-auto py-3 flex flex-col gap-1 ${
                        isSelected 
                          ? 'bg-club-orange text-white' 
                          : available 
                            ? 'bg-primary text-white' 
                            : isBlocked
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      }`}
                      disabled={!available && !isSelected}
                    >
                      <span className="font-bold text-sm">{t} - {endTimeLabel}</span>
                      {!available && occupiedBy && (
                        <span className="text-[10px] uppercase truncate w-full px-1 flex items-center justify-center">
                          {isBlocked ? <Lock className="inline h-2.5 w-2.5 mr-0.5" /> : <User className="inline h-2.5 w-2.5 mr-0.5" />}
                          {occupiedBy}
                        </span>
                      )}
                    </Button>
                  );
                })}
              </div>
            </div>

            <Button onClick={handleBooking} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12 text-lg" disabled={selectedSlots.length === 0 || loading || !bookedForFirstName || !bookedForLastName}>
              {loading ? "Prenotazione in corso..." : "Conferma per Socio"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ThirdPartyBooking;
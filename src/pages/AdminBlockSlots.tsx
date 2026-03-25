"use client";

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { setHours, setMinutes, setSeconds, setMilliseconds } from 'date-fns';
import { it } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, LogOut, CalendarPlus, Clock, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { Court } from '@/types/supabase';

const AdminBlockSlots = () => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [courts, setCourts] = useState<Court[]>([]);
  
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedCourt, setSelectedCourt] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("08:00");
  const [endTime, setEndTime] = useState<string>("09:00");
  const [reason, setReason] = useState<string>("");

  // Orario esteso fino alle 22:00
  const timeSlots = [
    "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"
  ];

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

  const fetchAdminStatus = async (): Promise<boolean> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate('/login');
      return false;
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (error || !profile?.is_admin) {
      showError("Accesso negato. Non sei un amministratore.");
      navigate('/dashboard');
      return false;
    }

    return true;
  };

  const fetchCourts = async () => {
    try {
      const { data, error } = await supabase
        .from('courts')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      
      setCourts(data || []);
      
      // Imposta il primo campo come selezionato di default
      if (data && data.length > 0) {
        setSelectedCourt(String(data[0].id));
      }
    } catch (err: any) {
      showError("Errore nel caricamento dei campi: " + err.message);
    }
  };

  useEffect(() => {
    const initialize = async () => {
      setLoading(true);
      try {
        const adminOk = await fetchAdminStatus();
        if (adminOk) {
          setIsAdmin(true);
          await fetchCourts();
        } else {
          setIsAdmin(false);
        }
      } catch (err: any) {
        showError("Errore durante l'inizializzazione: " + err.message);
      } finally {
        setLoading(false);
      }
    };
    
    initialize();
  }, [navigate]);

  const createDateTime = (date: Date | undefined, time: string) => {
    if (!date) return null;
    const [hours, minutes] = time.split(':').map(Number);
    let result = setHours(new Date(date), hours);
    result = setMinutes(result, minutes);
    result = setSeconds(result, 0);
    result = setMilliseconds(result, 0);
    return result;
  };

  const handleBlockSlot = async () => {
    if (!selectedDate || !selectedCourt || !startTime || !endTime) {
      showError("Compila tutti i campi obbligatori.");
      return;
    }

    const startDateTime = createDateTime(selectedDate, startTime);
    const endDateTime = createDateTime(selectedDate, endTime);

    if (!startDateTime || !endDateTime) {
      showError("Data o ora non valida.");
      return;
    }

    if (startDateTime >= endDateTime) {
      showError("L'ora di fine deve essere successiva all'ora di inizio.");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        showError("Utente non autenticato.");
        return;
      }

      const { error } = await supabase.from('reservations').insert({
        court_id: Number(selectedCourt),
        user_id: user.id,
        starts_at: startDateTime.toISOString(),
        ends_at: endDateTime.toISOString(),
        status: 'cancelled',
        notes: `BLOCCATO: ${reason || 'Nessun motivo specificato'}`,
        booked_for_first_name: 'SLOT',
        booked_for_last_name: 'BLOCCATO'
      });

      if (error) throw error;

      showSuccess("Slot bloccato con successo!");
      
      // Reset form
      setReason("");
      setStartTime("08:00");
      setEndTime("09:00");
      
    } catch (err: any) {
      showError("Errore durante il blocco dello slot: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 sm:p-10 lg:p-12">
      <header className="flex justify-between items-end mb-10 max-w-7xl mx-auto">
        <div className="flex items-center gap-6">
          <Link to="/admin">
            <Button variant="outline" size="icon" className="rounded-2xl border-none shadow-sm bg-white text-primary hover:scale-110 active:scale-95 transition-transform">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <p className="text-sm font-bold text-club-orange uppercase tracking-[0.2em] mb-1">Amministrazione</p>
            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tighter">Blocca Slot Orari</h1>
          </div>
        </div>
        <Button variant="ghost" onClick={handleLogout} className="rounded-2xl text-gray-400 hover:text-primary font-bold">
          <LogOut className="mr-2 h-4 w-4" /> Esci
        </Button>
      </header>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white">
          <CardHeader className="px-8 pt-8 pb-4">
            <CardTitle className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-primary" /> Seleziona Data e Campo
            </CardTitle>
            <CardDescription className="text-gray-400 text-sm">Scegli la data e il campo da bloccare</CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8 space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-semibold ml-1 text-gray-700">Campo</Label>
              <Select value={selectedCourt} onValueChange={setSelectedCourt}>
                <SelectTrigger className="rounded-xl border-gray-200">
                  <SelectValue placeholder="Seleziona un campo" />
                </SelectTrigger>
                <SelectContent>
                  {courts.length === 0 ? (
                    <SelectItem value="no-courts" disabled>Nessun campo disponibile</SelectItem>
                  ) : (
                    courts.map((court) => (
                      <SelectItem key={court.id} value={String(court.id)}>{court.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold ml-1 text-gray-700">Data</Label>
              <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  locale={it}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  className="rounded-2xl"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white">
          <CardHeader className="px-8 pt-8 pb-4">
            <CardTitle className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" /> Imposta Orario e Motivo
            </CardTitle>
            <CardDescription className="text-gray-400 text-sm">Definisci la fascia oraria da bloccare</CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold ml-1 text-gray-700">Ora inizio</Label>
                <Select value={startTime} onValueChange={setStartTime}>
                  <SelectTrigger className="rounded-xl border-gray-200">
                    <SelectValue placeholder="Inizio" />
                  </SelectTrigger>
                  <SelectContent>
                    {timeSlots.map((time) => (
                      <SelectItem key={time} value={time}>{time}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold ml-1 text-gray-700">Ora fine</Label>
                <Select value={endTime} onValueChange={setEndTime}>
                  <SelectTrigger className="rounded-xl border-gray-200">
                    <SelectValue placeholder="Fine" />
                  </SelectTrigger>
                  <SelectContent>
                    {timeSlots.map((time) => (
                      <SelectItem key={time} value={time}>{time}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold ml-1 text-gray-700">Motivo (opzionale)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Es. Manutenzione, torneo, evento speciale..."
                rows={3}
                className="rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary resize-none"
              />
            </div>

            <div className="bg-amber-50/80 border border-amber-200/60 rounded-2xl p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-amber-700 font-medium leading-relaxed">
                  Lo slot bloccato non sarà prenotabile dai soci. Verrà visualizzato come non disponibile nel calendario.
                </p>
              </div>
            </div>

            <Button
              onClick={handleBlockSlot}
              disabled={saving || !selectedDate || !selectedCourt || !startTime || !endTime}
              className="w-full h-12 bg-gradient-to-br from-primary to-[#23532f] hover:from-[#357a46] hover:to-[#23532f] text-white rounded-2xl font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.01] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {saving ? "Bloccaggio in corso..." : "Blocca Slot"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminBlockSlots;
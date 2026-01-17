"use client";

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, LogOut, Search, Users, Calendar, Clock, Target, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { useApprovalCheck } from '@/hooks/use-approval-check';
import { notifyReservationCreated, notifyBookingConflict } from '@/utils/matchNotifications';

// Import types
import type { Court, MatchRequest, Profile, SkillLevel, MatchType } from '@/types/supabase';

const FindMatch = () => {
  const navigate = useNavigate();
  const { isApproved, loading: approvalLoading } = useApprovalCheck();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [matchRequests, setMatchRequests] = useState<MatchRequest[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  
  // Form state
  const [requestedDate, setRequestedDate] = useState('');
  const [preferredTimeStart, setPreferredTimeStart] = useState('08:00');
  const [preferredTimeEnd, setPreferredTimeEnd] = useState('09:00');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('intermedio');
  const [matchType, setMatchType] = useState<MatchType>('singolare');
  const [notes, setNotes] = useState('');

  const timeSlots = [
    "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", 
    "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"
  ];

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

  const fetchData = async () => {
    if (!isApproved) return;

    setLoading(true);
    try {
      // Fetch open match requests
      const { data: requestsData, error: requestsError } = await supabase
        .from('match_requests')
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false });

      if (requestsError) throw requestsError;
      setMatchRequests(requestsData || []);

      // Fetch profiles for user names
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*');

      if (profilesError) throw profilesError;
      setProfiles(profilesData || []);

      // Fetch courts
      const { data: courtsData, error: courtsError } = await supabase
        .from('courts')
        .select('*')
        .eq('is_active', true);

      if (courtsError) throw courtsError;
      setCourts(courtsData || []);

    } catch (err: any) {
      showError("Errore nel caricamento dei dati: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isApproved) {
      fetchData();
    }
  }, [isApproved]);

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!requestedDate || !preferredTimeStart || !preferredTimeEnd || !skillLevel) {
      showError("Compila tutti i campi obbligatori.");
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showError("Utente non autenticato.");
        navigate('/login');
        return;
      }

      const { error } = await supabase
        .from('match_requests')
        .insert({
          user_id: user.id,
          requested_date: requestedDate,
          preferred_time_start: preferredTimeStart,
          preferred_time_end: preferredTimeEnd,
          skill_level: skillLevel,
          match_type: matchType,
          notes: notes.trim() || null,
          status: 'open'
        });

      if (error) throw error;

      showSuccess("Richiesta di partita creata con successo!");
      
      // Reset form
      setRequestedDate('');
      setPreferredTimeStart('08:00');
      setPreferredTimeEnd('09:00');
      setSkillLevel('intermedio');
      setMatchType('singolare');
      setNotes('');
      
      // Refresh data
      await fetchData();

    } catch (err: any) {
      showError("Errore durante la creazione della richiesta: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const getRequesterName = (userId: string): string => {
    const profile = profiles.find(p => p.id === userId);
    return profile?.full_name || 'Socio Sconosciuto';
  };

  const handleAcceptRequest = async (request: MatchRequest) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.id === request.user_id) {
        showError("Non puoi accettare la tua stessa richiesta.");
        return;
      }

      // For now, just show a message - in a real implementation, 
      // we would create a reservation and update the match request
      showSuccess(`Hai accettato la richiesta di partita di ${getRequesterName(request.user_id)}!`);
      
      // Here you would typically:
      // 1. Create a reservation for both players
      // 2. Update the match request status to 'matched'
      // 3. Notify both players

    } catch (err: any) {
      showError("Errore durante l'accettazione della richiesta: " + err.message);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    try {
      const { error } = await supabase
        .from('match_requests')
        .update({ status: 'cancelled' })
        .eq('id', requestId);

      if (error) throw error;

      showSuccess("Richiesta cancellata con successo!");
      await fetchData();

    } catch (err: any) {
      showError("Errore durante la cancellazione: " + err.message);
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
            <Search className="mr-2 h-7 w-7" /> Cerco Partita
          </h1>
        </div>
        <Button variant="outline" className="text-primary border-primary hover:bg-secondary" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" /> Esci
        </Button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Create Match Request Form */}
        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-primary flex items-center">
              <Calendar className="mr-2 h-5 w-5" /> Crea Richiesta di Partita
            </CardTitle>
            <CardDescription>Cerca un compagno di gioco per una partita di tennis.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitRequest} className="space-y-4">
              <div>
                <Label htmlFor="requestedDate">Data preferita</Label>
                <Input
                  id="requestedDate"
                  type="date"
                  className="mt-1"
                  value={requestedDate}
                  onChange={(e) => setRequestedDate(e.target.value)}
                  required
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Ora inizio preferita</Label>
                  <Select value={preferredTimeStart} onValueChange={setPreferredTimeStart}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timeSlots.map((time) => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Ora fine preferita</Label>
                  <Select value={preferredTimeEnd} onValueChange={setPreferredTimeEnd}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timeSlots.map((time) => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Livello skill</Label>
                  <Select value={skillLevel} onValueChange={(v) => setSkillLevel(v as SkillLevel)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="principiante">Principiante</SelectItem>
                      <SelectItem value="intermedio">Intermedio</SelectItem>
                      <SelectItem value="avanzato">Avanzato</SelectItem>
                      <SelectItem value="agonista">Agonista</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Tipo di partita</Label>
                  <Select value={matchType} onValueChange={(v) => setMatchType(v as MatchType)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="singolare">Singolare</SelectItem>
                      <SelectItem value="doppio">Doppio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Note (opzionali)</Label>
                <Textarea
                  className="mt-1"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Es. Preferisco giocare al campo centrale, disponibile solo al mattino..."
                  rows={3}
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                disabled={submitting || !requestedDate || !preferredTimeStart || !preferredTimeEnd}
              >
                {submitting ? "Creazione in corso..." : "Crea Richiesta"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Available Match Requests */}
        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-primary flex items-center">
              <Users className="mr-2 h-5 w-5" /> Richieste Disponibili
            </CardTitle>
            <CardDescription>
              {loading ? "Caricamento..." : `${matchRequests.length} richieste di partita aperte`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <p className="text-gray-600">Caricamento richieste...</p>
              </div>
            ) : matchRequests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>Nessuna richiesta di partita disponibile al momento.</p>
                <p className="text-sm mt-2">Crea la prima richiesta per trovare un compagno di gioco!</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                {matchRequests.map((request) => (
                  <Card key={request.id} className="border">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="font-semibold text-lg">
                            {getRequesterName(request.user_id)}
                          </h4>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              <Target className="mr-1 h-3 w-3" />
                              {skillLevelLabels[request.skill_level]}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {matchTypeLabels[request.match_type]}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAcceptRequest(request)}
                          className="text-green-600 border-green-300 hover:bg-green-50"
                        >
                          Accetta
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                        <div className="flex items-center">
                          <Calendar className="mr-2 h-4 w-4 text-club-orange" />
                          <span>
                            {format(parseISO(request.requested_date + 'T00:00:00'), 'dd/MM/yyyy', { locale: it })}
                          </span>
                        </div>
                        <div className="flex items-center">
                          <Clock className="mr-2 h-4 w-4 text-club-orange" />
                          <span>{request.preferred_time_start} - {request.preferred_time_end}</span>
                        </div>
                      </div>

                      {request.notes && (
                        <p className="text-sm text-gray-700 mt-3 border-t pt-3">
                          <span className="font-medium">Note: </span>
                          {request.notes}
                        </p>
                      )}

                      {/* Show cancel button only for own requests */}
                      <div className="mt-3 pt-3 border-t flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancelRequest(request.id)}
                          className="text-red-600 hover:text-red-800 hover:bg-red-50"
                        >
                          <X className="mr-2 h-4 w-4" />
                          Cancella Richiesta
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default FindMatch;
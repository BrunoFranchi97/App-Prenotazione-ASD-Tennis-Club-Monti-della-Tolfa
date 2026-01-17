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
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, LogOut, Calendar, Clock, Target, Users, UserPlus, XCircle, AlertCircle, MessageSquare, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { format, parseISO, isAfter, startOfDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { useApprovalCheck } from '@/hooks/use-approval-check';

// Import types
import type { MatchRequest, SkillLevel, MatchType } from '@/types/supabase';

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

const FindMatch = () => {
  const navigate = useNavigate();
  const { isApproved, loading: approvalLoading } = useApprovalCheck();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [allMatchRequests, setAllMatchRequests] = useState<MatchRequest[]>([]);
  const [myRequests, setMyRequests] = useState<MatchRequest[]>([]);
  const [othersRequests, setOthersRequests] = useState<MatchRequest[]>([]);
  const [profiles, setProfiles] = useState<{ [key: string]: string }>({}); // Map user_id to full_name
  
  // Form state
  const [requestedDate, setRequestedDate] = useState('');
  const [preferredTimeStart, setPreferredTimeStart] = useState('08:00');
  const [preferredTimeEnd, setPreferredTimeEnd] = useState('20:00');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('intermedio');
  const [matchType, setMatchType] = useState<MatchType>('singolare');
  const [notes, setNotes] = useState('');

  const timeSlots = [
    "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", 
    "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"
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

  const fetchData = async () => {
    if (!isApproved) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }

      // Fetch all match requests (open and matched)
      const { data: requestsData, error: requestsError } = await supabase
        .from('match_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (requestsError) throw requestsError;
      
      const requests = requestsData || [];
      setAllMatchRequests(requests);

      // Separate my requests from others
      const my = requests.filter(req => req.user_id === user.id);
      const others = requests.filter(req => 
        req.user_id !== user.id && 
        req.status === 'open' && 
        (!req.requested_date || isAfter(parseISO(req.requested_date + 'T00:00:00'), startOfDay(new Date())))
      );
      
      setMyRequests(my);
      setOthersRequests(others);

      // Fetch profiles for user names
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name');

      if (profilesError) throw profilesError;
      
      const profileMap: { [key: string]: string } = {};
      profilesData?.forEach(p => {
        profileMap[p.id] = p.full_name || 'Socio Sconosciuto';
      });
      setProfiles(profileMap);

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

    if (preferredTimeStart >= preferredTimeEnd) {
      showError("L'orario di fine deve essere successivo all'orario di inizio.");
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

      showSuccess("Richiesta di partita pubblicata con successo!");
      
      // Reset form
      setRequestedDate('');
      setPreferredTimeStart('08:00');
      setPreferredTimeEnd('20:00');
      setSkillLevel('intermedio');
      setMatchType('singolare');
      setNotes('');
      
      // Refresh data
      await fetchData();

    } catch (err: any) {
      showError("Errore durante la pubblicazione della richiesta: " + err.message);
    } finally {
      setSubmitting(false);
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

  const handleAcceptRequest = (request: MatchRequest) => {
    // Navigate to booking form with match request details
    navigate('/match-booking', { 
      state: { 
        matchRequest: request,
        opponentName: profiles[request.user_id] || 'Socio Sconosciuto'
      } 
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <Badge className="bg-green-100 text-green-800">Aperta</Badge>;
      case 'matched':
        return <Badge className="bg-blue-100 text-blue-800">Accoppiata</Badge>;
      case 'cancelled':
        return <Badge className="bg-gray-100 text-gray-800">Cancellata</Badge>;
      case 'expired':
        return <Badge className="bg-orange-100 text-orange-800">Scaduta</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
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
            <Users className="mr-2 h-7 w-7" /> Cerco Partita
          </h1>
        </div>
        <Button variant="outline" className="text-primary border-primary hover:bg-secondary" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" /> Esci
        </Button>
      </header>

      {/* WhatsApp Reminder */}
      <div className="mb-8">
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <MessageSquare className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-amber-800">Ricorda di avvisare l'altro giocatore via WhatsApp</p>
                <p className="text-sm text-amber-700 mt-1">
                  Dopo aver accettato una richiesta, contatta l'altro giocatore per confermare i dettagli della partita.
                  La prenotazione del campo verrà effettuata solo dopo aver concordato tutti i dettagli.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Three Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Pubblica Richiesta */}
        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-primary flex items-center">
              <UserPlus className="mr-2 h-5 w-5" /> Pubblica Richiesta
            </CardTitle>
            <CardDescription>Indica la tua disponibilità per trovare un compagno di gioco</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitRequest} className="space-y-4">
              <div>
                <Label htmlFor="requestedDate">Data preferita <span className="text-red-500">*</span></Label>
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
                  <Label>Ora inizio preferita <span className="text-red-500">*</span></Label>
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
                  <Label>Ora fine preferita <span className="text-red-500">*</span></Label>
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
                  <Label>Livello skill <span className="text-red-500">*</span></Label>
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
                  <Label>Tipo di partita <span className="text-red-500">*</span></Label>
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
                {submitting ? "Pubblicazione in corso..." : "Pubblica Richiesta"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Middle Column: Richieste di Altri */}
        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-primary flex items-center">
                  <Users className="mr-2 h-5 w-5" /> Richieste di Altri
                </CardTitle>
                <CardDescription>
                  {loading ? "Caricamento..." : `${othersRequests.length} richieste disponibili`}
                </CardDescription>
              </div>
              <Badge variant="secondary" className="text-lg px-3 py-1">
                {othersRequests.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <p className="text-gray-600">Caricamento richieste...</p>
              </div>
            ) : othersRequests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>Nessuna richiesta disponibile al momento.</p>
                <p className="text-sm mt-2">Controlla più tardi o pubblica tu una richiesta!</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                {othersRequests.map((request) => (
                  <Card key={request.id} className="border hover:border-primary/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="font-semibold text-lg">
                            {profiles[request.user_id] || 'Socio Sconosciuto'}
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
                          onClick={() => handleAcceptRequest(request)}
                          className="bg-green-600 hover:bg-green-700 text-white"
                          size="sm"
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Accetta
                        </Button>
                      </div>

                      <div className="space-y-2 text-sm text-gray-600">
                        <div className="flex items-center">
                          <Calendar className="mr-2 h-4 w-4 text-club-orange" />
                          <span className="font-medium">Data:</span>
                          <span className="ml-2">
                            {format(parseISO(request.requested_date + 'T00:00:00'), 'dd/MM/yyyy', { locale: it })}
                          </span>
                        </div>
                        <div className="flex items-center">
                          <Clock className="mr-2 h-4 w-4 text-club-orange" />
                          <span className="font-medium">Disponibilità:</span>
                          <span className="ml-2">{request.preferred_time_start} - {request.preferred_time_end}</span>
                        </div>
                      </div>

                      {request.notes && (
                        <p className="text-sm text-gray-700 mt-3 border-t pt-3">
                          <span className="font-medium">Note: </span>
                          {request.notes}
                        </p>
                      )}

                      <div className="mt-3 pt-3 border-t text-xs text-gray-500">
                        <div className="flex items-center">
                          <AlertCircle className="mr-1 h-3 w-3" />
                          Accettando, potrai selezionare un orario preciso nella fascia indicata
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Column: Le mie Richieste */}
        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-primary flex items-center">
                  <Target className="mr-2 h-5 w-5" /> Le mie Richieste
                </CardTitle>
                <CardDescription>
                  {loading ? "Caricamento..." : `${myRequests.length} richieste pubblicate`}
                </CardDescription>
              </div>
              <Badge variant="secondary" className="text-lg px-3 py-1">
                {myRequests.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <p className="text-gray-600">Caricamento...</p>
              </div>
            ) : myRequests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Target className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>Non hai pubblicato nessuna richiesta.</p>
                <p className="text-sm mt-2">Pubblica una richiesta per trovare un compagno di gioco!</p>
              </div>
            ) : (
              <Tabs defaultValue="open" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="open">Aperte</TabsTrigger>
                  <TabsTrigger value="all">Tutte</TabsTrigger>
                </TabsList>
                
                <TabsContent value="open" className="space-y-4 max-h-[400px] overflow-y-auto pr-2 mt-4">
                  {myRequests.filter(r => r.status === 'open').map((request) => (
                    <Card key={request.id} className="border">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              {getStatusBadge(request.status)}
                              <Badge variant="outline" className="text-xs">
                                {matchTypeLabels[request.match_type]}
                              </Badge>
                            </div>
                            <h4 className="font-semibold mt-2">
                              {format(parseISO(request.requested_date + 'T00:00:00'), 'dd/MM/yyyy', { locale: it })}
                            </h4>
                          </div>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleCancelRequest(request.id)}
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Cancella
                          </Button>
                        </div>

                        <div className="space-y-1 text-sm text-gray-600">
                          <div className="flex items-center">
                            <Clock className="mr-2 h-4 w-4 text-club-orange" />
                            <span>{request.preferred_time_start} - {request.preferred_time_end}</span>
                          </div>
                          <div className="flex items-center">
                            <Target className="mr-2 h-4 w-4 text-club-orange" />
                            <span>{skillLevelLabels[request.skill_level]}</span>
                          </div>
                        </div>

                        {request.notes && (
                          <p className="text-sm text-gray-700 mt-2 border-t pt-2">
                            <span className="font-medium">Note: </span>
                            {request.notes}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </TabsContent>

                <TabsContent value="all" className="space-y-4 max-h-[400px] overflow-y-auto pr-2 mt-4">
                  {myRequests.map((request) => (
                    <Card key={request.id} className="border">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              {getStatusBadge(request.status)}
                              <Badge variant="outline" className="text-xs">
                                {matchTypeLabels[request.match_type]}
                              </Badge>
                            </div>
                            <h4 className="font-semibold mt-2">
                              {format(parseISO(request.requested_date + 'T00:00:00'), 'dd/MM/yyyy', { locale: it })}
                            </h4>
                          </div>
                          {request.status === 'open' && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleCancelRequest(request.id)}
                            >
                              <XCircle className="mr-2 h-4 w-4" />
                              Cancella
                            </Button>
                          )}
                        </div>

                        <div className="space-y-1 text-sm text-gray-600">
                          <div className="flex items-center">
                            <Clock className="mr-2 h-4 w-4 text-club-orange" />
                            <span>{request.preferred_time_start} - {request.preferred_time_end}</span>
                          </div>
                          <div className="flex items-center">
                            <Target className="mr-2 h-4 w-4 text-club-orange" />
                            <span>{skillLevelLabels[request.skill_level]}</span>
                          </div>
                        </div>

                        {request.status === 'matched' && request.matched_with_user_id && (
                          <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-200">
                            <p className="text-sm font-medium text-blue-800">
                              <CheckCircle2 className="inline mr-1 h-4 w-4" />
                              Accoppiata con {profiles[request.matched_with_user_id] || 'altro socio'}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default FindMatch;
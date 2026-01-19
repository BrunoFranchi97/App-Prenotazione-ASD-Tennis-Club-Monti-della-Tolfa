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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, LogOut, Calendar, Clock, Target, Users, UserPlus, XCircle, AlertCircle, MessageSquare, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { format, parseISO, isAfter, startOfDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { useApprovalCheck } from '@/hooks/use-approval-check';
import UserNav from '@/components/UserNav';

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
  const [profiles, setProfiles] = useState<{ [key: string]: string }>({}); 
  
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

  const fetchData = async () => {
    if (!isApproved) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }

      // Prendi il livello skill del profilo per impostarlo come default nel form
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('skill_level')
        .eq('id', user.id)
        .single();
      
      if (userProfile?.skill_level) {
        setSkillLevel(userProfile.skill_level);
      }

      // Fetch all match requests (open and matched)
      const { data: requestsData, error: requestsError } = await supabase
        .from('match_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (requestsError) throw requestsError;
      
      const requests = (requestsData || []) as MatchRequest[];
      setAllMatchRequests(requests);

      const my = requests.filter(req => req.user_id === user.id && req.status !== 'cancelled');
      
      const others = requests.filter(req => 
        req.user_id !== user.id && 
        req.status === 'open' && 
        (!req.requested_date || isAfter(parseISO(req.requested_date + 'T23:59:59'), new Date()))
      );
      
      setMyRequests(my);
      setOthersRequests(others);

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
      setRequestedDate('');
      setNotes('');
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
        .delete()
        .eq('id', requestId);

      if (error) throw error;
      showSuccess("Richiesta eliminata con successo!");
      await fetchData();
    } catch (err: any) {
      showError("Errore durante l'eliminazione: " + err.message);
    }
  };

  const handleAcceptRequest = (request: MatchRequest) => {
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
            <Button variant="outline" size="icon" className="text-primary border-primary">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-primary flex items-center">
            <Users className="mr-2 h-7 w-7" /> Cerco Partita
          </h1>
        </div>
        <UserNav />
      </header>

      <div className="mb-8">
        <Tabs defaultValue="publish" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="publish" className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" /> Pubblica Richiesta
            </TabsTrigger>
            <TabsTrigger value="others" className="flex items-center gap-2">
              <Users className="h-4 w-4" /> Richieste di Altri
              {othersRequests.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {othersRequests.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="my" className="flex items-center gap-2">
              <Target className="h-4 w-4" /> Le mie Richieste
            </TabsTrigger>
          </TabsList>

          <TabsContent value="publish" className="space-y-6">
            <Card className="shadow-lg rounded-lg">
              <CardHeader>
                <CardTitle className="text-primary flex items-center">
                  <UserPlus className="mr-2 h-5 w-5" /> Pubblica una Nuova Richiesta
                </CardTitle>
                <CardDescription>Indica la tua disponibilità. Il tuo livello è preimpostato dal profilo.</CardDescription>
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Livello skill (prelevato dal profilo)</Label>
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
                      placeholder="Es. Preferisco giocare al campo centrale..."
                      rows={3}
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                    disabled={submitting || !requestedDate}
                  >
                    {submitting ? "Pubblicazione in corso..." : "Pubblica Richiesta"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="others" className="space-y-6">
            <Card className="shadow-lg rounded-lg">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-primary flex items-center">
                      <Users className="mr-2 h-5 w-5" /> Richieste Disponibili
                    </CardTitle>
                    <CardDescription>{othersRequests.length} soci cercano un avversario</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8">Caricamento...</div>
                ) : othersRequests.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="mx-auto h-12 w-12 mb-4 opacity-50" />
                    <p>Nessuna richiesta disponibile.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {othersRequests.map((request) => (
                      <Card key={request.id} className="border hover:border-primary/50 transition-colors">
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <h4 className="font-semibold text-lg">{profiles[request.user_id] || 'Socio'}</h4>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-xs">
                                  <Target className="mr-1 h-3 w-3" />
                                  {skillLevelLabels[request.skill_level]}
                                </Badge>
                                <Badge variant="outline" className="text-xs">{matchTypeLabels[request.match_type]}</Badge>
                              </div>
                            </div>
                            <Button
                              onClick={() => handleAcceptRequest(request)}
                              className="bg-green-600 hover:bg-green-700 text-white"
                              size="sm"
                            >
                              Accetta
                            </Button>
                          </div>
                          <div className="space-y-2 text-sm text-gray-600">
                            <div className="flex items-center">
                              <Calendar className="mr-2 h-4 w-4 text-club-orange" />
                              <span>{format(parseISO(request.requested_date + 'T00:00:00'), 'dd/MM/yyyy', { locale: it })}</span>
                            </div>
                            <div className="flex items-center">
                              <Clock className="mr-2 h-4 w-4 text-club-orange" />
                              <span>{request.preferred_time_start} - {request.preferred_time_end}</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="my" className="space-y-6">
            <Card className="shadow-lg rounded-lg">
              <CardHeader>
                <CardTitle className="text-primary flex items-center">
                  <Target className="mr-2 h-5 w-5" /> Le mie Richieste
                </CardTitle>
              </CardHeader>
              <CardContent>
                {myRequests.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">Nessuna richiesta pubblicata.</div>
                ) : (
                  <div className="space-y-4">
                    {myRequests.map((request) => (
                      <Card key={request.id} className="border">
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                {getStatusBadge(request.status)}
                                <Badge variant="outline" className="text-xs">{matchTypeLabels[request.match_type]}</Badge>
                              </div>
                              <h4 className="font-semibold">
                                {format(parseISO(request.requested_date + 'T00:00:00'), 'dd/MM/yyyy', { locale: it })}
                              </h4>
                              <p className="text-sm text-gray-600">{request.preferred_time_start} - {request.preferred_time_end}</p>
                            </div>
                            {request.status === 'open' && (
                              <Button variant="destructive" size="sm" onClick={() => handleCancelRequest(request.id)}>
                                Elimina
                              </Button>
                            )}
                          </div>
                          {request.status === 'matched' && request.matched_with_user_id && (
                            <div className="mt-3 p-2 bg-blue-50 rounded border border-blue-200 text-sm">
                              Accoppiata con <strong>{profiles[request.matched_with_user_id]}</strong>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default FindMatch;
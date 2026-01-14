"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, LogOut, Users, Search, UserPlus, Clock, Calendar as CalendarIcon, Trophy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import type { MatchRequest, SkillLevel, MatchType, Profile } from '@/types/supabase';

interface MatchRequestWithProfile extends MatchRequest {
  profile?: {
    full_name: string | null;
    skill_level: SkillLevel;
  };
}

const skillLevelLabels: Record<SkillLevel, string> = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzato: 'Avanzato',
  agonista: 'Agonista'
};

const skillLevelColors: Record<SkillLevel, string> = {
  principiante: 'bg-green-100 text-green-800',
  intermedio: 'bg-blue-100 text-blue-800',
  avanzato: 'bg-purple-100 text-purple-800',
  agonista: 'bg-red-100 text-red-800'
};

const FindMatch = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  // Form state
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [startTime, setStartTime] = useState<string>("09:00");
  const [endTime, setEndTime] = useState<string>("12:00");
  const [skillLevel, setSkillLevel] = useState<SkillLevel>("intermedio");
  const [matchType, setMatchType] = useState<MatchType>("singolare");
  const [notes, setNotes] = useState<string>("");
  
  // Data state
  const [myRequests, setMyRequests] = useState<MatchRequest[]>([]);
  const [openRequests, setOpenRequests] = useState<MatchRequestWithProfile[]>([]);

  const timeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let h = 8; h <= 20; h++) {
      slots.push(`${String(h).padStart(2, '0')}:00`);
    }
    return slots;
  }, []);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) showError(error.message);
    else {
      showSuccess("Disconnessione effettuata!");
      navigate('/login');
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }
      setCurrentUserId(user.id);

      // Fetch user's own requests
      const { data: myData, error: myError } = await supabase
        .from('match_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (myError) throw myError;
      setMyRequests(myData || []);

      // Fetch open requests from other users
      const { data: openData, error: openError } = await supabase
        .from('match_requests')
        .select('*')
        .eq('status', 'open')
        .neq('user_id', user.id)
        .gte('requested_date', format(new Date(), 'yyyy-MM-dd'))
        .order('requested_date', { ascending: true });

      if (openError) throw openError;

      // Fetch profiles for open requests
      if (openData && openData.length > 0) {
        const userIds = [...new Set(openData.map(r => r.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, skill_level')
          .in('id', userIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
        
        const requestsWithProfiles: MatchRequestWithProfile[] = openData.map(r => ({
          ...r,
          profile: profileMap.get(r.user_id) as any
        }));
        
        setOpenRequests(requestsWithProfiles);
      } else {
        setOpenRequests([]);
      }

    } catch (err: any) {
      showError("Errore nel caricamento: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateRequest = async () => {
    if (!selectedDate || !startTime || !endTime || !skillLevel || !matchType) {
      showError("Compila tutti i campi obbligatori.");
      return;
    }

    if (startTime >= endTime) {
      showError("L'ora di fine deve essere successiva all'ora di inizio.");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }

      const { error } = await supabase.from('match_requests').insert({
        user_id: user.id,
        requested_date: format(selectedDate, 'yyyy-MM-dd'),
        preferred_time_start: startTime + ':00',
        preferred_time_end: endTime + ':00',
        skill_level: skillLevel,
        match_type: matchType,
        notes: notes.trim() || null,
        status: 'open'
      });

      if (error) throw error;

      showSuccess("Richiesta pubblicata! Sarai contattato quando qualcuno sarà disponibile.");
      setNotes("");
      await fetchData();

    } catch (err: any) {
      showError("Errore: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    try {
      const { error } = await supabase
        .from('match_requests')
        .update({ status: 'cancelled' })
        .eq('id', requestId);

      if (error) throw error;
      showSuccess("Richiesta annullata.");
      await fetchData();
    } catch (err: any) {
      showError("Errore: " + err.message);
    }
  };

  const handleAcceptMatch = async (request: MatchRequestWithProfile) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('match_requests')
        .update({ 
          status: 'matched',
          matched_with_user_id: user.id
        })
        .eq('id', request.id);

      if (error) throw error;

      showSuccess(`Hai accettato la partita con ${request.profile?.full_name || 'un giocatore'}! Contattalo per organizzare i dettagli.`);
      await fetchData();
    } catch (err: any) {
      showError("Errore: " + err.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4 text-primary">Caricamento...</h1>
        </div>
      </div>
    );
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
          <h1 className="text-3xl font-bold text-primary">Cerco Partita</h1>
        </div>
        <Button variant="outline" className="text-primary border-primary hover:bg-secondary" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" /> Esci
        </Button>
      </header>

      <Tabs defaultValue="search" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="search">
            <Search className="mr-2 h-4 w-4" /> Cerca
          </TabsTrigger>
          <TabsTrigger value="create">
            <UserPlus className="mr-2 h-4 w-4" /> Pubblica
          </TabsTrigger>
          <TabsTrigger value="my-requests">
            <Users className="mr-2 h-4 w-4" /> Le Mie
          </TabsTrigger>
        </TabsList>

        {/* Tab: Cerca partite disponibili */}
        <TabsContent value="search">
          <Card>
            <CardHeader>
              <CardTitle className="text-primary flex items-center">
                <Search className="mr-2 h-5 w-5" /> Partite Disponibili
              </CardTitle>
              <CardDescription>Trova giocatori che cercano compagni di gioco</CardDescription>
            </CardHeader>
            <CardContent>
              {openRequests.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Users className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <p>Nessuna richiesta disponibile al momento.</p>
                  <p className="text-sm mt-2">Pubblica la tua richiesta per trovare compagni!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {openRequests.map((request) => (
                    <Card key={request.id} className="border-l-4 border-l-primary">
                      <CardContent className="pt-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-lg">
                                {request.profile?.full_name || 'Giocatore'}
                              </span>
                              <Badge className={skillLevelColors[request.skill_level]}>
                                {skillLevelLabels[request.skill_level]}
                              </Badge>
                              <Badge variant="outline">
                                {request.match_type === 'singolare' ? 'Singolare' : 'Doppio'}
                              </Badge>
                            </div>
                            
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center">
                                <CalendarIcon className="mr-1 h-4 w-4" />
                                {format(parseISO(request.requested_date), 'EEEE d MMMM', { locale: it })}
                              </span>
                              <span className="flex items-center">
                                <Clock className="mr-1 h-4 w-4" />
                                {request.preferred_time_start.slice(0, 5)} - {request.preferred_time_end.slice(0, 5)}
                              </span>
                            </div>
                            
                            {request.notes && (
                              <p className="text-sm text-gray-600 italic">"{request.notes}"</p>
                            )}
                          </div>
                          
                          <Button onClick={() => handleAcceptMatch(request)} className="bg-primary hover:bg-primary/90">
                            <Trophy className="mr-2 h-4 w-4" /> Accetta
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Pubblica richiesta */}
        <TabsContent value="create">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-primary flex items-center">
                  <CalendarIcon className="mr-2 h-5 w-5" /> Quando vuoi giocare?
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Data</Label>
                  <div className="mt-1 rounded-md border bg-white">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      locale={it}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Dalle ore</Label>
                    <Select value={startTime} onValueChange={setStartTime}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {timeSlots.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Alle ore</Label>
                    <Select value={endTime} onValueChange={setEndTime}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {timeSlots.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-primary flex items-center">
                  <Trophy className="mr-2 h-5 w-5" /> Preferenze
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Tipo di partita</Label>
                  <Select value={matchType} onValueChange={(v) => setMatchType(v as MatchType)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="singolare">Singolare (1 vs 1)</SelectItem>
                      <SelectItem value="doppio">Doppio (2 vs 2)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Il tuo livello</Label>
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
                  <Label>Note (opzionale)</Label>
                  <Textarea
                    className="mt-1"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Es. Cerco giocatore per partita amichevole..."
                    rows={3}
                  />
                </div>

                <Button 
                  onClick={handleCreateRequest}
                  disabled={saving || !selectedDate}
                  className="w-full bg-primary hover:bg-primary/90"
                >
                  {saving ? "Pubblicazione..." : "Pubblica Richiesta"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab: Le mie richieste */}
        <TabsContent value="my-requests">
          <Card>
            <CardHeader>
              <CardTitle className="text-primary flex items-center">
                <Users className="mr-2 h-5 w-5" /> Le Mie Richieste
              </CardTitle>
              <CardDescription>Gestisci le tue richieste di partita</CardDescription>
            </CardHeader>
            <CardContent>
              {myRequests.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Users className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <p>Non hai ancora pubblicato richieste.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {myRequests.map((request) => (
                    <Card key={request.id} className={`border-l-4 ${
                      request.status === 'open' ? 'border-l-green-500' :
                      request.status === 'matched' ? 'border-l-blue-500' :
                      'border-l-gray-300'
                    }`}>
                      <CardContent className="pt-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Badge variant={
                                request.status === 'open' ? 'default' :
                                request.status === 'matched' ? 'secondary' :
                                'outline'
                              }>
                                {request.status === 'open' ? 'In attesa' :
                                 request.status === 'matched' ? 'Abbinato!' :
                                 request.status === 'cancelled' ? 'Annullata' : 'Scaduta'}
                              </Badge>
                              <Badge className={skillLevelColors[request.skill_level]}>
                                {skillLevelLabels[request.skill_level]}
                              </Badge>
                              <Badge variant="outline">
                                {request.match_type === 'singolare' ? 'Singolare' : 'Doppio'}
                              </Badge>
                            </div>
                            
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center">
                                <CalendarIcon className="mr-1 h-4 w-4" />
                                {format(parseISO(request.requested_date), 'EEEE d MMMM', { locale: it })}
                              </span>
                              <span className="flex items-center">
                                <Clock className="mr-1 h-4 w-4" />
                                {request.preferred_time_start.slice(0, 5)} - {request.preferred_time_end.slice(0, 5)}
                              </span>
                            </div>
                          </div>
                          
                          {request.status === 'open' && (
                            <Button 
                              variant="destructive" 
                              size="sm"
                              onClick={() => handleCancelRequest(request.id)}
                            >
                              Annulla
                            </Button>
                          )}
                        </div>
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
  );
};

export default FindMatch;
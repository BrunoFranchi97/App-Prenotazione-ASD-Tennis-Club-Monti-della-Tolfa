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
import { ArrowLeft, Calendar, Clock, Target, Users, MapPin, Search, PlusCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { format, parseISO, isAfter, isBefore, startOfDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { useApprovalCheck } from '@/hooks/use-approval-check';
import UserNav from '@/components/UserNav';
import type { MatchRequest, SkillLevel, MatchType, Court } from '@/types/supabase';

const skillLevelLabels: Record<SkillLevel, string> = {
  'principiante': 'Principiante',
  'intermedio': 'Intermedio',
  'avanzato': 'Avanzato',
  'agonista': 'Agonista'
};

const FindMatch = () => {
  const navigate = useNavigate();
  const { isApproved, loading: approvalLoading } = useApprovalCheck();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [myRequests, setMyRequests] = useState<MatchRequest[]>([]);
  const [othersRequests, setOthersRequests] = useState<any[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [profiles, setProfiles] = useState<{ [key: string]: string }>({}); 
  
  const [requestedDate, setRequestedDate] = useState('');
  const [preferredTimeStart, setPreferredTimeStart] = useState('08:00');
  const [preferredTimeEnd, setPreferredTimeEnd] = useState('09:00');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('intermedio');
  const [matchType, setMatchType] = useState<MatchType>('singolare');
  const [selectedCourtId, setSelectedCourtId] = useState<string>('');
  const [notes, setNotes] = useState('');

  const timeSlots = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];

  const fetchData = async () => {
    if (!isApproved) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: courtsData } = await supabase.from('courts').select('*').eq('is_active', true);
      setCourts(courtsData || []);
      if (courtsData?.length && !selectedCourtId) setSelectedCourtId(courtsData[0].id.toString());

      const { data: requestsData } = await supabase.from('match_requests').select('*, court:court_id(*)').order('requested_date', { ascending: true });
      const requests = (requestsData || []) as any[];
      setMyRequests(requests.filter(r => r.user_id === user.id));
      
      // Filtra sfide aperte di altri utenti che non sono ancora scadute
      const now = new Date();
      setOthersRequests(requests.filter(r => 
        r.user_id !== user.id && 
        r.status === 'open' && 
        isAfter(parseISO(r.requested_date + 'T23:59:59'), now)
      ));

      const { data: profilesData } = await supabase.from('profiles').select('id, full_name');
      const profileMap: { [key: string]: string } = {};
      profilesData?.forEach(p => profileMap[p.id] = p.full_name || 'Socio');
      setProfiles(profileMap);
    } catch (err: any) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isApproved) fetchData(); }, [isApproved]);

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestedDate || !selectedCourtId) return showError("Data e Campo obbligatori.");
    if (preferredTimeStart >= preferredTimeEnd) return showError("L'orario di fine deve essere dopo quello di inizio.");

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // --- CONTROLLO CONFLITTI ---
      const startISO = `${requestedDate}T${preferredTimeStart}:00.000Z`;
      const endISO = `${requestedDate}T${preferredTimeEnd}:00.000Z`;

      const { data: conflicts, error: conflictErr } = await supabase
        .from('reservations')
        .select('id')
        .eq('court_id', parseInt(selectedCourtId))
        .lt('starts_at', endISO)
        .gt('ends_at', startISO)
        .neq('status', 'cancelled');

      if (conflictErr) throw conflictErr;

      if (conflicts && conflicts.length > 0) {
        showError("Spiacente, questo campo è già prenotato in questa fascia oraria. Scegli un altro orario o un altro campo.");
        setSubmitting(false);
        return;
      }
      // ----------------------------

      const { error } = await supabase.from('match_requests').insert({
        user_id: user?.id,
        requested_date: requestedDate,
        preferred_time_start: preferredTimeStart,
        preferred_time_end: preferredTimeEnd,
        skill_level: skillLevel,
        match_type: matchType,
        court_id: parseInt(selectedCourtId),
        notes: notes.trim() || null,
        status: 'open'
      });
      
      if (error) throw error;
      
      showSuccess("Sfida pubblicata con successo!");
      setRequestedDate('');
      setNotes('');
      fetchData();
    } catch (err: any) {
      showError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (approvalLoading) return <div className="p-8 text-center">Caricamento...</div>;
  if (!isApproved) return null;

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
            <Search className="mr-2 h-7 w-7" /> Bacheca Sfide
          </h1>
        </div>
        <UserNav />
      </header>

      <Tabs defaultValue="others" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-8">
          <TabsTrigger value="others">Sfide Aperte</TabsTrigger>
          <TabsTrigger value="publish">Pubblica Sfida</TabsTrigger>
          <TabsTrigger value="my">Le mie Sfide</TabsTrigger>
        </TabsList>

        <TabsContent value="publish">
          <Card className="shadow-lg rounded-lg max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="text-primary flex items-center">
                <PlusCircle className="mr-2 h-5 w-5" /> Proponi una Partita
              </CardTitle>
              <CardDescription>Definisci i dettagli. Il sistema verificherà la disponibilità del campo prima di pubblicare.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitRequest} className="space-y-6">
                <div className="space-y-2">
                  <Label className="flex items-center"><Calendar className="mr-2 h-4 w-4 text-club-orange" /> Data</Label>
                  <Input 
                    type="date" 
                    value={requestedDate} 
                    onChange={e => setRequestedDate(e.target.value)} 
                    required 
                    min={new Date().toISOString().split('T')[0]} 
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center"><Clock className="mr-2 h-4 w-4 text-club-orange" /> Ora Inizio</Label>
                    <Select value={preferredTimeStart} onValueChange={setPreferredTimeStart}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {timeSlots.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center"><Clock className="mr-2 h-4 w-4 text-club-orange" /> Ora Fine</Label>
                    <Select value={preferredTimeEnd} onValueChange={setPreferredTimeEnd}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {timeSlots.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center"><MapPin className="mr-2 h-4 w-4 text-club-orange" /> Campo</Label>
                  <Select value={selectedCourtId} onValueChange={setSelectedCourtId}>
                    <SelectTrigger><SelectValue placeholder="Scegli Campo" /></SelectTrigger>
                    <SelectContent>
                      {courts.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center"><Users className="mr-2 h-4 w-4 text-club-orange" /> Tipo Partita</Label>
                    <Select value={matchType} onValueChange={v => setMatchType(v as MatchType)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="singolare">Singolare</SelectItem>
                        <SelectItem value="doppio">Doppio</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center"><Target className="mr-2 h-4 w-4 text-club-orange" /> Livello Minimo</Label>
                    <Select value={skillLevel} onValueChange={v => setSkillLevel(v as SkillLevel)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(skillLevelLabels).map(([val, label]) => (
                          <SelectItem key={val} value={val}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Note / Messaggio</Label>
                  <Textarea placeholder="Es: Cerco qualcuno per un allenamento intenso..." value={notes} onChange={e => setNotes(e.target.value)} />
                </div>

                <Button type="submit" className="w-full bg-primary hover:bg-primary/90 h-12 text-lg" disabled={submitting}>
                  {submitting ? "Verifica e pubblicazione..." : "Pubblica Sfida"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="others">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {othersRequests.length === 0 ? (
              <div className="col-span-full text-center py-16 text-muted-foreground">
                <Users className="mx-auto h-16 w-16 mb-4 opacity-10" />
                <p className="text-xl font-medium">Nessuna sfida aperta</p>
                <p className="text-sm">Sii il primo a proporne una nella sezione "Pubblica Sfida"!</p>
              </div>
            ) : (
              othersRequests.map(r => (
                <Card key={r.id} className="border hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className="bg-primary/10 text-primary border-none capitalize">{r.match_type}</Badge>
                          <Badge variant="outline" className="text-xs">{skillLevelLabels[r.skill_level as SkillLevel]}</Badge>
                        </div>
                        <h3 className="font-bold text-xl text-gray-900">
                          {profiles[r.user_id]}
                        </h3>
                        <p className="text-sm text-gray-500">Socio del club</p>
                      </div>
                    </div>

                    <div className="space-y-3 mb-6">
                      <div className="flex items-center text-sm">
                        <Calendar className="mr-3 h-4 w-4 text-club-orange" />
                        <span className="font-medium text-gray-700 capitalize">
                          {format(parseISO(r.requested_date), 'EEEE dd MMMM', { locale: it })}
                        </span>
                      </div>
                      <div className="flex items-center text-sm">
                        <Clock className="mr-3 h-4 w-4 text-club-orange" />
                        <span className="font-medium text-gray-700">
                          {r.preferred_time_start} - {r.preferred_time_end}
                        </span>
                      </div>
                      <div className="flex items-center text-sm">
                        <MapPin className="mr-3 h-4 w-4 text-club-orange" />
                        <span className="font-medium text-primary">
                          {r.court?.name || 'Campo'}
                        </span>
                      </div>
                      
                      {r.notes && (
                        <div className="pt-3 border-t mt-3">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Messaggio:</p>
                          <p className="text-sm text-gray-600 italic leading-relaxed">"{r.notes}"</p>
                        </div>
                      )}
                    </div>

                    <Button 
                      className="w-full bg-primary hover:bg-primary/90 font-semibold"
                      onClick={() => navigate('/match-booking', { state: { matchRequest: r, opponentName: profiles[r.user_id] } })}
                    >
                      Accetta Sfida
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="my">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myRequests.length === 0 ? (
              <div className="col-span-full text-center py-16 text-muted-foreground">
                <Calendar className="mx-auto h-16 w-16 mb-4 opacity-10" />
                <p className="text-lg font-medium">Non hai pubblicato sfide</p>
              </div>
            ) : (
              myRequests.map(r => (
                <Card key={r.id} className="border opacity-90">
                  <CardContent className="p-5">
                    <div className="flex justify-between items-center mb-3">
                      <Badge variant={r.status === 'open' ? 'default' : 'secondary'} className={r.status === 'open' ? 'bg-green-100 text-green-800' : ''}>
                        {r.status === 'open' ? 'Aperta' : 'Abbinata'}
                      </Badge>
                      <span className="text-xs text-gray-400">Creata il {format(parseISO(r.created_at), 'dd/MM/yy')}</span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center"><Calendar className="mr-2 h-4 w-4 text-club-orange" /> {format(parseISO(r.requested_date), 'dd/MM/yyyy')}</div>
                      <div className="flex items-center"><Clock className="mr-2 h-4 w-4 text-club-orange" /> {r.preferred_time_start} - {r.preferred_time_end}</div>
                      <div className="flex items-center font-medium"><MapPin className="mr-2 h-4 w-4 text-primary" /> {r.court?.name || 'Campo'}</div>
                      <div className="text-xs text-gray-500 font-bold tracking-wider pt-1">{r.match_type.toUpperCase()} • {skillLevelLabels[r.skill_level as SkillLevel].toUpperCase()}</div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FindMatch;
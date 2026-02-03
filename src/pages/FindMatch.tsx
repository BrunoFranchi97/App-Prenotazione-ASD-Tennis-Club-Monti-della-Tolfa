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
import { ArrowLeft, Calendar, Clock, Target, Users, UserPlus, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { format, parseISO, isAfter } from 'date-fns';
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
      if (courtsData?.length) setSelectedCourtId(courtsData[0].id.toString());

      const { data: requestsData } = await supabase.from('match_requests').select('*, court:court_id(*)').order('created_at', { ascending: false });
      const requests = (requestsData || []) as any[];
      setMyRequests(requests.filter(r => r.user_id === user.id));
      setOthersRequests(requests.filter(r => r.user_id !== user.id && r.status === 'open' && isAfter(parseISO(r.requested_date + 'T23:59:59'), new Date())));

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
      showSuccess("Richiesta pubblicata!");
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
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-8">
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center">
          <Link to="/dashboard" className="mr-4"><Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <h1 className="text-3xl font-bold text-primary">Cerco Partita</h1>
        </div>
        <UserNav />
      </header>
      <Tabs defaultValue="others">
        <TabsList className="w-full mb-6">
          <TabsTrigger value="publish" className="flex-1">Pubblica</TabsTrigger>
          <TabsTrigger value="others" className="flex-1">Richieste</TabsTrigger>
          <TabsTrigger value="my" className="flex-1">Le mie</TabsTrigger>
        </TabsList>
        <TabsContent value="publish">
          <Card><CardHeader><CardTitle>Nuova Sfida</CardTitle></CardHeader>
            <CardContent><form onSubmit={handleSubmitRequest} className="space-y-4">
              <Input type="date" value={requestedDate} onChange={e => setRequestedDate(e.target.value)} required min={new Date().toISOString().split('T')[0]} />
              <div className="grid grid-cols-2 gap-4">
                <Select value={preferredTimeStart} onValueChange={setPreferredTimeStart}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{timeSlots.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
                <Select value={preferredTimeEnd} onValueChange={setPreferredTimeEnd}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{timeSlots.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
              </div>
              <Select value={selectedCourtId} onValueChange={setSelectedCourtId}><SelectTrigger><SelectValue placeholder="Scegli Campo" /></SelectTrigger><SelectContent>{courts.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent></Select>
              <Select value={matchType} onValueChange={v => setMatchType(v as MatchType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="singolare">Singolare</SelectItem><SelectItem value="doppio">Doppio</SelectItem></SelectContent></Select>
              <Textarea placeholder="Note..." value={notes} onChange={e => setNotes(e.target.value)} />
              <Button type="submit" className="w-full" disabled={submitting}>Pubblica Sfida</Button>
            </form></CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="others">
          <div className="grid gap-4">{othersRequests.map(r => (
            <Card key={r.id}><CardContent className="p-4 flex justify-between items-center">
              <div>
                <h4 className="font-bold">{profiles[r.user_id]}</h4>
                <p className="text-sm text-gray-500">{format(parseISO(r.requested_date), 'dd/MM/yyyy')} | {r.preferred_time_start}-{r.preferred_time_end}</p>
                <div className="flex items-center gap-1 text-xs text-primary font-medium mt-1"><MapPin className="h-3 w-3"/> {r.court?.name}</div>
              </div>
              <Button onClick={() => navigate('/match-booking', { state: { matchRequest: r, opponentName: profiles[r.user_id] } })}>Accetta</Button>
            </CardContent></Card>
          ))}</div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FindMatch;
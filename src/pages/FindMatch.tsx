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
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Calendar, Clock, Target, Users, MapPin, Search, PlusCircle, ChevronRight, Info, Zap, Loader2, X } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { format, parseISO, isAfter, startOfDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { useApprovalCheck } from '@/hooks/use-approval-check';
import UserNav from '@/components/UserNav';
import Footer from '@/components/Footer';
import { cn } from '@/lib/utils';
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
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [challengeToCancel, setChallengeToCancel] = useState<MatchRequest | null>(null);
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

  const timeSlots = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00"];

  const handleCancelChallenge = async (request: MatchRequest) => {
    setCancellingId(request.id);
    try {
      const { error } = await supabase.from('match_requests').delete().eq('id', request.id);
      if (error) throw error;
      showSuccess("Sfida annullata con successo.");
      fetchData();
    } catch (err: any) {
      showError(err.message || "Errore durante l'annullamento della sfida.");
    } finally {
      setCancellingId(null);
    }
  };

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
      
      const today = startOfDay(new Date());

      const activeRequests = requests.filter(r => {
        const reqDate = parseISO(r.requested_date);
        return isAfter(reqDate, today) || format(reqDate, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
      });

      setMyRequests(activeRequests.filter(r => r.user_id === user.id));
      setOthersRequests(activeRequests.filter(r => r.user_id !== user.id && r.status === 'open'));

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

  useEffect(() => { 
    if (isApproved) {
      fetchData();
      const channel = supabase
        .channel('schema-match-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'match_requests' }, () => fetchData())
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [isApproved]);

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestedDate || !selectedCourtId) return showError("Data e Campo obbligatori.");
    if (preferredTimeStart >= preferredTimeEnd) return showError("L'orario di fine deve essere dopo quello di inizio.");

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const startISO = new Date(`${requestedDate}T${preferredTimeStart}:00`).toISOString();
      const endISO = new Date(`${requestedDate}T${preferredTimeEnd}:00`).toISOString();

      const { data: conflicts } = await supabase
        .from('reservations')
        .select('id')
        .eq('court_id', parseInt(selectedCourtId))
        .lt('starts_at', endISO)
        .gt('ends_at', startISO)
        .neq('status', 'cancelled');

      if (conflicts && conflicts.length > 0) {
        showError("Il campo è già prenotato in questa fascia oraria.");
        setSubmitting(false);
        return;
      }

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
      
      showSuccess("Sfida pubblicata!");
      setRequestedDate('');
      setNotes('');
    } catch (err: any) {
      showError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (approvalLoading) return <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center"><Loader2 className="animate-spin text-primary h-12 w-12" /></div>;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      <div className="flex-grow p-6 sm:p-10 lg:p-12 max-w-7xl mx-auto w-full">
        <header className="flex justify-between items-end mb-12">
          <div className="flex items-center gap-6">
            <Link to="/dashboard">
              <Button variant="outline" size="icon" className="rounded-2xl border-none shadow-sm bg-white text-primary hover:scale-110 active:scale-95 transition-transform">
                <ArrowLeft size={20} />
              </Button>
            </Link>
            <div className="space-y-1">
              <p className="text-sm font-bold text-primary uppercase tracking-[0.2em] mb-1">Matchmaking</p>
              <h1 className="text-4xl font-extrabold text-gray-900 tracking-tighter">Bacheca Sfide</h1>
            </div>
          </div>
          <UserNav />
        </header>

        <Tabs defaultValue="others" className="w-full">
          <TabsList className="bg-white/50 p-1.5 rounded-[1.5rem] border border-gray-100 shadow-sm mb-12 grid grid-cols-3 max-w-2xl mx-auto h-auto">
            <TabsTrigger value="others" className="rounded-2xl py-3 font-bold text-sm data-[state=active]:bg-primary data-[state=active]:text-white">Sfide Aperte</TabsTrigger>
            <TabsTrigger value="publish" className="rounded-2xl py-3 font-bold text-sm data-[state=active]:bg-primary data-[state=active]:text-white">Pubblica Sfida</TabsTrigger>
            <TabsTrigger value="my" className="rounded-2xl py-3 font-bold text-sm data-[state=active]:bg-primary data-[state=active]:text-white">Le mie Sfide</TabsTrigger>
          </TabsList>

          <TabsContent value="others" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {loading ? (
                [1, 2, 3].map(i => <Skeleton key={i} className="h-80 w-full rounded-[2rem]" />)
              ) : othersRequests.length === 0 ? (
                <div className="col-span-full text-center py-24 bg-white/50 rounded-[2.5rem] border-2 border-dashed border-gray-100">
                  <Users className="mx-auto h-16 w-16 mb-4 text-gray-200" />
                  <p className="text-xl font-black text-gray-900 tracking-tight">Nessuna sfida attiva</p>
                  <p className="text-gray-500 font-medium mt-2">Sii il primo a rompere il ghiaccio!</p>
                </div>
              ) : (
                othersRequests.map(r => (
                  <Card key={r.id} className="group border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] rounded-[2rem] transition-all duration-500 bg-white overflow-hidden hover:-translate-y-2">
                    <div className="h-1.5 w-full bg-club-orange"></div>
                    <CardContent className="p-8">
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <h3 className="text-2xl font-black text-gray-900 tracking-tight">{profiles[r.user_id]}</h3>
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Sfidante</p>
                        </div>
                        <Badge className="bg-primary/10 text-primary border-none font-bold px-3 py-1 rounded-full uppercase text-[10px] tracking-wider">
                          {r.match_type}
                        </Badge>
                      </div>

                      <div className="space-y-4 bg-gray-50/50 p-6 rounded-[1.5rem] border border-gray-100 mb-8">
                        <div className="flex items-center gap-3">
                          <div className="bg-white p-2 rounded-lg shadow-sm text-club-orange"><Calendar size={16}/></div>
                          <span className="text-sm font-bold text-gray-700 capitalize">{format(parseISO(r.requested_date), 'EEEE dd MMMM', { locale: it })}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="bg-white p-2 rounded-lg shadow-sm text-club-orange"><Clock size={16}/></div>
                          <span className="text-sm font-bold text-gray-700">{r.preferred_time_start} - {r.preferred_time_end}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="bg-white p-2 rounded-lg shadow-sm text-club-orange"><MapPin size={16}/></div>
                          <span className="text-sm font-bold text-primary">{r.court?.name}</span>
                        </div>
                      </div>

                      {r.notes && (
                        <div className="mb-8 px-2">
                          <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest mb-1">Messaggio</p>
                          <p className="text-sm text-gray-500 italic leading-relaxed">"{r.notes}"</p>
                        </div>
                      )}

                      <Button 
                        className="w-full h-14 rounded-2xl bg-white border-2 border-gray-100 text-gray-900 font-black hover:border-primary/20 hover:bg-primary/5 hover:text-primary transition-all flex items-center justify-between px-6"
                        onClick={() => navigate('/match-booking', { state: { matchRequest: r, opponentName: profiles[r.user_id] } })}
                      >
                        Accetta Sfida
                        <ChevronRight size={18} className="transition-transform group-hover:translate-x-1" />
                      </Button>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="publish" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className="max-w-3xl mx-auto border-none shadow-[0_20px_40px_rgba(0,0,0,0.04)] rounded-[2.5rem] bg-white overflow-hidden">
              <div className="bg-primary p-10 text-center relative overflow-hidden">
                <Zap className="absolute -top-10 -right-10 h-40 w-40 text-white/10 rotate-12" />
                <div className="bg-white/20 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 backdrop-blur-md">
                  <PlusCircle className="text-white h-10 w-10" />
                </div>
                <CardTitle className="text-white text-3xl font-black tracking-tight">Proponi una Partita</CardTitle>
                <p className="text-white/70 font-medium mt-2">Trova il tuo prossimo avversario nel club</p>
              </div>

              <CardContent className="p-8 sm:p-12">
                <form onSubmit={handleSubmitRequest} className="space-y-10">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <Label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Data</Label>
                      <Input 
                        type="date" 
                        value={requestedDate} 
                        onChange={e => setRequestedDate(e.target.value)} 
                        required 
                        min={new Date().toISOString().split('T')[0]} 
                        className="h-14 rounded-2xl border-gray-100 bg-gray-50/50 focus:ring-primary/20 focus:border-primary text-base font-medium px-6"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Campo</Label>
                      <Select value={selectedCourtId} onValueChange={setSelectedCourtId}>
                        <SelectTrigger className="h-14 rounded-2xl border-gray-100 bg-gray-50/50 focus:ring-primary/20 focus:border-primary text-base font-medium px-6">
                          <SelectValue placeholder="Scegli Campo" />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl">
                          {courts.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <Label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Inizio</Label>
                      <Select value={preferredTimeStart} onValueChange={setPreferredTimeStart}>
                        <SelectTrigger className="h-14 rounded-2xl border-gray-100 bg-gray-50/50 focus:ring-primary/20 focus:border-primary text-base font-medium px-6">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl">
                          {timeSlots.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-3">
                      <Label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Fine</Label>
                      <Select value={preferredTimeEnd} onValueChange={setPreferredTimeEnd}>
                        <SelectTrigger className="h-14 rounded-2xl border-gray-100 bg-gray-50/50 focus:ring-primary/20 focus:border-primary text-base font-medium px-6">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl">
                          {timeSlots.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <Label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Tipo Match</Label>
                      <div className="flex gap-2">
                        {(['singolare', 'doppio'] as MatchType[]).map(type => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setMatchType(type)}
                            className={cn(
                              "flex-1 h-14 rounded-2xl text-sm font-black uppercase tracking-widest transition-all border-2",
                              matchType === type 
                                ? "bg-primary border-primary text-white shadow-lg shadow-primary/10" 
                                : "bg-white border-gray-100 text-gray-400 hover:border-primary/20 hover:text-primary"
                            )}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <Label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Livello</Label>
                      <Select value={skillLevel} onValueChange={v => setSkillLevel(v as SkillLevel)}>
                        <SelectTrigger className="h-14 rounded-2xl border-gray-100 bg-gray-50/50 focus:ring-primary/20 focus:border-primary text-base font-medium px-6">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl">
                          {Object.entries(skillLevelLabels).map(([val, label]) => (
                            <SelectItem key={val} value={val}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Note / Messaggio</Label>
                    <Textarea 
                      placeholder="Es: Cerco qualcuno per un allenamento intenso..." 
                      value={notes} 
                      onChange={e => setNotes(e.target.value)} 
                      className="rounded-2xl border-gray-100 bg-gray-50/50 focus:ring-primary/20 focus:border-primary text-base font-medium p-6 min-h-[120px]"
                    />
                  </div>

                  <div className="pt-6">
                    <Button 
                      type="submit" 
                      className="w-full h-16 rounded-[1.5rem] bg-gradient-to-br from-primary to-[#23532f] text-xl font-black shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-[0.98] transition-all flex items-center justify-center gap-3" 
                      disabled={submitting}
                    >
                      {submitting ? <Loader2 className="animate-spin" /> : <>Pubblica Sfida <ChevronRight size={24}/></>}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="my" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {loading ? (
                [1, 2, 3].map(i => <Skeleton key={i} className="h-48 w-full rounded-[2rem]" />)
              ) : myRequests.length === 0 ? (
                <div className="col-span-full text-center py-24 bg-white/50 rounded-[2.5rem] border-2 border-dashed border-gray-100">
                  <Calendar className="mx-auto h-16 w-16 mb-4 text-gray-200" />
                  <p className="text-xl font-black text-gray-900 tracking-tight">Ancora nessuna proposta</p>
                </div>
              ) : (
                myRequests.map(r => (
                  <Card key={r.id} className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white overflow-hidden opacity-90">
                    <CardContent className="p-8">
                      <div className="flex justify-between items-center mb-6">
                        <Badge className={cn(
                          "font-bold px-3 py-1 rounded-full uppercase text-[10px] tracking-wider border-none",
                          r.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                        )}>
                          {r.status === 'open' ? 'Aperta' : 'Abbinata'}
                        </Badge>
                        <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">{format(parseISO(r.created_at), 'dd/MM/yy')}</span>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 text-sm font-bold text-gray-700">
                          <Calendar size={14} className="text-club-orange"/> {format(parseISO(r.requested_date), 'dd/MM/yyyy')}
                        </div>
                        <div className="flex items-center gap-3 text-sm font-bold text-gray-700">
                          <Clock size={14} className="text-club-orange"/> {r.preferred_time_start} - {r.preferred_time_end}
                        </div>
                        <div className="flex items-center gap-3 text-sm font-bold text-primary">
                          <MapPin size={14}/> {r.court?.name}
                        </div>
                      </div>
                      {r.status === 'open' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-6 w-full rounded-2xl border-destructive/30 text-destructive hover:bg-destructive/5 hover:border-destructive font-bold text-xs"
                          disabled={cancellingId === r.id}
                          onClick={() => setChallengeToCancel(r)}
                        >
                          {cancellingId === r.id ? (
                            <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                          ) : (
                            <X className="h-3 w-3 mr-2" />
                          )}
                          Annulla Sfida
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
      <Footer />

      <AlertDialog open={!!challengeToCancel} onOpenChange={(open) => { if (!open) setChallengeToCancel(null); }}>
        <AlertDialogContent className="rounded-[2rem] border-none shadow-2xl">
          <AlertDialogHeader>
            <div className="mx-auto w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
              <X className="h-8 w-8 text-destructive" />
            </div>
            <AlertDialogTitle className="text-center text-xl font-black">Annulla sfida</AlertDialogTitle>
            <AlertDialogDescription className="text-center text-gray-500">
              Sei sicuro di voler ritirare questa proposta di sfida?
              {challengeToCancel && (
                <span className="block mt-2 font-bold text-gray-700">
                  {format(parseISO(challengeToCancel.requested_date), 'EEEE d MMMM', { locale: it })} · {challengeToCancel.preferred_time_start}–{challengeToCancel.preferred_time_end}
                </span>
              )}
              <span className="block mt-1 text-xs text-destructive font-semibold">La proposta sarà rimossa dalla bacheca.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3">
            <AlertDialogCancel className="h-12 flex-1 rounded-2xl font-bold" onClick={() => setChallengeToCancel(null)}>
              Mantieni
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-12 flex-1 rounded-2xl bg-destructive hover:bg-destructive/90 font-bold"
              onClick={() => {
                if (challengeToCancel) {
                  handleCancelChallenge(challengeToCancel);
                  setChallengeToCancel(null);
                }
              }}
            >
              Annulla Sfida
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FindMatch;
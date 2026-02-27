"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format, parseISO, addDays, subDays, startOfDay, endOfDay, isSameDay, setHours, setMinutes, addHours, differenceInMinutes } from "date-fns";
import { it } from "date-fns/locale";
import { 
  ArrowLeft, ChevronLeft, ChevronRight, Eye, Edit, Trash2, Plus, X, Calendar, Clock, User
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

import type { Court, Reservation } from "@/types/supabase";

type ProfileLite = { id: string; full_name: string | null };

type ReservationRow = Reservation & {
  court?: Court;
  bookedByName: string;
  groupId?: string; 
};

const TIME_SLOTS = [
  "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", 
  "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"
];

const SURFACE_COLORS: Record<string, string> = {
  "terra_rossa": "bg-orange-100 text-orange-800",
  "erba_sintetica": "bg-green-100 text-green-800",
  "superficie_dura": "bg-blue-100 text-blue-800",
};

const SURFACE_LABELS: Record<string, string> = {
  "terra_rossa": "Terra Rossa",
  "erba_sintetica": "Erba Sint.",
  "superficie_dura": "Sup. Dura",
};

const SLOT_COLORS = [
  "bg-green-100 border-green-200 text-green-800",
  "bg-blue-100 border-blue-200 text-blue-800",
  "bg-purple-100 border-purple-200 text-purple-800",
  "bg-amber-100 border-amber-200 text-amber-800",
  "bg-cyan-100 border-cyan-200 text-cyan-800",
  "bg-lime-100 border-lime-200 text-lime-800",
  "bg-indigo-100 border-indigo-200 text-indigo-800",
  "bg-teal-100 border-teal-200 text-teal-800",
];

const groupReservations = (reservations: ReservationRow[]): ReservationRow[] => {
  if (reservations.length === 0) return [];
  const sorted = [...reservations].sort((a, b) => {
    if (a.court_id !== b.court_id) return a.court_id - b.court_id;
    if (a.user_id !== b.user_id) return a.user_id.localeCompare(b.user_id);
    return parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime();
  });
  const grouped: ReservationRow[] = [];
  let currentGroup: ReservationRow[] = [];
  let groupId = 1;
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    if (currentGroup.length === 0) currentGroup.push(current);
    else {
      const lastInGroup = currentGroup[currentGroup.length - 1];
      const lastEnd = parseISO(lastInGroup.ends_at);
      const currentStart = parseISO(current.starts_at);
      const isConsecutive = 
        current.court_id === lastInGroup.court_id &&
        current.user_id === lastInGroup.user_id &&
        Math.abs(differenceInMinutes(currentStart, lastEnd)) <= 5;
      if (isConsecutive) currentGroup.push(current);
      else {
        currentGroup.forEach(res => grouped.push({ ...res, groupId: `group-${groupId}` }));
        groupId++;
        currentGroup = [current];
      }
    }
  }
  if (currentGroup.length > 0) currentGroup.forEach(res => grouped.push({ ...res, groupId: `group-${groupId}` }));
  return grouped;
};

const getGroupColor = (groupId: string): string => {
  if (!groupId) return SLOT_COLORS[0];
  const hash = groupId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return SLOT_COLORS[hash % SLOT_COLORS.length];
};

export default function AdminReservations() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [courts, setCourts] = useState<Court[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [visibleCourts, setVisibleCourts] = useState<number[]>([]);
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);

  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<ReservationRow | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [formCourtId, setFormCourtId] = useState("");
  const [formStartTime, setFormStartTime] = useState("");
  const [formDuration, setFormDuration] = useState("1");
  const [formNotes, setFormNotes] = useState("");

  const refreshAll = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return navigate("/login");
      setCurrentUserId(user.id);
      
      const { data: prof } = await supabase.from("profiles").select("is_admin").eq('id', user.id).single();
      if (!prof?.is_admin) return navigate("/dashboard");
      setIsAdmin(true);

      const [courtsData, profilesData, resData] = await Promise.all([
        supabase.from("courts").select("*").eq("is_active", true).order("id"),
        supabase.from("profiles").select("id, full_name").order("full_name"),
        supabase.from("reservations").select("*").gte("starts_at", startOfDay(selectedDate).toISOString()).lte("ends_at", endOfDay(selectedDate).toISOString()).neq("status", "cancelled")
      ]);

      const profileMap = new Map(profilesData.data?.map(p => [p.id, p.full_name || "Socio"]) || []);
      const courtMap = new Map(courtsData.data?.map(c => [c.id, c]) || []);

      setCourts(courtsData.data || []);
      setProfiles(profilesData.data || []);
      
      // Solo all'inizializzazione o se la lista visibile è vuota, mostriamo tutti
      if (visibleCourts.length === 0) {
        setVisibleCourts((courtsData.data || []).map(c => c.id));
      }
      
      const reservationsWithNames = (resData.data || []).map(r => ({
        ...r,
        court: courtMap.get(r.court_id),
        bookedByName: profileMap.get(r.user_id) || "Socio",
      }));
      setReservations(groupReservations(reservationsWithNames));
    } catch (err: any) {
      showError("Errore nel caricamento: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refreshAll(); }, [selectedDate]);

  const getReservationForSlot = (courtId: number, time: string): ReservationRow | null => {
    const slotStart = setMinutes(setHours(startOfDay(selectedDate), parseInt(time.split(':')[0])), parseInt(time.split(':')[1] || '0'));
    return reservations.find(r => r.court_id === courtId && isSameDay(parseISO(r.starts_at), selectedDate) && format(parseISO(r.starts_at), 'HH:mm') === time) || null;
  };

  const handlePrevDay = () => setSelectedDate(subDays(selectedDate, 1));
  const handleNextDay = () => setSelectedDate(addDays(selectedDate, 1));
  const handleToday = () => setSelectedDate(new Date());

  // Nuova logica: Se clicchi un campo specifico, vedi solo quello. Se clicchi "Tutti", vedi tutti.
  const handleCourtFilter = (courtId: number | 'all') => {
    if (courtId === 'all') {
      setVisibleCourts(courts.map(c => c.id));
    } else {
      setVisibleCourts([courtId]);
    }
  };

  const openViewDialog = (res: ReservationRow) => { setSelectedReservation(res); setViewDialogOpen(true); };
  const openEditDialog = (res: ReservationRow) => {
    setSelectedReservation(res);
    setFirstName(res.booked_for_first_name || "");
    setLastName(res.booked_for_last_name || "");
    setFormCourtId(String(res.court_id));
    setFormStartTime(format(parseISO(res.starts_at), 'HH:mm'));
    setFormDuration("1");
    setFormNotes(res.notes || "");
    setEditDialogOpen(true);
  };
  const openCreateDialog = (courtId: number, time: string) => {
    setFirstName(""); setLastName(""); setFormCourtId(String(courtId));
    setFormStartTime(time); setFormDuration("1"); setFormNotes("");
    setCreateDialogOpen(true);
  };
  const openDeleteDialog = (res: ReservationRow) => { setSelectedReservation(res); setDeleteDialogOpen(true); };

  const handleCreate = async () => {
    if (!firstName || !lastName || !formCourtId || !formStartTime) return showError("Compila i campi obbligatori.");
    setLoading(true);
    try {
      const start = setMinutes(setHours(startOfDay(selectedDate), parseInt(formStartTime.split(':')[0])), parseInt(formStartTime.split(':')[1] || '0'));
      const duration = parseInt(formDuration);
      const inserts = [];
      for (let i = 0; i < duration; i++) {
        const s = addHours(start, i);
        inserts.push({
          court_id: parseInt(formCourtId), user_id: currentUserId,
          starts_at: s.toISOString(), ends_at: addHours(s, 1).toISOString(),
          status: 'confirmed', notes: formNotes.trim() || null,
          booked_for_first_name: firstName.trim(), booked_for_last_name: lastName.trim(),
        });
      }
      const { error } = await supabase.from('reservations').insert(inserts);
      if (error) throw error;
      showSuccess("Prenotazione creata!");
      setCreateDialogOpen(false);
      refreshAll();
    } catch (err: any) { showError(err.message); } finally { setLoading(false); }
  };

  const handleEdit = async () => {
    if (!selectedReservation || !firstName || !lastName || !formCourtId || !formStartTime) return showError("Compila i campi obbligatori.");
    setLoading(true);
    try {
      const start = setMinutes(setHours(startOfDay(selectedDate), parseInt(formStartTime.split(':')[0])), parseInt(formStartTime.split(':')[1] || '0'));
      const { error } = await supabase.from('reservations').update({
        court_id: parseInt(formCourtId), booked_for_first_name: firstName.trim(), booked_for_last_name: lastName.trim(),
        starts_at: start.toISOString(), ends_at: addHours(start, 1).toISOString(),
        notes: formNotes.trim() || null, updated_at: new Date().toISOString()
      }).eq('id', selectedReservation.id);
      if (error) throw error;
      showSuccess("Aggiornata!");
      setEditDialogOpen(false);
      refreshAll();
    } catch (err: any) { showError(err.message); } finally { setLoading(false); }
  };

  const handleDelete = async () => {
    if (!selectedReservation) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('reservations').delete().eq('id', selectedReservation.id);
      if (error) throw error;
      showSuccess("Eliminata!");
      setDeleteDialogOpen(false);
      refreshAll();
    } catch (err: any) { showError(err.message); } finally { setLoading(false); }
  };

  if (!isAdmin && !loading) return null;
  const visibleCourtsList = courts.filter(c => visibleCourts.includes(c.id));

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      {/* Header Premium con Navigazione Distinta */}
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center">
          {/* Back button isolato */}
          <Link to="/admin" className="mr-auto group">
            <Button variant="ghost" size="sm" className="rounded-xl text-gray-500 hover:text-primary hover:bg-primary/5 px-3">
              <ArrowLeft className="h-5 w-5 mr-2 group-hover:-translate-x-1 transition-transform" />
              <span className="font-bold">Admin</span>
            </Button>
          </Link>
          
          {/* Blocco Navigazione Calendario Centrato */}
          <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-2xl border border-gray-100">
            <Button variant="ghost" size="icon" onClick={handlePrevDay} className="h-10 w-10 text-primary hover:bg-white hover:shadow-sm rounded-xl">
              <ChevronLeft className="h-6 w-6" />
            </Button>
            
            <div className="flex flex-col items-center min-w-[180px] px-4 cursor-pointer" onClick={handleToday}>
              <span className="text-[10px] font-black uppercase tracking-widest text-primary/60 leading-none mb-1">
                {isSameDay(selectedDate, new Date()) ? 'OGGI' : 'DATA'}
              </span>
              <span className="text-sm font-black text-gray-900 capitalize">
                {format(selectedDate, 'EEEE, dd MMMM', { locale: it })}
              </span>
            </div>
            
            <Button variant="ghost" size="icon" onClick={handleNextDay} className="h-10 w-10 text-primary hover:bg-white hover:shadow-sm rounded-xl">
              <ChevronRight className="h-6 w-6" />
            </Button>
          </div>
          
          {/* Spacer per bilanciamento */}
          <div className="ml-auto w-[100px]" />
        </div>
      </header>

      {/* Filtri Campi con Logica Switch */}
      <div className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-[73px] z-40 shadow-sm">
        <div className="container mx-auto px-6 py-3">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide py-1">
            <button
              onClick={() => handleCourtFilter('all')}
              className={cn(
                "px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all duration-300",
                visibleCourts.length === courts.length 
                  ? "bg-primary text-white shadow-lg shadow-primary/20 scale-105" 
                  : "bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
              )}
            >
              Tutti i Campi
            </button>
            <div className="w-px h-8 bg-gray-100 mx-2 self-center" />
            {courts.map(court => (
              <button
                key={court.id}
                onClick={() => handleCourtFilter(court.id)}
                className={cn(
                  "px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all duration-300",
                  visibleCourts.length === 1 && visibleCourts.includes(court.id) 
                    ? "bg-club-orange text-white shadow-lg shadow-club-orange/20 scale-105" 
                    : "bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600 border border-gray-100"
                )}
              >
                {court.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="container mx-auto px-6 py-8">
          <div className="flex gap-2">
            {/* Timeline */}
            <div className="sticky left-0 z-30 bg-[#F8FAFC]/80 backdrop-blur-sm pr-4 pt-16" style={{ width: '80px' }}>
              {TIME_SLOTS.map(time => (
                <div key={time} className="h-28 flex items-start justify-end pr-3 text-[11px] font-black text-gray-400 tracking-tighter">
                  {time}
                </div>
              ))}
            </div>

            {/* Grid */}
            <div className="flex-1 flex gap-6">
              {visibleCourtsList.map(court => (
                <div key={court.id} className="flex-1 min-w-[240px] animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="h-14 mb-4 bg-white rounded-2xl shadow-sm p-3 flex items-center justify-between border border-gray-50 group hover:border-primary/20 transition-all">
                    <div>
                      <h3 className="font-black text-gray-900 text-sm leading-none">{court.name}</h3>
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                        {SURFACE_LABELS[court.surface] || court.surface}
                      </p>
                    </div>
                    <div className={cn("w-2 h-2 rounded-full", court.is_active ? "bg-green-500" : "bg-gray-300")} />
                  </div>

                  {TIME_SLOTS.map(time => {
                    const res = getReservationForSlot(court.id, time);
                    const slotKey = `${court.id}-${time}`;
                    const isHovered = hoveredSlot === slotKey;
                    const slotColor = res ? getGroupColor(res.groupId || '') : "";

                    return (
                      <div
                        key={time}
                        className={cn(
                          "h-28 mb-3 rounded-[1.5rem] transition-all duration-300 relative overflow-hidden",
                          res 
                            ? cn("shadow-md border border-white/20 cursor-pointer", slotColor)
                            : "bg-white/50 border-2 border-dashed border-gray-100 hover:border-primary/30 hover:bg-white cursor-pointer group"
                        )}
                        onMouseEnter={() => setHoveredSlot(slotKey)}
                        onMouseLeave={() => setHoveredSlot(null)}
                        onClick={() => !res && openCreateDialog(court.id, time)}
                      >
                        {res ? (
                          <>
                            <div className="p-4 h-full flex flex-col">
                              <div className="flex items-center justify-between mb-1">
                                <p className="font-black text-gray-900 text-sm truncate uppercase tracking-tight">
                                  {res.booked_for_first_name} {res.booked_for_last_name}
                                </p>
                              </div>
                              <p className="text-[10px] font-bold opacity-70 flex items-center gap-1">
                                <Clock size={10} /> {time} - {format(parseISO(res.ends_at), 'HH:mm')}
                              </p>
                              <div className="mt-auto flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-black/20" />
                                <span className="text-[9px] font-black uppercase opacity-40">Prenotazione Socio</span>
                              </div>
                            </div>

                            <div className={cn(
                              "absolute bottom-2 right-2 flex gap-1.5 transition-all duration-300",
                              isHovered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
                            )}>
                              <button onClick={(e) => { e.stopPropagation(); openViewDialog(res); }} className="w-8 h-8 rounded-xl bg-white/90 shadow-sm flex items-center justify-center hover:scale-110 active:scale-95 text-gray-700">
                                <Eye className="h-4 w-4" />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); openEditDialog(res); }} className="w-8 h-8 rounded-xl bg-white/90 shadow-sm flex items-center justify-center hover:scale-110 active:scale-95 text-primary">
                                <Edit className="h-4 w-4" />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); openDeleteDialog(res); }} className="w-8 h-8 rounded-xl bg-white/90 shadow-sm flex items-center justify-center hover:scale-110 active:scale-95 text-red-600">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="h-full flex items-center justify-center">
                            <Plus className="h-6 w-6 text-gray-200 group-hover:text-primary/40 group-hover:scale-125 transition-all duration-500" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CRUD Dialogs rimangono invariati nella logica ma con stile premium */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem] border-none shadow-2xl p-8">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-primary uppercase tracking-tight">Scheda Prenotazione</DialogTitle>
            <DialogDescription className="text-sm font-medium text-gray-500">Dettagli completi del match selezionato</DialogDescription>
          </DialogHeader>
          {selectedReservation && (
            <div className="space-y-6 py-4">
              <div className="bg-gray-50 rounded-2xl p-6 grid grid-cols-2 gap-6 border border-gray-100">
                <div>
                  <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Socio</Label>
                  <p className="font-bold text-gray-900 text-lg">{selectedReservation.booked_for_first_name} {selectedReservation.booked_for_last_name}</p>
                </div>
                <div>
                  <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Campo</Label>
                  <p className="font-bold text-gray-900 text-lg">{selectedReservation.court?.name}</p>
                </div>
                <div>
                  <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Orario</Label>
                  <p className="font-bold text-primary text-lg">
                    {format(parseISO(selectedReservation.starts_at), 'HH:mm')} - {format(parseISO(selectedReservation.ends_at), 'HH:mm')}
                  </p>
                </div>
                <div>
                  <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Creato da</Label>
                  <p className="font-bold text-gray-700 text-sm">{selectedReservation.bookedByName}</p>
                </div>
              </div>
              {selectedReservation.notes && (
                <div className="px-4">
                  <Label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Note Amministrative</Label>
                  <p className="text-sm text-gray-600 italic mt-1 leading-relaxed">"{selectedReservation.notes}"</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)} className="rounded-xl font-bold h-12 w-full border-gray-200">Chiudi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem] border-t-8 border-t-primary shadow-2xl p-8">
          <DialogHeader className="pb-4">
            <DialogTitle className="text-2xl font-black text-primary uppercase tracking-tight">Nuova Prenotazione</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-gray-500 ml-1">Nome</Label>
                <Input value={firstName} onChange={e => setFirstName(e.target.value)} className="h-12 rounded-xl border-gray-200 focus:ring-primary/20" placeholder="Mario" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-gray-500 ml-1">Cognome</Label>
                <Input value={lastName} onChange={e => setLastName(e.target.value)} className="h-12 rounded-xl border-gray-200 focus:ring-primary/20" placeholder="Rossi" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-gray-500 ml-1">Inizio</Label>
                <Select value={formStartTime} onValueChange={setFormStartTime}>
                  <SelectTrigger className="h-12 rounded-xl border-gray-200"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-xl">{TIME_SLOTS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-gray-500 ml-1">Durata</Label>
                <Select value={formDuration} onValueChange={setFormDuration}>
                  <SelectTrigger className="h-12 rounded-xl border-gray-200"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="1">1 ora</SelectItem><SelectItem value="2">2 ore</SelectItem><SelectItem value="3">3 ore</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-500 ml-1">Note</Label>
              <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} className="rounded-xl border-gray-200 min-h-[80px]" placeholder="Aggiungi info..." />
            </div>
          </div>
          <DialogFooter className="gap-3 pt-6">
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} className="h-12 flex-1 rounded-xl font-bold">Annulla</Button>
            <Button onClick={handleCreate} disabled={loading || !firstName || !lastName} className="h-12 flex-1 rounded-xl bg-primary hover:bg-[#357a46] font-bold shadow-lg shadow-primary/20">Crea</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem] border-t-8 border-t-club-orange shadow-2xl p-8">
          <DialogHeader className="pb-4"><DialogTitle className="text-2xl font-black text-club-orange uppercase tracking-tight">Modifica Match</DialogTitle></DialogHeader>
          <div className="space-y-6">
             <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-gray-500 ml-1">Nome</Label>
                <Input value={firstName} onChange={e => setFirstName(e.target.value)} className="h-12 rounded-xl border-gray-200" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-gray-500 ml-1">Cognome</Label>
                <Input value={lastName} onChange={e => setLastName(e.target.value)} className="h-12 rounded-xl border-gray-200" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-500 ml-1">Orario Inizio</Label>
              <Select value={formStartTime} onValueChange={setFormStartTime}>
                <SelectTrigger className="h-12 rounded-xl border-gray-200"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-xl">{TIME_SLOTS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-500 ml-1">Note</Label>
              <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} className="rounded-xl border-gray-200 min-h-[80px]" />
            </div>
          </div>
          <DialogFooter className="gap-3 pt-6">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} className="h-12 flex-1 rounded-xl font-bold">Annulla</Button>
            <Button onClick={handleEdit} disabled={loading} className="h-12 flex-1 rounded-xl bg-club-orange hover:bg-orange-600 font-bold shadow-lg shadow-club-orange/20">Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="rounded-[2.5rem] p-8">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-black text-gray-900">Eliminare Prenotazione?</AlertDialogTitle>
            <AlertDialogDescription className="text-base font-medium">L'azione è definitiva e lo slot tornerà disponibile per tutti i soci.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 mt-4">
            <AlertDialogCancel className="h-12 flex-1 rounded-xl font-bold">Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="h-12 flex-1 rounded-xl bg-red-600 hover:bg-red-700 font-bold">Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
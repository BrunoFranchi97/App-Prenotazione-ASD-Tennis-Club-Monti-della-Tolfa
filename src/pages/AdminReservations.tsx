"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format, parseISO, addDays, subDays, startOfDay, endOfDay, isSameDay, setHours, setMinutes, addHours, differenceInMinutes } from "date-fns";
import { it } from "date-fns/locale";
import { 
  ArrowLeft, ChevronLeft, ChevronRight, Eye, Edit, Trash2, Plus, Clock, MapPin
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
      {/* Header Mobile-Optimized con Navigazione Centrata */}
      <header className="bg-white/90 backdrop-blur-md border-b border-gray-100 shadow-sm sticky top-0 z-50 px-4 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          {/* Back Icon Button */}
          <Link to="/admin">
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full text-gray-400 hover:text-primary hover:bg-gray-100">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          
          {/* Selettore Data Centrato e Compatto */}
          <div className="flex items-center gap-1 bg-gray-50/80 p-1 rounded-2xl border border-gray-100 shadow-inner">
            <Button variant="ghost" size="icon" onClick={handlePrevDay} className="h-9 w-9 text-primary hover:bg-white hover:shadow-sm rounded-xl">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            
            <div className="flex flex-col items-center min-w-[110px] px-2 cursor-pointer select-none" onClick={handleToday}>
              <span className="text-[9px] font-black uppercase tracking-widest text-primary/50 leading-none mb-0.5">
                {isSameDay(selectedDate, new Date()) ? 'OGGI' : 'DATA'}
              </span>
              <span className="text-sm font-black text-gray-900 capitalize">
                {format(selectedDate, 'EEE d MMM', { locale: it })}
              </span>
            </div>
            
            <Button variant="ghost" size="icon" onClick={handleNextDay} className="h-9 w-9 text-primary hover:bg-white hover:shadow-sm rounded-xl">
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
          
          {/* Empty Space for Balance */}
          <div className="w-10" />
        </div>
      </header>

      {/* Filtri Campi Capsule Style */}
      <div className="bg-white/80 backdrop-blur-md border-b border-gray-50 sticky top-[65px] z-40">
        <div className="px-4 py-2.5 overflow-x-auto scrollbar-hide">
          <div className="flex gap-2 items-center">
            <button
              onClick={() => handleCourtFilter('all')}
              className={cn(
                "px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex-shrink-0",
                visibleCourts.length === courts.length 
                  ? "bg-primary text-white shadow-lg shadow-primary/20 scale-105" 
                  : "bg-gray-100 text-gray-400 hover:bg-gray-200"
              )}
            >
              TUTTI I CAMPI
            </button>
            <div className="w-px h-6 bg-gray-200 flex-shrink-0" />
            {courts.map(court => {
              const isSelected = visibleCourts.length === 1 && visibleCourts.includes(court.id);
              return (
                <button
                  key={court.id}
                  onClick={() => handleCourtFilter(court.id)}
                  className={cn(
                    "px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex-shrink-0 border",
                    isSelected 
                      ? "bg-club-orange border-club-orange text-white shadow-lg shadow-club-orange/20 scale-105" 
                      : "bg-white border-gray-100 text-gray-400 hover:bg-gray-50"
                  )}
                >
                  {court.name.split(' ').pop()}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="container mx-auto px-4 py-6">
          <div className="flex gap-2">
            {/* Timeline */}
            <div className="sticky left-0 z-30 bg-[#F8FAFC]/80 backdrop-blur-sm pr-3 pt-14" style={{ width: '60px' }}>
              {TIME_SLOTS.map(time => (
                <div key={time} className="h-28 flex items-start justify-end pr-2 text-[10px] font-black text-gray-400">
                  {time}
                </div>
              ))}
            </div>

            {/* Grid */}
            <div className="flex-1 flex gap-4 overflow-x-auto">
              {visibleCourtsList.map(court => (
                <div key={court.id} className="flex-1 min-w-[220px] animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="h-12 mb-3 bg-white rounded-2xl shadow-sm p-3 flex items-center justify-between border border-gray-100">
                    <h3 className="font-black text-gray-900 text-[11px] uppercase tracking-wider">{court.name}</h3>
                    <div className={cn("w-1.5 h-1.5 rounded-full", court.is_active ? "bg-green-500" : "bg-gray-300")} />
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
                          "h-28 mb-2 rounded-2xl transition-all duration-300 relative overflow-hidden",
                          res 
                            ? cn("shadow-sm border border-white/20 cursor-pointer", slotColor)
                            : "bg-white/40 border-2 border-dashed border-gray-100 hover:border-primary/20 hover:bg-white cursor-pointer group"
                        )}
                        onMouseEnter={() => setHoveredSlot(slotKey)}
                        onMouseLeave={() => setHoveredSlot(null)}
                        onClick={() => !res && openCreateDialog(court.id, time)}
                      >
                        {res ? (
                          <>
                            <div className="p-3 h-full flex flex-col">
                              <p className="font-black text-gray-900 text-[11px] truncate uppercase">
                                {res.booked_for_first_name} {res.booked_for_last_name}
                              </p>
                              <p className="text-[9px] font-bold opacity-60 mt-0.5">
                                {time} - {format(parseISO(res.ends_at), 'HH:mm')}
                              </p>
                            </div>

                            <div className={cn(
                              "absolute bottom-2 right-2 flex gap-1 transition-all duration-300",
                              isHovered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
                            )}>
                              <button onClick={(e) => { e.stopPropagation(); openViewDialog(res); }} className="w-7 h-7 rounded-lg bg-white/90 shadow-sm flex items-center justify-center text-gray-700">
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); openEditDialog(res); }} className="w-7 h-7 rounded-lg bg-white/90 shadow-sm flex items-center justify-center text-primary">
                                <Edit className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); openDeleteDialog(res); }} className="w-7 h-7 rounded-lg bg-white/90 shadow-sm flex items-center justify-center text-red-600">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="h-full flex items-center justify-center">
                            <Plus className="h-5 w-5 text-gray-200 group-hover:text-primary/30" />
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

      {/* CRUD Dialogs */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-[90vw] rounded-[2rem] border-none shadow-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-primary uppercase">Dettaglio Match</DialogTitle>
          </DialogHeader>
          {selectedReservation && (
            <div className="space-y-4 py-2">
              <div className="bg-gray-50 rounded-2xl p-4 grid grid-cols-2 gap-4 border border-gray-100">
                <div><Label className="text-[9px] font-black text-gray-400 uppercase">Socio</Label><p className="font-bold text-gray-900 text-sm">{selectedReservation.booked_for_first_name} {selectedReservation.booked_for_last_name}</p></div>
                <div><Label className="text-[9px] font-black text-gray-400 uppercase">Campo</Label><p className="font-bold text-gray-900 text-sm">{selectedReservation.court?.name}</p></div>
                <div><Label className="text-[9px] font-black text-gray-400 uppercase">Orario</Label><p className="font-bold text-primary text-sm">{format(parseISO(selectedReservation.starts_at), 'HH:mm')} - {format(parseISO(selectedReservation.ends_at), 'HH:mm')}</p></div>
                <div><Label className="text-[9px] font-black text-gray-400 uppercase">Creato da</Label><p className="font-bold text-gray-700 text-[10px]">{selectedReservation.bookedByName}</p></div>
              </div>
              {selectedReservation.notes && <p className="text-xs text-gray-500 italic px-2">"{selectedReservation.notes}"</p>}
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setViewDialogOpen(false)} className="rounded-xl h-12 w-full">Chiudi</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-[90vw] rounded-[2rem] border-t-4 border-t-primary shadow-2xl p-6">
          <DialogHeader className="pb-2"><DialogTitle className="text-xl font-black text-primary uppercase">Nuova Prenotazione</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-[10px] font-bold text-gray-400">Nome</Label><Input value={firstName} onChange={e => setFirstName(e.target.value)} className="h-10 rounded-xl" /></div>
              <div className="space-y-1"><Label className="text-[10px] font-bold text-gray-400">Cognome</Label><Input value={lastName} onChange={e => setLastName(e.target.value)} className="h-10 rounded-xl" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px] font-bold text-gray-400">Inizio</Label>
                <Select value={formStartTime} onValueChange={setFormStartTime}><SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger><SelectContent className="rounded-xl">{TIME_SLOTS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold text-gray-400">Durata</Label>
                <Select value={formDuration} onValueChange={setFormDuration}><SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger><SelectContent className="rounded-xl"><SelectItem value="1">1 ora</SelectItem><SelectItem value="2">2 ore</SelectItem><SelectItem value="3">3 ore</SelectItem></SelectContent></Select>
              </div>
            </div>
            <div className="space-y-1"><Label className="text-[10px] font-bold text-gray-400">Note</Label><Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} className="rounded-xl min-h-[60px] text-xs" /></div>
          </div>
          <DialogFooter className="gap-2 pt-4"><Button variant="outline" onClick={() => setCreateDialogOpen(false)} className="h-11 flex-1 rounded-xl">Annulla</Button><Button onClick={handleCreate} disabled={loading || !firstName} className="h-11 flex-1 rounded-xl bg-primary">Crea</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-[90vw] rounded-[2rem] border-t-4 border-t-club-orange shadow-2xl p-6">
          <DialogHeader className="pb-2"><DialogTitle className="text-xl font-black text-club-orange uppercase">Modifica Match</DialogTitle></DialogHeader>
          <div className="space-y-4">
             <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-[10px] font-bold text-gray-400">Nome</Label><Input value={firstName} onChange={e => setFirstName(e.target.value)} className="h-10 rounded-xl" /></div>
              <div className="space-y-1"><Label className="text-[10px] font-bold text-gray-400">Cognome</Label><Input value={lastName} onChange={e => setLastName(e.target.value)} className="h-10 rounded-xl" /></div>
            </div>
            <div className="space-y-1"><Label className="text-[10px] font-bold text-gray-400">Orario</Label><Select value={formStartTime} onValueChange={setFormStartTime}><SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger><SelectContent className="rounded-xl">{TIME_SLOTS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label className="text-[10px] font-bold text-gray-400">Note</Label><Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} className="rounded-xl min-h-[60px] text-xs" /></div>
          </div>
          <DialogFooter className="gap-2 pt-4"><Button variant="outline" onClick={() => setEditDialogOpen(false)} className="h-11 flex-1 rounded-xl">Annulla</Button><Button onClick={handleEdit} className="h-11 flex-1 rounded-xl bg-club-orange">Salva</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="max-w-[90vw] rounded-[2rem] p-6 text-center">
          <AlertDialogHeader><AlertDialogTitle className="text-xl font-black">Eliminare?</AlertDialogTitle><AlertDialogDescription className="text-sm">L'azione è definitiva.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-4"><AlertDialogCancel className="h-11 flex-1 rounded-xl">No</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="h-11 flex-1 rounded-xl bg-red-600">Sì, elimina</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
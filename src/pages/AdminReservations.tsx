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
  groupId?: string; // ID del gruppo per prenotazioni consecutive
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

// Palette di colori pastello senza rosso/arancione per evitare segnali di urgenza
const SLOT_COLORS = [
  "bg-green-100 border-green-200 text-green-800",      // Verde chiaro (coerente con il club)
  "bg-blue-100 border-blue-200 text-blue-800",         // Blu chiaro
  "bg-purple-100 border-purple-200 text-purple-800",   // Viola chiaro
  "bg-amber-100 border-amber-200 text-amber-800",      // Ambra chiaro (sostituisce l'arancione)
  "bg-cyan-100 border-cyan-200 text-cyan-800",         // Ciano chiaro
  "bg-lime-100 border-lime-200 text-lime-800",         // Lime chiaro
  "bg-indigo-100 border-indigo-200 text-indigo-800",   // Indigo chiaro
  "bg-teal-100 border-teal-200 text-teal-800",         // Teal chiaro
];

// Funzione per raggruppare prenotazioni consecutive dello stesso utente sullo stesso campo
const groupReservations = (reservations: ReservationRow[]): ReservationRow[] => {
  if (reservations.length === 0) return [];
  
  // Ordina per campo, utente e orario di inizio
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
    
    if (currentGroup.length === 0) {
      // Inizia un nuovo gruppo
      currentGroup.push(current);
    } else {
      const lastInGroup = currentGroup[currentGroup.length - 1];
      const lastEnd = parseISO(lastInGroup.ends_at);
      const currentStart = parseISO(current.starts_at);
      
      // Controlla se è una prenotazione consecutiva:
      // Stesso campo, stesso utente, e inizia entro 5 minuti dalla fine della precedente
      const isConsecutive = 
        current.court_id === lastInGroup.court_id &&
        current.user_id === lastInGroup.user_id &&
        Math.abs(differenceInMinutes(currentStart, lastEnd)) <= 5;
      
      if (isConsecutive) {
        currentGroup.push(current);
      } else {
        // Assegna groupId a tutte le prenotazioni nel gruppo corrente
        currentGroup.forEach(res => {
          grouped.push({ ...res, groupId: `group-${groupId}` });
        });
        
        // Inizia un nuovo gruppo
        groupId++;
        currentGroup = [current];
      }
    }
  }
  
  // Aggiungi l'ultimo gruppo
  if (currentGroup.length > 0) {
    currentGroup.forEach(res => {
      grouped.push({ ...res, groupId: `group-${groupId}` });
    });
  }
  
  return grouped;
};

// Funzione per ottenere un colore consistente per un gruppo di prenotazioni
const getGroupColor = (groupId: string): string => {
  if (!groupId) return SLOT_COLORS[0];
  
  // Crea un hash semplice dal groupId per ottenere un colore consistente
  const hash = groupId.split('').reduce((acc, char) => {
    return acc + char.charCodeAt(0);
  }, 0);
  
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

  // CRUD Dialogs
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<ReservationRow | null>(null);
  const [createSlotData, setCreateSlotData] = useState<{ courtId: number; time: string } | null>(null);

  // Form states - MODIFICATO: rimossa formUserId, aggiunti firstName e lastName
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
      setVisibleCourts((courtsData.data || []).map(c => c.id));
      
      // Raggruppa le prenotazioni prima di impostarle
      const reservationsWithNames = (resData.data || []).map(r => ({
        ...r,
        court: courtMap.get(r.court_id),
        bookedByName: profileMap.get(r.user_id) || "Socio",
      }));
      
      const groupedReservations = groupReservations(reservationsWithNames);
      setReservations(groupedReservations);
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

  const toggleCourtVisibility = (courtId: number) => {
    setVisibleCourts(prev => prev.includes(courtId) ? prev.filter(id => id !== courtId) : [...prev, courtId]);
  };

  const openViewDialog = (res: ReservationRow) => {
    setSelectedReservation(res);
    setViewDialogOpen(true);
  };

  const openEditDialog = (res: ReservationRow) => {
    setSelectedReservation(res);
    // Per la modifica, precompiliamo con i dati esistenti
    setFirstName(res.booked_for_first_name || "");
    setLastName(res.booked_for_last_name || "");
    setFormCourtId(String(res.court_id));
    setFormStartTime(format(parseISO(res.starts_at), 'HH:mm'));
    setFormDuration("1");
    setFormNotes(res.notes || "");
    setEditDialogOpen(true);
  };

  const openCreateDialog = (courtId: number, time: string) => {
    setCreateSlotData({ courtId, time });
    setFirstName("");
    setLastName("");
    setFormCourtId(String(courtId));
    setFormStartTime(time);
    setFormDuration("1");
    setFormNotes("");
    setCreateDialogOpen(true);
  };

  const openDeleteDialog = (res: ReservationRow) => {
    setSelectedReservation(res);
    setDeleteDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!firstName || !lastName || !formCourtId || !formStartTime) {
      showError("Compila tutti i campi obbligatori: Nome, Cognome e Orario.");
      return;
    }
    
    setLoading(true);
    try {
      const [hours, minutes] = formStartTime.split(':').map(Number);
      const start = setMinutes(setHours(startOfDay(selectedDate), hours), minutes);
      const duration = parseInt(formDuration);
      
      const inserts = [];
      for (let i = 0; i < duration; i++) {
        const s = addHours(start, i);
        const e = addHours(s, 1);
        inserts.push({
          court_id: parseInt(formCourtId),
          user_id: currentUserId, // Usa l'ID dell'amministratore corrente
          starts_at: s.toISOString(),
          ends_at: e.toISOString(),
          status: 'confirmed',
          notes: formNotes.trim() || null,
          booked_for_first_name: firstName.trim(),
          booked_for_last_name: lastName.trim(),
        });
      }
      
      const { error } = await supabase.from('reservations').insert(inserts);
      if (error) throw error;
      showSuccess("Prenotazione creata!");
      setCreateDialogOpen(false);
      refreshAll();
    } catch (err: any) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedReservation || !firstName || !lastName || !formCourtId || !formStartTime) {
      showError("Compila tutti i campi obbligatori.");
      return;
    }
    
    setLoading(true);
    try {
      const [hours, minutes] = formStartTime.split(':').map(Number);
      const start = setMinutes(setHours(startOfDay(selectedDate), hours), minutes);
      const end = addHours(start, 1);
      
      const { error } = await supabase.from('reservations').update({
        court_id: parseInt(formCourtId),
        booked_for_first_name: firstName.trim(),
        booked_for_last_name: lastName.trim(),
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        notes: formNotes.trim() || null,
        updated_at: new Date().toISOString()
      }).eq('id', selectedReservation.id);
      
      if (error) throw error;
      showSuccess("Prenotazione aggiornata!");
      setEditDialogOpen(false);
      refreshAll();
    } catch (err: any) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedReservation) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('reservations').delete().eq('id', selectedReservation.id);
      if (error) throw error;
      showSuccess("Prenotazione eliminata!");
      setDeleteDialogOpen(false);
      refreshAll();
    } catch (err: any) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin && !loading) return null;

  const visibleCourtsList = courts.filter(c => visibleCourts.includes(c.id));

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      {/* Header con navigazione giorno - stile identico all'app */}
      <header className="bg-primary text-white shadow-lg sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/admin">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handlePrevDay} className="text-white hover:bg-white/10">
              <ChevronLeft className="h-6 w-6" />
            </Button>
            
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={handleToday}
              className="rounded-full px-4 py-1 bg-white/20 hover:bg-white/30 text-white font-bold text-xs uppercase tracking-wider"
            >
              Oggi
            </Button>
            
            <h1 className="text-xl font-bold capitalize min-w-[200px] text-center">
              {format(selectedDate, 'EEEE, dd MMM', { locale: it })}
            </h1>
            
            <Button variant="ghost" size="icon" onClick={handleNextDay} className="text-white hover:bg-white/10">
              <ChevronRight className="h-6 w-6" />
            </Button>
          </div>
          
          <div className="w-10" /> {/* Spacer for symmetry */}
        </div>
      </header<dyad-write path="src/pages/AdminReservations.tsx" description="Continua il file AdminReservations.tsx con il resto del codice">
      {/* Quick filter tabs */}
      <div className="bg-white border-b border-gray-100 sticky top-[72px] z-40 shadow-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setVisibleCourts(courts.map(c => c.id))}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all",
                visibleCourts.length === courts.length 
                  ? "bg-primary text-white shadow-md" 
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              Tutti i Campi
            </button>
            {courts.map(court => (
              <button
                key={court.id}
                onClick={() => toggleCourtVisibility(court.id)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all",
                  visibleCourts.includes(court.id) 
                    ? "bg-primary text-white shadow-md" 
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                {court.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Griglia principale */}
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto px-4 py-6">
          <div className="flex gap-0">
            {/* Colonna orari sticky */}
            <div className="sticky left-0 z-30 bg-[#F8FAFC] pr-2" style={{ width: '80px' }}>
              <div className="h-16" /> {/* Header spacer */}
              {TIME_SLOTS.map(time => (
                <div key={time} className="h-24 flex items-center justify-end pr-3 text-sm font-bold text-gray-500">
                  {time}
                </div>
              ))}
            </div>

            {/* Colonne campi */}
            <div className="flex-1 flex gap-4">
              {visibleCourtsList.map(court => (
                <div key={court.id} className="flex-1 min-w-[200px]">
                  {/* Header colonna campo */}
                  <div className="h-16 mb-2 bg-white rounded-2xl shadow-sm p-3 flex flex-col justify-center border border-gray-100">
                    <h3 className="font-black text-gray-900 text-sm mb-1">{court.name}</h3>
                    <Badge className={cn("text-[10px] font-bold uppercase w-fit", SURFACE_COLORS[court.surface] || "bg-gray-100 text-gray-800")}>
                      {SURFACE_LABELS[court.surface] || court.surface}
                    </Badge>
                  </div>

                  {/* Slot orari */}
                  {TIME_SLOTS.map(time => {
                    const reservation = getReservationForSlot(court.id, time);
                    const slotKey = `${court.id}-${time}`;
                    const isHovered = hoveredSlot === slotKey;
                    const isMine = reservation?.user_id === currentUserId;
                    const slotColor = reservation ? getGroupColor(reservation.groupId || '') : "";

                    return (
                      <div
                        key={time}
                        className={cn(
                          "h-24 mb-2 rounded-xl transition-all duration-200 relative group",
                          reservation 
                            ? cn("shadow-md cursor-pointer hover:shadow-lg hover:scale-[0.97]", slotColor)
                            : "bg-white/40 border-2 border-dashed border-gray-200 hover:border-primary/40 hover:bg-white/60 cursor-pointer"
                        )}
                        onMouseEnter={() => setHoveredSlot(slotKey)}
                        onMouseLeave={() => setHoveredSlot(null)}
                        onClick={() => !reservation && openCreateDialog(court.id, time)}
                      >
                        {reservation ? (
                          <>
                            <div className="p-3 h-full flex flex-col justify-between">
                              <div>
                                <div className="flex items-center gap-1 mb-1">
                                  {isMine && <span className="text-yellow-500">⭐</span>}
                                  <p className="font-bold text-gray-900 text-sm truncate">
                                    {reservation.bookedByName}
                                  </p>
                                </div>
                                <p className="text-xs text-gray-700 font-medium">
                                  {format(parseISO(reservation.starts_at), 'HH:mm')} - {format(parseISO(reservation.ends_at), 'HH:mm')}
                                </p>
                                {reservation.booked_for_first_name && (
                                  <p className="text-xs text-gray-600 mt-1">
                                    Per: {reservation.booked_for_first_name} {reservation.booked_for_last_name}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Icon overlay CRUD - appare solo su hover */}
                            <div className={cn(
                              "absolute top-2 right-2 flex gap-1 transition-opacity duration-200",
                              isHovered ? "opacity-100" : "opacity-0"
                            )}>
                              <button
                                onClick={(e) => { e.stopPropagation(); openViewDialog(reservation); }}
                                className="w-7 h-7 rounded-md bg-white/90 backdrop-blur-sm shadow-md flex items-center justify-center hover:bg-white transition-all"
                              >
                                <Eye className="h-3.5 w-3.5 text-gray-700" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); openEditDialog(reservation); }}
                                className="w-7 h-7 rounded-md bg-white/90 backdrop-blur-sm shadow-md flex items-center justify-center hover:bg-white transition-all"
                              >
                                <Edit className="h-3.5 w-3.5 text-primary" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); openDeleteDialog(reservation); }}
                                className="w-7 h-7 rounded-md bg-white/90 backdrop-blur-sm shadow-md flex items-center justify-center hover:bg-white transition-all"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-red-600" />
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="h-full flex items-center justify-center">
                            <Plus className="h-5 w-5 text-gray-300 group-hover:text-primary transition-colors" />
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

      {/* Dialog Visualizza */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-primary">Dettagli Prenotazione</DialogTitle>
            <DialogDescription>Informazioni complete sulla prenotazione selezionata</DialogDescription>
          </DialogHeader>
          {selectedReservation && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-bold text-gray-400 uppercase">Prenotato da</Label>
                  <p className="font-bold text-gray-900">{selectedReservation.bookedByName}</p>
                </div>
                <div>
                  <Label className="text-xs font-bold text-gray-400 uppercase">Campo</Label>
                  <p className="font-bold text-gray-900">{selectedReservation.court?.name}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-bold text-gray-400 uppercase">Orario</Label>
                  <p className="font-bold text-gray-900">
                    {format(parseISO(selectedReservation.starts_at), 'HH:mm')} - {format(parseISO(selectedReservation.ends_at), 'HH:mm')}
                  </p>
                </div>
                <div>
                  <Label className="text-xs font-bold text-gray-400 uppercase">Data</Label>
                  <p className="font-bold text-gray-900 capitalize">
                    {format(parseISO(selectedReservation.starts_at), 'dd MMM yyyy', { locale: it })}
                  </p>
                </div>
              </div>
              {(selectedReservation.booked_for_first_name || selectedReservation.booked_for_last_name) && (
                <div>
                  <Label className="text-xs font-bold text-gray-400 uppercase">Prenotato per</Label>
                  <p className="font-bold text-gray-900">
                    {selectedReservation.booked_for_first_name} {selectedReservation.booked_for_last_name}
                  </p>
                </div>
              )}
              {selectedReservation.notes && (
                <div>
                  <Label className="text-xs font-bold text-gray-400 uppercase">Note</Label>
                  <p className="text-sm text-gray-700 italic">{selectedReservation.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)} className="rounded-xl">
              Chiudi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Crea - MODIFICATO: rimossa selezione soci, aggiunti campi Nome e Cognome */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl border-t-8 border-t-primary">
          <DialogHeader className="pb-4">
            <DialogTitle className="text-primary text-2xl font-bold flex items-center gap-2">
              <User className="h-6 w-6" /> Nuova Prenotazione
            </DialogTitle>
            <DialogDescription className="text-gray-600">
              Aggiungi una prenotazione per questo slot
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-2">
            {/* Nome e Cognome */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700">Nome *</Label>
                <Input 
                  value={firstName} 
                  onChange={e => setFirstName(e.target.value)} 
                  className="h-12 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary"
                  placeholder="Mario"
                  maxLength={50}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700">Cognome *</Label>
                <Input 
                  value={lastName} 
                  onChange={e => setLastName(e.target.value)} 
                  className="h-12 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary"
                  placeholder="Rossi"
                  maxLength={50}
                />
              </div>
            </div>

            {/* Campo */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">Campo *</Label>
              <Select value={formCourtId} onValueChange={setFormCourtId}>
                <SelectTrigger className="h-12 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary">
                  <SelectValue placeholder="Seleziona campo" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {courts.map(c => (
                    <SelectItem key={c.id} value={String(c.id)} className="py-3">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Orario e Durata */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-club-orange" /> Orario Inizio *
                </Label>
                <div className="relative">
                  <Select value={formStartTime} onValueChange={setFormStartTime}>
                    <SelectTrigger className="h-12 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl max-h-60">
                      {TIME_SLOTS.map(time => (
                        <SelectItem 
                          key={time} 
                          value={time}
                          className="py-3 hover:bg-primary/5 data-[state=checked]:bg-primary/10 data-[state=checked]:text-primary"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{time}</span>
                            <span className="text-xs text-gray-400">ora</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700">Durata *</Label>
                <Select value={formDuration} onValueChange={setFormDuration}>
                  <SelectTrigger className="h-12 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="1" className="py-3">1 ora</SelectItem>
                    <SelectItem value="2" className="py-3">2 ore</SelectItem>
                    <SelectItem value="3" className="py-3">3 ore</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Note */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">Note (opzionale)</Label>
              <Textarea 
                value={formNotes} 
                onChange={e => setFormNotes(e.target.value)} 
                className="rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary min-h-[100px]"
                placeholder="Aggiungi note sulla prenotazione..."
                maxLength={500}
              />
            </div>
          </div>

          <DialogFooter className="gap-3 pt-4">
            <Button 
              variant="outline" 
              onClick={() => setCreateDialogOpen(false)} 
              className="rounded-xl border-gray-200 hover:bg-gray-50 h-12 font-semibold"
            >
              Annulla
            </Button>
            <Button 
              onClick={handleCreate} 
              disabled={loading || !firstName || !lastName || !formCourtId || !formStartTime}
              className={cn(
                "rounded-xl h-12 font-bold transition-all",
                loading || !firstName || !lastName || !formCourtId || !formStartTime
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-gradient-to-br from-primary to-[#23532f] hover:from-[#357a46] hover:to-[#23532f] text-white shadow-lg shadow-primary/20 hover:shadow-primary/30"
              )}
            >
              {loading ? "Creazione..." : "Crea Prenotazione"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Modifica - MODIFICATO: simile al create */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl border-t-8 border-t-primary">
          <DialogHeader className="pb-4">
            <DialogTitle className="text-primary text-2xl font-bold flex items-center gap-2">
              <Edit className="h-6 w-6" /> Modifica Prenotazione
            </DialogTitle>
            <DialogDescription className="text-gray-600">
              Aggiorna i dettagli della prenotazione
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-2">
            {/* Nome e Cognome */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700">Nome *</Label>
                <Input 
                  value={firstName} 
                  onChange={e => setFirstName(e.target.value)} 
                  className="h-12 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary"
                  placeholder="Mario"
                  maxLength={50}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700">Cognome *</Label>
                <Input 
                  value={lastName} 
                  onChange={e => setLastName(e.target.value)} 
                  className="h-12 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary"
                  placeholder="Rossi"
                  maxLength={50}
                />
              </div>
            </div>

            {/* Campo */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">Campo *</Label>
              <Select value={formCourtId} onValueChange={setFormCourtId}>
                <SelectTrigger className="h-12 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {courts.map(c => (
                    <SelectItem key={c.id} value={String(c.id)} className="py-3">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Orario */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Clock className="h-4 w-4 text-club-orange" /> Orario Inizio *
              </Label>
              <div className="relative">
                <Select value={formStartTime} onValueChange={setFormStartTime}>
                  <SelectTrigger className="h-<dyad-write path="src/pages/AdminReservations.tsx" description="Completa il file AdminReservations.tsx con la parte finale del dialog modifica">
                  <SelectTrigger className="h-12 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl max-h-60">
                    {TIME_SLOTS.map(time => (
                      <SelectItem 
                        key={time} 
                        value={time}
                        className="py-3 hover:bg-primary/5 data-[state=checked]:bg-primary/10 data-[state=checked]:text-primary"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{time}</span>
                          <span className="text-xs text-gray-400">ora</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Note */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">Note (opzionale)</Label>
              <Textarea 
                value={formNotes} 
                onChange={e => setFormNotes(e.target.value)} 
                className="rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary min-h-[100px]"
                placeholder="Aggiungi note sulla prenotazione..."
                maxLength={500}
              />
            </div>
          </div>

          <DialogFooter className="gap-3 pt-4">
            <Button 
              variant="outline" 
              onClick={() => setEditDialogOpen(false)} 
              className="rounded-xl border-gray-200 hover:bg-gray-50 h-12 font-semibold"
            >
              Annulla
            </Button>
            <Button 
              onClick={handleEdit} 
              disabled={loading || !firstName || !lastName || !formCourtId || !formStartTime}
              className={cn(
                "rounded-xl h-12 font-bold transition-all",
                loading || !firstName || !lastName || !formCourtId || !formStartTime
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-gradient-to-br from-primary to-[#23532f] hover:from-[#357a46] hover:to-[#23532f] text-white shadow-lg shadow-primary/20 hover:shadow-primary/30"
              )}
            >
              {loading ? "Salvataggio..." : "Salva Modifiche"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Elimina */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma Eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare questa prenotazione? Questa azione è irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="rounded-xl bg-red-600 hover:bg-red-700">
              Elimina Definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
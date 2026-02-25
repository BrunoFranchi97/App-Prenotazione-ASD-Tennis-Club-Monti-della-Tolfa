"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format, parseISO, isSameDay, startOfDay, isBefore } from "date-fns";
import { it } from "date-fns/locale";
import { 
  ArrowLeft, Eye, LogOut, PlusCircle, RefreshCw, Search, Trash2, 
  Clock, MapPin, Users, AlertCircle, ChevronDown, ChevronUp, 
  Filter, Trophy, CalendarDays, Edit
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { showError, showSuccess } from "@/utils/toast";
import { cleanReservationNotes } from "@/utils/noteCleaner";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import ReservationFormDialog from "@/components/admin/ReservationFormDialog";
import ReservationDetailsDialog from "@/components/admin/ReservationDetailsDialog";

import type { Court, Reservation, BookingType } from "@/types/supabase";

type ProfileLite = { id: string; full_name: string | null };

type ReservationRow = Reservation & {
  court?: Court;
  bookedByName: string;
  bookedForName: string;
};

interface ReservationGroup {
  id: string;
  user_id: string;
  court_id: number;
  date: Date;
  reservations: ReservationRow[];
  startTime: string;
  endTime: string;
  totalHours: number;
  status: string;
  bookedByName: string;
  bookedForName: string;
  court?: Court;
  bookingType: BookingType;
  notes?: string;
}

function groupReservations(reservations: ReservationRow[]): ReservationGroup[] {
  if (reservations.length === 0) return [];
  
  const sorted = [...reservations].sort((a, b) => {
    const aDate = parseISO(a.starts_at);
    const bDate = parseISO(b.starts_at);
    if (!isSameDay(aDate, bDate)) return aDate.getTime() - bDate.getTime();
    if (a.court_id !== b.court_id) return a.court_id - b.court_id;
    return aDate.getTime() - bDate.getTime();
  });

  const groups: ReservationGroup[] = [];
  let currentGroup: ReservationGroup | null = null;

  for (const reservation of sorted) {
    const startDate = parseISO(reservation.starts_at);
    const endDate = parseISO(reservation.ends_at);
    const dateOnly = startOfDay(startDate);

    if (!currentGroup || 
        currentGroup.court_id !== reservation.court_id || 
        !isSameDay(currentGroup.date, dateOnly) || 
        currentGroup.user_id !== reservation.user_id ||
        currentGroup.bookedForName !== (reservation.booked_for_first_name ? `${reservation.booked_for_first_name} ${reservation.booked_for_last_name}` : "Se stesso")
    ) {
      currentGroup = {
        id: `group_${reservation.id}`,
        user_id: reservation.user_id,
        court_id: reservation.court_id,
        date: dateOnly,
        reservations: [reservation],
        startTime: format(startDate, 'HH:mm'),
        endTime: format(endDate, 'HH:mm'),
        totalHours: 1,
        status: reservation.status,
        bookedByName: reservation.bookedByName,
        bookedForName: reservation.booked_for_first_name && reservation.booked_for_last_name 
          ? `${reservation.booked_for_first_name} ${reservation.booked_for_last_name}` 
          : "Se stesso",
        court: reservation.court,
        bookingType: reservation.booking_type || 'singolare',
        notes: reservation.notes || undefined
      };
      groups.push(currentGroup);
    } else {
      currentGroup.reservations.push(reservation);
      currentGroup.endTime = format(endDate, 'HH:mm');
      currentGroup.totalHours = currentGroup.reservations.length;
    }
  }
  return groups;
}

export default function AdminReservations() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [courts, setCourts] = useState<Court[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [filterCourtId, setFilterCourtId] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);

  const refreshAll = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return navigate("/login");
      
      const { data: prof } = await supabase.from("profiles").select("is_admin").eq('id', user.id).single();
      if (!prof?.is_admin) return navigate("/dashboard");
      setIsAdmin(true);

      const [courtsData, profilesData, resData] = await Promise.all([
        supabase.from("courts").select("*").order("name"),
        supabase.from("profiles").select("id, full_name").order("full_name"),
        supabase.from("reservations").select("*").order("starts_at", { ascending: false })
      ]);

      const profileMap = new Map(profilesData.data?.map(p => [p.id, p.full_name || "Socio"]) || []);
      const courtMap = new Map(courtsData.data?.map(c => [c.id, c]) || []);

      setCourts(courtsData.data || []);
      setProfiles(profilesData.data || []);
      setReservations((resData.data || []).map(r => ({
        ...r,
        court: courtMap.get(r.court_id),
        bookedByName: profileMap.get(r.user_id) || "Socio",
        bookedForName: r.booked_for_first_name && r.booked_for_last_name ? `${r.booked_for_first_name} ${r.booked_for_last_name}` : "Se stesso",
      })));
    } catch (err: any) {
      showError("Errore nel caricamento: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refreshAll(); }, []);

  const groups = useMemo(() => groupReservations(reservations), [reservations]);
  const filtered = useMemo(() => groups.filter(g => {
    if (selectedDate && !isSameDay(g.date, selectedDate)) return false;
    if (filterCourtId !== "all" && String(g.court_id) !== filterCourtId) return false;
    if (search && ![g.court?.name || "", g.bookedByName, g.bookedForName].join(" ").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [groups, selectedDate, filterCourtId, search]);

  // Calcola le date con prenotazioni per il calendario
  const datesWithReservations = useMemo(() => {
    return groups.map(g => g.date);
  }, [groups]);

  const handleDeleteGroup = async (group: ReservationGroup) => {
    try {
      const ids = group.reservations.map(r => r.id);
      const { error } = await supabase.from('reservations').delete().in('id', ids);
      if (error) throw error;
      showSuccess("Prenotazione eliminata con successo!");
      refreshAll();
    } catch (err: any) {
      showError(err.message);
    }
  };

  const handleSubmitForm = async (values: any) => {
    setLoading(true);
    try {
      if (formMode === 'edit' && values.id) {
        const { error } = await supabase.from('reservations').update({
          court_id: values.court_id,
          user_id: values.user_id,
          starts_at: values.starts_at,
          ends_at: values.ends_at,
          booked_for_first_name: values.booked_for_first_name,
          booked_for_last_name: values.booked_for_last_name,
          notes: values.notes,
          updated_at: new Date().toISOString()
        }).eq('id', values.id);
        if (error) throw error;
        showSuccess("Prenotazione aggiornata!");
      } else {
        // Logica creazione (può gestire più ore)
        const start = new Date(values.starts_at);
        const end = new Date(values.ends_at);
        const hours = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60));
        
        const inserts = [];
        for (let i = 0; i < hours; i++) {
          const s = new Date(start.getTime() + (i * 3600000));
          const e = new Date(s.getTime() + 3600000);
          inserts.push({
            court_id: values.court_id,
            user_id: values.user_id,
            starts_at: s.toISOString(),
            ends_at: e.toISOString(),
            status: 'confirmed',
            booked_for_first_name: values.booked_for_first_name,
            booked_for_last_name: values.booked_for_last_name,
            notes: values.notes
          });
        }
        const { error } = await supabase.from('reservations').insert(inserts);
        if (error) throw error;
        showSuccess("Nuova prenotazione creata!");
      }
      setFormOpen(false);
      refreshAll();
    } catch (err: any) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin && !loading) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="mb-10 flex justify-between items-center max-w-7xl mx-auto">
        <div className="flex items-center gap-4">
          <Link to="/admin">
            <Button variant="outline" size="icon" className="rounded-xl border-primary text-primary hover:bg-primary/5">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-black text-primary tracking-tight">Gestione Prenotazioni</h1>
            <p className="text-sm text-gray-500 font-medium">Pannello di controllo avanzato per l'amministratore</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={refreshAll} className="rounded-xl border-primary text-primary hover:bg-primary/5">
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} /> Aggiorna
          </Button>
          <Button onClick={() => { setFormMode("create"); setSelectedReservation(null); setFormOpen(true); }} className="rounded-xl bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20">
            <PlusCircle className="mr-2 h-4 w-4" /> Nuova Prenotazione
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-7xl mx-auto">
        {/* Sidebar Filtri */}
        <aside className="lg:col-span-4 space-y-6">
          <Card className="border-none shadow-xl rounded-[2rem] overflow-hidden">
            <CardHeader className="bg-primary text-white pb-6">
              <CardTitle className="text-lg flex items-center gap-2">
                <CalendarDays className="h-5 w-5" /> Calendario
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 bg-white">
              <Calendar 
                mode="single" 
                selected={selectedDate} 
                onSelect={setSelectedDate} 
                locale={it} 
                className="mx-auto" 
                modifiers={{ 
                  hasReservations: datesWithReservations 
                }}
                modifiersStyles={{
                  hasReservations: {
                    position: 'relative',
                  }
                }}
                modifiersClassNames={{
                  hasReservations: 'relative after:content-[""] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:rounded-full after:bg-club-orange'
                }}
              />
              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-center gap-2 text-xs text-gray-500">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-club-orange"></div>
                  <span>Giorni con prenotazioni</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl rounded-[2rem] bg-white p-6 space-y-6">
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase text-gray-400 tracking-widest ml-1">Filtra Campo</Label>
              <Select value={filterCourtId} onValueChange={setFilterCourtId}>
                <SelectTrigger className="rounded-2xl h-12 bg-gray-50 border-none">
                  <SelectValue placeholder="Tutti i campi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i campi</SelectItem>
                  {courts.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase text-gray-400 tracking-widest ml-1">Cerca Socio</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
                <Input 
                  placeholder="Nome o cognome..." 
                  className="pl-10 rounded-2xl h-12 bg-gray-50 border-none"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  maxLength={50}
                />
              </div>
            </div>
          </Card>
        </aside>

        {/* Lista Prenotazioni */}
        <main className="lg:col-span-8 space-y-4">
          <div className="flex justify-between items-end mb-4 px-2">
             <h2 className="text-xl font-bold text-gray-700 capitalize">
               {selectedDate ? format(selectedDate, 'EEEE d MMMM', { locale: it }) : 'Tutte le date'}
             </h2>
             <Badge variant="outline" className="rounded-full bg-white font-bold">{filtered.length} Risultati</Badge>
          </div>

          {filtered.length === 0 ? (
            <Card className="border-2 border-dashed p-20 rounded-[2rem] text-center text-gray-400 bg-white/50">
              <AlertCircle className="mx-auto h-12 w-12 mb-4 opacity-20" />
              <p className="font-bold">Nessuna prenotazione trovata per i criteri selezionati.</p>
            </Card>
          ) : (
            filtered.map(group => (
              <Card key={group.id} className="border-none shadow-md rounded-3xl overflow-hidden bg-white hover:shadow-xl transition-all duration-300 group">
                <div className={`h-2 w-full ${group.status === 'confirmed' ? 'bg-primary' : 'bg-destructive'}`}></div>
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <Badge className={cn("rounded-lg capitalize font-bold", group.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                          {group.status}
                        </Badge>
                        <span className="text-sm font-black text-gray-400 uppercase tracking-tighter flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {group.court?.name}
                        </span>
                      </div>
                      <h3 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                        <Clock className="h-6 w-6 text-club-orange" /> {group.startTime} - {group.endTime}
                        <span className="text-xs font-medium text-gray-400">({group.totalHours}h)</span>
                      </h3>
                      <div className="flex items-center gap-2 text-sm text-gray-600 font-bold">
                        <Users className="h-4 w-4 text-primary" /> {group.bookedByName} 
                        {group.bookedForName !== "Se stesso" && <span className="text-club-orange">→ per {group.bookedForName}</span>}
                      </div>
                    </div>

                    <div className="flex gap-2 w-full md:w-auto border-t md:border-none pt-4 md:pt-0">
                      <Button variant="secondary" size="icon" className="rounded-xl" onClick={() => { setSelectedReservation(group.reservations[0]); setDetailsOpen(true); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" className="rounded-xl border-primary text-primary" onClick={() => { setSelectedReservation(group.reservations[0]); setFormMode("edit"); setFormOpen(true); }}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="icon" className="rounded-xl shadow-lg shadow-red-100">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-3xl">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Stai eliminando l'intero blocco di prenotazione ({group.totalHours} ore) di {group.bookedByName}. Questa azione non è reversibile.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="rounded-xl">Annulla</AlertDialogCancel>
                            <AlertDialogAction className="rounded-xl bg-destructive" onClick={() => handleDeleteGroup(group)}>Elimina Definitivamente</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  {group.notes && (
                    <div className="mt-4 pt-4 border-t border-gray-50 italic text-xs text-gray-500">
                      Note: "{cleanReservationNotes(group.notes)}"
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </main>
      </div>

      <ReservationFormDialog 
        open={formOpen} 
        onOpenChange={setFormOpen} 
        mode={formMode} 
        initial={selectedReservation} 
        courts={courts} 
        profiles={profiles} 
        onSubmit={handleSubmitForm} 
        loading={loading}
      />
      
      <ReservationDetailsDialog 
        open={detailsOpen} 
        onOpenChange={setDetailsOpen} 
        reservation={selectedReservation} 
        court={selectedReservation?.court_id ? courts.find(c => c.id === selectedReservation.court_id) : undefined} 
        bookedByName={selectedReservation?.user_id ? profiles.find(p => p.id === selectedReservation.user_id)?.full_name || "" : ""} 
        onEdit={() => { setDetailsOpen(false); setFormMode("edit"); setFormOpen(true); }}
      />
    </div>
  );
}
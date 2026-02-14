"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format, parseISO, isBefore, isAfter, isEqual, addHours, startOfDay, isSameDay } from "date-fns";
import { it } from "date-fns/locale";
import { ArrowLeft, Eye, LogOut, PlusCircle, RefreshCw, Search, Trash2, Edit, CalendarDays, Clock, MapPin, Users, AlertCircle, ChevronDown, ChevronUp, Filter } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { showError, showSuccess } from "@/utils/toast";
import { cleanReservationNotes } from "@/utils/noteCleaner";

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

import type { Court, Reservation } from "@/types/supabase";

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
  notes?: string;
  bookingType?: string;
}

function statusLabel(s: Reservation["status"]) {
  if (s === "confirmed") return "Confermata";
  if (s === "pending") return "In attesa";
  return "Annullata";
}

function statusBadgeClasses(s: Reservation["status"]) {
  if (s === "confirmed") return "bg-green-100 text-green-800";
  if (s === "pending") return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}

function groupReservations(reservations: ReservationRow[]): ReservationGroup[] {
  if (reservations.length === 0) return [];

  const sorted = [...reservations].sort((a, b) => {
    if (a.user_id !== b.user_id) return a.user_id.localeCompare(b.user_id);
    if (a.court_id !== b.court_id) return a.court_id - b.court_id;
    const aDate = parseISO(a.starts_at);
    const bDate = parseISO(b.starts_at);
    return aDate.getTime() - bDate.getTime();
  });

  const groups: ReservationGroup[] = [];
  let currentGroup: ReservationGroup | null = null;

  for (const reservation of sorted) {
    const startDate = parseISO(reservation.starts_at);
    const endDate = parseISO(reservation.ends_at);
    const dateOnly = startOfDay(startDate);

    if (!currentGroup) {
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
        bookedForName: reservation.bookedForName,
        court: reservation.court,
        notes: cleanReservationNotes(reservation.notes),
        bookingType: reservation.booking_type,
      };
      groups.push(currentGroup);
      continue;
    }

    const lastRes = currentGroup.reservations[currentGroup.reservations.length - 1];
    const lastEnd = parseISO(lastRes.ends_at);
    
    if (currentGroup.user_id === reservation.user_id && 
        currentGroup.court_id === reservation.court_id && 
        isSameDay(currentGroup.date, dateOnly) && 
        isEqual(lastEnd, startDate)) {
      currentGroup.reservations.push(reservation);
      currentGroup.endTime = format(endDate, 'HH:mm');
      currentGroup.totalHours = currentGroup.reservations.length;
      if (reservation.status === 'cancelled') currentGroup.status = 'cancelled';
    } else {
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
        bookedForName: reservation.bookedForName,
        court: reservation.court,
        notes: cleanReservationNotes(reservation.notes),
        bookingType: reservation.booking_type,
      };
      groups.push(currentGroup);
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
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [filterCourtId, setFilterCourtId] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [formInitial, setFormInitial] = useState<Reservation | null>(null);
  const [formSaving, setFormSaving] = useState(false);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsReservationId, setDetailsReservationId] = useState<string | null>(null);

  const detailsReservation = useMemo(() => reservations.find((r) => r.id === detailsReservationId) || null, [reservations, detailsReservationId]);
  const detailsCourt = useMemo(() => detailsReservation ? courts.find((c) => c.id === detailsReservation.court_id) : undefined, [courts, detailsReservation]);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) showError(error.message);
    else navigate("/login");
  };

  const refreshAll = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return navigate("/login");
      const { data: prof } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
      if (!prof?.is_admin) return navigate("/dashboard");
      setIsAdmin(true);

      const { data: courtsData } = await supabase.from("courts").select("*").order("name", { ascending: true });
      const { data: profilesData } = await supabase.from("profiles").select("id, full_name").order("full_name", { ascending: true });
      const { data: resData } = await supabase.from("reservations").select("*").order("starts_at", { ascending: false });

      const newCourts = (courtsData || []) as Court[];
      const newProfiles = (profilesData || []) as ProfileLite[];
      setCourts(newCourts);
      setProfiles(newProfiles);

      const profileMap = new Map(newProfiles.map(p => [p.id, p.full_name || ""]));
      const courtMap = new Map(newCourts.map(c => [c.id, c]));

      const raw = (resData || []) as Reservation[];
      setReservations(raw.map(r => ({
        ...r,
        court: courtMap.get(r.court_id),
        bookedByName: profileMap.get(r.user_id) || "Socio Sconosciuto",
        bookedForName: r.booked_for_first_name && r.booked_for_last_name ? `${r.booked_for_first_name} ${r.booked_for_last_name}` : "Se stesso",
      })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refreshAll(); }, []);

  const groups = useMemo(() => groupReservations(reservations), [reservations]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => {
      if (selectedDate && !isSameDay(g.date, selectedDate)) return false;
      if (filterCourtId !== "all" && String(g.court_id) !== filterCourtId) return false;
      if (filterStatus !== "all" && g.status !== filterStatus) return false;
      if (!q) return true;
      return [g.court?.name || "", g.bookedByName, g.bookedForName, g.notes || ""].join(" ").toLowerCase().includes(q);
    });
  }, [groups, selectedDate, filterCourtId, filterStatus, search]);

  const bookedDates = useMemo(() => groups.map(g => g.date), [groups]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("reservations").delete().eq("id", id);
    if (error) showError(error.message);
    else {
      showSuccess("Eliminata.");
      refreshAll();
    }
  };

  const upsertReservation = async (values: any) => {
    setFormSaving(true);
    try {
      const { error } = await supabase.from("reservations").upsert({
        ...values,
        status: values.status || "confirmed",
        updated_at: new Date().toISOString()
      });
      if (error) throw error;
      showSuccess("Salvato.");
      setFormOpen(false);
      refreshAll();
    } catch (e: any) {
      showError(e.message);
    } finally {
      setFormSaving(false);
    }
  };

  if (!isAdmin && !loading) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/admin">
            <Button variant="outline" size="icon" className="text-primary border-primary">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-primary sm:text-3xl">Gestione Prenotazioni</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => refreshAll()}><RefreshCw className="mr-2 h-4 w-4" /> Aggiorna</Button>
          <Button onClick={() => { setFormMode("create"); setFormInitial(null); setFormOpen(true); }} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            <PlusCircle className="mr-2 h-4 w-4" /> Nuova
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sidebar Filtri/Calendario */}
        <aside className="lg:col-span-4 space-y-6">
          <Card className="shadow-lg border-none">
            <CardHeader className="bg-primary text-primary-foreground py-4">
              <CardTitle className="text-lg">Filtro Data</CardTitle>
            </CardHeader>
            <CardContent className="p-4 bg-white">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                locale={it}
                modifiers={{ booked: bookedDates }}
                modifiersStyles={{ booked: { color: 'hsl(var(--accent))', fontWeight: 'bold' } }}
              />
            </CardContent>
          </Card>

          <Card className="shadow-lg border-none">
            <CardHeader className="py-4">
              <CardTitle className="text-lg flex items-center"><Filter className="mr-2 h-4 w-4" /> Altri Filtri</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Campo</Label>
                <Select value={filterCourtId} onValueChange={setFilterCourtId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti i campi</SelectItem>
                    {courts.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cerca Socio o Note</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome..." />
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>

        {/* Elenco Prenotazioni */}
        <main className="lg:col-span-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">
              {selectedDate ? format(selectedDate, 'dd MMMM yyyy', { locale: it }) : 'Tutte le date'}
            </h2>
            <Badge variant="secondary">{filtered.length} Risultati</Badge>
          </div>

          {loading ? (
            <div className="py-20 text-center">Caricamento...</div>
          ) : filtered.length === 0 ? (
            <Card className="py-20 text-center text-muted-foreground bg-white/50 border-dashed">
              <AlertCircle className="mx-auto h-12 w-12 mb-4 opacity-20" />
              <p>Nessuna prenotazione per i filtri selezionati.</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {filtered.map(group => {
                const isExpanded = expandedGroups[group.id];
                return (
                  <Card key={group.id} className="shadow-sm border-none overflow-hidden hover:shadow-md transition-shadow">
                    <div className="flex flex-col sm:flex-row">
                      <div className={`w-full sm:w-2 ${group.status === 'confirmed' ? 'bg-primary' : 'bg-destructive'}`}></div>
                      <div className="flex-1 p-4">
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge className={statusBadgeClasses(group.status as any)}>{statusLabel(group.status as any)}</Badge>
                              <span className="text-sm font-bold text-gray-500">{group.court?.name}</span>
                            </div>
                            <h3 className="text-lg font-bold text-gray-800 flex items-center">
                              <Clock className="mr-2 h-4 w-4 text-club-orange" /> {group.startTime} - {group.endTime}
                            </h3>
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => { setDetailsReservationId(group.reservations[0].id); setDetailsOpen(true); }}><Eye className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => { setFormMode("edit"); setFormInitial(group.reservations[0]); setFormOpen(true); }}><Edit className="h-4 w-4" /></Button>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-600">
                          <div className="flex items-center"><Users className="mr-2 h-4 w-4 text-club-orange" /> <span className="font-medium">Prenotato da:</span> <span className="ml-1 truncate">{group.bookedByName}</span></div>
                          <div className="flex items-center"><Users className="mr-2 h-4 w-4 text-club-orange" /> <span className="font-medium">Per:</span> <span className="ml-1 truncate">{group.bookedForName}</span></div>
                        </div>

                        {group.reservations.length > 1 && (
                          <div className="mt-4 pt-3 border-t">
                            <Collapsible open={isExpanded} onOpenChange={val => setExpandedGroups(prev => ({...prev, [group.id]: val}))}>
                              <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="sm" className="w-full justify-between h-8 text-xs">
                                  Contiene {group.reservations.length} slot orari
                                  {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                </Button>
                              </CollapsibleTrigger>
                              <CollapsibleContent className="space-y-2 mt-2">
                                {group.reservations.map(res => (
                                  <div key={res.id} className="flex items-center justify-between text-xs p-2 bg-gray-50 rounded">
                                    <span>{format(parseISO(res.starts_at), 'HH:mm')} - {format(parseISO(res.ends_at), 'HH:mm')}</span>
                                    <div className="flex gap-2">
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-6 w-6 text-destructive"><Trash2 className="h-3 w-3" /></Button></AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader><AlertDialogTitle>Confermi l'eliminazione?</AlertDialogTitle></AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>No</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => handleDelete(res.id)}>Sì, elimina</AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    </div>
                                  </div>
                                ))}
                              </CollapsibleContent>
                            </Collapsible>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </main>
      </div>

      <ReservationFormDialog open={formOpen} onOpenChange={setFormOpen} mode={formMode} loading={formSaving} courts={courts} profiles={profiles} initial={formInitial} onSubmit={upsertReservation} />
      <ReservationDetailsDialog open={detailsOpen} onOpenChange={setDetailsOpen} reservation={detailsReservation} court={detailsCourt} bookedByName={detailsReservation?.bookedByName || "—"} onEdit={() => { setDetailsOpen(false); setFormMode("edit"); setFormInitial(detailsReservation); setFormOpen(true); }} />
    </div>
  );
}
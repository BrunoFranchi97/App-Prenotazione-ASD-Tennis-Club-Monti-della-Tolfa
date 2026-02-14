"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format, parseISO, isSameDay, startOfDay } from "date-fns";
import { it } from "date-fns/locale";
import { ArrowLeft, Eye, LogOut, PlusCircle, RefreshCw, Search, Trash2, Edit, Clock, MapPin, Users, AlertCircle, ChevronDown, ChevronUp, Filter, MessageSquare } from "lucide-react";

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
  if (s === "confirmed") return "bg-green-100 text-green-800 border-none";
  if (s === "pending") return "bg-yellow-100 text-yellow-800 border-none";
  return "bg-red-100 text-red-800 border-none";
}

function groupReservations(reservations: ReservationRow[]): ReservationGroup[] {
  if (reservations.length === 0) return [];

  const sorted = [...reservations].sort((a, b) => {
    const aDate = parseISO(a.starts_at);
    const bDate = parseISO(b.starts_at);
    if (!isSameDay(aDate, bDate)) return aDate.getTime() - bDate.getTime();
    if (a.court_id !== b.court_id) return a.court_id - b.court_id;
    if (a.user_id !== b.user_id) return a.user_id.localeCompare(b.user_id);
    return aDate.getTime() - bDate.getTime();
  });

  const groups: ReservationGroup[] = [];
  let currentGroup: ReservationGroup | null = null;

  for (const reservation of sorted) {
    const startDate = parseISO(reservation.starts_at);
    const endDate = parseISO(reservation.ends_at);
    const dateOnly = startOfDay(startDate);

    if (!currentGroup) {
      currentGroup = createGroup(reservation, dateOnly, startDate, endDate);
      groups.push(currentGroup);
      continue;
    }

    const lastRes = currentGroup.reservations[currentGroup.reservations.length - 1];
    const lastEnd = parseISO(lastRes.ends_at);
    
    const samePerson = currentGroup.user_id === reservation.user_id && 
                      currentGroup.bookedForName === reservation.bookedForName;

    if (samePerson && currentGroup.court_id === reservation.court_id && 
        isSameDay(currentGroup.date, dateOnly) && 
        (Math.abs(startDate.getTime() - lastEnd.getTime()) < 1000)) {
      currentGroup.reservations.push(reservation);
      currentGroup.endTime = format(endDate, 'HH:mm');
      currentGroup.totalHours = currentGroup.reservations.length;
    } else {
      currentGroup = createGroup(reservation, dateOnly, startDate, endDate);
      groups.push(currentGroup);
    }
  }
  return groups;
}

function createGroup(res: ReservationRow, date: Date, start: Date, end: Date): ReservationGroup {
  return {
    id: `group_${res.id}`,
    user_id: res.user_id,
    court_id: res.court_id,
    date,
    reservations: [res],
    startTime: format(start, 'HH:mm'),
    endTime: format(end, 'HH:mm'),
    totalHours: 1,
    status: res.status,
    bookedByName: res.bookedByName,
    bookedForName: res.bookedForName,
    court: res.court,
    notes: cleanReservationNotes(res.notes),
    bookingType: res.booking_type,
  };
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
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  const [formOpen, setFormOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsReservationId, setDetailsReservationId] = useState<string | null>(null);

  const detailsReservation = useMemo(() => reservations.find((r) => r.id === detailsReservationId) || null, [reservations, detailsReservationId]);
  const detailsCourt = useMemo(() => detailsReservation ? courts.find((c) => c.id === detailsReservation.court_id) : undefined, [courts, detailsReservation]);

  const refreshAll = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return navigate("/login");
      const { data: prof } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refreshAll(); }, []);

  const groups = useMemo(() => groupReservations(reservations), [reservations]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups
      .filter((g) => {
        if (selectedDate && !isSameDay(g.date, selectedDate)) return false;
        if (filterCourtId !== "all" && String(g.court_id) !== filterCourtId) return false;
        if (filterStatus !== "all" && g.status !== filterStatus) return false;
        if (!q) return true;
        return [g.court?.name || "", g.bookedByName, g.bookedForName, g.notes || ""].join(" ").toLowerCase().includes(q);
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [groups, selectedDate, filterCourtId, filterStatus, search]);

  const bookedDates = useMemo(() => groups.map(g => g.date), [groups]);

  const handleDeleteOne = async (id: string) => {
    try {
      const { error } = await supabase.from('reservations').delete().eq('id', id);
      if (error) throw error;
      showSuccess("Ora eliminata.");
      refreshAll();
    } catch (e: any) { showError(e.message); }
  };

  const handleDeleteGroup = async (group: ReservationGroup) => {
    try {
      for (const res of group.reservations) {
        await supabase.from('reservations').delete().eq('id', res.id);
      }
      showSuccess("Intero gruppo eliminato.");
      refreshAll();
    } catch (e: any) { showError(e.message); }
  };

  const toggleGroup = (id: string) => {
    setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (!isAdmin && !loading) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/admin">
            <Button variant="outline" size="icon" className="text-primary border-primary"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <h1 className="text-2xl font-bold text-primary sm:text-3xl">Gestione Prenotazioni</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={refreshAll}><RefreshCw className="mr-2 h-4 w-4" /> Aggiorna</Button>
          <Button onClick={() => { setFormOpen(true); }} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            <PlusCircle className="mr-2 h-4 w-4" /> Nuova
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <aside className="lg:col-span-4 space-y-6">
          <Card className="shadow-lg border-none overflow-hidden">
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
              <CardTitle className="text-lg flex items-center"><Filter className="mr-2 h-4 w-4" /> Filtri</CardTitle>
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
                  <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca..." />
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>

        <main className="lg:col-span-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-700">
              {selectedDate ? format(selectedDate, 'dd MMMM yyyy', { locale: it }) : 'Tutte le date'}
            </h2>
            <Badge variant="secondary" className="bg-white">{filtered.length} {filtered.length === 1 ? 'Gruppo' : 'Gruppi'}</Badge>
          </div>

          <div className="space-y-4">
            {filtered.length === 0 ? (
              <Card className="py-20 text-center text-muted-foreground bg-white/50 border-dashed">
                <AlertCircle className="mx-auto h-12 w-12 mb-4 opacity-20" />
                <p>Nessuna prenotazione per questa data.</p>
              </Card>
            ) : (
              filtered.map(group => (
                <Collapsible key={group.id} open={openGroups[group.id]} onOpenChange={() => toggleGroup(group.id)}>
                  <Card className="shadow-sm border-none overflow-hidden hover:shadow-md transition-shadow">
                    <div className="flex flex-col sm:flex-row">
                      <div className={`w-full sm:w-2 ${group.status === 'confirmed' ? 'bg-primary' : 'bg-destructive'}`}></div>
                      <div className="flex-1 p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge className={statusBadgeClasses(group.status as any)}>{statusLabel(group.status as any)}</Badge>
                              <span className="text-sm font-bold text-gray-500">{group.court?.name}</span>
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 flex items-center">
                              <Clock className="mr-2 h-5 w-5 text-club-orange" /> {group.startTime} - {group.endTime}
                              <span className="ml-2 text-sm font-normal text-muted-foreground">({group.totalHours}h)</span>
                            </h3>
                          </div>
                          <div className="flex gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="text-blue-500 hover:bg-blue-50 focus-visible:ring-0" 
                              onClick={(e) => { e.stopPropagation(); setDetailsReservationId(group.reservations[0].id); setDetailsOpen(true); }}
                            >
                              <Eye className="h-5 w-5" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="text-primary hover:bg-green-50 focus-visible:ring-0" 
                              onClick={(e) => { e.stopPropagation(); navigate('/admin/edit-reservation', { state: { group } }); }}
                            >
                              <Edit className="h-5 w-5" />
                            </Button>
                            
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="text-destructive hover:bg-red-50 focus-visible:ring-0" 
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Trash2 className="h-5 w-5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Elimina intera prenotazione?</AlertDialogTitle>
                                  <AlertDialogDescription>Verranno eliminati tutti gli slot dalle {group.startTime} alle {group.endTime}.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteGroup(group)} className="bg-destructive text-white">Elimina Tutto</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm text-gray-600 mb-4">
                          <div className="flex items-center"><Users className="mr-2 h-4 w-4 text-club-orange" /> <span className="font-medium mr-1">Da:</span> <span className="truncate">{group.bookedByName}</span></div>
                          <div className="flex items-center"><Users className="mr-2 h-4 w-4 text-club-orange" /> <span className="font-medium mr-1">Per:</span> <span className="truncate font-semibold">{group.bookedForName}</span></div>
                        </div>

                        {group.notes && (
                          <div className="mb-4 p-2 bg-gray-50 rounded-md border-l-4 border-club-orange">
                            <div className="flex items-start">
                              <MessageSquare className="mr-2 h-4 w-4 text-club-orange shrink-0 mt-0.5" />
                              <span className="text-sm text-gray-700 italic leading-relaxed">"{group.notes}"</span>
                            </div>
                          </div>
                        )}

                        <div className="mt-2 pt-3 border-t border-gray-100">
                          <CollapsibleTrigger asChild>
                            <Button variant="link" size="sm" className="p-0 text-primary h-auto flex items-center font-semibold hover:no-underline">
                              {openGroups[group.id] ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
                              Dettaglio Ore
                            </Button>
                          </CollapsibleTrigger>
                        </div>

                        <CollapsibleContent className="mt-3 space-y-2">
                          <div className="grid grid-cols-1 gap-2">
                            {group.reservations.map((res) => (
                              <div key={res.id} className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-lg shadow-sm">
                                <div className="flex items-center gap-4">
                                  <span className="font-bold text-gray-800 text-sm">{format(parseISO(res.starts_at), 'HH:mm')} - {format(parseISO(res.ends_at), 'HH:mm')}</span>
                                  <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider py-0.5 bg-secondary/30">{res.booking_type}</Badge>
                                </div>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-destructive hover:bg-red-50" 
                                  onClick={() => handleDeleteOne(res.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </div>
                    </div>
                  </Card>
                </Collapsible>
              ))
            )}
          </div>
        </main>
      </div>

      <ReservationFormDialog open={formOpen} onOpenChange={setFormOpen} mode="create" courts={courts} profiles={profiles} onSubmit={async (v) => { await supabase.from('reservations').insert(v); refreshAll(); setFormOpen(false); }} />
      <ReservationDetailsDialog open={detailsOpen} onOpenChange={setDetailsOpen} reservation={detailsReservation} court={detailsCourt} bookedByName={detailsReservation?.bookedByName || "—"} onEdit={() => { setDetailsOpen(false); navigate('/admin/edit-reservation', { state: { group: groups.find(g => g.reservations.some(r => r.id === detailsReservation?.id)) } }); }} />
    </div>
  );
}
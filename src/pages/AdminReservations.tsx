"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format, parseISO, isSameDay, startOfDay } from "date-fns";
import { it } from "date-fns/locale";
import { ArrowLeft, Eye, LogOut, PlusCircle, RefreshCw, Search, Trash2, Clock, MapPin, Users, AlertCircle, ChevronDown, ChevronUp, Filter, Trophy } from "lucide-react";

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
}

const bookingTypeLabels: Record<BookingType, string> = {
  singolare: 'Singolare',
  doppio: 'Doppio',
  lezione: 'Lezione con Maestro'
};

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

    if (!currentGroup || currentGroup.court_id !== reservation.court_id || !isSameDay(currentGroup.date, dateOnly) || currentGroup.user_id !== reservation.user_id) {
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
        bookingType: reservation.booking_type || 'singolare',
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
  const [filterStatus, setFilterStatus] = useState<string>("all");
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
  const filtered = useMemo(() => groups.filter(g => {
    if (selectedDate && !isSameDay(g.date, selectedDate)) return false;
    if (filterCourtId !== "all" && String(g.court_id) !== filterCourtId) return false;
    if (filterStatus !== "all" && g.status !== filterStatus) return false;
    if (search && ![g.court?.name || "", g.bookedByName, g.bookedForName].join(" ").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [groups, selectedDate, filterCourtId, filterStatus, search]);

  const handleSubmitForm = async (v: any) => {
    setLoading(true);
    try {
      const { error } = v.id ? await supabase.from('reservations').update(v).eq('id', v.id) : await supabase.from('reservations').insert(v);
      if (error) throw error;
      showSuccess(v.id ? "Modificata!" : "Creata!");
      setFormOpen(false);
      refreshAll();
    } catch (e: any) { showError(e.message); }
    finally { setLoading(false); }
  };

  if (!isAdmin && !loading) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="mb-8 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Link to="/admin"><Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <h1 className="text-2xl font-bold text-primary">Prenotazioni Admin</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refreshAll}><RefreshCw className="mr-2 h-4 w-4" /> Aggiorna</Button>
          <Button onClick={() => { setFormMode("create"); setSelectedReservation(null); setFormOpen(true); }}><PlusCircle className="mr-2 h-4 w-4" /> Nuova</Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <aside className="lg:col-span-4 space-y-6">
          <Card><CardContent className="p-4"><Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} locale={it} /></CardContent></Card>
          <Card><CardContent className="p-4 space-y-4">
            <Label>Filtra Campo</Label>
            <Select value={filterCourtId} onValueChange={setFilterCourtId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tutti</SelectItem>{courts.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
            <Input maxLength={50} placeholder="Cerca socio..." value={search} onChange={e => setSearch(e.target.value)} />
          </CardContent></Card>
        </aside>

        <main className="lg:col-span-8 space-y-4">
          {filtered.length === 0 ? <Card className="p-10 text-center text-muted-foreground">Nessuna prenotazione trovata.</Card> : filtered.map(g => (
            <Card key={g.id} className="p-4 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex gap-2 items-center mb-1">
                    <Badge variant={g.status === 'confirmed' ? 'secondary' : 'destructive'}>{g.status}</Badge>
                    <span className="font-bold text-gray-500">{g.court?.name}</span>
                  </div>
                  <h3 className="text-xl font-bold flex items-center"><Clock className="mr-2 h-4 w-4" /> {g.startTime} - {g.endTime}</h3>
                  <p className="text-sm text-gray-600">Prenotato da: {g.bookedByName}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => { setSelectedReservation(g.reservations[0]); setDetailsOpen(true); }}><Eye className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => { setSelectedReservation(g.reservations[0]); setFormMode("edit"); setFormOpen(true); }}><PlusCircle className="h-4 w-4 text-blue-500" /></Button>
                </div>
              </div>
            </Card>
          ))}
        </main>
      </div>

      <ReservationFormDialog open={formOpen} onOpenChange={setFormOpen} mode={formMode} initial={selectedReservation} courts={courts} profiles={profiles} onSubmit={handleSubmitForm} />
      <ReservationDetailsDialog open={detailsOpen} onOpenChange={setDetailsOpen} reservation={selectedReservation} court={selectedReservation?.court_id ? courts.find(c => c.id === selectedReservation.court_id) : undefined} bookedByName={selectedReservation?.user_id ? profiles.find(p => p.id === selectedReservation.user_id)?.full_name || "" : ""} onEdit={() => { setDetailsOpen(false); setFormMode("edit"); setFormOpen(true); }} />
    </div>
  );
}
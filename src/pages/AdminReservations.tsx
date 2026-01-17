"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format, parseISO, isBefore } from "date-fns";
import { it } from "date-fns/locale";
import { ArrowLeft, Eye, LogOut, PlusCircle, RefreshCw, Search, Trash2, Edit, CalendarDays, Clock, MapPin, Users, AlertCircle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { showError, showSuccess } from "@/utils/toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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

import ReservationFormDialog from "@/components/admin/ReservationFormDialog";
import ReservationDetailsDialog from "@/components/admin/ReservationDetailsDialog";

import type { Court, Reservation } from "@/types/supabase";

type ProfileLite = { id: string; full_name: string | null };

type ReservationRow = Reservation & {
  court?: Court;
  bookedByName: string;
  bookedForName: string;
};

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

export default function AdminReservations() {
  const navigate = useNavigate();

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const [courts, setCourts] = useState<Court[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);

  const [filterCourtId, setFilterCourtId] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDay, setFilterDay] = useState<string>(""); // dd/MM/yyyy
  const [search, setSearch] = useState<string>("");

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [formInitial, setFormInitial] = useState<Reservation | null>(null);
  const [formSaving, setFormSaving] = useState(false);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsReservationId, setDetailsReservationId] = useState<string | null>(null);

  const detailsReservation = useMemo(() => {
    return reservations.find((r) => r.id === detailsReservationId) || null;
  }, [reservations, detailsReservationId]);

  const detailsCourt = useMemo(() => {
    if (!detailsReservation) return undefined;
    return courts.find((c) => c.id === detailsReservation.court_id);
  }, [courts, detailsReservation]);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) showError(error.message);
    else {
      showSuccess("Disconnessione effettuata con successo!");
      navigate("/login");
    }
  };

  const fetchAdminStatus = async () => {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) {
      navigate("/login");
      return false;
    }

    const { data: profile, error } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
    if (error || !profile?.is_admin) {
      showError("Accesso negato. Non sei un amministratore.");
      navigate("/dashboard");
      return false;
    }
    return true;
  };

  const fetchCourts = async () => {
    const { data, error } = await supabase.from("courts").select("*").order("name", { ascending: true });
    if (error) throw error;
    setCourts((data || []) as Court[]);
  };

  const fetchProfiles = async () => {
    const { data, error } = await supabase.from("profiles").select("id, full_name").order("full_name", { ascending: true });
    if (error) throw error;
    setProfiles((data || []) as ProfileLite[]);
  };

  const fetchReservations = async () => {
    const { data, error } = await supabase
      .from("reservations")
      .select("*")
      .order("starts_at", { ascending: false });

    if (error) throw error;

    const raw = (data || []) as Reservation[];

    const courtMap = new Map<number, Court>();
    courts.forEach((c) => courtMap.set(c.id, c));

    const profileMap = new Map<string, string>();
    profiles.forEach((p) => profileMap.set(p.id, p.full_name || ""));

    const rows: ReservationRow[] = raw.map((r) => {
      const bookedForName =
        r.booked_for_first_name && r.booked_for_last_name ? `${r.booked_for_first_name} ${r.booked_for_last_name}` : "Se stesso";

      const bookedByName = profileMap.get(r.user_id) || "Socio (nome non impostato)";

      return {
        ...r,
        court: courtMap.get(r.court_id),
        bookedByName,
        bookedForName,
      };
    });

    setReservations(rows);
  };

  const refreshAll = async () => {
    setLoading(true);
    try {
      const ok = await fetchAdminStatus();
      setIsAdmin(ok);
      if (!ok) return;

      await fetchCourts();
      await fetchProfiles();

      // fetchReservations usa courts/profiles già in state: quindi dopo averli caricati, li rileggo da DB e poi mappo.
      const { data: courtsData } = await supabase.from("courts").select("*").order("name", { ascending: true });
      const { data: profilesData } = await supabase.from("profiles").select("id, full_name").order("full_name", { ascending: true });

      const newCourts = (courtsData || []) as Court[];
      const newProfiles = (profilesData || []) as ProfileLite[];

      setCourts(newCourts);
      setProfiles(newProfiles);

      const profileMap = new Map<string, string>();
      newProfiles.forEach((p) => profileMap.set(p.id, p.full_name || ""));

      const courtMap = new Map<number, Court>();
      newCourts.forEach((c) => courtMap.set(c.id, c));

      const { data: resData, error: resErr } = await supabase.from("reservations").select("*").order("starts_at", { ascending: false });
      if (resErr) throw resErr;

      const raw = (resData || []) as Reservation[];
      const rows: ReservationRow[] = raw.map((r) => {
        const bookedForName =
          r.booked_for_first_name && r.booked_for_last_name ? `${r.booked_for_first_name} ${r.booked_for_last_name}` : "Se stesso";
        const bookedByName = profileMap.get(r.user_id) || "Socio (nome non impostato)";
        return { ...r, court: courtMap.get(r.court_id), bookedByName, bookedForName };
      });

      setReservations(rows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAll().catch((e) => {
      showError(`Errore caricamento: ${e.message || e}`);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reservations.filter((r) => {
      if (filterCourtId !== "all" && String(r.court_id) !== filterCourtId) return false;
      if (filterStatus !== "all" && r.status !== filterStatus) return false;

      if (filterDay) {
        const day = format(parseISO(r.starts_at), "dd/MM/yyyy", { locale: it });
        if (day !== filterDay) return false;
      }

      if (!q) return true;

      const hay = [
        r.court?.name || "",
        r.bookedByName,
        r.bookedForName,
        r.notes || "",
        statusLabel(r.status),
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [reservations, filterCourtId, filterStatus, filterDay, search]);

  const openCreate = () => {
    setFormMode("create");
    setFormInitial(null);
    setFormOpen(true);
  };

  const openEdit = (r: Reservation) => {
    setFormMode("edit");
    setFormInitial(r);
    setFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("reservations").delete().eq("id", id);
    if (error) {
      showError("Errore eliminazione: " + error.message);
      return;
    }
    showSuccess("Prenotazione eliminata.");
    await refreshAll();
  };

  const checkConflict = async (payload: { id?: string; court_id: number; starts_at: string; ends_at: string }) => {
    let q = supabase
      .from("reservations")
      .select("id")
      .eq("court_id", payload.court_id)
      .lt("starts_at", payload.ends_at)
      .gt("ends_at", payload.starts_at);

    if (payload.id) q = q.neq("id", payload.id);

    const { data, error } = await q;
    if (error) throw error;
    return (data || []).length > 0;
  };

  const upsertReservation = async (values: {
    id?: string;
    user_id: string;
    court_id: number;
    starts_at: string;
    ends_at: string;
    booked_for_first_name?: string | null;
    booked_for_last_name?: string | null;
    notes?: string | null;
  }) => {
    setFormSaving(true);
    try {
      const conflict = await checkConflict({
        id: values.id,
        court_id: values.court_id,
        starts_at: values.starts_at,
        ends_at: values.ends_at,
      });

      if (conflict) {
        showError("Conflitto: esiste già una prenotazione che si sovrappone per questo campo e orario.");
        return;
      }

      if (formMode === "create") {
        const { error } = await supabase.from("reservations").insert({
          user_id: values.user_id,
          court_id: values.court_id,
          starts_at: values.starts_at,
          ends_at: values.ends_at,
          status: "confirmed",
          booked_for_first_name: values.booked_for_first_name ?? null,
          booked_for_last_name: values.booked_for_last_name ?? null,
          notes: values.notes ?? null,
        });

        if (error) throw error;

        showSuccess("Prenotazione creata.");
      } else {
        const { error } = await supabase
          .from("reservations")
          .update({
            user_id: values.user_id,
            court_id: values.court_id,
            starts_at: values.starts_at,
            ends_at: values.ends_at,
            booked_for_first_name: values.booked_for_first_name ?? null,
            booked_for_last_name: values.booked_for_last_name ?? null,
            notes: values.notes ?? null,
            updated_at: new Date().toISOString() // AGGIUNTO: aggiorna il timestamp di modifica
          })
          .eq("id", values.id);

        if (error) throw error;

        showSuccess("Prenotazione aggiornata.");
      }

      setFormOpen(false);
      setFormInitial(null);
      await refreshAll();
    } catch (e: any) {
      showError("Errore salvataggio: " + (e?.message || e));
    } finally {
      setFormSaving(false);
    }
  };

  if (!isAdmin && !loading) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/admin">
            <Button variant="outline" size="icon" className="text-primary border-primary hover:bg-secondary">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-primary sm:text-3xl">Gestisci Prenotazioni</h1>
            <p className="text-sm text-muted-foreground">Ricerca, dettagli, modifica ed elimina prenotazioni su tutti i campi.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" className="text-primary border-primary hover:bg-secondary" onClick={() => refreshAll()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Aggiorna
          </Button>
          <Button variant="outline" className="text-primary border-primary hover:bg-secondary" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Esci
          </Button>
        </div>
      </header>

      <div className="mb-6 grid gap-3 lg:grid-cols-12">
        <Card className="lg:col-span-12">
          <CardHeader className="pb-3">
            <CardTitle className="text-primary">Filtri</CardTitle>
            <CardDescription>Filtra per campo, stato, giorno (dd/MM/yyyy) e testo libero.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-12">
            <div className="lg:col-span-3">
              <Label className="text-sm">Campo</Label>
              <Select value={filterCourtId} onValueChange={setFilterCourtId}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i campi</SelectItem>
                  {courts.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="lg:col-span-3">
              <Label className="text-sm">Stato</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="confirmed">Confermata</SelectItem>
                  <SelectItem value="pending">In attesa</SelectItem>
                  <SelectItem value="cancelled">Annullata</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="lg:col-span-3">
              <Label className="text-sm">Giorno (dd/MM/yyyy)</Label>
              <Input className="mt-1" value={filterDay} onChange={(e) => setFilterDay(e.target.value)} placeholder="Es. 14/01/2026" />
            </div>

            <div className="lg:col-span-3">
              <Label className="text-sm">Ricerca</Label>
              <div className="mt-1 flex items-center gap-2">
                <div className="relative w-full">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Campo, socio, note..." />
                </div>
              </div>
            </div>

            <div className="lg:col-span-12 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                Risultati: <span className="font-medium text-foreground">{filtered.length}</span>
              </div>
              <Button onClick={openCreate} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                <PlusCircle className="mr-2 h-4 w-4" />
                Nuova prenotazione
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-lg rounded-lg">
        <CardHeader>
          <CardTitle className="text-primary">Elenco prenotazioni</CardTitle>
          <CardDescription>
            {loading ? "Caricamento..." : `${filtered.length} prenotazioni trovate`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-muted-foreground">Caricamento...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <AlertCircle className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>Nessuna prenotazione trovata con i filtri attuali.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((r) => {
                const isFuture = isBefore(new Date(), parseISO(r.starts_at));
                
                return (
                  <Card key={r.id} className="border hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className={`${statusBadgeClasses(r.status)}`}>
                              {statusLabel(r.status)}
                            </Badge>
                            {!isFuture && (
                              <Badge variant="outline" className="text-xs">
                                Passata
                              </Badge>
                            )}
                          </div>
                          <h3 className="font-bold text-lg">
                            {r.court?.name || `Campo #${r.court_id}`}
                          </h3>
                          <p className="text-sm text-gray-600">
                            {format(parseISO(r.starts_at), "dd/MM/yyyy", { locale: it })}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2 mb-4">
                        <div className="flex items-center text-sm">
                          <Clock className="mr-2 h-4 w-4 text-club-orange" />
                          <span className="font-medium">Orario:</span>
                          <span className="ml-2">
                            {format(parseISO(r.starts_at), "HH:mm")} - {format(parseISO(r.ends_at), "HH:mm")}
                          </span>
                        </div>
                        
                        <div className="flex items-center text-sm">
                          <Users className="mr-2 h-4 w-4 text-club-orange" />
                          <span className="font-medium">Prenotato da:</span>
                          <span className="ml-2 truncate" title={r.bookedByName}>{r.bookedByName}</span>
                        </div>

                        <div className="flex items-center text-sm">
                          <Users className="mr-2 h-4 w-4 text-club-orange" />
                          <span className="font-medium">Prenotato per:</span>
                          <span className="ml-2 truncate" title={r.bookedForName}>{r.bookedForName}</span>
                        </div>

                        {r.notes && (
                          <div className="text-sm text-gray-700 pt-2 border-t">
                            <p className="font-medium">Note:</p>
                            <p className="text-xs mt-1 line-clamp-2">{r.notes}</p>
                          </div>
                        )}
                      </div>

                      <div className="pt-3 border-t">
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setDetailsReservationId(r.id);
                              setDetailsOpen(true);
                            }}
                            className="flex-1"
                          >
                            <Eye className="mr-2 h-4 w-4" /> Dettagli
                          </Button>
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(r)}
                            className="flex-1"
                          >
                            <Edit className="mr-2 h-4 w-4" /> Modifica
                          </Button>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="sm" className="flex-1">
                                <Trash2 className="mr-2 h-4 w-4" /> Elimina
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Eliminare la prenotazione?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Questa azione è irreversibile. Verrà rimossa la prenotazione selezionata.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annulla</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(r.id)}>Conferma</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ReservationFormDialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setFormInitial(null);
        }}
        mode={formMode}
        loading={formSaving}
        courts={courts}
        profiles={profiles}
        initial={formInitial}
        onSubmit={upsertReservation}
      />

      <ReservationDetailsDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        reservation={detailsReservation}
        court={detailsCourt}
        bookedByName={detailsReservation?.bookedByName || "—"}
        onEdit={() => {
          if (!detailsReservation) return;
          setDetailsOpen(false);
          openEdit(detailsReservation);
        }}
      />
    </div>
  );
}
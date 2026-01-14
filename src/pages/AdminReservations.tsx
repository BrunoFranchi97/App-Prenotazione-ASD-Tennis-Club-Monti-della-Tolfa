"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, LogOut, Edit, Trash2, PlusCircle, CalendarDays, Clock, MapPin, User, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { format, parseISO, addHours, isBefore, setHours, setMinutes } from 'date-fns';
import { it } from 'date-fns/locale';
import { Reservation, Court } from '@/types/supabase';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";

interface Profile {
  id: string;
  full_name: string;
  is_admin: boolean;
}

interface DetailedAdminReservation extends Reservation {
  courts: {
    name: string;
    surface: string;
  } | null;
  profiles: {
    full_name: string;
  } | null;
}

const AdminReservations = () => {
  const navigate = useNavigate();
  const [reservations, setReservations] = useState<DetailedAdminReservation[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCancelling, setIsCancelling] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState<DetailedAdminReservation | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form states for editing/creating
  const [editDate, setEditDate] = useState<Date | undefined>(new Date());
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editCourtId, setEditCourtId] = useState<string | undefined>(undefined);
  const [editUserId, setEditUserId] = useState('');
  const [editBookedForFirstName, setEditBookedForFirstName] = useState('');
  const [editBookedForLastName, setEditBookedForLastName] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        showError(error.message);
      } else {
        showSuccess("Disconnessione effettuata con successo!");
        navigate('/login');
      }
    } catch (error: any) {
      showError(error.message || "Errore durante la disconnessione.");
    }
  };

  const fetchAdminStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      if (error || !profile?.is_admin) {
        setIsAdmin(false);
        showError("Accesso negato. Non sei un amministratore.");
        navigate('/dashboard');
      } else {
        setIsAdmin(true);
      }
    } else {
      setIsAdmin(false);
      navigate('/login');
    }
  };

  const fetchAllReservations = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('reservations')
        .select(`
          *,
          courts (
            name,
            surface
          ),
          profiles (
            full_name
          )
        `)
        .order('starts_at', { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      setReservations(data as DetailedAdminReservation[]);
    } catch (err: any) {
      console.error("Errore nel caricamento delle prenotazioni:", err.message);
      setError("Errore nel caricamento delle prenotazioni: " + err.message);
      showError("Errore nel caricamento delle prenotazioni.");
    } finally {
      setLoading(false);
    }
  };

  const fetchCourts = async () => {
    const { data, error } = await supabase
      .from('courts')
      .select('*')
      .eq('is_active', true);
    if (error) {
      showError("Errore nel caricamento dei campi: " + error.message);
    } else {
      setCourts(data || []);
    }
  };

  useEffect(() => {
    fetchAdminStatus();
    fetchCourts();
    fetchAllReservations();
  }, [navigate]);

  const handleCancelReservation = async (reservationId: string) => {
    setIsCancelling(reservationId);
    try {
      const { error } = await supabase
        .from('reservations')
        .delete()
        .eq('id', reservationId);

      if (error) {
        showError("Errore durante l'annullamento della prenotazione: " + error.message);
      } else {
        showSuccess("Prenotazione annullata con successo!");
        fetchAllReservations();
      }
    } catch (err: any) {
      showError(err.message || "Errore inaspettato durante l'annullamento.");
    } finally {
      setIsCancelling(null);
    }
  };

  const handleEditClick = (reservation: DetailedAdminReservation) => {
    setIsEditing(reservation);
    setEditDate(parseISO(reservation.starts_at));
    setEditStartTime(format(parseISO(reservation.starts_at), 'HH:mm'));
    setEditEndTime(format(parseISO(reservation.ends_at), 'HH:mm'));
    setEditCourtId(reservation.court_id.toString());
    setEditUserId(reservation.user_id);
    setEditBookedForFirstName(reservation.booked_for_first_name || '');
    setEditBookedForLastName(reservation.booked_for_last_name || '');
    setEditNotes(reservation.notes || '');
  };

  const handleUpdateReservation = async () => {
    if (!isEditing || !editDate || !editCourtId || !editStartTime || !editEndTime || !editUserId) {
      showError("Compila tutti i campi richiesti.");
      return;
    }

    setLoading(true);
    try {
      let startsAt = new Date(editDate);
      startsAt = new Date(startsAt.setHours(parseInt(editStartTime.split(':')[0]), parseInt(editStartTime.split(':')[1]), 0, 0));
      let endsAt = new Date(editDate);
      endsAt = new Date(endsAt.setHours(parseInt(editEndTime.split(':')[0]), parseInt(editEndTime.split(':')[1]), 0, 0));

      const { error } = await supabase
        .from('reservations')
        .update({
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          court_id: parseInt(editCourtId),
          user_id: editUserId,
          booked_for_first_name: editBookedForFirstName || null,
          booked_for_last_name: editBookedForLastName || null,
          notes: editNotes || null,
        })
        .eq('id', isEditing.id);

      if (error) {
        showError("Errore durante l'aggiornamento della prenotazione: " + error.message);
      } else {
        showSuccess("Prenotazione aggiornata con successo!");
        setIsEditing(null);
        fetchAllReservations();
      }
    } catch (err: any) {
      showError(err.message || "Errore inaspettato durante l'aggiornamento.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateReservation = async () => {
    if (!editDate || !editCourtId || !editStartTime || !editEndTime || !editUserId) {
      showError("Compila tutti i campi richiesti per la nuova prenotazione.");
      return;
    }

    setLoading(true);
    try {
      let startsAt = new Date(editDate);
      startsAt = new Date(startsAt.setHours(parseInt(editStartTime.split(':')[0]), parseInt(editStartTime.split(':')[1]), 0, 0));
      let endsAt = new Date(editDate);
      endsAt = new Date(endsAt.setHours(parseInt(editEndTime.split(':')[0]), parseInt(editEndTime.split(':')[1]), 0, 0));

      const { error } = await supabase
        .from('reservations')
        .insert({
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          court_id: parseInt(editCourtId),
          user_id: editUserId,
          booked_for_first_name: editBookedForFirstName || null,
          booked_for_last_name: editBookedForLastName || null,
          notes: editNotes || null,
          status: 'confirmed',
        });

      if (error) {
        showError("Errore durante la creazione della prenotazione: " + error.message);
      } else {
        showSuccess("Prenotazione creata con successo!");
        setIsCreating(false);
        fetchAllReservations();
        // Clear form fields
        setEditDate(new Date());
        setEditStartTime('');
        setEditEndTime('');
        setEditCourtId(undefined);
        setEditUserId('');
        setEditBookedForFirstName('');
        setEditBookedForLastName('');
        setEditNotes('');
      }
    } catch (err: any) {
      showError(err.message || "Errore inaspettato durante la creazione.");
    } finally {
      setLoading(false);
    }
  };

  const timeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let i = 0; i < 24; i++) {
      slots.push(format(setMinutes(setHours(new Date(), i), 0), 'HH:mm'));
    }
    return slots;
  }, []);

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Accesso Negato</h1>
          <p className="text-xl text-gray-600">Non hai i permessi per accedere a questa pagina.</p>
          <Link to="/dashboard" className="text-blue-500 hover:text-blue-700 underline mt-4 block">
            Torna alla Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white p-4">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4 text-primary">Caricamento...</h1>
          <p className="text-xl text-gray-600">Recupero prenotazioni.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white p-4">
        <Card className="w-full max-w-md shadow-lg rounded-lg text-center">
          <CardHeader>
            <CardTitle className="text-destructive text-3xl font-bold">Errore</CardTitle>
            <CardDescription className="text-gray-600 mt-2">
              {error}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => window.location.reload()} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              Riprova
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center">
          <Link to="/admin" className="mr-4">
            <Button variant="outline" size="icon" className="text-primary border-primary hover:bg-secondary">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-primary">Gestione Prenotazioni</h1>
        </div>
        <Button variant="outline" className="text-primary border-primary hover:bg-secondary" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" /> Esci
        </Button>
      </header>

      <div className="mb-6 flex justify-end">
        <Dialog open={isCreating} onOpenChange={setIsCreating}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <PlusCircle className="mr-2 h-4 w-4" /> Crea Nuova Prenotazione
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Crea Nuova Prenotazione</DialogTitle>
              <DialogDescription>
                Inserisci i dettagli per la nuova prenotazione.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="create-user-id" className="text-right">ID Utente</Label>
                <Input id="create-user-id" value={editUserId} onChange={(e) => setEditUserId(e.target.value)} className="col-span-3" placeholder="ID Utente (es. UUID)" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="create-first-name" className="text-right">Nome Socio Terzo</Label>
                <Input id="create-first-name" value={editBookedForFirstName} onChange={(e) => setEditBookedForFirstName(e.target.value)} className="col-span-3" placeholder="Nome (opzionale)" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="create-last-name" className="text-right">Cognome Socio Terzo</Label>
                <Input id="create-last-name" value={editBookedForLastName} onChange={(e) => setEditBookedForLastName(e.target.value)} className="col-span-3" placeholder="Cognome (opzionale)" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="create-court" className="text-right">Campo</Label>
                <Select onValueChange={setEditCourtId} value={editCourtId} >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Seleziona un campo" />
                  </SelectTrigger>
                  <SelectContent>
                    {courts.map((court) => (
                      <SelectItem key={court.id} value={court.id.toString()}>{court.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="create-date" className="text-right">Data</Label>
                <div className="col-span-3">
                  <Calendar
                    mode="single"
                    selected={editDate}
                    onSelect={setEditDate}
                    initialFocus
                    locale={it}
                    className="rounded-md border shadow"
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="create-start-time" className="text-right">Ora Inizio</Label>
                <Select onValueChange={setEditStartTime} value={editStartTime}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Seleziona ora inizio" />
                  </SelectTrigger>
                  <SelectContent>
                    {timeSlots.map(slot => <SelectItem key={slot} value={slot}>{slot}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="create-end-time" className="text-right">Ora Fine</Label>
                <Select onValueChange={setEditEndTime} value={editEndTime}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Seleziona ora fine" />
                  </SelectTrigger>
                  <SelectContent>
                    {timeSlots.map(slot => <SelectItem key={slot} value={slot}>{slot}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="create-notes" className="text-right">Note</Label>
                <Textarea id="create-notes" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="col-span-3" placeholder="Note aggiuntive (opzionale)" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreating(false)}>Annulla</Button>
              <Button onClick={handleCreateReservation} disabled={loading}>
                {loading ? "Creazione..." : "Crea Prenotazione"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="shadow-lg rounded-lg">
        <CardHeader>
          <CardTitle className="text-primary">Tutte le Prenotazioni</CardTitle>
          <CardDescription>Panoramica e gestione di tutte le prenotazioni effettuate.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campo</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Orario</TableHead>
                  <TableHead>Prenotato da</TableHead>
                  <TableHead>Prenotato per</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reservations.map((res) => (
                  <TableRow key={res.id}>
                    <TableCell className="font-medium">{res.courts?.name || 'N/D'}</TableCell>
                    <TableCell>{format(parseISO(res.starts_at), 'dd/MM/yyyy', { locale: it })}</TableCell>
                    <TableCell>{format(parseISO(res.starts_at), 'HH:mm')} - {format(parseISO(res.ends_at), 'HH:mm')}</TableCell>
                    <TableCell>{res.profiles?.full_name || 'Sconosciuto'}</TableCell>
                    <TableCell>
                      {res.booked_for_first_name && res.booked_for_last_name
                        ? `${res.booked_for_first_name} ${res.booked_for_last_name}`
                        : 'Se stesso'}
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate">{res.notes || '-'}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        res.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                        res.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {res.status === 'confirmed' ? 'Confermata' :
                         res.status === 'pending' ? 'In Attesa' :
                         'Annullata'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end space-x-2">
                        <Button variant="outline" size="icon" onClick={() => handleEditClick(res)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon" disabled={isCancelling === res.id}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Sei assolutamente sicuro?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Questa azione non può essere annullata. Verrà eliminata la prenotazione per il campo{" "}
                                <span className="font-semibold">{res.courts?.name || 'sconosciuto'}</span> il{" "}
                                <span className="font-semibold capitalize">{format(parseISO(res.starts_at), 'EEEE, dd MMMM yyyy', { locale: it })}</span> dalle{" "}
                                <span className="font-semibold">{format(parseISO(res.starts_at), 'HH:mm')}</span> alle{" "}
                                <span className="font-semibold">{format(parseISO(res.ends_at), 'HH:mm')}</span>.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annulla</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleCancelReservation(res.id)}>
                                Conferma Eliminazione
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Reservation Dialog */}
      <Dialog open={!!isEditing} onOpenChange={() => setIsEditing(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Modifica Prenotazione</DialogTitle>
            <DialogDescription>
              Apporta modifiche alla prenotazione selezionata.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-user-id" className="text-right">ID Utente</Label>
              <Input id="edit-user-id" value={editUserId} onChange={(e) => setEditUserId(e.target.value)} className="col-span-3" placeholder="ID Utente (es. UUID)" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-first-name" className="text-right">Nome Socio Terzo</Label>
              <Input id="edit-first-name" value={editBookedForFirstName} onChange={(e) => setEditBookedForFirstName(e.target.value)} className="col-span-3" placeholder="Nome (opzionale)" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-last-name" className="text-right">Cognome Socio Terzo</Label>
              <Input id="edit-last-name" value={editBookedForLastName} onChange={(e) => setEditBookedForLastName(e.target.value)} className="col-span-3" placeholder="Cognome (opzionale)" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-court" className="text-right">Campo</Label>
              <Select onValueChange={setEditCourtId} value={editCourtId} >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Seleziona un campo" />
                </SelectTrigger>
                <SelectContent>
                  {courts.map((court) => (
                    <SelectItem key={court.id} value={court.id.toString()}>{court.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-date" className="text-right">Data</Label>
              <div className="col-span-3">
                <Calendar
                  mode="single"
                  selected={editDate}
                  onSelect={setEditDate}
                  initialFocus
                  locale={it}
                  className="rounded-md border shadow"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-start-time" className="text-right">Ora Inizio</Label>
              <Select onValueChange={setEditStartTime} value={editStartTime}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Seleziona ora inizio" />
                </SelectTrigger>
                <SelectContent>
                  {timeSlots.map(slot => <SelectItem key={slot} value={slot}>{slot}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-end-time" className="text-right">Ora Fine</Label>
              <Select onValueChange={setEditEndTime} value={editEndTime}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Seleziona ora fine" />
                </SelectTrigger>
                <SelectContent>
                  {timeSlots.map(slot => <SelectItem key={slot} value={slot}>{slot}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-notes" className="text-right">Note</Label>
              <Textarea id="edit-notes" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="col-span-3" placeholder="Note aggiuntive (opzionale)" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditing(null)}>Annulla</Button>
            <Button onClick={handleUpdateReservation} disabled={loading}>
              {loading ? "Aggiornamento..." : "Salva Modifiche"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminReservations;
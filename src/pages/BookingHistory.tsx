"use client";

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { ArrowLeft, LogOut, CalendarDays, Clock, MapPin, Info, Trash2, User, Edit, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { format, parseISO, isBefore, addHours, isSameDay, differenceInMinutes } from 'date-fns';
import { it } from 'date-fns/locale';
import { Reservation } from '@/types/supabase';
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

// Estendi l'interfaccia Reservation per includere i dettagli del campo
interface DetailedReservation extends Reservation {
  courts: {
    name: string;
    surface: string;
  } | null;
}

// Interfaccia per gruppi di prenotazioni consecutive
interface ReservationGroup {
  id: string; // ID unico per il gruppo (basato sulla prima prenotazione)
  courtId: number;
  courtName: string;
  courtSurface: string;
  date: Date;
  reservations: DetailedReservation[];
  startTime: string;
  endTime: string;
  totalHours: number;
  status: string;
  bookedForName: string;
  notes?: string;
  isExpanded: boolean;
}

const BookingHistory = () => {
  const navigate = useNavigate();
  const [reservations, setReservations] = useState<DetailedReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState<string | null>(null); // ID del gruppo in cancellazione
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set()); // Gruppi espansi

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

  const fetchUserReservations = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showError("Utente non autenticato. Effettua il login.");
        navigate('/login');
        return;
      }

      const { data, error } = await supabase
        .from('reservations')
        .select(`
          *,
          courts (
            name,
            surface
          )
        `)
        .eq('user_id', user.id)
        .order('starts_at', { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      setReservations(data as DetailedReservation[]);
    } catch (err: any) {
      console.error("Errore nel caricamento delle prenotazioni:", err.message);
      setError("Errore nel caricamento delle prenotazioni: " + err.message);
      showError("Errore nel caricamento delle prenotazioni.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserReservations();
  }, [navigate]);

  // Funzione per raggruppare le prenotazioni consecutive dello stesso giorno
  const groupConsecutiveReservations = (reservationsList: DetailedReservation[]): ReservationGroup[] => {
    const groups: ReservationGroup[] = [];
    
    if (reservationsList.length === 0) {
      return groups;
    }

    // Ordina per data e ora
    const sortedReservations = [...reservationsList].sort((a, b) => {
      return parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime();
    });

    let currentGroup: ReservationGroup | null = null;

    for (const reservation of sortedReservations) {
      const startTime = parseISO(reservation.starts_at);
      const endTime = parseISO(reservation.ends_at);
      const reservationDate = new Date(startTime.getFullYear(), startTime.getMonth(), startTime.getDate());
      const courtName = reservation.courts?.name || `Campo #${reservation.court_id}`;
      const courtSurface = reservation.courts?.surface || 'N/D';
      
      const bookedForName = reservation.booked_for_first_name && reservation.booked_for_last_name
        ? `${reservation.booked_for_first_name} ${reservation.booked_for_last_name}`
        : "Te stesso";

      if (!currentGroup) {
        // Crea un nuovo gruppo
        currentGroup = {
          id: reservation.id,
          courtId: reservation.court_id,
          courtName,
          courtSurface,
          date: reservationDate,
          reservations: [reservation],
          startTime: format(startTime, 'HH:mm'),
          endTime: format(endTime, 'HH:mm'),
          totalHours: differenceInMinutes(endTime, startTime) / 60,
          status: reservation.status,
          bookedForName,
          notes: reservation.notes || undefined,
          isExpanded: expandedGroups.has(reservation.id),
        };
      } else {
        const currentGroupEndTime = parseISO(currentGroup.reservations[currentGroup.reservations.length - 1].ends_at);
        
        // Controlla se la prenotazione è consecutiva allo stesso campo e giorno
        const isSameCourt = reservation.court_id === currentGroup.courtId;
        const isSameDate = isSameDay(startTime, currentGroup.date);
        const isConsecutive = differenceInMinutes(startTime, currentGroupEndTime) === 0;
        
        if (isSameCourt && isSameDate && isConsecutive) {
          // Aggiungi al gruppo esistente
          currentGroup.reservations.push(reservation);
          currentGroup.endTime = format(endTime, 'HH:mm');
          currentGroup.totalHours += differenceInMinutes(endTime, startTime) / 60;
          
          // Se le note sono diverse, combinale
          if (reservation.notes && reservation.notes !== currentGroup.notes) {
            currentGroup.notes = currentGroup.notes 
              ? `${currentGroup.notes}; ${reservation.notes}`
              : reservation.notes;
          }
          
          // Aggiorna lo stato se cambia
          if (reservation.status !== currentGroup.status) {
            currentGroup.status = 'mixed';
          }
        } else {
          // Chiudi il gruppo corrente e creane uno nuovo
          groups.push(currentGroup);
          
          currentGroup = {
            id: reservation.id,
            courtId: reservation.court_id,
            courtName,
            courtSurface,
            date: reservationDate,
            reservations: [reservation],
            startTime: format(startTime, 'HH:mm'),
            endTime: format(endTime, 'HH:mm'),
            totalHours: differenceInMinutes(endTime, startTime) / 60,
            status: reservation.status,
            bookedForName,
            notes: reservation.notes || undefined,
            isExpanded: expandedGroups.has(reservation.id),
          };
        }
      }
    }

    // Aggiungi l'ultimo gruppo
    if (currentGroup) {
      groups.push(currentGroup);
    }

    // Ordina i gruppi dalla più recente alla più vecchia
    return groups.sort((a, b) => b.date.getTime() - a.date.getTime());
  };

  const groupedReservations = groupConsecutiveReservations(reservations);

  const toggleGroupExpansion = (groupId: string) => {
    const newExpandedGroups = new Set(expandedGroups);
    if (newExpandedGroups.has(groupId)) {
      newExpandedGroups.delete(groupId);
    } else {
      newExpandedGroups.add(groupId);
    }
    setExpandedGroups(newExpandedGroups);
  };

  const handleCancelGroup = async (group: ReservationGroup) => {
    setIsCancelling(group.id);
    try {
      // Elimina tutte le prenotazioni nel gruppo
      const reservationIds = group.reservations.map(r => r.id);
      
      const { error } = await supabase
        .from('reservations')
        .delete()
        .in('id', reservationIds);

      if (error) {
        showError("Errore durante l'annullamento della prenotazione: " + error.message);
      } else {
        showSuccess(`Prenotazione${group.reservations.length > 1 ? 'i' : ''} annullata${group.reservations.length > 1 ? 'e' : ''} con successo!`);
        fetchUserReservations(); // Refresh the list
      }
    } catch (err: any) {
      showError(err.message || "Errore inaspettato durante l'annullamento.");
    } finally {
      setIsCancelling(null);
    }
  };

  const handleEditGroup = (group: ReservationGroup) => {
    // Per ora reindirizziamo alla pagina di prenotazione standard
    // In futuro potremmo creare una pagina di modifica specifica
    showInfo("Funzionalità di modifica in sviluppo. Al momento, puoi annullare e ri-prenotare.");
  };

  const isCancellable = (group: ReservationGroup): boolean => {
    // Controlla se almeno una prenotazione nel gruppo è cancellabile
    return group.reservations.some(reservation => {
      const reservationStartTime = parseISO(reservation.starts_at);
      const oneHourFromNow = addHours(new Date(), 1);
      return isBefore(oneHourFromNow, reservationStartTime);
    });
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'confirmed': return 'Confermata';
      case 'pending': return 'In Attesa';
      case 'cancelled': return 'Annullata';
      case 'mixed': return 'Parziale';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'mixed': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const showInfo = (message: string) => {
    // Potremmo usare un toast o un alert
    alert(message);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white p-4">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4 text-primary">Caricamento...</h1>
          <p className="text-xl text-gray-600">Recupero storico prenotazioni.</p>
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
          <Link to="/dashboard" className="mr-4">
            <Button variant="outline" size="icon" className="text-primary border-primary hover:bg-secondary hover:text-primary">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-primary">Storico Prenotazioni</h1>
        </div>
        <Button variant="outline" className="text-primary border-primary hover:bg-secondary hover:text-primary" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" /> Esci
        </Button>
      </header>

      <div className="space-y-6">
        {groupedReservations.length === 0 ? (
          <Card className="shadow-lg rounded-lg text-center p-8">
            <Info className="mx-auto h-12 w-12 text-gray-500 mb-4" />
            <CardTitle className="text-2xl font-bold text-gray-700">Nessuna prenotazione trovata</CardTitle>
            <CardDescription className="mt-2 text-gray-600">
              Sembra che tu non abbia ancora effettuato prenotazioni.
            </CardDescription>
            <Link to="/book">
              <Button className="mt-6 bg-primary hover:bg-primary/90 text-primary-foreground">
                Prenota un Campo Ora
              </Button>
            </Link>
          </Card>
        ) : (
          groupedReservations.map((group) => (
            <Card key={group.id} className="shadow-lg rounded-lg overflow-hidden">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <CardTitle className="text-xl font-bold text-primary flex items-center">
                      <MapPin className="mr-2 h-5 w-5 text-club-orange" />
                      {group.courtName}
                      <span className={`ml-3 px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(group.status)}`}>
                        {getStatusLabel(group.status)}
                      </span>
                      {group.reservations.length > 1 && (
                        <span className="ml-2 px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                          {group.reservations.length} slot
                        </span>
                      )}
                    </CardTitle>
                    {/* Rimosso: CardDescription con Superficie */}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleGroupExpansion(group.id)}
                    className="ml-2"
                  >
                    {expandedGroups.has(group.id) ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center text-gray-700">
                    <User className="mr-2 h-4 w-4 text-club-orange" />
                    <span>Prenotato per: <span className="font-semibold">{group.bookedForName}</span></span>
                  </div>
                  <div className="flex items-center text-gray-700">
                    <CalendarDays className="mr-2 h-4 w-4 text-club-orange" />
                    <span>Data: <span className="font-semibold capitalize">{format(group.date, 'EEEE, dd MMMM yyyy', { locale: it })}</span></span>
                  </div>
                  <div className="flex items-center text-gray-700">
                    <Clock className="mr-2 h-4 w-4 text-club-orange" />
                    <span>Orario: <span className="font-semibold">{group.startTime} - {group.endTime}</span></span>
                    <span className="ml-2 text-sm text-gray-500">
                      ({group.totalHours % 1 === 0 ? group.totalHours.toFixed(0) : group.totalHours.toFixed(1)}h)
                    </span>
                  </div>
                  {group.notes && (
                    <div className="flex items-start text-gray-700">
                      <Info className="mr-2 h-4 w-4 text-club-orange mt-1" />
                      <span>Note: <span className="font-medium">{group.notes}</span></span>
                    </div>
                  )}
                </div>

                {expandedGroups.has(group.id) && group.reservations.length > 1 && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h4 className="font-medium text-gray-700 mb-2">Slot dettagliati:</h4>
                    <div className="space-y-2">
                      {group.reservations.map((reservation, index) => (
                        <div key={reservation.id} className="flex items-center justify-between text-sm bg-gray-50 p-2 rounded">
                          <div>
                            <span className="font-medium">Slot {index + 1}:</span>
                            <span className="ml-2">
                              {format(parseISO(reservation.starts_at), 'HH:mm')} - {format(parseISO(reservation.ends_at), 'HH:mm')}
                            </span>
                            {reservation.notes && reservation.notes !== group.notes && (
                              <span className="ml-2 text-gray-500 italic">({reservation.notes})</span>
                            )}
                          </div>
                          <span className={`px-2 py-1 rounded text-xs ${getStatusColor(reservation.status)}`}>
                            {getStatusLabel(reservation.status)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-6 flex flex-col sm:flex-row gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleEditGroup(group)}
                    disabled={!isCancellable(group)}
                  >
                    <Edit className="mr-2 h-4 w-4" /> Modifica
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        className="flex-1"
                        disabled={!isCancellable(group) || isCancelling === group.id}
                      >
                        {isCancelling === group.id ? "Annullamento..." : "Annulla Prenotazione"}
                        <Trash2 className="ml-2 h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Sei assolutamente sicuro?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Questa azione non può essere annullata. Verranno eliminate {group.reservations.length > 1 ? 'le tue prenotazioni' : 'la tua prenotazione'} per il campo{" "}
                          <span className="font-semibold">{group.courtName}</span> il{" "}
                          <span className="font-semibold capitalize">{format(group.date, 'EEEE, dd MMMM yyyy', { locale: it })}</span> dalle{" "}
                          <span className="font-semibold">{group.startTime}</span> alle{" "}
                          <span className="font-semibold">{group.endTime}</span>.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleCancelGroup(group)}>
                          Conferma Annullamento
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                
                {!isCancellable(group) && (
                  <p className="text-sm text-red-500 mt-2">
                    Non è possibile modificare o annullare prenotazioni che iniziano entro 1 ora.
                  </p>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default BookingHistory;
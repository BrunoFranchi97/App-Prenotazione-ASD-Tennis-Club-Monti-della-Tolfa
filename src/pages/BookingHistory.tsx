import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO, isBefore } from 'date-fns';
import { it } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, LogOut, CalendarDays, Clock, MapPin, Edit, Users, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import type { Court, Reservation } from '@/types/supabase';

interface ReservationGroup {
  id: string;
  courtId: number;
  courtName: string;
  date: Date;
  reservations: Reservation[];
  startTime: string;
  endTime: string;
  totalHours: number;
  status: string;
  bookedForName: string;
  notes?: string;
  bookingType?: string;
}

const BookingHistory = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [groupedReservations, setGroupedReservations] = useState<ReservationGroup[]>([]);
  const [editingGroup, setEditingGroup] = useState<ReservationGroup | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);

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

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }

      // Fetch reservations
      const { data: reservationsData, error: reservationsError } = await supabase
        .from('reservations')
        .select('*')
        .eq('user_id', user.id)
        .order('starts_at', { ascending: false });

      if (reservationsError) throw reservationsError;
      setReservations(reservationsData || []);

      // Fetch courts
      const { data: courtsData, error: courtsError } = await supabase
        .from('courts')
        .select('*');

      if (courtsError) throw courtsError;
      setCourts(courtsData || []);

    } catch (err: any) {
      showError("Errore nel caricamento dei dati: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Group reservations by date, court, and booking type
  useEffect(() => {
    if (!reservations.length || !courts.length) {
      setGroupedReservations([]);
      return;
    }

    const courtMap = new Map(courts.map(court => [court.id, court]));
    const grouped = new Map<string, ReservationGroup>();

    reservations.forEach(reservation => {
      const date = parseISO(reservation.starts_at);
      const dateKey = format(date, 'yyyy-MM-dd');
      const courtKey = reservation.court_id;
      const bookingType = reservation.booking_type || 'singolare';
      
      // Create a unique group key
      const groupKey = `${dateKey}_${courtKey}_${bookingType}_${reservation.booked_for_first_name || 'self'}_${reservation.booked_for_last_name || 'self'}`;

      if (!grouped.has(groupKey)) {
        const court = courtMap.get(reservation.court_id);
        const startTime = format(parseISO(reservation.starts_at), 'HH:mm');
        const endTime = format(parseISO(reservation.ends_at), 'HH:mm');

        grouped.set(groupKey, {
          id: groupKey,
          courtId: reservation.court_id,
          courtName: court?.name || `Campo ${reservation.court_id}`,
          date,
          reservations: [reservation],
          startTime,
          endTime,
          totalHours: 1,
          status: reservation.status,
          bookedForName: reservation.booked_for_first_name && reservation.booked_for_last_name 
            ? `${reservation.booked_for_first_name} ${reservation.booked_for_last_name}`
            : "Te stesso",
          notes: reservation.notes || undefined,
          bookingType: reservation.booking_type
        });
      } else {
        const group = grouped.get(groupKey)!;
        group.reservations.push(reservation);
        
        // Update times
        const sortedReservations = [...group.reservations].sort((a, b) => 
          parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime()
        );
        
        group.startTime = format(parseISO(sortedReservations[0].starts_at), 'HH:mm');
        group.endTime = format(parseISO(sortedReservations[sortedReservations.length - 1].ends_at), 'HH:mm');
        group.totalHours = sortedReservations.length;
        
        // Update status if any reservation is cancelled
        if (reservation.status === 'cancelled') {
          group.status = 'cancelled';
        }
      }
    });

    setGroupedReservations(Array.from(grouped.values()));
  }, [reservations, courts]);

  const handleEdit = (group: ReservationGroup) => {
    navigate('/edit-booking', { state: { group } });
  };

  const handleDelete = async (group: ReservationGroup) => {
    setDeletingGroupId(group.id);
    try {
      // Elimina TUTTE le prenotazioni del gruppo
      for (const reservation of group.reservations) {
        const { error } = await supabase
          .from('reservations')
          .delete()
          .eq('id', reservation.id);

        if (error) throw error;
      }

      showSuccess("Prenotazione eliminata con successo!");
      fetchData(); // Refresh data
    } catch (err: any) {
      showError("Errore durante l'eliminazione: " + err.message);
    } finally {
      setDeletingGroupId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <Badge className="bg-green-100 text-green-800">Confermata</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">In attesa</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800">Annullata</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center">
          <Link to="/dashboard" className="mr-4">
            <Button variant="outline" size="icon" className="text-primary border-primary hover:bg-secondary">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-primary">Storico Prenotazioni</h1>
        </div>
        <Button variant="outline" className="text-primary border-primary hover:bg-secondary" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" /> Esci
        </Button>
      </header>

      <div className="space-y-6">
        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-primary">Le tue prenotazioni</CardTitle>
            <CardDescription>
              Visualizza tutte le tue prenotazioni passate e future. Puoi modificare o eliminare quelle future.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {groupedReservations.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <CalendarDays className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>Nessuna prenotazione trovata.</p>
                <p className="text-sm mt-2">Effettua la tua prima prenotazione per vederla qui.</p>
                <Link to="/book">
                  <Button className="mt-4 bg-primary hover:bg-primary/90 text-primary-foreground">
                    Prenota un Campo
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {groupedReservations.map((group) => {
                  const isFuture = isBefore(new Date(), group.date);
                  const isEditable = isFuture && group.status === 'confirmed';
                  
                  return (
                    <Card key={group.id} className="border hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              {getStatusBadge(group.status)}
                              {group.notes?.includes('[MATCH]') && (
                                <Badge variant="secondary" className="bg-purple-100 text-purple-800">
                                  <Users className="mr-1 h-3 w-3" /> Match
                                </Badge>
                              )}
                            </div>
                            <h3 className="font-bold text-lg">
                              {group.courtName}
                            </h3>
                            <p className="text-sm text-gray-600">
                              {format(group.date, 'dd/MM/yyyy', { locale: it })}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2 mb-4">
                          <div className="flex items-center text-sm">
                            <Clock className="mr-2 h-4 w-4 text-club-orange" />
                            <span className="font-medium">Orario:</span>
                            <span className="ml-2">{group.startTime} - {group.endTime}</span>
                          </div>
                          <div className="flex items-center text-sm">
                            <CalendarDays className="mr-2 h-4 w-4 text-club-orange" />
                            <span className="font-medium">Durata:</span>
                            <span className="ml-2">{group.totalHours}h</span>
                          </div>
                          <div className="flex items-center text-sm">
                            <Users className="mr-2 h-4 w-4 text-club-orange" />
                            <span className="font-medium">Per:</span>
                            <span className="ml-2">{group.bookedForName}</span>
                          </div>
                          {group.notes && (
                            <div className="text-sm text-gray-700 pt-2 border-t">
                              <p className="font-medium">Note:</p>
                              <p className="text-xs mt-1 line-clamp-2">{group.notes}</p>
                            </div>
                          )}
                        </div>

                        <div className="pt-3 border-t">
                          {isEditable ? (
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEdit(group)}
                                disabled={deletingGroupId !== null}
                                className="flex-1"
                              >
                                <Edit className="mr-2 h-4 w-4" /> Modifica
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDelete(group)}
                                disabled={deletingGroupId === group.id}
                                className="flex-1"
                              >
                                {deletingGroupId === group.id ? (
                                  "Eliminazione..."
                                ) : (
                                  <>
                                    <Trash2 className="mr-2 h-4 w-4" /> Elimina
                                  </>
                                )}
                              </Button>
                            </div>
                          ) : (
                            <div className="text-center">
                              <span className="text-sm text-muted-foreground">
                                {isFuture ? "Non modificabile" : "Prenotazione passata"}
                              </span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BookingHistory;
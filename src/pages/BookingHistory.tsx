import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO, isBefore } from 'date-fns';
import { it } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, LogOut, CalendarDays, Clock, MapPin, Edit, Users, Trash2, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { cleanReservationNotes } from '@/utils/noteCleaner';
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
  isRecipientOnly?: boolean; // Se l'utente è solo il destinatario e non chi ha prenotato
}

const BookingHistory = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [groupedReservations, setGroupedReservations] = useState<ReservationGroup[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
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
      setCurrentUserId(user.id);

      // Recupera il profilo per il matching del nome
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();

      let query = supabase.from('reservations').select('*');

      if (profile?.full_name) {
        // Splitta il nome per cercare match parziali o esatti
        const parts = profile.full_name.trim().split(/\s+/);
        const firstName = parts[0];
        const lastName = parts.slice(1).join(' ');

        if (firstName && lastName) {
          // Cerca prenotazioni fatte dall'utente OR fatte per l'utente (match nome/cognome)
          query = query.or(`user_id.eq.${user.id},and(booked_for_first_name.ilike.${firstName},booked_for_last_name.ilike.${lastName})`);
        } else {
          query = query.eq('user_id', user.id);
        }
      } else {
        query = query.eq('user_id', user.id);
      }

      const { data: reservationsData, error: reservationsError } = await query.order('starts_at', { ascending: false });

      if (reservationsError) throw reservationsError;
      setReservations(reservationsData || []);

      const { data: courtsData, error: courtsError } = await supabase.from('courts').select('*');
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
      const isRecipientOnly = reservation.user_id !== currentUserId;
      
      const groupKey = `${dateKey}_${courtKey}_${reservation.user_id}_${reservation.booked_for_first_name || 'self'}`;

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
            : (isRecipientOnly ? "Te stesso" : "Te stesso"),
          notes: cleanReservationNotes(reservation.notes),
          bookingType: reservation.booking_type,
          isRecipientOnly
        });
      } else {
        const group = grouped.get(groupKey)!;
        group.reservations.push(reservation);
        const sorted = [...group.reservations].sort((a, b) => parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime());
        group.startTime = format(parseISO(sorted[0].starts_at), 'HH:mm');
        group.endTime = format(parseISO(sorted[sorted.length - 1].ends_at), 'HH:mm');
        group.totalHours = sorted.length;
      }
    });

    setGroupedReservations(Array.from(grouped.values()));
  }, [reservations, courts, currentUserId]);

  const handleDelete = async (group: ReservationGroup) => {
    setDeletingGroupId(group.id);
    try {
      for (const res of group.reservations) {
        const { error } = await supabase.from('reservations').delete().eq('id', res.id);
        if (error) throw error;
      }
      showSuccess("Prenotazione eliminata!");
      fetchData();
    } catch (err: any) {
      showError(err.message);
    } finally {
      setDeletingGroupId(null);
    }
  };

  if (loading) return <div className="p-8 text-center">Caricamento storico...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center">
          <Link to="/dashboard" className="mr-4">
            <Button variant="outline" size="icon" className="text-primary border-primary hover:bg-secondary"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <h1 className="text-3xl font-bold text-primary">Storico Prenotazioni</h1>
        </div>
        <Button variant="outline" onClick={handleLogout} className="border-primary text-primary hover:bg-secondary">
          <LogOut className="mr-2 h-4 w-4" /> Esci
        </Button>
      </header>

      <div className="space-y-6">
        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-primary">I miei campi</CardTitle>
            <CardDescription>Prenotazioni effettuate da te o caricate a tuo nome da altri soci.</CardDescription>
          </CardHeader>
          <CardContent>
            {groupedReservations.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground"><p>Nessuna prenotazione trovata.</p></div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {groupedReservations.map((group) => {
                  const isFuture = isBefore(new Date(), group.date);
                  return (
                    <Card key={group.id} className={`border ${group.isRecipientOnly ? 'bg-blue-50/30' : ''} hover:shadow-md transition-shadow`}>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className={group.status === 'confirmed' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                                {group.status === 'confirmed' ? 'Confermata' : 'Annullata'}
                              </Badge>
                              {group.isRecipientOnly && <Badge className="bg-blue-100 text-blue-800 border-none">Ricevuta</Badge>}
                            </div>
                            <h3 className="font-bold text-lg">{group.courtName}</h3>
                            <p className="text-sm text-gray-600">{format(group.date, 'dd/MM/yyyy', { locale: it })}</p>
                          </div>
                        </div>
                        <div className="space-y-2 mb-4 text-sm">
                          <div className="flex items-center"><Clock className="mr-2 h-4 w-4 text-club-orange" /> {group.startTime} - {group.endTime} ({group.totalHours}h)</div>
                          <div className="flex items-center"><Users className="mr-2 h-4 w-4 text-club-orange" /> {group.isRecipientOnly ? "Prenotata per te da un socio" : `Per: ${group.bookedForName}`}</div>
                        </div>
                        <div className="pt-3 border-t">
                          {isFuture && !group.isRecipientOnly ? (
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" className="flex-1" onClick={() => navigate('/edit-booking', { state: { group } })}><Edit className="h-4 w-4 mr-1"/> Modifica</Button>
                              <Button variant="destructive" size="sm" className="flex-1" onClick={() => handleDelete(group)} disabled={deletingGroupId === group.id}>{deletingGroupId === group.id ? "..." : <Trash2 className="h-4 w-4"/>}</Button>
                            </div>
                          ) : (
                            <div className="text-center text-xs text-muted-foreground flex items-center justify-center">
                              <Info className="h-3 w-3 mr-1" /> {group.isRecipientOnly ? "Contatta chi ha prenotato per modifiche" : "Prenotazione passata"}
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
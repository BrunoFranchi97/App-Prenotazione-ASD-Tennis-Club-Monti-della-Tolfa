"use client";

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { ArrowLeft, LogOut, CalendarDays, Clock, MapPin, Info, Trash2, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { format, parseISO, isBefore, addHours } from 'date-fns';
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

const BookingHistory = () => {
  const navigate = useNavigate();
  const [reservations, setReservations] = useState<DetailedReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState<string | null>(null); // Stores the ID of the reservation being cancelled

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
        .order('starts_at', { ascending: false }); // Ordina dalla più recente alla meno recente

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
        fetchUserReservations(); // Refresh the list
      }
    } catch (err: any) {
      showError(err.message || "Errore inaspettato durante l'annullamento.");
    } finally {
      setIsCancelling(null);
    }
  };

  const isCancellable = (startsAt: string): boolean => {
    const reservationStartTime = parseISO(startsAt);
    const oneHourFromNow = addHours(new Date(), 1);
    return isBefore(oneHourFromNow, reservationStartTime);
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
        {reservations.length === 0 ? (
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
          reservations.map((res) => (
            <Card key={res.id} className="shadow-lg rounded-lg p-6">
              <CardHeader className="p-0 mb-4">
                <CardTitle className="text-xl font-bold text-primary flex items-center">
                  <MapPin className="mr-2 h-5 w-5 text-club-orange" />
                  {res.courts?.name || 'Campo Sconosciuto'}
                  <span className={`ml-auto px-3 py-1 rounded-full text-sm font-semibold ${
                    res.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                    res.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {res.status === 'confirmed' ? 'Confermata' :
                     res.status === 'pending' ? 'In Attesa' :
                     'Annullata'}
                  </span>
                </CardTitle>
                <CardDescription className="text-gray-600 text-sm mt-1">
                  Superficie: {res.courts?.surface || 'N/D'}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 space-y-2">
                {res.booked_for_first_name && res.booked_for_last_name ? (
                  <div className="flex items-center text-gray-700">
                    <User className="mr-2 h-4 w-4 text-club-orange" />
                    <span>Prenotato per: <span className="font-semibold">{res.booked_for_first_name} {res.booked_for_last_name}</span></span>
                  </div>
                ) : (
                  <div className="flex items-center text-gray-700">
                    <User className="mr-2 h-4 w-4 text-club-orange" />
                    <span>Prenotato da: <span className="font-semibold">Te stesso</span></span>
                  </div>
                )}
                <div className="flex items-center text-gray-700">
                  <CalendarDays className="mr-2 h-4 w-4 text-club-orange" />
                  <span>Data: <span className="font-semibold capitalize">{format(parseISO(res.starts_at), 'EEEE, dd MMMM yyyy', { locale: it })}</span></span>
                </div>
                <div className="flex items-center text-gray-700">
                  <Clock className="mr-2 h-4 w-4 text-club-orange" />
                  <span>Orario: <span className="font-semibold">{format(parseISO(res.starts_at), 'HH:mm')} - {format(parseISO(res.ends_at), 'HH:mm')}</span></span>
                </div>
                {res.notes && (
                  <div className="flex items-start text-gray-700">
                    <Info className="mr-2 h-4 w-4 text-club-orange mt-1" />
                    <span>Note: <span className="font-medium">{res.notes}</span></span>
                  </div>
                )}
                <div className="pt-4">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        className="w-full"
                        disabled={!isCancellable(res.starts_at) || isCancelling === res.id}
                      >
                        {isCancelling === res.id ? "Annullamento..." : "Annulla Prenotazione"}
                        <Trash2 className="ml-2 h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Sei assolutamente sicuro?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Questa azione non può essere annullata. Verrà eliminata la tua prenotazione per il campo{" "}
                          <span className="font-semibold">{res.courts?.name || 'sconosciuto'}</span> il{" "}
                          <span className="font-semibold capitalize">{format(parseISO(res.starts_at), 'EEEE, dd MMMM yyyy', { locale: it })}</span> dalle{" "}
                          <span className="font-semibold">{format(parseISO(res.starts_at), 'HH:mm')}</span> alle{" "}
                          <span className="font-semibold">{format(parseISO(res.ends_at), 'HH:mm')}</span>.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleCancelReservation(res.id)}>
                          Conferma Annullamento
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  {!isCancellable(res.starts_at) && (
                    <p className="text-sm text-red-500 mt-2">
                      Non è possibile annullare prenotazioni che iniziano entro 1 ora.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default BookingHistory;
"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO, isBefore, isSameDay, startOfDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { ArrowLeft, LogOut, Clock, Users, Trash2, Info, CalendarDays, MapPin, Edit } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { cleanReservationNotes } from '@/utils/noteCleaner';
import UserNav from '@/components/UserNav';
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
  isRecipientOnly?: boolean;
}

const BookingHistory = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  
  // Stato per la data selezionata nel calendario
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      showSuccess("Disconnessione effettuata!");
      navigate('/login');
    } catch (error: any) {
      showError(error.message);
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

      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();

      let query = supabase.from('reservations').select('*');
      if (profile?.full_name) {
        const parts = profile.full_name.trim().split(/\s+/);
        const firstName = parts[0];
        const lastName = parts.slice(1).join(' ');
        if (firstName && lastName) {
          query = query.or(`user_id.eq.${user.id},and(booked_for_first_name.ilike.${firstName},booked_for_last_name.ilike.${lastName})`);
        } else {
          query = query.eq('user_id', user.id);
        }
      } else {
        query = query.eq('user_id', user.id);
      }

      const { data: reservationsData } = await query.order('starts_at', { ascending: false });
      setReservations(reservationsData || []);

      const { data: courtsData } = await supabase.from('courts').select('*');
      setCourts(courtsData || []);

    } catch (err: any) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Raggruppamento di tutte le prenotazioni
  const allGroups = useMemo(() => {
    if (!reservations.length || !courts.length) return [];
    const courtMap = new Map(courts.map(c => [c.id, c]));
    const grouped = new Map<string, ReservationGroup>();

    reservations.forEach(res => {
      const date = parseISO(res.starts_at);
      const dateKey = format(date, 'yyyy-MM-dd');
      const isRecipientOnly = res.user_id !== currentUserId;
      const groupKey = `${dateKey}_${res.court_id}_${res.user_id}_${res.booked_for_first_name || 'self'}`;

      if (!grouped.has(groupKey)) {
        const court = courtMap.get(res.court_id);
        grouped.set(groupKey, {
          id: groupKey,
          courtId: res.court_id,
          courtName: court?.name || `Campo ${res.court_id}`,
          date: startOfDay(date),
          reservations: [res],
          startTime: format(date, 'HH:mm'),
          endTime: format(parseISO(res.ends_at), 'HH:mm'),
          totalHours: 1,
          status: res.status,
          bookedForName: res.booked_for_first_name && res.booked_for_last_name 
            ? `${res.booked_for_first_name} ${res.booked_for_last_name}`
            : "Te stesso",
          notes: cleanReservationNotes(res.notes),
          bookingType: res.booking_type,
          isRecipientOnly
        });
      } else {
        const group = grouped.get(groupKey)!;
        group.reservations.push(res);
        const sorted = [...group.reservations].sort((a, b) => parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime());
        group.startTime = format(parseISO(sorted[0].starts_at), 'HH:mm');
        group.endTime = format(parseISO(sorted[sorted.length - 1].ends_at), 'HH:mm');
        group.totalHours = sorted.length;
      }
    });
    return Array.from(grouped.values());
  }, [reservations, courts, currentUserId]);

  // Filtro per la data selezionata
  const filteredGroups = useMemo(() => {
    if (!selectedDate) return [];
    return allGroups.filter(g => isSameDay(g.date, selectedDate));
  }, [allGroups, selectedDate]);

  // Date che hanno prenotazioni (per il calendario)
  const bookedDates = useMemo(() => {
    return allGroups.map(g => g.date);
  }, [allGroups]);

  const handleDelete = async (group: ReservationGroup) => {
    setDeletingGroupId(group.id);
    try {
      for (const res of group.reservations) {
        await supabase.from('reservations').delete().eq('id', res.id);
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
            <Button variant="outline" size="icon" className="text-primary border-primary hover:bg-secondary">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-primary">I miei Campi</h1>
        </div>
        <div className="flex items-center gap-2">
          <UserNav />
          <Button variant="outline" onClick={handleLogout} className="hidden sm:flex border-primary text-primary hover:bg-secondary">
            <LogOut className="mr-2 h-4 w-4" /> Esci
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Colonna Calendario */}
        <div className="lg:col-span-4">
          <Card className="shadow-lg border-none overflow-hidden">
            <CardHeader className="bg-primary text-primary-foreground">
              <CardTitle className="text-lg flex items-center">
                <CalendarDays className="mr-2 h-5 w-5" /> Calendario Prenotazioni
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 bg-white">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                locale={it}
                className="mx-auto"
                modifiers={{ booked: bookedDates }}
                modifiersStyles={{
                  booked: { 
                    fontWeight: 'bold', 
                    color: 'hsl(var(--accent))',
                    textDecoration: 'underline'
                  }
                }}
              />
              <div className="mt-4 flex items-center justify-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-club-orange"></div>
                  <span>Giorno con campi</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-primary"></div>
                  <span>Oggi/Selezionato</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Colonna Risultati */}
        <div className="lg:col-span-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-700">
              {selectedDate ? format(selectedDate, 'EEEE dd MMMM', { locale: it }) : 'Seleziona una data'}
            </h2>
            <Badge variant="outline" className="bg-white">
              {filteredGroups.length} {filteredGroups.length === 1 ? 'prenotazione' : 'prenotazioni'}
            </Badge>
          </div>

          {filteredGroups.length === 0 ? (
            <Card className="border-dashed py-20 text-center text-muted-foreground bg-white/50">
              <CardContent>
                <div className="flex flex-col items-center">
                  <Info className="h-12 w-12 mb-4 opacity-20" />
                  <p className="text-lg">Nessun campo prenotato per questa data.</p>
                  <Link to="/book" className="mt-4">
                    <Button variant="link" className="text-primary font-semibold">Prenota ora il tuo prossimo match</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredGroups.map((group) => {
                const isFuture = !isBefore(group.date, startOfDay(new Date()));
                return (
                  <Card key={group.id} className={`border-none shadow-md overflow-hidden ${group.isRecipientOnly ? 'bg-blue-50/50' : 'bg-white'} hover:shadow-lg transition-shadow`}>
                    <div className={`h-1.5 w-full ${group.status === 'confirmed' ? 'bg-primary' : 'bg-destructive'}`}></div>
                    <CardContent className="p-5">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={group.status === 'confirmed' ? 'bg-green-100 text-green-800 border-none' : 'bg-red-100 text-red-800 border-none'}>
                              {group.status === 'confirmed' ? 'Confermata' : 'Annullata'}
                            </Badge>
                            {group.isRecipientOnly && (
                              <Badge className="bg-blue-100 text-blue-800 border-none">Ricevuta</Badge>
                            )}
                          </div>
                          <h3 className="font-bold text-xl flex items-center text-primary">
                            <MapPin className="mr-1.5 h-4 w-4 text-club-orange" /> {group.courtName}
                          </h3>
                        </div>
                      </div>

                      <div className="space-y-3 mb-6">
                        <div className="flex items-center text-sm text-gray-600">
                          <Clock className="mr-2 h-4 w-4 text-club-orange" />
                          <span className="font-semibold">{group.startTime} - {group.endTime}</span>
                          <span className="ml-1.5 text-xs">({group.totalHours}h)</span>
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <Users className="mr-2 h-4 w-4 text-club-orange" />
                          <span className="truncate">
                            {group.isRecipientOnly ? "Prenotata per te" : `Per: ${group.bookedForName}`}
                          </span>
                        </div>
                        {group.notes && (
                          <p className="text-xs text-gray-500 italic line-clamp-2 border-l-2 border-gray-100 pl-2">
                            "{group.notes}"
                          </p>
                        )}
                      </div>

                      <div className="pt-4 border-t border-gray-50">
                        {isFuture && !group.isRecipientOnly ? (
                          <div className="flex gap-2">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="flex-1 border-primary text-primary hover:bg-secondary"
                              onClick={() => navigate('/edit-booking', { state: { group } })}
                            >
                              <Edit className="h-4 w-4 mr-1.5" /> Modifica
                            </Button>
                            <Button 
                              variant="destructive" 
                              size="sm" 
                              className="px-3"
                              onClick={() => handleDelete(group)}
                              disabled={deletingGroupId === group.id}
                            >
                              {deletingGroupId === group.id ? "..." : <Trash2 className="h-4 w-4" />}
                            </Button>
                          </div>
                        ) : (
                          <div className="text-center text-[11px] text-muted-foreground flex items-center justify-center py-1 bg-gray-50 rounded">
                            <Info className="h-3 w-3 mr-1.5" /> 
                            {group.isRecipientOnly ? "Gestita da chi ha prenotato" : "Prenotazione conclusa"}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BookingHistory;
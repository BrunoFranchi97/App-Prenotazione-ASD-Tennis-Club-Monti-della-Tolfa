"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO, isBefore, isSameDay, startOfDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { ArrowLeft, LogOut, Clock, Users, Trash2, Info, CalendarDays, MapPin, Edit, X } from 'lucide-react';
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
  
  // Default undefined per mostrare tutto da oggi in poi
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

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

      const { data: reservationsData } = await query.order('starts_at', { ascending: true });
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

  const filteredGroups = useMemo(() => {
    let filtered = allGroups;
    
    if (selectedDate) {
      // Filtra per data specifica
      filtered = filtered.filter(g => isSameDay(g.date, selectedDate));
    } else {
      // Default: da oggi in poi
      const today = startOfDay(new Date());
      filtered = filtered.filter(g => !isBefore(g.date, today));
    }
    
    return filtered.sort((a, b) => {
      const dateDiff = a.date.getTime() - b.date.getTime();
      if (dateDiff !== 0) return dateDiff;
      return a.startTime.localeCompare(b.startTime);
    });
  }, [allGroups, selectedDate]);

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
            <Button variant="outline" size="icon" className="text-primary border-primary hover:bg-secondary hover:text-primary">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-primary">I miei Campi</h1>
        </div>
        <div className="flex items-center gap-2">
          <UserNav />
          <Button variant="outline" onClick={handleLogout} className="hidden sm:flex border-primary text-primary hover:bg-secondary hover:text-primary">
            <LogOut className="mr-2 h-4 w-4" /> Esci
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4">
          <Card className="shadow-lg border-none overflow-hidden">
            <CardHeader className="bg-primary text-primary-foreground">
              <CardTitle className="text-lg flex items-center justify-between">
                <div className="flex items-center">
                  <CalendarDays className="mr-2 h-5 w-5" /> Calendario
                </div>
                {selectedDate && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setSelectedDate(undefined)}
                    className="h-7 px-2 text-xs text-white hover:bg-white/20"
                  >
                    <X className="h-3 w-3 mr-1" /> Reset
                  </Button>
                )}
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
              <div className="mt-4 flex flex-col gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-club-orange"></div>
                  <span>Giorni con prenotazioni</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary"></div>
                  <span>Data selezionata</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-8">
          <div className="flex items-center justify-between mb-6">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-gray-800">
                {selectedDate 
                  ? format(selectedDate, 'EEEE dd MMMM', { locale: it }) 
                  : 'Prossime Prenotazioni'}
              </h2>
              <p className="text-sm text-gray-500">
                {selectedDate 
                  ? `Match in programma per questa data` 
                  : 'Tutti i tuoi impegni futuri nel club'}
              </p>
            </div>
            <Badge variant="outline" className="bg-white px-3 py-1 text-primary border-primary/20 font-bold">
              {filteredGroups.length} {filteredGroups.length === 1 ? 'match' : 'match'}
            </Badge>
          </div>

          {filteredGroups.length === 0 ? (
            <Card className="border-dashed py-20 text-center text-muted-foreground bg-white/50 rounded-[2rem]">
              <CardContent>
                <div className="flex flex-col items-center">
                  <div className="bg-gray-100 p-4 rounded-full mb-4">
                    <Info className="h-8 w-8 opacity-40" />
                  </div>
                  <p className="text-lg font-medium">Nessuna prenotazione trovata.</p>
                  <p className="text-sm mt-1">Non hai match in programma per questo periodo.</p>
                  <Link to="/book" className="mt-6">
                    <Button className="bg-primary hover:bg-primary/90 rounded-xl font-bold">
                      Prenota un Campo ora
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredGroups.map((group) => {
                const isFuture = !isBefore(group.date, startOfDay(new Date()));
                return (
                  <Card key={group.id} className={`border-none shadow-md overflow-hidden rounded-2xl ${group.isRecipientOnly ? 'bg-blue-50/50' : 'bg-white'} hover:shadow-lg transition-all duration-300`}>
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
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-0.5">
                            {format(group.date, 'EEEE dd MMMM', { locale: it })}
                          </p>
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
                              className="flex-1 border-primary text-primary hover:bg-secondary hover:text-primary rounded-xl font-bold"
                              onClick={() => navigate('/edit-booking', { state: { group } })}
                            >
                              <Edit className="h-4 w-4 mr-1.5" /> Modifica
                            </Button>
                            <Button 
                              variant="destructive" 
                              size="sm" 
                              className="px-3 rounded-xl"
                              onClick={() => handleDelete(group)}
                              disabled={deletingGroupId === group.id}
                            >
                              {deletingGroupId === group.id ? "..." : <Trash2 className="h-4 w-4" />}
                            </Button>
                          </div>
                        ) : (
                          <div className="text-center text-[11px] text-muted-foreground flex items-center justify-center py-2 bg-gray-50 rounded-xl">
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
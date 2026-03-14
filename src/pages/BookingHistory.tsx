"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO, isBefore, isSameDay, startOfDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, LogOut, Clock, Users, Trash2, Info, CalendarDays, MapPin, Edit, X, Filter, Layers, Target } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { cleanReservationNotes } from '@/utils/noteCleaner';
import UserNav from '@/components/UserNav';
import { cn } from '@/lib/utils';
import type { Court, Reservation, BookingType } from '@/types/supabase';

interface ReservationGroup {
  id: string;
  courtId: number;
  courtName: string;
  courtSurface?: string;
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

const SURFACE_LABELS: Record<string, string> = {
  "terra_rossa": "Terra Rossa",
  "erba_sintetica": "Sintetico",
  "superficie_dura": "Cemento",
};

const BookingHistory = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  
  // Filtri
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedSurface, setSelectedSurface] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");

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
          courtSurface: court?.surface,
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
    
    // Filtro Data
    if (selectedDate) {
      filtered = filtered.filter(g => isSameDay(g.date, selectedDate));
    } else {
      const today = startOfDay(new Date());
      filtered = filtered.filter(g => !isBefore(g.date, today));
    }

    // Filtro Superficie
    if (selectedSurface !== "all") {
      filtered = filtered.filter(g => g.courtSurface === selectedSurface);
    }

    // Filtro Tipologia
    if (selectedType !== "all") {
      filtered = filtered.filter(g => g.bookingType === selectedType);
    }
    
    return filtered.sort((a, b) => {
      const dateDiff = a.date.getTime() - b.date.getTime();
      if (dateDiff !== 0) return dateDiff;
      return a.startTime.localeCompare(b.startTime);
    });
  }, [allGroups, selectedDate, selectedSurface, selectedType]);

  const resetFilters = () => {
    setSelectedDate(undefined);
    setSelectedSurface("all");
    setSelectedType("all");
  };

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

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]"><div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div></div>;

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 sm:p-10 lg:p-12">
      <header className="flex justify-between items-center mb-10 max-w-7xl mx-auto">
        <div className="flex items-center gap-6">
          <Link to="/dashboard">
            <Button variant="outline" size="icon" className="rounded-2xl border-none shadow-sm bg-white text-primary hover:scale-110 active:scale-95 transition-transform">
              <ArrowLeft size={20} />
            </Button>
          </Link>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tighter">I miei Campi</h1>
        </div>
        <UserNav />
      </header>

      {/* Airbnb Style Filter Bar */}
      <div className="max-w-7xl mx-auto mb-12">
        <Card className="border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] rounded-[2.5rem] bg-white overflow-hidden">
          <CardContent className="p-2 sm:p-3">
            <div className="flex flex-col md:flex-row items-center gap-2 md:gap-0">
              
              {/* Date Filter */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex-1 w-full flex flex-col items-start px-8 py-4 hover:bg-gray-50 transition-colors rounded-[2rem] text-left group">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 group-hover:text-primary transition-colors">Quando</span>
                    <div className="flex items-center gap-2">
                      <CalendarDays size={16} className="text-club-orange" />
                      <span className="text-sm font-bold text-gray-700">
                        {selectedDate ? format(selectedDate, 'dd MMM yyyy', { locale: it }) : 'Tutte le date'}
                      </span>
                    </div>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-3xl border-none shadow-2xl" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    locale={it}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              <div className="hidden md:block w-px h-10 bg-gray-100" />

              {/* Surface Filter */}
              <div className="flex-1 w-full">
                <Select value={selectedSurface} onValueChange={setSelectedSurface}>
                  <SelectTrigger className="h-auto border-none shadow-none bg-transparent px-8 py-4 hover:bg-gray-50 transition-colors rounded-[2rem] focus:ring-0 group">
                    <div className="flex flex-col items-start text-left">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 group-hover:text-primary transition-colors">Superficie</span>
                      <div className="flex items-center gap-2">
                        <Layers size={16} className="text-club-orange" />
                        <span className="text-sm font-bold text-gray-700">
                          {selectedSurface === 'all' ? 'Qualsiasi' : SURFACE_LABELS[selectedSurface]}
                        </span>
                      </div>
                    </div>
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-none shadow-xl">
                    <SelectItem value="all">Tutte le superfici</SelectItem>
                    <SelectItem value="terra_rossa">Terra Rossa</SelectItem>
                    <SelectItem value="erba_sintetica">Sintetico</SelectItem>
                    <SelectItem value="superficie_dura">Cemento</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="hidden md:block w-px h-10 bg-gray-100" />

              {/* Type Filter */}
              <div className="flex-1 w-full">
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger className="h-auto border-none shadow-none bg-transparent px-8 py-4 hover:bg-gray-50 transition-colors rounded-[2rem] focus:ring-0 group">
                    <div className="flex flex-col items-start text-left">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 group-hover:text-primary transition-colors">Tipologia</span>
                      <div className="flex items-center gap-2">
                        <Target size={16} className="text-club-orange" />
                        <span className="text-sm font-bold text-gray-700">
                          {selectedType === 'all' ? 'Qualsiasi' : selectedType.charAt(0).toUpperCase() + selectedType.slice(1)}
                        </span>
                      </div>
                    </div>
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-none shadow-xl">
                    <SelectItem value="all">Tutti i tipi</SelectItem>
                    <SelectItem value="singolare">Singolare</SelectItem>
                    <SelectItem value="doppio">Doppio</SelectItem>
                    <SelectItem value="lezione">Lezione</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Reset / Search Button */}
              <div className="px-4 py-2 w-full md:w-auto">
                <Button 
                  onClick={resetFilters}
                  className={cn(
                    "w-full md:w-14 h-14 rounded-full transition-all duration-300 flex items-center justify-center",
                    (selectedDate || selectedSurface !== 'all' || selectedType !== 'all') 
                      ? "bg-destructive text-white hover:bg-destructive/90" 
                      : "bg-primary text-white hover:scale-105"
                  )}
                >
                  {(selectedDate || selectedSurface !== 'all' || selectedType !== 'all') ? <X size={20} /> : <Filter size={20} />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="space-y-1">
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">
              {selectedDate ? 'Match del giorno' : 'Prossimi impegni'}
            </h2>
            <p className="text-sm font-medium text-gray-500">
              Trovate {filteredGroups.length} prenotazioni corrispondenti
            </p>
          </div>
        </div>

        {filteredGroups.length === 0 ? (
          <div className="text-center py-32 bg-white/50 rounded-[3rem] border-2 border-dashed border-gray-100">
            <div className="bg-gray-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Info className="h-10 w-10 text-gray-300" />
            </div>
            <p className="text-xl font-bold text-gray-900">Nessun match trovato</p>
            <p className="text-gray-500 font-medium mt-2">Prova a cambiare i filtri o prenota un nuovo campo.</p>
            <Link to="/book" className="mt-8 inline-block">
              <Button className="bg-primary hover:bg-primary/90 rounded-2xl px-8 h-14 font-bold shadow-lg shadow-primary/20">
                Prenota ora
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredGroups.map((group) => {
              const isFuture = !isBefore(group.date, startOfDay(new Date()));
              return (
                <Card key={group.id} className={cn(
                  "group border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_15px_40px_rgba(0,0,0,0.08)] rounded-[2.5rem] transition-all duration-500 bg-white overflow-hidden hover:-translate-y-2",
                  group.isRecipientOnly && "bg-blue-50/30"
                )}>
                  <div className={cn(
                    "h-2 w-full",
                    group.status === 'confirmed' ? "bg-primary" : "bg-destructive"
                  )}></div>
                  <CardContent className="p-8">
                    <div className="flex justify-between items-start mb-6">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge className={cn(
                            "border-none font-black text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-full",
                            group.status === 'confirmed' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          )}>
                            {group.status === 'confirmed' ? 'Confermata' : 'Annullata'}
                          </Badge>
                          {group.isRecipientOnly && (
                            <Badge className="bg-blue-100 text-blue-700 border-none font-black text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-full">Ricevuta</Badge>
                          )}
                        </div>
                        <h3 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                          <MapPin size={20} className="text-club-orange" /> {group.courtName}
                        </h3>
                        <p className="text-[11px] font-bold text-primary uppercase tracking-widest">
                          {format(group.date, 'EEEE d MMMM', { locale: it })}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4 bg-gray-50/80 p-6 rounded-[2rem] border border-gray-100 mb-8">
                      <div className="flex items-center gap-4">
                        <div className="bg-white p-2.5 rounded-xl shadow-sm text-club-orange"><Clock size={18}/></div>
                        <div>
                          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Orario</p>
                          <p className="text-base font-bold text-gray-700">{group.startTime} - {group.endTime} <span className="text-xs font-medium opacity-60">({group.totalHours}h)</span></p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="bg-white p-2.5 rounded-xl shadow-sm text-club-orange"><Users size={18}/></div>
                        <div>
                          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Socio</p>
                          <p className="text-base font-bold text-gray-700 truncate max-w-[180px]">
                            {group.isRecipientOnly ? "Prenotata per te" : group.bookedForName}
                          </p>
                        </div>
                      </div>
                    </div>

                    {group.notes && (
                      <div className="mb-8 px-2">
                        <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest mb-1">Note</p>
                        <p className="text-sm text-gray-500 italic leading-relaxed line-clamp-2">"{group.notes}"</p>
                      </div>
                    )}

                    <div className="pt-6 border-t border-gray-50">
                      {isFuture && !group.isRecipientOnly ? (
                        <div className="flex gap-3">
                          <Button 
                            variant="outline" 
                            className="flex-1 h-12 rounded-xl border-2 border-gray-100 text-gray-700 font-bold hover:border-primary/20 hover:bg-primary/5 hover:text-primary transition-all"
                            onClick={() => navigate('/edit-booking', { state: { group } })}
                          >
                            <Edit className="h-4 w-4 mr-2" /> Modifica
                          </Button>
                          <Button 
                            variant="destructive" 
                            className="w-12 h-12 rounded-xl p-0 flex items-center justify-center"
                            onClick={() => handleDelete(group)}
                            disabled={deletingGroupId === group.id}
                          >
                            {deletingGroupId === group.id ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : <Trash2 className="h-4 w-4" />}
                          </Button>
                        </div>
                      ) : (
                        <div className="text-center py-3 bg-gray-50 rounded-2xl">
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center justify-center gap-2">
                            <Info size={12} /> {group.isRecipientOnly ? "Gestita dal prenotante" : "Match concluso"}
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
      </div>
    </div>
  );
};

export default BookingHistory;
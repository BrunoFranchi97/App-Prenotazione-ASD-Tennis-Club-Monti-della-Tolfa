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
import { ArrowLeft, Clock, Users, Trash2, Info, CalendarDays, MapPin, Edit, X, Filter, Layers, Target, ChevronDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { cleanReservationNotes } from '@/utils/noteCleaner';
import UserNav from '@/components/UserNav';
import { cn } from '@/lib/utils';
import type { Court, Reservation } from '@/types/supabase';

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
  "terra_rossa": "Terra",
  "erba_sintetica": "Erba",
  "superficie_dura": "Cem.",
};

const BookingHistory = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedSurface, setSelectedSurface] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/login'); return; }
      setCurrentUserId(user.id);

      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();

      let query = supabase.from('reservations').select('*');
      if (profile?.full_name) {
        const parts = profile.full_name.trim().split(/\s+/);
        const firstName = parts[0];
        const lastName = parts.slice(1).join(' ');
        if (firstName && lastName) {
          query = query.or(`user_id.eq.${user.id},and(booked_for_first_name.ilike.${firstName},booked_for_last_name.ilike.${lastName})`);
        } else { query = query.eq('user_id', user.id); }
      } else { query = query.eq('user_id', user.id); }

      const { data: reservationsData } = await query.order('starts_at', { ascending: true });
      setReservations(reservationsData || []);

      const { data: courtsData } = await supabase.from('courts').select('*');
      setCourts(courtsData || []);
    } catch (err: any) { showError(err.message); }
    finally { setLoading(false); }
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
          id: groupKey, courtId: res.court_id, courtName: court?.name || `Campo ${res.court_id}`,
          courtSurface: court?.surface, date: startOfDay(date), reservations: [res],
          startTime: format(date, 'HH:mm'), endTime: format(parseISO(res.ends_at), 'HH:mm'),
          totalHours: 1, status: res.status,
          bookedForName: res.booked_for_first_name && res.booked_for_last_name ? `${res.booked_for_first_name} ${res.booked_for_last_name}` : "Te stesso",
          notes: cleanReservationNotes(res.notes), bookingType: res.booking_type, isRecipientOnly
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
    if (selectedDate) filtered = filtered.filter(g => isSameDay(g.date, selectedDate));
    else {
      const today = startOfDay(new Date());
      filtered = filtered.filter(g => !isBefore(g.date, today));
    }
    if (selectedSurface !== "all") filtered = filtered.filter(g => g.courtSurface === selectedSurface);
    if (selectedType !== "all") filtered = filtered.filter(g => g.bookingType === selectedType);
    
    return filtered.sort((a, b) => {
      const dateDiff = a.date.getTime() - b.date.getTime();
      if (dateDiff !== 0) return dateDiff;
      return a.startTime.localeCompare(b.startTime);
    });
  }, [allGroups, selectedDate, selectedSurface, selectedType]);

  const isFiltered = selectedDate || selectedSurface !== 'all' || selectedType !== 'all';

  const handleDelete = async (group: ReservationGroup) => {
    setDeletingGroupId(group.id);
    try {
      for (const res of group.reservations) await supabase.from('reservations').delete().eq('id', res.id);
      showSuccess("Prenotazione eliminata!");
      fetchData();
    } catch (err: any) { showError(err.message); }
    finally { setDeletingGroupId(null); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]"><div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div></div>;

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 sm:p-8 lg:p-10">
      <header className="flex justify-between items-center mb-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-4">
          <Link to="/dashboard">
            <Button variant="outline" size="icon" className="rounded-xl border-none shadow-sm bg-white text-primary hover:scale-105 transition-transform h-9 w-9">
              <ArrowLeft size={18} />
            </Button>
          </Link>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">I miei Campi</h1>
        </div>
        <UserNav />
      </header>

      {/* Ultra-Compact Filter Bar */}
      <div className="max-w-6xl mx-auto mb-8 sticky top-4 z-40">
        <div className="bg-white/80 backdrop-blur-md border border-gray-100 shadow-lg rounded-full p-1.5 flex items-center gap-1">
          
          {/* Date Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <button className={cn(
                "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-full transition-all hover:bg-gray-50",
                selectedDate && "bg-primary/5 text-primary"
              )}>
                <CalendarDays size={14} className={selectedDate ? "text-primary" : "text-club-orange"} />
                <span className="text-[11px] font-bold truncate max-w-[80px]">
                  {selectedDate ? format(selectedDate, 'd MMM', { locale: it }) : 'Quando'}
                </span>
                <ChevronDown size={10} className="opacity-40" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 rounded-3xl border-none shadow-2xl" align="start">
              <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} locale={it} initialFocus />
            </PopoverContent>
          </Popover>

          <div className="w-px h-4 bg-gray-100" />

          {/* Surface Filter */}
          <div className="flex-1">
            <Select value={selectedSurface} onValueChange={setSelectedSurface}>
              <SelectTrigger className="h-auto border-none shadow-none bg-transparent px-3 py-2 hover:bg-gray-50 rounded-full focus:ring-0 flex items-center justify-center gap-2">
                <Layers size={14} className={selectedSurface !== 'all' ? "text-primary" : "text-club-orange"} />
                <span className="text-[11px] font-bold truncate max-w-[80px]">
                  {selectedSurface === 'all' ? 'Superficie' : SURFACE_LABELS[selectedSurface]}
                </span>
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-none shadow-xl">
                <SelectItem value="all">Tutte</SelectItem>
                <SelectItem value="terra_rossa">Terra</SelectItem>
                <SelectItem value="erba_sintetica">Erba</SelectItem>
                <SelectItem value="superficie_dura">Cemento</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-px h-4 bg-gray-100" />

          {/* Type Filter */}
          <div className="flex-1">
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="h-auto border-none shadow-none bg-transparent px-3 py-2 hover:bg-gray-50 rounded-full focus:ring-0 flex items-center justify-center gap-2">
                <Target size={14} className={selectedType !== 'all' ? "text-primary" : "text-club-orange"} />
                <span className="text-[11px] font-bold truncate max-w-[80px]">
                  {selectedType === 'all' ? 'Tipo' : selectedType.charAt(0).toUpperCase() + selectedType.slice(1, 4)}
                </span>
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-none shadow-xl">
                <SelectItem value="all">Tutti</SelectItem>
                <SelectItem value="singolare">Singolare</SelectItem>
                <SelectItem value="doppio">Doppio</SelectItem>
                <SelectItem value="lezione">Lezione</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Reset Button - Only visible when filtered */}
          {isFiltered && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => { setSelectedDate(undefined); setSelectedSurface("all"); setSelectedType("all"); }}
              className="h-8 w-8 rounded-full bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition-all"
            >
              <X size={14} />
            </Button>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto">
        <div className="flex items-end justify-between mb-6 px-2">
          <div className="space-y-0.5">
            <h2 className="text-lg font-black text-gray-900 tracking-tight">
              {selectedDate ? 'Match del giorno' : 'Prossimi impegni'}
            </h2>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              {filteredGroups.length} {filteredGroups.length === 1 ? 'prenotazione' : 'prenotazioni'}
            </p>
          </div>
        </div>

        {filteredGroups.length === 0 ? (
          <div className="text-center py-20 bg-white/50 rounded-[2.5rem] border-2 border-dashed border-gray-100">
            <Info className="mx-auto h-10 w-10 text-gray-200 mb-3" />
            <p className="text-sm font-bold text-gray-500">Nessun match trovato</p>
            <Link to="/book" className="mt-4 inline-block">
              <Button size="sm" className="bg-primary hover:bg-primary/90 rounded-full px-6 font-bold">Prenota ora</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredGroups.map((group) => {
              const isFuture = !isBefore(group.date, startOfDay(new Date()));
              return (
                <Card key={group.id} className={cn(
                  "group border-none shadow-sm hover:shadow-xl rounded-[2rem] transition-all duration-500 bg-white overflow-hidden hover:-translate-y-1",
                  group.isRecipientOnly && "bg-blue-50/20"
                )}>
                  <div className={cn("h-1.5 w-full", group.status === 'confirmed' ? "bg-primary" : "bg-destructive")}></div>
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge className={cn(
                            "border-none font-black text-[8px] uppercase tracking-widest px-2 py-0.5 rounded-full",
                            group.status === 'confirmed' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          )}>
                            {group.status === 'confirmed' ? 'OK' : 'Annullata'}
                          </Badge>
                          {group.isRecipientOnly && (
                            <Badge className="bg-blue-100 text-blue-700 border-none font-black text-[8px] uppercase tracking-widest px-2 py-0.5 rounded-full">Ricevuta</Badge>
                          )}
                        </div>
                        <h3 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                          <MapPin size={16} className="text-club-orange" /> {group.courtName}
                        </h3>
                        <p className="text-[10px] font-bold text-primary uppercase tracking-widest">
                          {format(group.date, 'EEEE d MMMM', { locale: it })}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3 bg-gray-50/80 p-4 rounded-2xl border border-gray-100 mb-6">
                      <div className="flex items-center gap-3">
                        <Clock size={14} className="text-club-orange shrink-0"/>
                        <p className="text-xs font-bold text-gray-700">{group.startTime} - {group.endTime} <span className="text-[10px] opacity-50">({group.totalHours}h)</span></p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Users size={14} className="text-club-orange shrink-0"/>
                        <p className="text-xs font-bold text-gray-700 truncate">
                          {group.isRecipientOnly ? "Prenotata per te" : group.bookedForName}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {isFuture && !group.isRecipientOnly ? (
                        <>
                          <Button 
                            variant="outline" 
                            className="flex-1 h-10 rounded-xl border-gray-100 text-gray-700 font-bold text-xs hover:bg-primary/5 hover:text-primary transition-all"
                            onClick={() => navigate('/edit-booking', { state: { group } })}
                          >
                            <Edit className="h-3.5 w-3.5 mr-2" /> Modifica
                          </Button>
                          <Button 
                            variant="destructive" 
                            className="w-10 h-10 rounded-xl p-0 flex items-center justify-center"
                            onClick={() => handleDelete(group)}
                            disabled={deletingGroupId === group.id}
                          >
                            {deletingGroupId === group.id ? <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </>
                      ) : (
                        <div className="w-full text-center py-2 bg-gray-50 rounded-xl">
                          <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center justify-center gap-2">
                            <Info size={10} /> {group.isRecipientOnly ? "Gestita dal prenotante" : "Match concluso"}
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
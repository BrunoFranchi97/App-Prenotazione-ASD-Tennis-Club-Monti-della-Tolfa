"use client";

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, startOfMonth, subMonths, isWithinInterval, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, BarChart2, TrendingUp, Users, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { Court, Reservation } from '@/types/supabase';

const AdminUsageStats = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [courts, setCourts] = useState<Court[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("current");
  const [topUsers, setTopUsers] = useState<{name: string, count: number}[]>([]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: isAdmin } = await supabase.from('profiles').select('is_admin').eq('id', user?.id).single();
      if (!isAdmin?.is_admin) return navigate('/dashboard');

      const [cData, rData, pData] = await Promise.all([
        supabase.from('courts').select('*'),
        supabase.from('reservations').select('*').neq('status', 'cancelled'),
        supabase.from('profiles').select('id, full_name')
      ]);

      setCourts(cData.data || []);
      setReservations(rData.data || []);

      const userMap = new Map(pData.data?.map(p => [p.id, p.full_name || "Socio"]) || []);
      const userCounts: Record<string, number> = {};
      rData.data?.forEach(r => {
        userCounts[r.user_id] = (userCounts[r.user_id] || 0) + 1;
      });

      const top = Object.entries(userCounts)
        .map(([id, count]) => ({ name: userMap.get(id) || "Socio", count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      
      setTopUsers(top);
    } catch (e: any) { showError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchStats(); }, []);

  const statsByCourt = useMemo(() => {
    const now = new Date();
    const start = selectedPeriod === "current" ? startOfMonth(now) : subMonths(now, 3);
    const filtered = reservations.filter(r => isWithinInterval(parseISO(r.starts_at), { start, end: now }));

    return courts.map(c => {
      const courtRes = filtered.filter(r => r.court_id === c.id);
      return {
        name: c.name,
        count: courtRes.length,
        hours: courtRes.length // Ogni record è 1h nell'attuale logica
      };
    });
  }, [courts, reservations, selectedPeriod]);

  if (loading) return <div className="p-8 text-center">Caricamento statistiche...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-3">
          <Link to="/admin"><Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <h1 className="text-3xl font-bold text-primary">Statistiche</h1>
        </div>
        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="current">Mese Corrente</SelectItem>
            <SelectItem value="last3">Ultimi 3 Mesi</SelectItem>
          </SelectContent>
        </Select>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="p-6 flex flex-col items-center">
          <Users className="h-8 w-8 text-primary mb-2" />
          <p className="text-sm text-gray-500 uppercase font-bold">Prenotazioni Totali</p>
          <p className="text-4xl font-black">{reservations.length}</p>
        </Card>
        <Card className="p-6 flex flex-col items-center">
          <Clock className="h-8 w-8 text-club-orange mb-2" />
          <p className="text-sm text-gray-500 uppercase font-bold">Ore Giocate</p>
          <p className="text-4xl font-black">{reservations.length}h</p>
        </Card>
        <Card className="p-6 flex flex-col items-center">
          <TrendingUp className="h-8 w-8 text-green-500 mb-2" />
          <p className="text-sm text-gray-500 uppercase font-bold">Campi Attivi</p>
          <p className="text-4xl font-black">{courts.length}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader><CardTitle>Utilizzo per Campo</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Campo</TableHead><TableHead>Prenotazioni</TableHead><TableHead>Ore</TableHead></TableRow></TableHeader>
              <TableBody>
                {statsByCourt.map(s => (
                  <TableRow key={s.name}>
                    <TableCell className="font-bold">{s.name}</TableCell>
                    <TableCell>{s.count}</TableCell>
                    <TableCell>{s.hours}h</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top 5 Soci Attivi</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topUsers.map((u, i) => (
                <div key={u.name} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                  <span className="font-bold text-gray-700">{i+1}. {u.name}</span>
                  <Badge>{u.count} match</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminUsageStats;
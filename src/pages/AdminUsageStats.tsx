"use client";

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, subMonths, isWithinInterval, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, LogOut, BarChart2, TrendingUp, Users, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { Court, Reservation } from '@/types/supabase';

interface CourtStats {
  court: Court;
  totalReservations: number;
  totalHours: number;
  utilizationRate: number;
  monthlyReservations: number;
}

interface MonthlyStats {
  month: string;
  totalReservations: number;
  totalHours: number;
  uniqueUsers: number;
}

const AdminUsageStats = () => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [courts, setCourts] = useState<Court[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("current");
  const [courtStats, setCourtStats] = useState<CourtStats[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats[]>([]);

  const periods = [
    { value: "current", label: "Mese Corrente" },
    { value: "last3", label: "Ultimi 3 Mesi" },
    { value: "last6", label: "Ultimi 6 Mesi" },
    { value: "year", label: "Ultimo Anno" }
  ];

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

  const fetchData = async () => {
    try {
      // Fetch courts
      const { data: courtsData, error: courtsError } = await supabase
        .from('courts')
        .select('*')
        .order('name', { ascending: true });

      if (courtsError) throw courtsError;
      setCourts(courtsData || []);

      // Fetch reservations
      const { data: reservationsData, error: reservationsError } = await supabase
        .from('reservations')
        .select('*')
        .order('starts_at', { ascending: false });

      if (reservationsError) throw reservationsError;
      setReservations(reservationsData || []);

    } catch (err: any) {
      showError("Errore nel caricamento dei dati: " + err.message);
    }
  };

  const calculateStats = () => {
    if (!courts.length || !reservations.length) return;

    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    switch (selectedPeriod) {
      case "current":
        startDate = startOfMonth(now);
        endDate = endOfMonth(now);
        break;
      case "last3":
        startDate = subMonths(now, 3);
        break;
      case "last6":
        startDate = subMonths(now, 6);
        break;
      case "year":
        startDate = subMonths(now, 12);
        break;
      default:
        startDate = subMonths(now, 1);
    }

    // Filter reservations by period
    const filteredReservations = reservations.filter(reservation => {
      const reservationDate = parseISO(reservation.starts_at);
      return isWithinInterval(reservationDate, { start: startDate, end: endDate });
    });

    // Calculate court stats
    const stats: CourtStats[] = courts.map(court => {
      const courtReservations = filteredReservations.filter(r => r.court_id === court.id);
      const totalHours = courtReservations.reduce((sum, r) => {
        const start = parseISO(r.starts_at);
        const end = parseISO(r.ends_at);
        return sum + (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      }, 0);

      // Calculate utilization rate (simplified: based on 12 hours per day, 30 days)
      const totalPossibleHours = selectedPeriod === "current" ? 12 * 30 : 
        selectedPeriod === "last3" ? 12 * 90 :
        selectedPeriod === "last6" ? 12 * 180 : 12 * 365;
      const utilizationRate = totalPossibleHours > 0 ? (totalHours / totalPossibleHours) * 100 : 0;

      return {
        court,
        totalReservations: courtReservations.length,
        totalHours: Math.round(totalHours * 10) / 10,
        utilizationRate: Math.round(utilizationRate * 10) / 10,
        monthlyReservations: Math.round((courtReservations.length / (selectedPeriod === "current" ? 1 : 
          selectedPeriod === "last3" ? 3 : selectedPeriod === "last6" ? 6 : 12)) * 10) / 10
      };
    });

    setCourtStats(stats);

    // Calculate monthly stats
    const monthlyData: { [key: string]: MonthlyStats } = {};
    
    filteredReservations.forEach(reservation => {
      const date = parseISO(reservation.starts_at);
      const monthKey = format(date, 'MMMM yyyy', { locale: it });
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthKey,
          totalReservations: 0,
          totalHours: 0,
          uniqueUsers: new Set()
        } as any;
      }
      
      monthlyData[monthKey].totalReservations++;
      monthlyData[monthKey].totalHours += (parseISO(reservation.ends_at).getTime() - date.getTime()) / (1000 * 60 * 60);
      (monthlyData[monthKey] as any).uniqueUsers.add(reservation.user_id);
    });

    // Convert Set to number and round hours
    const monthlyStatsArray = Object.values(monthlyData).map(stat => ({
      ...stat,
      totalHours: Math.round(stat.totalHours * 10) / 10,
      uniqueUsers: (stat as any).uniqueUsers.size
    }));

    setMonthlyStats(monthlyStatsArray.reverse());
  };

  useEffect(() => {
    const initialize = async () => {
      await fetchAdminStatus();
      if (isAdmin) {
        await fetchData();
      }
      setLoading(false);
    };
    initialize();
  }, []);

  useEffect(() => {
    calculateStats();
  }, [courts, reservations, selectedPeriod]);

  if (!isAdmin && !loading) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white p-4">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4 text-primary">Caricamento...</h1>
          <p className="text-xl text-gray-600">Calcolo statistiche.</p>
        </div>
      </div>
    );
  }

  const totalReservations = courtStats.reduce((sum, stat) => sum + stat.totalReservations, 0);
  const totalHours = courtStats.reduce((sum, stat) => sum + stat.totalHours, 0);
  const avgUtilization = courtStats.length > 0 ? 
    Math.round((courtStats.reduce((sum, stat) => sum + stat.utilizationRate, 0) / courtStats.length) * 10) / 10 : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center">
          <Link to="/admin" className="mr-4">
            <Button variant="outline" size="icon" className="text-primary border-primary hover:bg-secondary hover:text-primary">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-primary">Statistiche Utilizzo</h1>
        </div>
        <div className="flex items-center gap-4">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periods.map((period) => (
                <SelectItem key={period.value} value={period.value}>
                  {period.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" className="text-primary border-primary hover:bg-secondary hover:text-primary" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" /> Esci
          </Button>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="shadow-lg rounded-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prenotazioni Totali</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalReservations}</div>
            <p className="text-xs text-muted-foreground">
              {periods.find(p => p.value === selectedPeriod)?.label}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-lg rounded-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ore Totali</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHours}</div>
            <p className="text-xs text-muted-foreground">
              Ore di utilizzo
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-lg rounded-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Utilizzo Medio</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgUtilization}%</div>
            <p className="text-xs text-muted-foreground">
              Tasso di utilizzo
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-lg rounded-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Campi Attivi</CardTitle>
            <BarChart2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{courts.filter(c => c.is_active).length}/{courts.length}</div>
            <p className="text-xs text-muted-foreground">
              Campi disponibili
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Court Stats Table */}
      <Card className="shadow-lg rounded-lg mb-8">
        <CardHeader>
          <CardTitle className="text-primary">Statistiche per Campo</CardTitle>
          <CardDescription>Utilizzo dettagliato di ogni campo</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campo</TableHead>
                  <TableHead>Superficie</TableHead>
                  <TableHead>Prenotazioni</TableHead>
                  <TableHead>Ore Totali</TableHead>
                  <TableHead>Media Mensile</TableHead>
                  <TableHead>Tasso Utilizzo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courtStats.map((stat) => (
                  <TableRow key={stat.court.id}>
                    <TableCell className="font-medium">{stat.court.name}</TableCell>
                    <TableCell>{stat.court.surface}</TableCell>
                    <TableCell>{stat.totalReservations}</TableCell>
                    <TableCell>{stat.totalHours}h</TableCell>
                    <TableCell>{stat.monthlyReservations}</TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                          <div 
                            className="bg-primary h-2 rounded-full" 
                            style={{ width: `${Math.min(stat.utilizationRate, 100)}%` }}
                          ></div>
                        </div>
                        <span className="text-sm">{stat.utilizationRate}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Stats */}
      {monthlyStats.length > 0 && (
        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-primary">Andamento Mensile</CardTitle>
            <CardDescription>Evoluzione delle prenotazioni nel tempo</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mese</TableHead>
                    <TableHead>Prenotazioni</TableHead>
                    <TableHead>Ore Totali</TableHead>
                    <TableHead>Utenti Unici</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyStats.map((stat, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{stat.month}</TableCell>
                      <TableCell>{stat.totalReservations}</TableCell>
                      <TableCell>{stat.totalHours}h</TableCell>
                      <TableCell>{stat.uniqueUsers}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AdminUsageStats;
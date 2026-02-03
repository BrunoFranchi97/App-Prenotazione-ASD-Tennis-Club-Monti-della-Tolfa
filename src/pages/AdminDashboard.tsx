"use client";

import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarPlus, Lock, BarChart2, LogOut, BookOpen, ArrowLeft, Users, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import Footer from '@/components/Footer';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unapprovedCount, setUnapprovedCount] = useState(0);

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
        return false;
      } else {
        setIsAdmin(true);
        return true;
      }
    } else {
      setIsAdmin(false);
      navigate('/login');
      return false;
    }
  };

  const fetchUnapprovedCount = async () => {
    const { count, error } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('approved', false);

    if (error) {
      console.error("Error fetching unapproved count:", error.message);
      setUnapprovedCount(0);
    } else {
      setUnapprovedCount(count || 0);
    }
  };

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

  useEffect(() => {
    let isMounted = true;
    
    const initialize = async () => {
      setLoading(true);
      const adminOk = await fetchAdminStatus();
      if (isMounted && adminOk) {
        await fetchUnapprovedCount();
      }
      if (isMounted) {
        setLoading(false);
      }
    };
    
    initialize();

    // Realtime subscription for unapproved users count
    const channel = supabase
      .channel('schema-profiles-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles'
        },
        () => {
          fetchUnapprovedCount();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-white flex flex-col">
        <div className="flex-grow p-4 sm:p-6 lg:p-8">
          <header className="flex justify-between items-center mb-8">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-10 w-24" />
          </header>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-48 w-full" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-green-50 to-white">
      <div className="flex-grow p-4 sm:p-6 lg:p-8">
        <header className="flex justify-between items-center mb-8">
          <div className="flex items-center">
            <Link to="/dashboard" className="mr-4">
              <Button variant="outline" size="icon" className="text-primary border-primary hover:bg-secondary">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-primary">Pannello Amministrativo</h1>
          </div>
          <Button variant="outline" className="text-primary border-primary hover:bg-secondary" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" /> Esci
          </Button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className={`shadow-lg rounded-lg ${unapprovedCount > 0 ? 'border-2 border-red-500' : ''}`}>
            <CardHeader>
              <CardTitle className="text-primary flex items-center">
                <CheckCircle className="mr-2 h-5 w-5" /> Gestisci Approvazioni
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 mb-4">
                {unapprovedCount > 0 
                  ? <span className="font-bold text-red-600">{unapprovedCount} soci in attesa di approvazione.</span>
                  : "Nessun socio in attesa di approvazione."
                }
              </p>
              <Link to="/admin/approvals">
                <Button className="w-full bg-club-orange hover:bg-club-orange/80 text-club-orange-foreground">
                  <Users className="mr-2 h-4 w-4" /> Approva Soci
                </Button>
              </Link>
            </CardContent>
          </Card>
          
          <Card className="shadow-lg rounded-lg">
            <CardHeader>
              <CardTitle className="text-primary flex items-center">
                <BookOpen className="mr-2 h-5 w-5" /> Gestisci Prenotazioni
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 mb-4">Visualizza, modifica, elimina e crea nuove prenotazioni.</p>
              <Link to="/admin/reservations">
                <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">Gestisci</Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="shadow-lg rounded-lg">
            <CardHeader>
              <CardTitle className="text-primary flex items-center">
                <CalendarPlus className="mr-2 h-5 w-5" /> Gestisci Campi
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 mb-4">Attiva o disattiva i campi per renderli prenotabili.</p>
              <Link to="/admin/manage-schedules">
                <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">Gestisci</Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="shadow-lg rounded-lg">
            <CardHeader>
              <CardTitle className="text-primary flex items-center">
                <Lock className="mr-2 h-5 w-5" /> Blocca Slot
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 mb-4">Blocca fasce orarie per manutenzione o tornei.</p>
              <Link to="/admin/block-slots">
                <Button variant="outline" className="w-full text-primary border-primary hover:bg-secondary">Blocca</Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="shadow-lg rounded-lg">
            <CardHeader>
              <CardTitle className="text-primary flex items-center">
                <BarChart2 className="mr-2 h-5 w-5" /> Statistiche Utilizzo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 mb-4">Visualizza le statistiche di utilizzo per ciascun campo.</p>
              <Link to="/admin/usage-stats">
                <Button variant="outline" className="w-full text-primary border-primary hover:bg-secondary">Vedi Statistiche</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default AdminDashboard;
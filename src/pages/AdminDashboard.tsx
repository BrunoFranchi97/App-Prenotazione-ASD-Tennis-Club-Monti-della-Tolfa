"use client";

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { CalendarPlus, Lock, BarChart2, LogOut, BookOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
      setLoading(false);
    };
    fetchAdminStatus();
  }, [navigate]);

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4 text-primary">Caricamento...</h1>
          <p className="text-xl text-gray-600">Verifica permessi amministrativi.</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    // Questo blocco dovrebbe essere raggiunto solo se c'è un ritardo nel reindirizzamento
    return null; 
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-primary">Pannello Amministrativo</h1>
        <Button variant="outline" className="text-primary border-primary hover:bg-secondary" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" /> Esci
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
              <CalendarPlus className="mr-2 h-5 w-5" /> Gestisci Orari
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 mb-4">Aggiungi o modifica gli orari disponibili per i campi.</p>
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
  );
};

export default AdminDashboard;
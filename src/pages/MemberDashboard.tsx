"use client";

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { CalendarDays, History, LogOut, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';

const MemberDashboard = () => {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error("Error fetching user profile:", error.message);
          setFullName(user.email); // Fallback to email if name not found
        } else if (profile) {
          setFullName(profile.full_name);
        } else {
          setFullName(user.email); // Fallback to email if no profile
        }
      } else {
        setFullName("Socio"); // Default if no user session
      }
    };
    fetchUserProfile();
  }, []);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-primary">Benvenuto, {fullName}!</h1>
        <Button variant="outline" className="text-primary border-primary hover:bg-secondary" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" /> Esci
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-primary flex items-center">
              <CalendarDays className="mr-2 h-5 w-5" /> Prenota un Campo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 mb-4">Scegli la data e l'orario per la tua prossima partita.</p>
            <Link to="/book">
              <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">Vai al Calendario</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-primary flex items-center">
              <History className="mr-2 h-5 w-5" /> Storico Prenotazioni
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 mb-4">Visualizza le tue prenotazioni passate e future.</p>
            <Link to="/history">
              <Button variant="outline" className="w-full text-primary border-primary hover:bg-secondary">Vedi Storico</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-primary flex items-center">
              <Users className="mr-2 h-5 w-5" /> Prenota per un Socio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 mb-4">Effettua una prenotazione per un altro socio.</p>
            <Link to="/book-for-third-party">
              <Button variant="outline" className="w-full text-primary border-primary hover:bg-secondary">Prenota per Terzi</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MemberDashboard;
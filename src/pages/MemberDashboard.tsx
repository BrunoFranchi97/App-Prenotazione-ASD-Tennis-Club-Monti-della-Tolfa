"use client";

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CalendarDays, History, LogOut, Users, Settings, Search, FileText, AlertTriangle, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import Footer from '@/components/Footer';
import UserNav from '@/components/UserNav';

const MemberDashboard = () => {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isApproved, setIsApproved] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserProfile = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('full_name, is_admin, approved')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error("Error fetching user profile:", error.message);
          setFullName(user.email);
        } else if (profile) {
          setFullName(profile.full_name);
          setIsAdmin(profile.is_admin);
          setIsApproved(profile.approved);
        } else {
          setFullName(user.email);
        }
      } else {
        setFullName("Socio");
      }
      setLoading(false);
    };
    fetchUserProfile();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white p-4">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4 text-primary">Caricamento...</h1>
          <p className="text-xl text-gray-600">Recupero profilo utente.</p>
        </div>
      </div>
    );
  }

  const bookingRoutes = [
    { path: "/book", title: "Prenota un Campo", icon: CalendarDays, description: "Scegli la data e l'orario per la tua prossima partita." },
    { path: "/book-for-third-party", title: "Prenota per un Socio", icon: Users, description: "Effettua una prenotazione per un altro socio." },
    { path: "/find-match", title: "Cerco Partita", icon: Search, description: "Trova compagni di gioco del tuo livello." },
  ];

  const nonBookingRoutes = [
    { path: "/history", title: "Storico Prenotazioni", icon: History, description: "Visualizza le tue prenotazioni passate e future." },
    { path: "/medical-certificates", title: "Certificato Medico", icon: FileText, description: "Gestisci il tuo certificato medico e le scadenze." },
  ];

  const renderCard = (item: any, disabled: boolean, specialVariant: boolean = false) => {
    const Icon = item.icon;
    return (
      <Card key={item.path} className={`shadow-lg rounded-lg ${disabled ? 'opacity-60' : ''} ${specialVariant ? 'border-2 border-club-orange/20' : ''}`}>
        <CardHeader>
          <CardTitle className={`${specialVariant ? 'text-club-orange' : 'text-primary'} flex items-center`}>
            <Icon className="mr-2 h-5 w-5" /> {item.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-700 mb-4">{item.description}</p>
          <Link to={item.path} onClick={(e) => disabled && e.preventDefault()}>
            <Button 
              className={`w-full ${item.path === '/book' ? 'bg-primary hover:bg-primary/90 text-primary-foreground' : specialVariant ? 'bg-club-orange hover:bg-club-orange/90 text-white' : 'text-primary border-primary hover:bg-secondary hover:text-primary'}`}
              disabled={disabled}
              variant={item.path === '/book' || specialVariant ? 'default' : 'outline'}
            >
              {item.path === '/admin' ? 'Accedi al Pannello' : item.path === '/book' ? 'Vai al Calendario' : 'Visualizza'}
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-green-50 to-white">
      <div className="flex-grow p-4 sm:p-6 lg:p-8">
        <header className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-primary">Benvenuto, {fullName}!</h1>
          <UserNav />
        </header>

        {!isApproved && (
          <Alert className="mb-6 border-club-orange bg-club-orange/10 text-club-orange-foreground">
            <AlertTriangle className="h-4 w-4 text-club-orange" />
            <AlertTitle className="text-club-orange">Accesso Limitato</AlertTitle>
            <AlertDescription className="text-club-orange/90">
              Il tuo account è in attesa di approvazione da parte di un amministratore. 
              Fino all'approvazione, non potrai effettuare prenotazioni o cercare partite.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {bookingRoutes.map(item => renderCard(item, !isApproved))}
          {nonBookingRoutes.map(item => renderCard(item, false))}
          
          {isAdmin && renderCard({ 
            path: "/admin", 
            title: "Pannello Admin", 
            icon: ShieldCheck, 
            description: "Gestisci prenotazioni, soci, campi e visualizza le statistiche del club." 
          }, false, true)}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default MemberDashboard;
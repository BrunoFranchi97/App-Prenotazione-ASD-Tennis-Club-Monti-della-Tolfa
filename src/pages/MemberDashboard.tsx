"use client";

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CalendarDays, History, LogOut, Users, Settings, Search, FileText, AlertTriangle, ShieldCheck, ChevronRight } from 'lucide-react';
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
          setFullName(user.email);
        } else if (profile) {
          setFullName(profile.full_name);
          setIsAdmin(profile.is_admin);
          setIsApproved(profile.approved);
        } else {
          setFullName(user.email);
        }
      }
      setLoading(false);
    };
    fetchUserProfile();
  }, []);

  // Estrai solo il primo nome
  const firstName = fullName ? fullName.split(' ')[0] : 'Socio';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-500 font-medium">Caricamento Club...</p>
        </div>
      </div>
    );
  }

  const bookingRoutes = [
    { 
      path: "/book", 
      title: "Prenota un Campo", 
      icon: CalendarDays, 
      description: "Riserva il tuo slot orario per giocare.",
      buttonText: "Vai al Calendario",
      isPrimary: true
    },
    { 
      path: "/book-for-third-party", 
      title: "Prenota per Socio", 
      icon: Users, 
      description: "Gestisci la prenotazione per un altro socio.",
      buttonText: "Prenota per terzi"
    },
    { 
      path: "/find-match", 
      title: "Cerco Partita", 
      icon: Search, 
      description: "Trova nuovi avversari e organizza sfide.",
      buttonText: "Apri la Bacheca"
    },
  ];

  const nonBookingRoutes = [
    { 
      path: "/history", 
      title: "I miei Campi", 
      icon: History, 
      description: "Visualizza i tuoi impegni passati e futuri.",
      buttonText: "Vedi Prenotazioni"
    },
    { 
      path: "/medical-certificates", 
      title: "Certificato Medico", 
      icon: FileText, 
      description: "Carica e verifica l'idoneità sportiva.",
      buttonText: "Gestisci Documenti"
    },
  ];

  const renderCard = (item: any, disabled: boolean, isAdminCard: boolean = false) => {
    const Icon = item.icon;
    return (
      <Card key={item.path} className={`group relative border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] rounded-[1.5rem] transition-all duration-500 overflow-hidden bg-white ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:-translate-y-2'}`}>
        <div className={`h-1.5 w-full ${isAdminCard ? 'bg-club-orange' : item.isPrimary ? 'bg-primary' : 'bg-gray-100'}`}></div>
        <CardHeader className="pb-2">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-2 ${isAdminCard ? 'bg-club-orange/10 text-club-orange' : item.isPrimary ? 'bg-primary/10 text-primary' : 'bg-gray-50 text-gray-400'}`}>
            <Icon size={24} />
          </div>
          <CardTitle className={`text-xl font-bold tracking-tight ${isAdminCard ? 'text-club-orange' : 'text-gray-900'}`}>
            {item.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500 text-sm mb-6 leading-relaxed">{item.description}</p>
          <Link to={item.path} className="block" onClick={(e) => disabled && e.preventDefault()}>
            <Button 
              className={`w-full h-12 rounded-xl font-bold transition-all flex items-center justify-between px-5 ${item.isPrimary ? 'bg-primary hover:bg-[#357a46] text-white shadow-lg shadow-primary/10' : isAdminCard ? 'bg-club-orange hover:bg-opacity-90 text-white' : 'bg-white border-2 border-gray-100 text-gray-700 hover:border-primary/20 hover:bg-primary/5 hover:text-primary'}`}
              disabled={disabled}
              variant={item.isPrimary || isAdminCard ? 'default' : 'outline'}
            >
              {item.buttonText || "Visualizza"}
              <ChevronRight size={18} className={`transition-transform group-hover:translate-x-1 ${disabled ? 'opacity-0' : ''}`} />
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      <div className="flex-grow p-6 sm:p-10 lg:p-12 max-w-7xl mx-auto w-full">
        <header className="flex justify-between items-end mb-12">
          <div className="space-y-1">
            <p className="text-sm font-bold text-primary uppercase tracking-[0.2em] mb-1">Bentornato</p>
            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tighter">Ciao, {firstName}!</h1>
          </div>
          <UserNav />
        </header>

        {!isApproved && (
          <Alert className="mb-10 border-none bg-amber-50 rounded-[1.5rem] p-6 shadow-sm">
            <AlertTriangle className="h-6 w-6 text-amber-600 mt-1" />
            <div className="ml-4">
              <AlertTitle className="text-amber-800 font-bold text-lg">In attesa di approvazione</AlertTitle>
              <AlertDescription className="text-amber-700 mt-1">
                La segreteria sta verificando il tuo profilo. Presto potrai prenotare i campi!
              </AlertDescription>
            </div>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {bookingRoutes.map(item => renderCard(item, !isApproved))}
          {nonBookingRoutes.map(item => renderCard(item, false))}
          
          {isAdmin && renderCard({ 
            path: "/admin", 
            title: "Pannello Admin", 
            icon: ShieldCheck, 
            description: "Strumenti di gestione per l'amministrazione del club.",
            buttonText: "Accedi agli Strumenti"
          }, false, true)}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default MemberDashboard;
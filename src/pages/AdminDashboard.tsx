"use client";

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarPlus, Lock, BarChart2, LogOut, BookOpen, ArrowLeft, Users, CheckCircle, UserCog, ChevronRight, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import Footer from '@/components/Footer';
import UserNav from '@/components/UserNav';

const AdminDashboard = () => {
  const navigate = useNavigate();
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
      .eq('status', 'pending');

    if (error) {
      console.error("Error fetching unapproved count:", error.message);
      setUnapprovedCount(0);
    } else {
      setUnapprovedCount(count || 0);
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
      <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
        <div className="flex-grow p-6 sm:p-10 lg:p-12 max-w-7xl mx-auto w-full">
          <header className="flex justify-between items-end mb-12">
            <Skeleton className="h-12 w-64" />
            <Skeleton className="h-10 w-10 rounded-full" />
          </header>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Skeleton key={i} className="h-64 w-full rounded-[1.5rem]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  const adminTools = [
    { 
      path: "/admin/approvals", 
      title: "Approvazioni", 
      icon: CheckCircle, 
      description: "Abilita i nuovi soci a prenotare i campi.",
      buttonText: "Gestisci Richieste",
      badge: unapprovedCount > 0 ? unapprovedCount : undefined,
      isUrgent: unapprovedCount > 0
    },
    { 
      path: "/admin/users", 
      title: "Anagrafica Soci", 
      icon: UserCog, 
      description: "Gestisci i profili e i ruoli amministrativi.",
      buttonText: "Vedi Elenco"
    },
    { 
      path: "/admin/reservations", 
      title: "Prenotazioni", 
      icon: BookOpen, 
      description: "Visualizza e gestisci tutti i campi prenotati.",
      buttonText: "Apri Tabellone"
    },
    { 
      path: "/admin/block-slots", 
      title: "Blocca Slot", 
      icon: Lock, 
      description: "Riserva campi per manutenzione o tornei.",
      buttonText: "Aggiungi Blocco"
    },
    { 
      path: "/admin/manage-schedules", 
      title: "Asset Campi", 
      icon: CalendarPlus, 
      description: "Attiva o disattiva la visibilità dei campi.",
      buttonText: "Configura"
    },
    { 
      path: "/admin/usage-stats", 
      title: "Statistiche", 
      icon: BarChart2, 
      description: "Analizza l'utilizzo e le ore giocate nel club.",
      buttonText: "Vedi Report"
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      <div className="flex-grow p-6 sm:p-10 lg:p-12 max-w-7xl mx-auto w-full">
        <header className="flex justify-between items-end mb-12">
          <div className="flex items-center gap-6">
            <Link to="/dashboard">
              <Button variant="outline" size="icon" className="rounded-2xl border-none shadow-sm bg-white text-primary hover:scale-110 active:scale-95 transition-transform">
                <ArrowLeft size={20} />
              </Button>
            </Link>
            <div className="space-y-1">
              <p className="text-sm font-bold text-club-orange uppercase tracking-[0.2em] mb-1">Amministrazione</p>
              <h1 className="text-4xl font-extrabold text-gray-900 tracking-tighter">Pannello Controllo</h1>
            </div>
          </div>
          <UserNav />
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {adminTools.map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.path} className={`group relative border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] rounded-[1.5rem] transition-all duration-500 overflow-hidden bg-white hover:-translate-y-2`}>
                <div className={`h-1.5 w-full ${item.isUrgent ? 'bg-destructive' : 'bg-club-orange'}`}></div>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-2 ${item.isUrgent ? 'bg-destructive/10 text-destructive' : 'bg-club-orange/10 text-club-orange'}`}>
                      <Icon size={24} />
                    </div>
                    {item.badge && (
                      <div className="bg-destructive text-white text-[10px] font-black px-2.5 py-1 rounded-full animate-pulse shadow-md shadow-destructive/20">
                        {item.badge} AZIONI
                      </div>
                    )}
                  </div>
                  <CardTitle className="text-xl font-bold tracking-tight text-gray-900">
                    {item.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-500 text-sm mb-6 leading-relaxed">{item.description}</p>
                  <Link to={item.path} className="block">
                    <Button 
                      className={`w-full h-12 rounded-xl font-bold transition-all flex items-center justify-between px-5 bg-white border-2 border-gray-100 text-gray-700 hover:border-club-orange/20 hover:bg-club-orange/5 hover:text-club-orange`}
                      variant="outline"
                    >
                      {item.buttonText}
                      <ChevronRight size={18} className="transition-transform group-hover:translate-x-1" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default AdminDashboard;
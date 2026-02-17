"use client";

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CalendarDays, History, Users, Settings, Search, FileText, AlertTriangle, ShieldCheck, ChevronRight, Target } from 'lucide-react';
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
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <p className="text-gray-400 font-medium">Club Canepacce</p>
        </div>
      </div>
    );
  }

  const mainActions = [
    { 
      path: "/book", 
      title: "Prenota Campo", 
      icon: CalendarDays, 
      description: "Match veloce o allenamento",
      color: "from-green-500 to-green-700",
      accent: "bg-green-100 text-green-700"
    },
    { 
      path: "/find-match", 
      title: "Trova Sfida", 
      icon: Search, 
      description: "Cerca avversari nel club",
      color: "from-orange-400 to-orange-600",
      accent: "bg-orange-100 text-orange-700"
    },
    { 
      path: "/book-for-third-party", 
      title: "Prenota per Soci", 
      icon: Users, 
      description: "Organizza per altri",
      color: "from-blue-500 to-blue-700",
      accent: "bg-blue-100 text-blue-700"
    },
  ];

  const secondaryActions = [
    { path: "/history", title: "I miei Campi", icon: History, description: "Storico e futuri" },
    { path: "/medical-certificates", title: "Certificato Medico", icon: FileText, description: "Stato idoneità" },
    { path: "/profile", title: "Il mio Profilo", icon: Target, description: "Livello e dati" },
  ];

  const renderMainCard = (item: any, disabled: boolean) => {
    const Icon = item.icon;
    return (
      <Link 
        key={item.path} 
        to={disabled ? "#" : item.path} 
        className={`group block press-effect ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <Card className="h-full border-none shadow-depth hover:shadow-airbnb-hover transition-premium overflow-hidden bg-white">
          <div className={`h-2 w-full bg-gradient-to-r ${item.color}`}></div>
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-6">
              <div className={`p-3 rounded-2xl ${item.accent} shadow-inner`}>
                <Icon className="h-7 w-7" />
              </div>
              {!disabled && <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-primary group-hover:translate-x-1 transition-premium" />}
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-1">{item.title}</h3>
            <p className="text-sm text-gray-500">{item.description}</p>
          </CardContent>
        </Card>
      </Link>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FCFCFC]">
      <div className="flex-grow">
        {/* Header Premium */}
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100 px-6 py-4">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="bg-primary rounded-xl p-2 shadow-premium">
                <img src="/logo.png" alt="TC" className="h-6 w-6 invert brightness-0" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold tracking-widest text-gray-400 leading-none mb-1">Benvenuto</p>
                <h1 className="text-lg font-bold text-gray-900 truncate max-w-[150px] sm:max-w-none">{fullName}</h1>
              </div>
            </div>
            <UserNav />
          </div>
        </header>

        <main className="max-w-7xl mx-auto p-6 space-y-10">
          {!isApproved && (
            <Alert className="border-none shadow-depth bg-orange-50 rounded-2xl p-4 animate-in slide-in-from-top duration-500">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              <div className="ml-2">
                <AlertTitle className="text-orange-800 font-bold">Account in verifica</AlertTitle>
                <AlertDescription className="text-orange-700/80 text-sm">
                  Stiamo approvando il tuo profilo. Presto potrai prenotare!
                </AlertDescription>
              </div>
            </Alert>
          )}

          {/* Sezione Hero / Main Actions */}
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">Azioni Rapide</h2>
              {isAdmin && (
                <Link to="/admin">
                  <Button variant="ghost" size="sm" className="text-primary font-bold hover:bg-primary/5 rounded-full px-4">
                    <Settings className="mr-2 h-4 w-4" /> Pannello Admin
                  </Button>
                </Link>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {mainActions.map(item => renderMainCard(item, !isApproved))}
            </div>
          </section>

          {/* Sezione Secondaria */}
          <section className="space-y-6">
            <h2 className="text-xl font-bold text-gray-900">Gestione e Account</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {secondaryActions.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.path} to={item.path} className="press-effect">
                    <div className="flex items-center p-4 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-premium transition-premium">
                      <div className="bg-gray-50 p-2.5 rounded-xl mr-4">
                        <Icon className="h-5 w-5 text-gray-600" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{item.title}</p>
                        <p className="text-xs text-gray-500">{item.description}</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        </main>
      </div>
      <Footer />
    </div>
  );
};

export default MemberDashboard;
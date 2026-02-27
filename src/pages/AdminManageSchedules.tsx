"use client";

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Loader2, ChevronRight, Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { Court } from '@/types/supabase';
import UserNav from '@/components/UserNav';
import { cn } from '@/lib/utils';

const AdminManageSchedules = () => {
  const navigate = useNavigate();
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

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
        showError("Accesso negato.");
        navigate('/dashboard');
      } else {
        setIsAdmin(true);
      }
    } else {
      setIsAdmin(false);
      navigate('/login');
    }
  };

  const fetchCourts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('courts')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setCourts(data || []);
    } catch (err: any) {
      showError("Errore nel caricamento dei campi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminStatus();
    fetchCourts();
  }, [navigate]);

  const handleToggleCourtActive = async (courtId: number, currentStatus: boolean) => {
    setProcessingId(courtId);
    try {
      const { error } = await supabase
        .from('courts')
        .update({ is_active: !currentStatus })
        .eq('id', courtId);

      if (error) throw error;
      
      showSuccess(`Stato campo aggiornato!`);
      setCourts(prev => prev.map(c => c.id === courtId ? { ...c, is_active: !currentStatus } : c));
    } catch (err: any) {
      showError("Errore durante l'aggiornamento.");
    } finally {
      setProcessingId(null);
    }
  };

  if (loading && courts.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <Loader2 className="animate-spin text-primary h-12 w-12" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 sm:p-10 lg:p-12">
      <header className="flex justify-between items-end mb-12 max-w-4xl mx-auto w-full">
        <div className="flex items-center gap-6">
          <Link to="/admin">
            <Button variant="outline" size="icon" className="rounded-2xl border-none shadow-sm bg-white text-primary hover:scale-110 active:scale-95 transition-transform">
              <ArrowLeft size={20} />
            </Button>
          </Link>
          <div className="space-y-1">
            <p className="text-sm font-bold text-club-orange uppercase tracking-[0.2em] mb-1">Configurazione</p>
            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tighter">Asset Campi</h1>
          </div>
        </div>
        <UserNav />
      </header>

      <Card className="max-w-4xl mx-auto border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] rounded-[2.5rem] bg-white overflow-hidden">
        <CardHeader className="bg-gray-50/50 border-b border-gray-100 p-8 sm:p-10">
          <div className="flex items-center gap-3 mb-2">
            <Activity className="text-primary h-5 w-5" />
            <CardTitle className="text-2xl font-black text-gray-900">Visibilità Calendario</CardTitle>
          </div>
          <CardDescription className="text-base font-medium text-gray-500">
            Attiva o disattiva i campi per renderli immediatamente prenotabili dai soci o nasconderli per manutenzione.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="p-4 sm:p-8">
          <div className="space-y-3">
            {courts.map((court) => (
              <div 
                key={court.id} 
                className={cn(
                  "flex items-center justify-between p-6 rounded-[1.5rem] border-2 transition-all duration-300",
                  court.is_active 
                    ? "bg-white border-gray-50 hover:border-primary/20 hover:shadow-md" 
                    : "bg-gray-50/50 border-transparent opacity-70"
                )}
              >
                <div className="flex items-center gap-5">
                  <div className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm",
                    court.is_active ? "bg-primary text-white" : "bg-gray-200 text-gray-400"
                  )}>
                    <MapPin size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{court.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge 
                        variant="secondary" 
                        className={cn(
                          "text-[10px] font-black uppercase tracking-widest px-2 py-0.5",
                          court.is_active 
                            ? "bg-green-100 text-green-700" 
                            : "bg-red-100 text-red-700"
                        )}
                      >
                        {court.is_active ? 'Disponibile' : 'Fuori Servizio'}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right hidden sm:block">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Stato</p>
                    <p className={cn(
                      "text-sm font-bold",
                      court.is_active ? "text-primary" : "text-gray-400"
                    )}>
                      {court.is_active ? 'Attivo' : 'Nascosto'}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-2xl">
                    <Switch
                      checked={court.is_active}
                      onCheckedChange={() => handleToggleCourtActive(court.id, court.is_active)}
                      disabled={processingId === court.id}
                      className="data-[state=checked]:bg-primary"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {courts.length === 0 && (
            <div className="text-center py-20 text-gray-400 font-bold uppercase tracking-widest">
              Nessun campo configurato nel database.
            </div>
          )}
        </CardContent>
      </Card>
      
      <div className="max-w-4xl mx-auto mt-8 bg-amber-50 p-6 rounded-[2rem] border border-amber-100 flex gap-4">
        <div className="bg-white p-2 rounded-xl shadow-sm h-fit">
          <Activity className="text-amber-600 h-5 w-5" />
        </div>
        <p className="text-sm text-amber-800 leading-relaxed font-medium">
          <strong>Nota:</strong> Disattivare un campo non cancella le prenotazioni esistenti, ma impedisce ai soci di effettuarne di nuove su quel campo finché non viene riattivato.
        </p>
      </div>
    </div>
  );
};

export default AdminManageSchedules;
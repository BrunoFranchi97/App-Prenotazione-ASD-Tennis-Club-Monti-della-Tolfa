"use client";

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, UserCheck, RefreshCw, CheckCircle, XCircle, Loader2, ChevronRight, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import type { Profile } from '@/types/supabase';
import UserNav from '@/components/UserNav';

const AdminApprovals = () => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchAdminStatus = async (): Promise<boolean> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
    return !!profile?.is_admin;
  };

  const fetchPendingProfiles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('approved', false)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setProfiles(data || []);
    } catch (err: any) {
      showError("Errore nel caricamento: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialize = async () => {
      const adminOk = await fetchAdminStatus();
      if (adminOk) {
        setIsAdmin(true);
        await fetchPendingProfiles();
      } else {
        navigate('/dashboard');
      }
    };
    initialize();
  }, [navigate]);

  const handleUpdateStatus = async (profileId: string, status: 'approved' | 'rejected') => {
    setProcessingId(profileId);
    try {
      const updateData: any = { 
        approved: status === 'approved',
        approved_at: status === 'approved' ? new Date().toISOString() : null 
      };

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', profileId);

      if (error) throw error;
      showSuccess(status === 'approved' ? "Socio approvato!" : "Socio rifiutato.");
      fetchPendingProfiles();
    } catch (err: any) {
      showError("Errore: " + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
      <Loader2 className="animate-spin text-primary h-12 w-12" />
    </div>
  );
  
  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 sm:p-10 lg:p-12">
      <header className="flex justify-between items-end mb-12 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-6">
          <Link to="/admin">
            <Button variant="outline" size="icon" className="rounded-2xl border-none shadow-sm bg-white text-primary hover:scale-110 active:scale-95 transition-transform">
              <ArrowLeft size={20} />
            </Button>
          </Link>
          <div className="space-y-1">
            <p className="text-sm font-bold text-club-orange uppercase tracking-[0.2em] mb-1">Amministrazione</p>
            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tighter flex items-center gap-3">
              Approvazioni <Badge className="bg-destructive text-white border-none font-black px-3">{profiles.length}</Badge>
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={fetchPendingProfiles} className="rounded-xl border-none shadow-sm bg-white text-primary">
            <RefreshCw className="mr-2 h-4 w-4" /> Aggiorna
          </Button>
          <UserNav />
        </div>
      </header>

      <Card className="shadow-[0_2px_12px_rgba(0,0,0,0.06)] rounded-[2.5rem] border-none overflow-hidden max-w-7xl mx-auto bg-white">
        <CardHeader className="bg-gray-50/50 border-b border-gray-100 p-8">
          <CardTitle className="text-2xl font-black text-gray-900">Soci in Sospeso</CardTitle>
          <CardDescription className="text-base font-medium">Abilita i nuovi soci registrati per permettere loro di prenotare i campi.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {profiles.length === 0 ? (
            <div className="text-center py-24 px-6 text-muted-foreground">
              <div className="bg-green-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="h-10 w-10 text-green-500" />
              </div>
              <p className="text-xl font-bold text-gray-900">Ottimo lavoro!</p>
              <p className="text-gray-500 font-medium mt-2">Nessun socio attende l'approvazione al momento.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/30 hover:bg-gray-50/30">
                    <TableHead className="font-black text-gray-800 py-6 px-8">Socio</TableHead>
                    <TableHead className="font-black text-gray-800">Registrato il</TableHead>
                    <TableHead className="font-black text-gray-800">Livello</TableHead>
                    <TableHead className="text-right font-black text-gray-800 px-8">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((p) => (
                    <TableRow key={p.id} className="hover:bg-primary/[0.02] transition-colors border-b border-gray-50">
                      <TableCell className="px-8 py-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                            {p.full_name?.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-bold text-gray-900 text-lg">{p.full_name}</span>
                            <span className="text-[10px] text-gray-400 uppercase font-black tracking-widest">{p.phone || "No telefono"}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-gray-500">
                        {format(parseISO(p.created_at), 'dd MMMM yyyy', { locale: it })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize border-primary/20 text-primary font-bold">
                          {p.skill_level}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right px-8">
                        <div className="flex justify-end gap-3">
                          <Button 
                            size="sm" 
                            onClick={() => handleUpdateStatus(p.id, 'approved')}
                            disabled={processingId === p.id}
                            className="bg-gradient-to-br from-primary to-[#23532f] hover:from-[#357a46] hover:to-[#23532f] rounded-xl px-6 font-bold shadow-md shadow-primary/10"
                          >
                            Approva
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="sm" 
                            onClick={() => handleUpdateStatus(p.id, 'rejected')}
                            disabled={processingId === p.id}
                            className="rounded-xl font-bold"
                          >
                            Rifiuta
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminApprovals;
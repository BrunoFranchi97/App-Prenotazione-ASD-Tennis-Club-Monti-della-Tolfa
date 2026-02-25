"use client";

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, LogOut, CheckCircle, UserCheck, RefreshCw, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import type { Profile } from '@/types/supabase';

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
      // Usiamo una query sicura che non crasha se la colonna status non esiste ancora
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
      // Prepariamo l'update: se status esiste lo usiamo, altrimenti usiamo solo approved
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

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="animate-spin text-primary h-10 w-10" /></div>;
  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="flex justify-between items-center mb-8 max-w-7xl mx-auto">
        <div className="flex items-center">
          <Link to="/admin" className="mr-4">
            <Button variant="outline" size="icon" className="rounded-xl border-primary text-primary">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-black text-primary flex items-center gap-2">
            <UserCheck className="h-7 w-7" /> Approvazioni
          </h1>
        </div>
        <Button variant="outline" onClick={fetchPendingProfiles} className="rounded-xl border-primary text-primary">
          <RefreshCw className="mr-2 h-4 w-4" /> Aggiorna
        </Button>
      </header>

      <Card className="shadow-xl rounded-[2rem] border-none overflow-hidden max-w-7xl mx-auto bg-white">
        <CardHeader className="bg-gray-50/50 border-b">
          <CardTitle>Richieste in Sospeso</CardTitle>
          <CardDescription>Soci che attendono l'abilitazione per poter prenotare i campi.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {profiles.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <CheckCircle className="mx-auto h-16 w-16 mb-4 text-green-500 opacity-20" />
              <p className="text-lg font-bold">Nessuna richiesta in sospeso.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/30">
                    <TableHead className="font-bold">Socio</TableHead>
                    <TableHead className="font-bold">Registrato il</TableHead>
                    <TableHead className="text-right font-bold">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((p) => (
                    <TableRow key={p.id} className="hover:bg-gray-50/50 transition-colors">
                      <TableCell className="font-bold text-gray-800">{p.full_name}</TableCell>
                      <TableCell>{format(parseISO(p.created_at), 'dd/MM/yyyy HH:mm', { locale: it })}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-3">
                          <Button 
                            size="sm" 
                            onClick={() => handleUpdateStatus(p.id, 'approved')}
                            disabled={processingId === p.id}
                            className="bg-green-600 hover:bg-green-700 rounded-xl px-6 font-bold"
                          >
                            Approva
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="sm" 
                            onClick={() => handleUpdateStatus(p.id, 'rejected')}
                            disabled={processingId === p.id}
                            className="rounded-xl"
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
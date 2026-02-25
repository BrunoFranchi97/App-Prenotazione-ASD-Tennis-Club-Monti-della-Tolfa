"use client";

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, LogOut, CheckCircle, UserCheck, RefreshCw, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import type { Profile } from '@/types/supabase';

const AdminApprovals = () => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

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
        .neq('status', 'approved')
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
      const { error } = await supabase
        .from('profiles')
        .update({ 
          status, 
          approved: status === 'approved',
          approved_at: status === 'approved' ? new Date().toISOString() : null 
        })
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

  if (loading) return <div className="p-8 text-center">Caricamento...</div>;
  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center">
          <Link to="/admin" className="mr-4">
            <Button variant="outline" size="icon" className="text-primary border-primary hover:bg-secondary">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-primary flex items-center">
            <UserCheck className="mr-2 h-7 w-7" /> Approvazioni
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchPendingProfiles}><RefreshCw className="mr-2 h-4 w-4" /> Aggiorna</Button>
          <Button variant="outline" onClick={handleLogout}><LogOut className="mr-2 h-4 w-4" /> Esci</Button>
        </div>
      </header>

      <Card className="shadow-lg rounded-lg">
        <CardHeader>
          <CardTitle>Richieste in Sospeso</CardTitle>
          <CardDescription>Soci in attesa o precedentemente rifiutati.</CardDescription>
        </CardHeader>
        <CardContent>
          {profiles.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <CheckCircle className="mx-auto h-12 w-12 mb-4 text-green-500 opacity-70" />
              <p>Nessuna richiesta in sospeso.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Registrato il</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.full_name}</TableCell>
                      <TableCell>
                        <Badge variant={p.status === 'rejected' ? 'destructive' : 'secondary'}>
                          {p.status === 'rejected' ? 'Rifiutato' : 'In attesa'}
                        </Badge>
                      </TableCell>
                      <TableCell>{format(parseISO(p.created_at), 'dd/MM/yyyy HH:mm', { locale: it })}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            size="sm" 
                            onClick={() => handleUpdateStatus(p.id, 'approved')}
                            disabled={processingId === p.id}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            Approva
                          </Button>
                          {p.status !== 'rejected' && (
                            <Button 
                              variant="destructive" 
                              size="sm" 
                              onClick={() => handleUpdateStatus(p.id, 'rejected')}
                              disabled={processingId === p.id}
                            >
                              Rifiuta
                            </Button>
                          )}
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
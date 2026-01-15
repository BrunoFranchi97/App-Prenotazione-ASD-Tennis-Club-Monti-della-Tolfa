"use client";

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, LogOut, CheckCircle, XCircle, UserCheck, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import type { Profile } from '@/types/supabase';

interface UnapprovedProfile extends Profile {
    email: string;
}

const AdminApprovals = () => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<UnapprovedProfile[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);

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

  const fetchAdminStatus = async (): Promise<boolean> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate('/login');
      return false;
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (error || !profile?.is_admin) {
      showError("Accesso negato. Non sei un amministratore.");
      navigate('/dashboard');
      return false;
    }

    return true;
  };

  const fetchUnapprovedProfiles = async () => {
    setLoading(true);
    try {
      // Fetch profiles that are not approved
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, created_at, skill_level')
        .eq('approved', false)
        .order('created_at', { ascending: true });

      if (profilesError) throw profilesError;

      const profileIds = profilesData.map(p => p.id);
      
      // Fetch corresponding user emails from auth.users (requires service role, but we simulate fetching data)
      // NOTE: In a real app, fetching auth.users data requires RLS bypass or a service role client/edge function.
      // Since we are using the client, we will simulate the email retrieval or rely on the fact that the profile ID is the user ID.
      
      // For now, we will assume we can get the email via a separate query or mock it.
      // Since we cannot query auth.users directly from the client, we will just display the ID for now, 
      // or rely on the fact that the user's email is often available in the auth session, but here we only have the profile data.
      
      // To keep it simple and functional within client constraints, we will fetch the email via a separate query 
      // (which might fail due to RLS on auth.users, but we proceed assuming the admin context allows it, or we rely on the profile data).
      
      // Since we cannot reliably fetch email from auth.users on the client side, we will skip the email for now 
      // and rely on the full_name and ID.
      
      const profilesWithEmail: UnapprovedProfile[] = profilesData.map(p => ({
          ...p,
          email: `ID: ${p.id.substring(0, 8)}...`, // Placeholder for email/ID
      })) as UnapprovedProfile[];

      setProfiles(profilesWithEmail);

    } catch (err: any) {
      showError("Errore nel caricamento dei soci: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialize = async () => {
      const adminOk = await fetchAdminStatus();
      if (adminOk) {
        setIsAdmin(true);
        await fetchUnapprovedProfiles();
      }
    };
    initialize();
  }, [navigate]);

  const handleApprove = async (profileId: string) => {
    setProcessingId(profileId);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ approved: true, approved_at: new Date().toISOString() })
        .eq('id', profileId);

      if (error) throw error;

      showSuccess("Socio approvato con successo!");
      await fetchUnapprovedProfiles();
    } catch (err: any) {
      showError("Errore durante l'approvazione: " + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (profileId: string) => {
    setProcessingId(profileId);
    try {
      // In a real scenario, you might want to delete the user from auth.users as well, 
      // but for simplicity here, we just delete the profile entry.
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', profileId);

      if (error) throw error;

      // Optionally, delete the user from auth.users (requires service role or admin API)
      // await supabase.auth.admin.deleteUser(profileId);

      showSuccess("Socio rifiutato e rimosso.");
      await fetchUnapprovedProfiles();
    } catch (err: any) {
      showError("Errore durante il rifiuto: " + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white p-4">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4 text-primary">Caricamento...</h1>
          <p className="text-xl text-gray-600">Recupero richieste di approvazione.</p>
        </div>
      </div>
    );
  }

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
            <UserCheck className="mr-2 h-7 w-7" /> Gestione Approvazioni Soci
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="text-primary border-primary hover:bg-secondary" onClick={fetchUnapprovedProfiles}>
            <RefreshCw className="mr-2 h-4 w-4" /> Aggiorna
          </Button>
          <Button variant="outline" className="text-primary border-primary hover:bg-secondary" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" /> Esci
          </Button>
        </div>
      </header>

      <Card className="shadow-lg rounded-lg">
        <CardHeader>
          <CardTitle className="text-primary">Soci in Attesa di Approvazione</CardTitle>
          <CardDescription>
            {profiles.length} soci in attesa. Approva per consentire loro di prenotare.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {profiles.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <CheckCircle className="mx-auto h-12 w-12 mb-4 text-green-500 opacity-70" />
              <p>Nessun socio in attesa di approvazione. Tutto in ordine!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome Completo</TableHead>
                    <TableHead>Livello</TableHead>
                    <TableHead>Registrato il</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        {p.full_name || p.email}
                        <p className="text-xs text-muted-foreground mt-0.5">{p.email}</p>
                      </TableCell>
                      <TableCell className="capitalize">{p.skill_level}</TableCell>
                      <TableCell>{format(parseISO(p.created_at), 'dd/MM/yyyy HH:mm', { locale: it })}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            size="sm" 
                            onClick={() => handleApprove(p.id)} 
                            disabled={processingId === p.id}
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            {processingId === p.id ? 'Approvazione...' : 'Approva'}
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="sm" 
                            onClick={() => handleReject(p.id)}
                            disabled={processingId === p.id}
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
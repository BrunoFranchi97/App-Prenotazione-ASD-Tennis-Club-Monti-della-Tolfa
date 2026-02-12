"use client";

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, LogOut, Users, Search, ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import type { Profile } from '@/types/supabase';

const AdminUserManagement = () => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);

  const fetchAdminStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentAdminId(user.id);
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      if (!profile?.is_admin) {
        showError("Accesso negato.");
        navigate('/dashboard');
        return false;
      }
      setIsAdmin(true);
      return true;
    }
    navigate('/login');
    return false;
  };

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name', { ascending: true });

      if (error) throw error;
      setProfiles(data || []);
    } catch (err: any) {
      showError("Errore nel caricamento dei soci: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialize = async () => {
      const ok = await fetchAdminStatus();
      if (ok) await fetchProfiles();
    };
    initialize();
  }, [navigate]);

  const handleToggleAdmin = async (profileId: string, currentStatus: boolean) => {
    if (profileId === currentAdminId) {
      showError("Non puoi rimuovere i tuoi stessi permessi di amministratore.");
      return;
    }

    setProcessingId(profileId);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_admin: !currentStatus })
        .eq('id', profileId);

      if (error) throw error;

      showSuccess(`Ruolo aggiornato con successo!`);
      setProfiles(prev => prev.map(p => 
        p.id === profileId ? { ...p, is_admin: !currentStatus } : p
      ));
    } catch (err: any) {
      showError("Errore durante l'aggiornamento: " + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const filteredProfiles = profiles.filter(p => 
    (p.full_name || "").toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
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
            <Users className="mr-2 h-7 w-7" /> Gestione Ruoli Soci
          </h1>
        </div>
        <Button variant="outline" className="text-primary border-primary hover:bg-secondary" onClick={() => navigate('/login')}>
          <LogOut className="mr-2 h-4 w-4" /> Esci
        </Button>
      </header>

      <Card className="shadow-lg rounded-lg mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-primary">Ricerca Socio</CardTitle>
          <CardDescription>Cerca un socio per nome per promuoverlo o rimuovere i permessi admin.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              className="pl-9" 
              placeholder="Cerca per nome..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-lg rounded-lg">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Socio</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Ruolo</TableHead>
                <TableHead className="text-right">Admin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProfiles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                    Nessun socio trovato.
                  </TableCell>
                </TableRow>
              ) : (
                filteredProfiles.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      {p.full_name || `ID: ${p.id.substring(0, 8)}...`}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.approved ? "secondary" : "outline"} className={p.approved ? "bg-green-100 text-green-800 border-none" : ""}>
                        {p.approved ? "Approvato" : "In attesa"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        {p.is_admin ? (
                          <Badge className="bg-orange-100 text-orange-800 border-none flex items-center">
                            <ShieldCheck className="mr-1 h-3 w-3" /> Amministratore
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-gray-500">Socio</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {processingId === p.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        ) : (
                          <Switch 
                            checked={p.is_admin} 
                            onCheckedChange={() => handleToggleAdmin(p.id, p.is_admin)}
                            disabled={p.id === currentAdminId}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminUserManagement;
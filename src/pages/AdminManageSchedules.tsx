"use client";

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowLeft, LogOut, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { Court } from '@/types/supabase';

const AdminManageSchedules = () => {
  const navigate = useNavigate();
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

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
    setError(null);
    try {
      const { data, error } = await supabase
        .from('courts')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        throw new Error(error.message);
      }
      setCourts(data || []);
    } catch (err: any) {
      console.error("Errore nel caricamento dei campi:", err.message);
      setError("Errore nel caricamento dei campi: " + err.message);
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
    setLoading(true);
    try {
      const { error } = await supabase
        .from('courts')
        .update({ is_active: !currentStatus })
        .eq('id', courtId);

      if (error) {
        showError("Errore nell'aggiornamento dello stato del campo: " + error.message);
      } else {
        showSuccess(`Campo aggiornato con successo!`);
        fetchCourts(); // Refresh the list
      }
    } catch (err: any) {
      showError(err.message || "Errore inaspettato durante l'aggiornamento.");
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Accesso Negato</h1>
          <p className="text-xl text-gray-600">Non hai i permessi per accedere a questa pagina.</p>
          <Link to="/dashboard" className="text-blue-500 hover:text-blue-700 underline mt-4 block">
            Torna alla Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white p-4">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4 text-primary">Caricamento...</h1>
          <p className="text-xl text-gray-600">Recupero campi.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white p-4">
        <Card className="w-full max-w-md shadow-lg rounded-lg text-center">
          <CardHeader>
            <CardTitle className="text-destructive text-3xl font-bold">Errore</CardTitle>
            <CardDescription className="text-gray-600 mt-2">
              {error}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => window.location.reload()} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              Riprova
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center">
          <Link to="/admin" className="mr-4">
            <Button variant="outline" size="icon" className="text-primary border-primary hover:bg-secondary">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-primary">Gestione Campi</h1>
        </div>
        <Button variant="outline" className="text-primary border-primary hover:bg-secondary" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" /> Esci
        </Button>
      </header>

      <Card className="shadow-lg rounded-lg">
        <CardHeader>
          <CardTitle className="text-primary">Stato Campi</CardTitle>
          <CardDescription>Attiva o disattiva i campi per renderli prenotabili o meno.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome Campo</TableHead>
                  <TableHead>Superficie</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courts.map((court) => (
                  <TableRow key={court.id}>
                    <TableCell className="font-medium">{court.name}</TableCell>
                    <TableCell>{court.surface}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        court.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {court.is_active ? 'Attivo' : 'Disattivo'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <Label htmlFor={`toggle-${court.id}`} className="sr-only">Attiva/Disattiva {court.name}</Label>
                        <Switch
                          id={`toggle-${court.id}`}
                          checked={court.is_active}
                          onCheckedChange={() => handleToggleCourtActive(court.id, court.is_active)}
                          disabled={loading}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminManageSchedules;
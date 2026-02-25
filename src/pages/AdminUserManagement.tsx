"use client";

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, LogOut, Users, Search, ShieldCheck, Loader2, Filter, UserCog } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import type { Profile, ProfileStatus } from '@/types/supabase';
import UserNav from '@/components/UserNav';

const AdminUserManagement = () => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentAdminId(user.id);

      const { data: adminProf } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
      if (!adminProf?.is_admin) {
        navigate('/dashboard');
        return;
      }
      setIsAdmin(true);

      const { data, error } = await supabase.from('profiles').select('*').order('full_name', { ascending: true });
      if (error) throw error;
      setProfiles(data || []);
    } catch (err: any) {
      showError("Errore nel caricamento soci: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProfiles(); }, []);

  const handleToggleAdmin = async (profileId: string, currentStatus: boolean) => {
    if (profileId === currentAdminId) return showError("Non puoi rimuovere te stesso dagli amministratori.");
    setProcessingId(profileId);
    try {
      const { error } = await supabase.from('profiles').update({ is_admin: !currentStatus }).eq('id', profileId);
      if (error) throw error;
      showSuccess("Ruolo socio aggiornato con successo.");
      setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, is_admin: !currentStatus } : p));
    } catch (err: any) { showError(err.message); }
    finally { setProcessingId(null); }
  };

  const handleToggleApproval = async (profileId: string, currentStatus: boolean) => {
    setProcessingId(profileId);
    try {
      const { error } = await supabase.from('profiles').update({ approved: !currentStatus }).eq('id', profileId);
      if (error) throw error;
      showSuccess(currentStatus ? "Accesso socio revocato." : "Socio abilitato alle prenotazioni.");
      setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, approved: !currentStatus } : p));
    } catch (err: any) { showError(err.message); }
    finally { setProcessingId(null); }
  };

  const filteredProfiles = profiles.filter(p => {
    const matchesSearch = (p.full_name || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || 
      (statusFilter === "approved" && p.approved) || 
      (statusFilter === "pending" && !p.approved);
    return matchesSearch && matchesStatus;
  });

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="animate-spin text-primary h-12 w-12" /></div>;
  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="flex justify-between items-center mb-10 max-w-7xl mx-auto">
        <div className="flex items-center gap-4">
          <Link to="/admin">
            <Button variant="outline" size="icon" className="rounded-xl border-primary text-primary">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-black text-primary tracking-tight flex items-center gap-2">
              <UserCog className="h-8 w-8" /> Anagrafica Soci
            </h1>
          </div>
        </div>
        <UserNav />
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 max-w-7xl mx-auto">
        <Card className="border-none shadow-lg rounded-2xl bg-white">
          <CardHeader className="pb-3"><CardTitle className="text-xs font-black uppercase text-gray-400">Ricerca Rapida</CardTitle></CardHeader>
          <CardContent>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input maxLength={50} className="pl-10 rounded-xl bg-gray-50 border-none h-11" placeholder="Nome o cognome..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-lg rounded-2xl bg-white">
          <CardHeader className="pb-3"><CardTitle className="text-xs font-black uppercase text-gray-400">Stato Approvazione</CardTitle></CardHeader>
          <CardContent>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="rounded-xl bg-gray-50 border-none h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i soci</SelectItem>
                <SelectItem value="approved">Abilitati</SelectItem>
                <SelectItem value="pending">In attesa / Revocati</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-2xl rounded-[2.5rem] border-none overflow-hidden max-w-7xl mx-auto bg-white">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                  <TableHead className="font-black text-gray-800 py-6 px-8">Socio</TableHead>
                  <TableHead className="font-black text-gray-800">Livello</TableHead>
                  <TableHead className="text-center font-black text-gray-800">Abilitato</TableHead>
                  <TableHead className="text-center font-black text-gray-800">Amministratore</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProfiles.map((p) => (
                  <TableRow key={p.id} className="hover:bg-primary/[0.02] transition-colors">
                    <TableCell className="px-8">
                       <div className="flex flex-col">
                         <span className="font-bold text-gray-900">{p.full_name || "Senza Nome"}</span>
                         <span className="text-[10px] text-gray-400 uppercase font-black">{p.phone || "No telefono"}</span>
                       </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize font-bold border-primary/20 text-primary">
                        {p.skill_level}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center">
                        <Switch 
                          checked={p.approved} 
                          onCheckedChange={() => handleToggleApproval(p.id, p.approved)} 
                          disabled={processingId === p.id}
                          className="data-[state=checked]:bg-green-500"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center">
                        <Switch 
                          checked={p.is_admin} 
                          onCheckedChange={() => handleToggleAdmin(p.id, p.is_admin)} 
                          disabled={p.id === currentAdminId || processingId === p.id}
                          className="data-[state=checked]:bg-club-orange"
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filteredProfiles.length === 0 && (
              <div className="text-center py-20 text-gray-400 font-bold">Nessun socio trovato.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminUserManagement;
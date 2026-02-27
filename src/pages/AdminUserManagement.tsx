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
import { ArrowLeft, Search, Loader2, UserCog } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import type { Profile } from '@/types/supabase';
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
              Anagrafica Soci
            </h1>
          </div>
        </div>
        <UserNav />
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10 max-w-7xl mx-auto">
        <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] rounded-[2rem] bg-white p-6">
          <div className="flex flex-col gap-3">
            <Label className="text-xs font-black uppercase text-gray-400 tracking-widest ml-1">Ricerca Rapida</Label>
            <div className="relative">
              <Search className="absolute left-4 top-4 h-5 w-5 text-gray-400" />
              <Input 
                className="pl-12 h-14 rounded-2xl bg-gray-50 border-none text-base font-medium focus:ring-primary/20" 
                placeholder="Cerca per nome o cognome..." 
                value={search} 
                onChange={(e) => setSearch(e.target.value)} 
              />
            </div>
          </div>
        </Card>
        <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] rounded-[2rem] bg-white p-6">
          <div className="flex flex-col gap-3">
            <Label className="text-xs font-black uppercase text-gray-400 tracking-widest ml-1">Filtro Stato</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-14 rounded-2xl bg-gray-50 border-none text-base font-medium focus:ring-primary/20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="all">Tutti i soci</SelectItem>
                <SelectItem value="approved">Abilitati alle prenotazioni</SelectItem>
                <SelectItem value="pending">In attesa o Revocati</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>
      </div>

      <Card className="shadow-[0_2px_12px_rgba(0,0,0,0.06)] rounded-[2.5rem] border-none overflow-hidden max-w-7xl mx-auto bg-white">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/30 hover:bg-gray-50/30">
                  <TableHead className="font-black text-gray-800 py-8 px-10 text-base">Socio</TableHead>
                  <TableHead className="font-black text-gray-800 text-base">Livello</TableHead>
                  <TableHead className="text-center font-black text-gray-800 text-base">Abilitato</TableHead>
                  <TableHead className="text-center font-black text-gray-800 text-base px-10">Amministratore</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProfiles.map((p) => (
                  <TableRow key={p.id} className="hover:bg-primary/[0.02] transition-colors border-b border-gray-50">
                    <TableCell className="px-10 py-6">
                       <div className="flex items-center gap-4">
                         <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">
                           {p.full_name?.charAt(0).toUpperCase()}
                         </div>
                         <div className="flex flex-col">
                           <span className="font-bold text-gray-900 text-lg leading-tight">{p.full_name || "Senza Nome"}</span>
                           <span className="text-[10px] text-gray-400 uppercase font-black tracking-widest">{p.phone || "Nessun telefono"}</span>
                         </div>
                       </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize font-bold border-primary/20 text-primary py-1 px-3">
                        {p.skill_level}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center">
                        <Switch 
                          checked={p.approved} 
                          onCheckedChange={() => handleToggleApproval(p.id, p.approved)} 
                          disabled={processingId === p.id}
                          className="data-[state=checked]:bg-primary"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-center px-10">
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
              <div className="text-center py-24 text-gray-400 font-bold">Nessun socio corrisponde ai criteri di ricerca.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminUserManagement;
"use client";

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Search, Loader2, UserCog, Trash2, UserMinus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import type { Profile } from '@/types/supabase';
import UserNav from '@/components/UserNav';
import { cn } from '@/lib/utils';

const AdminUserManagement = () => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);
  
  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [profileToDelete, setProfileToDelete] = useState<Profile | null>(null);

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

  const handleDeleteProfile = async () => {
    if (!profileToDelete) return;
    if (profileToDelete.id === currentAdminId) return showError("Non puoi eliminare il tuo profilo.");
    
    setProcessingId(profileToDelete.id);
    try {
      // Nota: Questa azione rimuove solo il profilo dal DB. 
      // La rimozione dall'auth richiederebbe un edge function con service role key.
      const { error } = await supabase.from('profiles').delete().eq('id', profileToDelete.id);
      if (error) throw error;
      
      showSuccess("Profilo socio rimosso con successo.");
      setProfiles(prev => prev.filter(p => p.id !== profileToDelete.id));
      setDeleteDialogOpen(false);
    } catch (err: any) {
      showError("Errore durante l'eliminazione: " + err.message);
    } finally {
      setProcessingId(null);
      setProfileToDelete(null);
    }
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
                  <TableHead className="text-center font-black text-gray-800 text-base">Admin</TableHead>
                  <TableHead className="text-right font-black text-gray-800 text-base px-10">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProfiles.map((p) => (
                  <TableRow key={p.id} className="hover:bg-primary/[0.02] transition-colors border-b border-gray-50 group">
                    <TableCell className="px-10 py-6">
                       <div className="flex flex-col">
                         <span className="font-bold text-gray-900 text-lg leading-tight">{p.full_name || "Senza Nome"}</span>
                         <span className="text-[10px] text-gray-400 uppercase font-black tracking-widest mt-1">Registrato il {new Date(p.created_at).toLocaleDateString()}</span>
                       </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize font-bold border-primary/20 text-primary py-1 px-3 bg-primary/5">
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
                    <TableCell className="text-center">
                      <div className="flex justify-center">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={p.id === currentAdminId ? "cursor-not-allowed" : ""}>
                                <Switch
                                  checked={p.is_admin}
                                  onCheckedChange={() => handleToggleAdmin(p.id, p.is_admin)}
                                  disabled={p.id === currentAdminId || processingId === p.id}
                                  className="data-[state=checked]:bg-club-orange"
                                />
                              </span>
                            </TooltipTrigger>
                            {p.id === currentAdminId && (
                              <TooltipContent side="top" className="text-xs">
                                Non puoi rimuovere il tuo ruolo di amministratore
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </TableCell>
                    <TableCell className="text-right px-10">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={p.id === currentAdminId ? "cursor-not-allowed inline-block" : "inline-block"}>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setProfileToDelete(p);
                                  setDeleteDialogOpen(true);
                                }}
                                disabled={p.id === currentAdminId || processingId === p.id}
                                className="rounded-xl text-gray-400 hover:text-destructive hover:bg-destructive/5 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Trash2 className="h-5 w-5" />
                              </Button>
                            </span>
                          </TooltipTrigger>
                          {p.id === currentAdminId && (
                            <TooltipContent side="top" className="text-xs">
                              Non puoi eliminare il tuo account da qui
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
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

      {/* Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="rounded-[2rem] border-none shadow-2xl">
          <AlertDialogHeader>
            <div className="mx-auto w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
              <UserMinus className="h-8 w-8 text-destructive" />
            </div>
            <AlertDialogTitle className="text-2xl font-black text-center text-gray-900">Rimuovere Socio?</AlertDialogTitle>
            <AlertDialogDescription className="text-center text-base font-medium text-gray-500 px-4">
              Stai per rimuovere il profilo di <span className="font-bold text-gray-900">{profileToDelete?.full_name}</span>. 
              Questa azione revocherà l'accesso al sistema ma non eliminerà le credenziali di accesso (email).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col sm:flex-row gap-3 pt-6 px-4">
            <AlertDialogCancel className="w-full sm:flex-1 h-14 rounded-2xl border-gray-100 font-bold text-gray-500 hover:bg-gray-50 m-0">
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteProfile}
              className="w-full sm:flex-1 h-14 rounded-2xl bg-destructive hover:bg-destructive/90 text-white font-bold shadow-lg shadow-destructive/20 m-0"
            >
              Conferma Rimozione
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminUserManagement;
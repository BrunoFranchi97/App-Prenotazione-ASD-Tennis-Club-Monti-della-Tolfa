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
import { ArrowLeft, LogOut, Users, Search, ShieldCheck, Loader2, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import type { Profile, ProfileStatus } from '@/types/supabase';

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
      showError("Errore: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProfiles(); }, []);

  const handleToggleAdmin = async (profileId: string, currentStatus: boolean) => {
    if (profileId === currentAdminId) return showError("Non puoi rimuoverti i permessi.");
    setProcessingId(profileId);
    try {
      const { error } = await supabase.from('profiles').update({ is_admin: !currentStatus }).eq('id', profileId);
      if (error) throw error;
      showSuccess("Ruolo aggiornato.");
      setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, is_admin: !currentStatus } : p));
    } catch (err: any) { showError(err.message); }
    finally { setProcessingId(null); }
  };

  const handleUpdateStatus = async (profileId: string, newStatus: ProfileStatus) => {
    setProcessingId(profileId);
    try {
      const { error } = await supabase.from('profiles').update({ 
        status: newStatus, 
        approved: newStatus === 'approved' 
      }).eq('id', profileId);
      if (error) throw error;
      showSuccess("Stato aggiornato.");
      setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, status: newStatus } : p));
    } catch (err: any) { showError(err.message); }
    finally { setProcessingId(null); }
  };

  const filteredProfiles = profiles.filter(p => {
    const matchesSearch = (p.full_name || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) return <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto" /></div>;
  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center">
          <Link to="/admin" className="mr-4">
            <Button variant="outline" size="icon" className="text-primary border-primary hover:bg-secondary"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <h1 className="text-3xl font-bold text-primary flex items-center"><Users className="mr-2 h-7 w-7" /> Gestione Soci</h1>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-sm">Ricerca</CardTitle></CardHeader>
          <CardContent>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input maxLength={50} className="pl-9" placeholder="Nome socio..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-sm">Stato Socio</CardTitle></CardHeader>
          <CardContent>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli stati</SelectItem>
                <SelectItem value="approved">Approvato</SelectItem>
                <SelectItem value="pending">In attesa</SelectItem>
                <SelectItem value="rejected">Rifiutato</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-lg rounded-lg overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Socio</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Azioni Stato</TableHead>
                  <TableHead className="text-center">Admin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProfiles.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.full_name}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === 'approved' ? 'secondary' : p.status === 'rejected' ? 'destructive' : 'outline'}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {p.status !== 'approved' && <Button size="xs" onClick={() => handleUpdateStatus(p.id, 'approved')}>Approva</Button>}
                        {p.status !== 'rejected' && <Button size="xs" variant="outline" onClick={() => handleUpdateStatus(p.id, 'rejected')}>Rifiuta</Button>}
                        {p.status !== 'pending' && <Button size="xs" variant="ghost" onClick={() => handleUpdateStatus(p.id, 'pending')}>Sospendi</Button>}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch checked={p.is_admin} onCheckedChange={() => handleToggleAdmin(p.id, p.is_admin)} disabled={p.id === currentAdminId || processingId === p.id} />
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

export default AdminUserManagement;
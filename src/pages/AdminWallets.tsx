"use client";

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Search, Loader2, Wallet as WalletIcon, PlusCircle, MinusCircle, History, Users, Tag, Lightbulb, Sun, Moon, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { format, parseISO, isAfter } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useWallet } from '@/hooks/use-wallet';
import { formatEur } from '@/utils/wallet';
import WalletMovementRow from '@/components/WalletMovementRow';
import UserNav from '@/components/UserNav';
import type { MemberType, CourtRate, LightsOverride } from '@/types/supabase';

interface MemberRow {
  id: string;
  full_name: string | null;
  member_type: MemberType;
  approved: boolean;
}

const AdminWallets = () => {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [search, setSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState<MemberRow | null>(null);

  const { wallet, movements, coverNamesById, refetch: refetchWallet } = useWallet(selectedMember?.id ?? null);

  const [topupOpen, setTopupOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const [rates, setRates] = useState<CourtRate[]>([]);
  const [newValidFrom, setNewValidFrom] = useState('');
  const [newRateDay, setNewRateDay] = useState('');
  const [newRateLights, setNewRateLights] = useState('');
  const [newRateNote, setNewRateNote] = useState('');
  const [rateSubmitting, setRateSubmitting] = useState(false);

  const [lightsThreshold, setLightsThreshold] = useState('30');
  const [thresholdSaving, setThresholdSaving] = useState(false);
  const [overrides, setOverrides] = useState<LightsOverride[]>([]);
  const [overrideDay, setOverrideDay] = useState('');
  const [overrideForce, setOverrideForce] = useState<'on' | 'off'>('on');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);
  const [overrideToRemove, setOverrideToRemove] = useState<LightsOverride | null>(null);
  const [removingOverride, setRemovingOverride] = useState(false);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/login'); return; }
      const { data: adminProf } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
      if (!adminProf?.is_admin) {
        showError("Accesso negato. Non sei un amministratore.");
        navigate('/dashboard');
        return;
      }
      setIsAdmin(true);

      const [{ data: membersData }, { data: ratesData }, { data: settingData }, { data: overridesData }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, member_type, approved').order('full_name'),
        supabase.from('court_rates').select('*').order('valid_from', { ascending: false }),
        supabase.from('app_settings').select('value').eq('key', 'luci_soglia_minuti').single(),
        supabase.from('lights_overrides').select('*').order('day', { ascending: true }),
      ]);
      setMembers(membersData || []);
      setRates(ratesData || []);
      if (settingData?.value) setLightsThreshold(settingData.value);
      setOverrides(overridesData || []);
      setLoading(false);
    };
    init();
  }, [navigate]);

  const fetchRates = async () => {
    const { data } = await supabase.from('court_rates').select('*').order('valid_from', { ascending: false });
    setRates(data || []);
  };

  const fetchOverrides = async () => {
    const { data } = await supabase.from('lights_overrides').select('*').order('day', { ascending: true });
    setOverrides(data || []);
  };

  const filteredMembers = members.filter(m => (m.full_name || '').toLowerCase().includes(search.toLowerCase()));
  const activeRate = rates.find(r => !isAfter(parseISO(r.valid_from), new Date()));

  const handleAddRate = async () => {
    const day = parseFloat(newRateDay.replace(',', '.'));
    const lights = parseFloat(newRateLights.replace(',', '.'));
    if (!newValidFrom) { showError("Indica da quando vale la nuova tariffa."); return; }
    if (!day || day < 0 || !lights || lights < 0) { showError("Indica tariffe valide."); return; }
    setRateSubmitting(true);
    const { error } = await supabase.rpc('admin_set_court_rate', {
      p_valid_from: new Date(newValidFrom).toISOString(),
      p_rate_day_cents: Math.round(day * 100),
      p_rate_lights_cents: Math.round(lights * 100),
      p_note: newRateNote.trim() || null,
    });
    setRateSubmitting(false);
    if (error) { showError(error.message); return; }
    showSuccess("Nuova tariffa registrata.");
    setNewValidFrom(''); setNewRateDay(''); setNewRateLights(''); setNewRateNote('');
    fetchRates();
  };

  const handleSaveThreshold = async () => {
    const minutes = parseInt(lightsThreshold, 10);
    if (!Number.isInteger(minutes) || minutes < 0) { showError("Indica un numero di minuti valido."); return; }
    setThresholdSaving(true);
    const { error } = await supabase.from('app_settings').update({ value: String(minutes) }).eq('key', 'luci_soglia_minuti');
    setThresholdSaving(false);
    if (error) { showError(error.message); return; }
    showSuccess("Soglia luci aggiornata: vale da subito per i nuovi calcoli.");
  };

  const handleSetOverride = async () => {
    if (!overrideDay) { showError("Scegli una data."); return; }
    setOverrideSubmitting(true);
    const { error } = await supabase.rpc('admin_set_lights_override', {
      p_day: overrideDay,
      p_force_lights: overrideForce === 'on',
      p_reason: overrideReason.trim() || null,
    });
    setOverrideSubmitting(false);
    if (error) { showError(error.message); return; }
    showSuccess("Override luci salvato per quel giorno.");
    setOverrideDay(''); setOverrideReason(''); setOverrideForce('on');
    fetchOverrides();
  };

  const handleRemoveOverride = async () => {
    if (!overrideToRemove) return;
    setRemovingOverride(true);
    const { error } = await supabase.rpc('admin_set_lights_override', {
      p_day: overrideToRemove.day, p_force_lights: null, p_reason: null,
    });
    setRemovingOverride(false);
    if (error) { showError(error.message); return; }
    showSuccess("Override rimosso: quel giorno torna al calcolo automatico.");
    setOverrideToRemove(null);
    fetchOverrides();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <Loader2 className="animate-spin text-primary h-12 w-12" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 sm:p-10 lg:p-12">
      <header className="flex justify-between items-end mb-10 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-6">
          <Link to="/admin">
            <Button variant="outline" size="icon" className="rounded-2xl border-none shadow-sm bg-white text-primary hover:scale-110 active:scale-95 transition-transform">
              <ArrowLeft size={20} />
            </Button>
          </Link>
          <div className="space-y-1">
            <p className="text-sm font-bold text-club-orange uppercase tracking-[0.2em] mb-1">Amministrazione</p>
            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tighter">Portafogli Soci</h1>
          </div>
        </div>
        <UserNav />
      </header>

      <Tabs defaultValue="soci" className="max-w-7xl mx-auto w-full">
        <TabsList className="bg-white/50 p-1.5 rounded-[1.5rem] border border-gray-100 shadow-sm mb-10 grid grid-cols-3 max-w-xl h-auto">
          <TabsTrigger value="soci" className="rounded-2xl py-3 font-bold text-sm data-[state=active]:bg-club-orange data-[state=active]:text-white">
            <Users size={16} className="mr-2" /> Soci
          </TabsTrigger>
          <TabsTrigger value="tariffe" className="rounded-2xl py-3 font-bold text-sm data-[state=active]:bg-club-orange data-[state=active]:text-white">
            <Tag size={16} className="mr-2" /> Tariffe
          </TabsTrigger>
          <TabsTrigger value="luci" className="rounded-2xl py-3 font-bold text-sm data-[state=active]:bg-club-orange data-[state=active]:text-white">
            <Lightbulb size={16} className="mr-2" /> Luci
          </TabsTrigger>
        </TabsList>

        <TabsContent value="soci" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-4">
              <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] rounded-[2rem] bg-white overflow-hidden">
                <CardContent className="p-6 space-y-4">
                  <Label className="text-xs font-black uppercase text-gray-400 tracking-widest ml-1">Cerca Socio</Label>
                  <div className="relative">
                    <Search className="absolute left-4 top-3.5 h-4 w-4 text-gray-400" />
                    <Input
                      className="pl-11 h-12 rounded-2xl bg-gray-50 border-none text-sm font-medium focus:ring-primary/20"
                      placeholder="Cerca per nome..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1 max-h-[60vh] overflow-y-auto -mx-2 px-2">
                    {filteredMembers.map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSelectedMember(m)}
                        className={cn(
                          "w-full text-left px-4 py-3 rounded-xl flex items-center justify-between gap-2 transition-colors",
                          selectedMember?.id === m.id ? "bg-club-orange/10 border-2 border-club-orange/20" : "hover:bg-gray-50 border-2 border-transparent"
                        )}
                      >
                        <span className={cn("text-sm font-bold truncate", selectedMember?.id === m.id ? "text-club-orange" : "text-gray-700")}>
                          {m.full_name || 'Senza nome'}
                        </span>
                        {!m.approved && (
                          <Badge className="bg-amber-100 text-amber-700 border-none font-bold text-[9px] shrink-0">In attesa</Badge>
                        )}
                      </button>
                    ))}
                    {filteredMembers.length === 0 && (
                      <p className="text-center text-xs text-gray-400 font-bold uppercase tracking-widest py-8">Nessun socio trovato</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-8">
              {!selectedMember ? (
                <div className="flex flex-col items-center justify-center py-24 px-6 bg-gray-50/50 rounded-[2rem] border-2 border-dashed border-gray-100 text-gray-400">
                  <WalletIcon className="h-10 w-10 mb-4 opacity-20" />
                  <p className="text-sm font-bold uppercase tracking-widest text-center">← Seleziona un socio per gestire il portafoglio</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white overflow-hidden">
                    <CardContent className="p-8 flex items-center justify-between flex-wrap gap-6">
                      <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{selectedMember.full_name || 'Senza nome'}</p>
                        <p className="text-4xl font-black text-primary">{formatEur(wallet?.balance_cents || 0)}</p>
                      </div>
                      <div className="flex gap-3">
                        <Button
                          onClick={() => setTopupOpen(true)}
                          className="h-12 rounded-xl font-bold bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/10"
                        >
                          <PlusCircle size={18} className="mr-2" /> Accredita Contanti
                        </Button>
                        <Button
                          onClick={() => setAdjustOpen(true)}
                          variant="outline"
                          className="h-12 rounded-xl font-bold border-2 border-gray-100 text-gray-700 hover:border-club-orange/20 hover:bg-club-orange/5 hover:text-club-orange"
                        >
                          <MinusCircle size={18} className="mr-2" /> Correggi Saldo
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white">
                    <CardHeader className="px-8 pt-8 pb-4">
                      <CardTitle className="text-lg font-extrabold text-gray-900">Storico Movimenti</CardTitle>
                    </CardHeader>
                    <CardContent className="px-8 pb-8">
                      {movements.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 px-6 bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-100 text-gray-400">
                          <History className="h-8 w-8 mb-2 opacity-20" />
                          <p className="text-xs font-bold uppercase tracking-widest text-center">Nessun movimento</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {movements.map(m => (
                            <WalletMovementRow key={m.id} movement={m} coverNamesById={coverNamesById} />
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="tariffe" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-7 space-y-6">
              {activeRate && (
                <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-primary/5 border border-primary/10">
                  <CardContent className="p-8 flex items-center justify-between flex-wrap gap-6">
                    <div>
                      <p className="text-[10px] font-black text-primary/70 uppercase tracking-widest mb-1">Tariffa attuale</p>
                      <p className="text-2xl font-black text-primary">{formatEur(activeRate.rate_day_cents)} <span className="text-sm font-bold text-primary/60">/ persona / ora</span></p>
                      <p className="text-sm font-bold text-club-orange mt-1">{formatEur(activeRate.rate_lights_cents)} <span className="text-xs font-medium text-club-orange/70">con luci</span></p>
                    </div>
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Tag className="h-7 w-7 text-primary" />
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white">
                <CardHeader className="px-8 pt-8 pb-4">
                  <CardTitle className="text-lg font-extrabold text-gray-900">Storico Tariffe</CardTitle>
                </CardHeader>
                <CardContent className="px-8 pb-8">
                  {rates.length === 0 ? (
                    <p className="text-center text-xs text-gray-400 font-bold uppercase tracking-widest py-8">Nessuna tariffa configurata</p>
                  ) : (
                    <div className="space-y-2">
                      {rates.map(r => (
                        <div key={r.id} className="flex justify-between items-center px-4 py-3 rounded-xl bg-gray-50/50">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-gray-700">
                              Dal {format(parseISO(r.valid_from), "d MMM yyyy 'alle' HH:mm", { locale: it })}
                            </span>
                            {r.note && <span className="text-[10px] text-gray-400 font-medium">{r.note}</span>}
                          </div>
                          <span className="text-sm font-black text-gray-900 shrink-0">
                            {formatEur(r.rate_day_cents)} <span className="text-gray-400 font-medium">/</span> {formatEur(r.rate_lights_cents)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-5">
              <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white">
                <CardHeader className="px-8 pt-8 pb-4">
                  <CardTitle className="text-lg font-extrabold text-gray-900">Nuova Tariffa</CardTitle>
                </CardHeader>
                <CardContent className="px-8 pb-8 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Decorre da</Label>
                    <Input
                      type="datetime-local"
                      value={newValidFrom}
                      onChange={e => setNewValidFrom(e.target.value)}
                      className="h-12 rounded-xl border-gray-100 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">€ / persona / ora</Label>
                      <Input
                        value={newRateDay}
                        onChange={e => setNewRateDay(e.target.value)}
                        placeholder="3,00"
                        inputMode="decimal"
                        className="h-12 rounded-xl border-gray-100 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">€ con luci</Label>
                      <Input
                        value={newRateLights}
                        onChange={e => setNewRateLights(e.target.value)}
                        placeholder="5,00"
                        inputMode="decimal"
                        className="h-12 rounded-xl border-gray-100 text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Nota (opzionale)</Label>
                    <Textarea
                      value={newRateNote}
                      onChange={e => setNewRateNote(e.target.value)}
                      placeholder="Es: adeguamento stagionale"
                      className="rounded-xl border-gray-100 text-sm min-h-[80px]"
                    />
                  </div>
                  <Button
                    onClick={handleAddRate}
                    disabled={rateSubmitting}
                    className="w-full h-12 rounded-xl font-bold bg-gradient-to-br from-primary to-[#23532f] text-white shadow-lg shadow-primary/10"
                  >
                    {rateSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salva Nuova Tariffa'}
                  </Button>
                  <p className="text-[10px] text-gray-400 font-medium leading-snug px-1">
                    Le tariffe non si modificano: ogni cambiamento aggiunge una nuova riga valida da un certo momento in poi. Le prenotazioni già fatte mantengono il prezzo pagato.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="luci" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-7 space-y-6">
              <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-primary/5 border border-primary/10">
                <CardContent className="p-8 space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Sun className="h-7 w-7 text-primary" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-primary/70 uppercase tracking-widest mb-1">Come funziona il calcolo automatico</p>
                      <p className="text-sm text-gray-700 font-medium leading-relaxed">
                        Un'ora di gioco paga la tariffa "con luci" quando finisce più tardi del tramonto
                        di quel giorno, oltre un margine di tolleranza. Il tramonto è calcolato ogni volta
                        per Tolfa nel fuso orario italiano, quindi la soglia si sposta da sola con le stagioni.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-end gap-3 pt-2">
                    <div className="space-y-2 flex-1">
                      <Label className="text-xs font-black text-primary/70 uppercase tracking-widest ml-1">Margine di tolleranza (minuti dopo il tramonto)</Label>
                      <Input
                        value={lightsThreshold}
                        onChange={e => setLightsThreshold(e.target.value)}
                        inputMode="numeric"
                        placeholder="30"
                        className="h-12 rounded-xl border-primary/20 bg-white text-sm"
                      />
                    </div>
                    <Button
                      onClick={handleSaveThreshold}
                      disabled={thresholdSaving}
                      className="h-12 rounded-xl font-bold bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/10 shrink-0"
                    >
                      {thresholdSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salva'}
                    </Button>
                  </div>
                  <p className="text-[10px] text-primary/60 font-medium leading-snug px-1">
                    Vale da subito per tutti i giorni senza un override manuale sotto. Le prenotazioni già
                    fatte mantengono il prezzo pagato: cambia solo il calcolo per le prenotazioni future.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white">
                <CardHeader className="px-8 pt-8 pb-4">
                  <CardTitle className="text-lg font-extrabold text-gray-900">Override Impostati</CardTitle>
                </CardHeader>
                <CardContent className="px-8 pb-8">
                  {overrides.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 px-6 bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-100 text-gray-400">
                      <Lightbulb className="h-8 w-8 mb-2 opacity-20" />
                      <p className="text-xs font-bold uppercase tracking-widest text-center">Nessun override: vale ovunque il calcolo automatico</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {overrides.map(o => (
                        <div key={o.day} className="flex justify-between items-center px-4 py-3 rounded-xl bg-gray-50/50 gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={cn(
                              "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                              o.force_lights ? "bg-club-orange/10 text-club-orange" : "bg-gray-200 text-gray-500"
                            )}>
                              {o.force_lights ? <Sun size={16} /> : <Moon size={16} />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-gray-700 truncate">
                                {format(parseISO(o.day), "d MMMM yyyy", { locale: it })}
                                <span className={cn("ml-2 text-[10px] font-black uppercase tracking-widest", o.force_lights ? "text-club-orange" : "text-gray-400")}>
                                  {o.force_lights ? 'Sempre luci' : 'Mai luci'}
                                </span>
                              </p>
                              {o.reason && <p className="text-[10px] text-gray-400 font-medium truncate">{o.reason}</p>}
                            </div>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9 rounded-lg text-gray-400 hover:text-destructive hover:bg-destructive/10 shrink-0"
                            onClick={() => setOverrideToRemove(o)}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-5">
              <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white">
                <CardHeader className="px-8 pt-8 pb-4">
                  <CardTitle className="text-lg font-extrabold text-gray-900">Forza un Giorno Specifico</CardTitle>
                </CardHeader>
                <CardContent className="px-8 pb-8 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Data</Label>
                    <Input
                      type="date"
                      value={overrideDay}
                      onChange={e => setOverrideDay(e.target.value)}
                      className="h-12 rounded-xl border-gray-100 text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Calcolo per quel giorno</Label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setOverrideForce('on')}
                        className={cn("flex-1 h-11 rounded-xl text-sm font-bold border-2 transition-all flex items-center justify-center gap-2", overrideForce === 'on' ? "bg-club-orange border-club-orange text-white" : "bg-white border-gray-100 text-gray-400 hover:border-club-orange/30")}
                      >
                        <Sun size={16} /> Sempre luci
                      </button>
                      <button
                        type="button"
                        onClick={() => setOverrideForce('off')}
                        className={cn("flex-1 h-11 rounded-xl text-sm font-bold border-2 transition-all flex items-center justify-center gap-2", overrideForce === 'off' ? "bg-gray-700 border-gray-700 text-white" : "bg-white border-gray-100 text-gray-400 hover:border-gray-300")}
                      >
                        <Moon size={16} /> Mai luci
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Motivo (opzionale)</Label>
                    <Textarea
                      value={overrideReason}
                      onChange={e => setOverrideReason(e.target.value)}
                      placeholder="Es: torneo serale, evento sociale..."
                      className="rounded-xl border-gray-100 text-sm min-h-[80px]"
                    />
                  </div>
                  <Button
                    onClick={handleSetOverride}
                    disabled={overrideSubmitting}
                    className="w-full h-12 rounded-xl font-bold bg-gradient-to-br from-primary to-[#23532f] text-white shadow-lg shadow-primary/10"
                  >
                    {overrideSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salva Override'}
                  </Button>
                  <p className="text-[10px] text-gray-400 font-medium leading-snug px-1">
                    Sostituisce il calcolo automatico solo per questa data. Impostarne uno nuovo sulla
                    stessa data sovrascrive quello precedente.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {selectedMember && (
        <TopupCashDialog
          open={topupOpen}
          onOpenChange={setTopupOpen}
          memberName={selectedMember.full_name || 'questo socio'}
          onSubmit={async (amountCents, note) => {
            const { error } = await supabase.rpc('admin_wallet_topup_cash', {
              p_user_id: selectedMember.id, p_amount_cents: amountCents, p_note: note,
            });
            if (error) { showError(error.message); return false; }
            showSuccess(`Ricarica contanti registrata per ${selectedMember.full_name || 'il socio'}.`);
            refetchWallet();
            return true;
          }}
        />
      )}

      <AlertDialog open={!!overrideToRemove} onOpenChange={(open) => { if (!open && !removingOverride) setOverrideToRemove(null); }}>
        <AlertDialogContent className="rounded-[2rem] border-none shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center text-xl font-black">Rimuovi override luci</AlertDialogTitle>
            <AlertDialogDescription className="text-center text-gray-500">
              {overrideToRemove && (
                <>Il {format(parseISO(overrideToRemove.day), "d MMMM yyyy", { locale: it })} tornerà al calcolo automatico basato sul tramonto.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3">
            <AlertDialogCancel className="h-12 flex-1 rounded-2xl font-bold" disabled={removingOverride}>
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveOverride}
              disabled={removingOverride}
              className="h-12 flex-1 rounded-2xl font-bold bg-destructive hover:bg-destructive/90"
            >
              {removingOverride ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Rimuovi'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {selectedMember && (
        <AdjustBalanceDialog
          open={adjustOpen}
          onOpenChange={setAdjustOpen}
          memberName={selectedMember.full_name || 'questo socio'}
          currentBalanceCents={wallet?.balance_cents || 0}
          onSubmit={async (amountCents, note) => {
            const { error } = await supabase.rpc('admin_wallet_adjust', {
              p_user_id: selectedMember.id, p_amount_cents: amountCents, p_note: note,
            });
            if (error) { showError(error.message); return false; }
            showSuccess("Correzione saldo registrata.");
            refetchWallet();
            return true;
          }}
        />
      )}
    </div>
  );
};

interface TopupCashDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberName: string;
  onSubmit: (amountCents: number, note: string) => Promise<boolean>;
}

const TopupCashDialog: React.FC<TopupCashDialogProps> = ({ open, onOpenChange, memberName, onSubmit }) => {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => { setAmount(''); setNote(''); };

  const handleSubmit = async () => {
    const euros = parseFloat(amount.replace(',', '.'));
    if (!euros || euros <= 0) { showError("Inserisci un importo valido."); return; }
    if (!note.trim()) { showError('Aggiungi una nota (es. "Contanti consegnati al circolo").'); return; }
    setSubmitting(true);
    const ok = await onSubmit(Math.round(euros * 100), note.trim());
    setSubmitting(false);
    if (ok) { reset(); onOpenChange(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent className="sm:max-w-sm border-t-8 border-t-primary rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-gray-900">Accredita Contanti</DialogTitle>
          <DialogDescription className="text-sm">Per {memberName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Importo (€)</Label>
            <Input value={amount} onChange={e => setAmount(e.target.value)} placeholder="10,00" inputMode="decimal" className="h-12 rounded-xl border-gray-100" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Nota</Label>
            <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Es: Contanti consegnati al circolo il 22/09" className="rounded-xl border-gray-100 min-h-[80px]" />
          </div>
        </div>
        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button variant="ghost" className="w-full text-gray-500" onClick={() => onOpenChange(false)} disabled={submitting}>Annulla</Button>
          <Button className="w-full bg-primary hover:bg-primary/90 font-bold" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Accredita'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface AdjustBalanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberName: string;
  currentBalanceCents: number;
  onSubmit: (amountCents: number, note: string) => Promise<boolean>;
}

const AdjustBalanceDialog: React.FC<AdjustBalanceDialogProps> = ({ open, onOpenChange, memberName, currentBalanceCents, onSubmit }) => {
  const [direction, setDirection] = useState<'add' | 'remove'>('add');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => { setAmount(''); setNote(''); setDirection('add'); };

  const handleSubmit = async () => {
    const euros = parseFloat(amount.replace(',', '.'));
    if (!euros || euros <= 0) { showError("Inserisci un importo valido."); return; }
    if (!note.trim()) { showError("Indica il motivo della correzione."); return; }
    const amountCents = Math.round(euros * 100) * (direction === 'remove' ? -1 : 1);
    setSubmitting(true);
    const ok = await onSubmit(amountCents, note.trim());
    setSubmitting(false);
    if (ok) { reset(); onOpenChange(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent className="sm:max-w-sm border-t-8 border-t-club-orange rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-gray-900">Correggi Saldo</DialogTitle>
          <DialogDescription className="text-sm">{memberName} · Saldo attuale {formatEur(currentBalanceCents)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDirection('add')}
              className={cn("flex-1 h-11 rounded-xl text-sm font-bold border-2 transition-all", direction === 'add' ? "bg-primary border-primary text-white" : "bg-white border-gray-100 text-gray-400 hover:border-primary/30")}
            >
              Aggiungi credito
            </button>
            <button
              type="button"
              onClick={() => setDirection('remove')}
              className={cn("flex-1 h-11 rounded-xl text-sm font-bold border-2 transition-all", direction === 'remove' ? "bg-club-orange border-club-orange text-white" : "bg-white border-gray-100 text-gray-400 hover:border-club-orange/30")}
            >
              Rimuovi credito
            </button>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Importo (€)</Label>
            <Input value={amount} onChange={e => setAmount(e.target.value)} placeholder="5,00" inputMode="decimal" className="h-12 rounded-xl border-gray-100" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Motivo</Label>
            <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Es: Errore di addebito prenotazione del 20/09" className="rounded-xl border-gray-100 min-h-[80px]" />
          </div>
        </div>
        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button variant="ghost" className="w-full text-gray-500" onClick={() => onOpenChange(false)} disabled={submitting}>Annulla</Button>
          <Button className="w-full bg-club-orange hover:bg-club-orange/90 font-bold" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Conferma Correzione'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdminWallets;

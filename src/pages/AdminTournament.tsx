"use client";

import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Trophy, ImageIcon, Save, Upload, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { Tournament, TournamentOverrideMode } from '@/types/supabase';
import { isTorneoAttivo } from '@/utils/tournament';
import { cn } from '@/lib/utils';
import Footer from '@/components/Footer';
import UserNav from '@/components/UserNav';

const overrideOptions: { value: TournamentOverrideMode; label: string; description: string }[] = [
  { value: 'auto', label: 'Automatico', description: 'Attivo in base alle date di inizio e fine' },
  { value: 'on', label: 'Forza Attivo', description: 'Sempre attivo, indipendentemente dalle date' },
  { value: 'off', label: 'Forza Disattivo', description: 'Sempre disattivo, avvisi nascosti' },
];

const AdminTournament = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [overrideMode, setOverrideMode] = useState<TournamentOverrideMode>('off');

  const currentTournament: Tournament | null = tournamentId
    ? {
        id: tournamentId,
        name,
        description,
        start_date: startDate || null,
        end_date: endDate || null,
        poster_url: posterUrl,
        override_mode: overrideMode,
        created_at: '',
        updated_at: '',
      }
    : null;

  const attivo = isTorneoAttivo(currentTournament);

  const fetchData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate('/login'); return; }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin) {
      showError("Accesso negato. Non sei un amministratore.");
      navigate('/dashboard');
      return;
    }
    setIsAdmin(true);

    const { data } = await supabase
      .from('tournaments')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      setTournamentId(data.id);
      setName(data.name || '');
      setDescription(data.description || '');
      setStartDate(data.start_date || '');
      setEndDate(data.end_date || '');
      setPosterUrl(data.poster_url || null);
      setOverrideMode(data.override_mode || 'off');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUploadPoster = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showError("Carica un'immagine valida (JPG, PNG).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showError("L'immagine non può superare 5 MB.");
      return;
    }

    setUploading(true);
    const fileExt = file.name.split('.').pop();
    const filePath = `locandina-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('tournament-posters')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      showError("Errore nel caricamento della locandina.");
      setUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('tournament-posters')
      .getPublicUrl(filePath);

    setPosterUrl(publicUrl);
    setUploading(false);
    showSuccess("Locandina caricata. Ricordati di salvare.");
  };

  const handleSave = async () => {
    if (startDate && endDate && endDate < startDate) {
      showError("La data di fine non può precedere quella di inizio.");
      return;
    }

    setSaving(true);
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      start_date: startDate || null,
      end_date: endDate || null,
      poster_url: posterUrl,
      override_mode: overrideMode,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (tournamentId) {
      ({ error } = await supabase.from('tournaments').update(payload).eq('id', tournamentId));
    } else {
      const { data, error: insertError } = await supabase.from('tournaments').insert(payload).select().single();
      error = insertError;
      if (data) setTournamentId(data.id);
    }

    if (error) {
      showError("Errore nel salvataggio delle impostazioni torneo.");
    } else {
      showSuccess("Impostazioni torneo salvate.");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
        <div className="flex-grow p-6 sm:p-10 lg:p-12 max-w-4xl mx-auto w-full">
          <Skeleton className="h-12 w-64 mb-10" />
          <Skeleton className="h-40 w-full rounded-[1.5rem] mb-8" />
          <Skeleton className="h-96 w-full rounded-[1.5rem]" />
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      <div className="flex-grow p-6 sm:p-10 lg:p-12 max-w-4xl mx-auto w-full">
        <header className="flex justify-between items-center mb-10">
          <div className="flex items-center gap-6">
            <Link to="/admin">
              <Button variant="outline" size="icon" className="rounded-2xl border-none shadow-sm bg-white text-primary hover:scale-110 active:scale-95 transition-transform">
                <ArrowLeft size={20} />
              </Button>
            </Link>
            <div className="space-y-1">
              <p className="text-sm font-bold text-club-orange uppercase tracking-[0.2em] mb-1">Amministrazione</p>
              <h1 className="text-3xl font-extrabold text-gray-900 tracking-tighter">Gestione Torneo</h1>
            </div>
          </div>
          <UserNav />
        </header>

        {/* Stato corrente */}
        <Card className={cn(
          "mb-8 border-none rounded-[1.5rem] overflow-hidden transition-all duration-500",
          attivo ? "bg-amber-50 shadow-[0_4px_20px_rgba(245,158,11,0.15)]" : "bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
        )}>
          <div className={cn("h-1.5 w-full transition-all duration-500", attivo ? "bg-amber-400" : "bg-gray-200")}></div>
          <CardContent className="px-8 py-6">
            <div className="flex items-center gap-5">
              <div className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all duration-500",
                attivo ? "bg-amber-100 text-amber-600" : "bg-gray-100 text-gray-400"
              )}>
                <Trophy size={26} />
              </div>
              <div>
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Stato Attuale</p>
                <h3 className="text-xl font-extrabold text-gray-900 tracking-tight">
                  {attivo ? 'Torneo in Corso' : 'Nessun Torneo Attivo'}
                </h3>
                <p className="text-sm text-gray-500 mt-1 leading-snug">
                  {attivo
                    ? 'I soci vedono l\'avviso di possibile revoca sugli slot serali (18-20, 21-22) e weekend mattina.'
                    : 'Gli avvisi sugli slot a rischio sono nascosti ai soci.'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Form configurazione */}
        <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.06)] rounded-[1.5rem] overflow-hidden bg-white mb-8">
          <div className="h-1.5 w-full bg-club-orange"></div>
          <CardContent className="p-8 space-y-7">
            <div>
              <Label htmlFor="name" className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Nome Torneo</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Es. Torneo Sociale 2026"
                className="mt-2 h-12 rounded-xl"
              />
            </div>

            <div>
              <Label htmlFor="description" className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Descrizione</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Informazioni sul torneo, categorie, regolamento..."
                className="mt-2 rounded-xl min-h-[100px]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <Label htmlFor="start" className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Data Inizio</Label>
                <Input
                  id="start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-2 h-12 rounded-xl"
                />
              </div>
              <div>
                <Label htmlFor="end" className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Data Fine</Label>
                <Input
                  id="end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-2 h-12 rounded-xl"
                />
              </div>
            </div>

            {/* Modalità attivazione */}
            <div>
              <Label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Modalità Attivazione</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                {overrideOptions.map((opt) => {
                  const selected = overrideMode === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setOverrideMode(opt.value)}
                      className={cn(
                        "text-left p-4 rounded-xl border-2 transition-all duration-300",
                        selected
                          ? "border-club-orange bg-club-orange/5 shadow-sm"
                          : "border-gray-100 bg-white hover:border-club-orange/20"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {selected
                          ? <CheckCircle2 className="h-4 w-4 text-club-orange" />
                          : <div className="h-4 w-4 rounded-full border-2 border-gray-200" />}
                        <span className={cn("text-sm font-bold", selected ? "text-club-orange" : "text-gray-700")}>{opt.label}</span>
                      </div>
                      <p className="text-xs text-gray-500 leading-snug pl-6">{opt.description}</p>
                    </button>
                  );
                })}
              </div>
              {overrideMode === 'auto' && (!startDate || !endDate) && (
                <div className="flex items-start gap-2 mt-3 text-amber-700">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <p className="text-xs font-medium leading-snug">
                    In modalità Automatico devi impostare entrambe le date, altrimenti il torneo resta disattivo.
                  </p>
                </div>
              )}
            </div>

            {/* Locandina */}
            <div>
              <Label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Locandina</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleUploadPoster}
                className="hidden"
              />
              {posterUrl ? (
                <div className="mt-2 flex flex-col sm:flex-row items-start gap-4">
                  <img
                    src={posterUrl}
                    alt="Locandina torneo"
                    className="w-40 h-56 object-cover rounded-xl border border-gray-100 shadow-sm"
                  />
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="rounded-xl font-bold border-2 border-gray-100 text-gray-700 hover:border-club-orange/20 hover:bg-club-orange/5 hover:text-club-orange"
                    >
                      <Upload className="mr-2 h-4 w-4" /> {uploading ? 'Caricamento...' : 'Sostituisci'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setPosterUrl(null)}
                      className="rounded-xl font-bold text-destructive hover:bg-destructive/5"
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Rimuovi
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="mt-2 w-full flex flex-col items-center justify-center py-12 px-6 bg-gray-50/50 rounded-[1.5rem] border-2 border-dashed border-gray-200 text-gray-400 hover:border-club-orange/30 hover:text-club-orange transition-all"
                >
                  <ImageIcon className="h-8 w-8 mb-3 opacity-40" />
                  <p className="text-sm font-bold uppercase tracking-widest">{uploading ? 'Caricamento...' : 'Carica Locandina'}</p>
                  <p className="text-xs mt-1 normal-case tracking-normal">JPG o PNG, max 5 MB</p>
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full h-14 rounded-[1.5rem] font-black text-lg shadow-xl bg-gradient-to-br from-primary to-[#23532f] text-white hover:scale-[1.01] active:scale-[0.98] shadow-primary/20"
        >
          <Save className="mr-2 h-5 w-5" /> {saving ? 'Salvataggio...' : 'Salva Impostazioni'}
        </Button>
      </div>
      <Footer />
    </div>
  );
};

export default AdminTournament;

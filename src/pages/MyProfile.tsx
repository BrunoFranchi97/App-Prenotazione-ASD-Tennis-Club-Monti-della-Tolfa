"use client";

import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, User, Camera, Save, Lock, Smartphone, CreditCard, Loader2, Target } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import type { SkillLevel } from '@/types/supabase';

const MyProfile = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [userEmail, setUserEmail] = useState<string>('');

  // Form states
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('intermedio');
  const [membershipNumber, setMembershipNumber] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }
      setUserEmail(user.email || '');

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      
      setProfile(data);
      setFullName(data.full_name || '');
      setPhone(data.phone || '');
      setSkillLevel(data.skill_level || 'intermedio');
      setMembershipNumber(data.membership_number || '');
    } catch (err: any) {
      showError("Errore nel caricamento del profilo: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showError("Immagine troppo grande. Massimo 2MB.");
      return;
    }

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/avatar.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setProfile({ ...profile, avatar_url: publicUrl });
      showSuccess("Foto profilo aggiornata!");
    } catch (err: any) {
      showError("Errore durante l'upload: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          phone: phone,
          skill_level: skillLevel,
          membership_number: membershipNumber,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) throw error;
      showSuccess("Profilo aggiornato con successo!");
    } catch (err: any) {
      showError("Errore durante l'aggiornamento: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword) return;
    
    if (newPassword !== confirmPassword) {
      showError("Le password non corrispondono.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      
      showSuccess("Password aggiornata! Per sicurezza, effettua nuovamente l'accesso.");
      
      // Logout per forzare il rientro con le nuove credenziali
      await supabase.auth.signOut();
      navigate('/login');
    } catch (err: any) {
      showError("Errore nel cambio password: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 sm:p-10 lg:p-12">
      <header className="flex justify-between items-end mb-10 max-w-4xl mx-auto">
        <div className="flex items-center gap-6">
          <Link to="/dashboard">
            <Button variant="outline" size="icon" className="rounded-2xl border-none shadow-sm bg-white text-primary hover:scale-110 active:scale-95 transition-transform">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <p className="text-sm font-bold text-club-orange uppercase tracking-[0.2em] mb-1">Account</p>
            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tighter">Il mio Profilo</h1>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Sidebar */}
        <div className="space-y-5">
          <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white text-center p-6">
            <div className="relative inline-block mx-auto mb-4">
              <Avatar className="h-28 w-28 border-4 border-white shadow-xl cursor-pointer" onClick={handleAvatarClick}>
                <AvatarImage src={profile?.avatar_url} />
                <AvatarFallback className="text-4xl bg-primary/10 text-primary font-black">
                  {fullName?.charAt(0).toUpperCase() || userEmail.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={handleAvatarClick}
                className="absolute bottom-0 right-0 p-2 bg-club-orange rounded-full text-white shadow-lg hover:scale-110 transition-transform"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </button>
              <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} />
            </div>
            <h2 className="text-lg font-extrabold text-gray-900 tracking-tight">{fullName || 'Socio'}</h2>
            <p className="text-xs text-gray-400 font-medium mb-4">{userEmail}</p>
            <div className="flex justify-center gap-2 flex-wrap">
              <Badge className={`border-none font-bold ${profile?.approved ? 'bg-primary/10 text-primary' : 'bg-amber-100 text-amber-700'}`}>
                {profile?.approved ? 'Approvato' : 'In attesa'}
              </Badge>
              {profile?.is_admin && (
                <Badge className="bg-club-orange/10 text-club-orange border-none font-bold">Admin</Badge>
              )}
            </div>
          </Card>

          <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white">
            <CardHeader className="pb-3 px-6 pt-6">
              <CardTitle className="text-xs font-black text-gray-400 uppercase tracking-widest">Info Club</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-6 pb-6">
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-xl bg-club-orange/10 flex items-center justify-center flex-shrink-0">
                  <CreditCard className="h-4 w-4 text-club-orange" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tessera</p>
                  <p className="font-bold text-gray-800">{membershipNumber || 'N/D'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-xl bg-club-orange/10 flex items-center justify-center flex-shrink-0">
                  <Target className="h-4 w-4 text-club-orange" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Livello</p>
                  <p className="font-bold text-gray-800 capitalize">{skillLevel}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main content */}
        <div className="md:col-span-2 space-y-5">
          <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white">
            <CardHeader className="px-8 pt-8 pb-4">
              <CardTitle className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
                <User className="h-5 w-5 text-primary" /> Informazioni Personali
              </CardTitle>
              <CardDescription className="text-gray-400 text-sm">Aggiorna i tuoi dati e le tue abilità</CardDescription>
            </CardHeader>
            <CardContent className="px-8 pb-8">
              <form onSubmit={handleUpdateProfile} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName" className="text-sm font-semibold ml-1 text-gray-700">Nome Completo</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Il tuo nome"
                      className="rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-semibold ml-1 text-gray-700">Telefono</Label>
                    <div className="relative">
                      <Smartphone className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                      <Input
                        id="phone"
                        className="pl-9 rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+39 333..."
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold ml-1 text-gray-700">Livello di Gioco</Label>
                    <Select value={skillLevel} onValueChange={(v) => setSkillLevel(v as SkillLevel)}>
                      <SelectTrigger className="rounded-xl border-gray-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="principiante">Principiante</SelectItem>
                        <SelectItem value="intermedio">Intermedio</SelectItem>
                        <SelectItem value="avanzato">Avanzato</SelectItem>
                        <SelectItem value="agonista">Agonista</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="membership" className="text-sm font-semibold ml-1 text-gray-700">Numero Tessera (opzionale)</Label>
                    <Input
                      id="membership"
                      value={membershipNumber}
                      onChange={(e) => setMembershipNumber(e.target.value)}
                      placeholder="Codice tessera"
                      className="rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={saving}
                  className="w-full h-12 bg-gradient-to-br from-primary to-[#23532f] hover:from-[#357a46] hover:to-[#23532f] text-white rounded-2xl font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.01] active:scale-[0.98]"
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Salva Modifiche Profilo
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-none shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[2rem] bg-white">
            <CardHeader className="px-8 pt-8 pb-4">
              <CardTitle className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
                <Lock className="h-5 w-5 text-primary" /> Sicurezza
              </CardTitle>
              <CardDescription className="text-gray-400 text-sm">Aggiorna la tua password di accesso</CardDescription>
            </CardHeader>
            <CardContent className="px-8 pb-8">
              <form onSubmit={handleChangePassword} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="newPassword" className="text-sm font-semibold ml-1 text-gray-700">Nuova Password</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min. 6 caratteri"
                      className="rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPass" className="text-sm font-semibold ml-1 text-gray-700">Conferma Nuova Password</Label>
                    <Input
                      id="confirmPass"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Ripeti la password"
                      className="rounded-xl border-gray-200 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  disabled={saving || !newPassword}
                  className="w-full h-12 rounded-2xl border-2 border-primary/20 text-primary font-bold hover:bg-primary/5 transition-all"
                >
                  Aggiorna Password
                </Button>
                <p className="text-xs text-gray-400 text-center">
                  Nota: verrai disconnesso per confermare la nuova password.
                </p>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default MyProfile;
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="flex justify-between items-center mb-8 max-w-4xl mx-auto">
        <div className="flex items-center">
          <Link to="/dashboard" className="mr-4">
            <Button variant="outline" size="icon" className="text-primary border-primary">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-primary">Il mio Profilo</h1>
        </div>
      </header>

      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="space-y-6">
          <Card className="shadow-lg text-center p-6">
            <div className="relative inline-block mx-auto mb-4 group">
              <Avatar className="h-32 w-32 border-4 border-white shadow-xl cursor-pointer" onClick={handleAvatarClick}>
                <AvatarImage src={profile?.avatar_url} />
                <AvatarFallback className="text-4xl bg-primary text-white">
                  {fullName?.charAt(0).toUpperCase() || userEmail.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div 
                className="absolute bottom-0 right-0 p-2 bg-club-orange rounded-full text-white shadow-lg cursor-pointer hover:scale-110 transition-transform"
                onClick={handleAvatarClick}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </div>
              <input 
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleAvatarUpload}
              />
            </div>
            <h2 className="text-xl font-bold text-gray-800">{fullName || 'Socio'}</h2>
            <p className="text-sm text-gray-500 mb-4">{userEmail}</p>
            <div className="flex justify-center gap-2">
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                {profile?.approved ? 'Approvato' : 'In attesa'}
              </Badge>
              {profile?.is_admin && (
                <Badge variant="secondary" className="bg-orange-100 text-orange-800">Admin</Badge>
              )}
            </div>
          </Card>

          <Card className="shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Info Club</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center text-sm">
                <CreditCard className="mr-2 h-4 w-4 text-club-orange" />
                <span className="font-medium mr-2">Tessera:</span>
                <span className="text-gray-700">{membershipNumber || 'N/D'}</span>
              </div>
              <div className="flex items-center text-sm">
                <Target className="mr-2 h-4 w-4 text-club-orange" />
                <span className="font-medium mr-2">Livello:</span>
                <span className="text-gray-700 capitalize">{skillLevel}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2 space-y-6">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-primary flex items-center">
                <User className="mr-2 h-5 w-5" /> Informazioni Personali
              </CardTitle>
              <CardDescription>Aggiorna i tuoi dati di contatto e le tue abilità</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Nome Completo</Label>
                    <Input 
                      id="fullName" 
                      value={fullName} 
                      onChange={(e) => setFullName(e.target.value)} 
                      placeholder="Il tuo nome"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefono</Label>
                    <div className="relative">
                      <Smartphone className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                      <Input 
                        id="phone" 
                        className="pl-9"
                        value={phone} 
                        onChange={(e) => setPhone(e.target.value)} 
                        placeholder="+39 333..."
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Livello di Gioco</Label>
                    <Select value={skillLevel} onValueChange={(v) => setSkillLevel(v as SkillLevel)}>
                      <SelectTrigger>
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
                    <Label htmlFor="membership">Numero Tessera (opzionale)</Label>
                    <Input 
                      id="membership" 
                      value={membershipNumber} 
                      onChange={(e) => setMembershipNumber(e.target.value)} 
                      placeholder="Codice tessera"
                    />
                  </div>
                </div>

                <Button type="submit" disabled={saving} className="w-full bg-primary hover:bg-primary/90">
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  <span className="ml-2">Salva Modifiche Profilo</span>
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-primary flex items-center">
                <Lock className="mr-2 h-5 w-5" /> Sicurezza
              </CardTitle>
              <CardDescription>Aggiorna la tua password di accesso</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">Nuova Password</Label>
                    <Input 
                      id="newPassword" 
                      type="password" 
                      value={newPassword} 
                      onChange={(e) => setNewPassword(e.target.value)} 
                      placeholder="Min. 6 caratteri"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPass">Conferma Nuova Password</Label>
                    <Input 
                      id="confirmPass" 
                      type="password" 
                      value={confirmPassword} 
                      onChange={(e) => setConfirmPassword(e.target.value)} 
                    />
                  </div>
                </div>
                <Button type="submit" variant="outline" disabled={saving || !newPassword} className="w-full border-primary text-primary">
                  Aggiorna Password
                </Button>
                <p className="text-xs text-muted-foreground text-center">
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
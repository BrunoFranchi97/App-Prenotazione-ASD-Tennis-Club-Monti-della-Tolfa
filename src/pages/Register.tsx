"use client";

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { MailCheck, ArrowLeft } from 'lucide-react';
import { getAuthRedirectTo } from '@/utils/authRedirect';

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (password !== confirmPassword) {
      showError("Le password non corrispondono.");
      setLoading(false);
      return;
    }

    try {
      const redirectTo = getAuthRedirectTo();

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
          },
          emailRedirectTo: redirectTo,
        },
      });

      if (error) {
        // Se l'utente esiste già, Supabase potrebbe non restituire un errore esplicito per sicurezza 
        // a seconda delle impostazioni del progetto, ma se lo fa, lo mostriamo chiaramente.
        if (error.message.toLowerCase().includes("already registered") || error.status === 400) {
          showError("Questa email è già in uso. Effettua il login.");
        } else {
          showError(error.message);
        }
      } else if (data.user && data.user.identities && data.user.identities.length === 0) {
        // Tipico comportamento di Supabase quando l'utente esiste già: restituisce successo ma zero identità
        showError("Email già in uso. Effettua il login o recupera la password.");
      } else if (data.user) {
        setIsRegistered(true);
      }
    } catch (error: any) {
      showError("Errore durante la registrazione. Riprova più tardi.");
    } finally {
      setLoading(false);
    }
  };

  if (isRegistered) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white p-4">
        <Card className="w-full max-w-md shadow-lg rounded-lg text-center">
          <CardHeader>
            <MailCheck className="mx-auto h-16 w-16 text-primary mb-4" />
            <CardTitle className="text-3xl font-bold text-primary">Verifica Email Inviata</CardTitle>
            <CardDescription className="text-gray-600 mt-2">
              Abbiamo inviato un link di verifica a <strong>{email}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-700">
              Per completare la registrazione e accedere, clicca sul link contenuto nell'email.
            </p>
            <p className="text-sm text-red-600 font-medium">
              Attenzione: Dopo la verifica, il tuo account dovrà essere approvato da un amministratore prima di poter prenotare.
            </p>
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Link to="/login" className="w-full">
              <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
                Vai al Login
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white p-4">
      <Card className="w-full max-w-md shadow-lg rounded-lg">
        <CardHeader className="text-center">
          <img src="/logo.png" alt="Logo" className="mx-auto h-20 w-20 mb-4" />
          <CardTitle className="text-3xl font-bold text-primary">Registrati</CardTitle>
          <CardDescription className="text-gray-600 mt-2">Crea il tuo account socio.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome Completo</Label>
              <Input id="name" type="text" placeholder="Nome e Cognome" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="email@esempio.it" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="Min. 6 caratteri" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Conferma Password</Label>
              <Input id="confirm-password" type="password" placeholder="Ripeti password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={loading}>
              {loading ? "Registrazione..." : "Registrati"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="text-sm text-center">
          <Link to="/login" className="text-primary hover:underline">Hai già un account? Accedi</Link>
        </CardFooter>
      </Card>
    </div>
  );
};

export default Register;
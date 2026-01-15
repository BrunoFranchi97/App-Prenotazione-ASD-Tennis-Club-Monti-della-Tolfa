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

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const navigate = useNavigate();

  const getEmailRedirectUrl = () => {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    // Se siamo in locale, usiamo localhost per il testing.
    if (isLocalhost) {
      return 'http://localhost:8080/dashboard';
    }
    
    // In tutti gli altri casi (inclusi i deploy Vercel), usiamo l'URL di produzione configurato.
    // Questo URL deve essere configurato come VITE_APP_DOMAIN in Vercel.
    const appDomain = import.meta.env.VITE_APP_DOMAIN || 'https://dyad-generated-app.vercel.app';
    return `${appDomain}/dashboard`;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (password !== confirmPassword) {
      showError("Le password non corrispondono.");
      setLoading(false);
      return;
    }

    try {
      // Usa l'URL di redirect determinato
      const redirectTo = getEmailRedirectUrl();
      console.log('Email redirect URL set to:', redirectTo);

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
        showError(error.message);
      } else if (data.user) {
        setIsRegistered(true);
        console.log('Registration successful, redirect URL set to:', redirectTo);
      }
    } catch (error: any) {
      showError(error.message || "Errore durante la registrazione.");
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
            <p className="text-xs text-gray-500 mt-4">
              Se non ricevi l'email entro pochi minuti, controlla la cartella spam.
            </p>
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Link to="/login" className="w-full">
              <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
                Vai al Login
              </Button>
            </Link>
            <Button variant="link" onClick={() => setIsRegistered(false)} className="text-primary">
              <ArrowLeft className="mr-2 h-4 w-4" /> Torna al modulo
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white p-4">
      <Card className="w-full max-w-md shadow-lg rounded-lg">
        <CardHeader className="text-center">
          <img src="/logo.png" alt="ASD Tennis Club Monti della Tolfa Logo" className="mx-auto h-20 w-20 mb-4" />
          <CardTitle className="text-3xl font-bold text-primary">Registrati</CardTitle>
          <CardDescription className="text-gray-600 mt-2">Crea il tuo account per iniziare a prenotare.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome Completo</Label>
              <Input id="name" type="text" placeholder="Inserisci il tuo nome" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="Inserisci la tua email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="Crea una password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Conferma Password</Label>
              <Input id="confirm-password" type="password" placeholder="Conferma la password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={loading}>
              {loading ? "Registrazione in corso..." : "Registrati"}
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
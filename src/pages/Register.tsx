"use client";

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { MailCheck, Info } from 'lucide-react';
import { getAuthRedirectTo } from '@/utils/authRedirect';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);

  // GDPR Consents
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [personalDataAccepted, setPersonalDataAccepted] = useState(false);
  const [healthDataAccepted, setHealthDataAccepted] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!termsAccepted || !personalDataAccepted || !healthDataAccepted) {
      showError("È necessario accettare tutti i consensi per procedere.");
      return;
    }

    if (password !== confirmPassword) {
      showError("Le password non corrispondono.");
      return;
    }

    setLoading(true);

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
        if (error.message.toLowerCase().includes("already registered") || error.status === 400) {
          showError("Questa email è già in uso. Effettua il login.");
        } else {
          showError(error.message);
        }
      } else if (data.user && data.user.identities && data.user.identities.length === 0) {
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
            <div className="space-y-2 mb-6">
              <Label htmlFor="confirm-password">Conferma Password</Label>
              <Input id="confirm-password" type="password" placeholder="Ripeti password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </div>

            {/* GDPR Checkboxes */}
            <div className="space-y-4 pt-4 border-t border-gray-100">
              <div className="flex items-start space-x-3">
                <Checkbox 
                  id="terms" 
                  checked={termsAccepted} 
                  onCheckedChange={(checked) => setTermsAccepted(!!checked)}
                  className="mt-1"
                />
                <div className="grid gap-1.5 leading-none">
                  <div className="flex items-center">
                    <Label htmlFor="terms" className="text-sm font-normal cursor-pointer">
                      Ho letto e accetto i <Link to="/terms" className="text-primary hover:underline font-medium">Termini</Link> e l'<Link to="/privacy" className="text-primary hover:underline font-medium">Informativa Privacy</Link>
                    </Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 ml-2 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs text-xs">Accettazione dei termini di servizio e delle politiche di riservatezza del club.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Checkbox 
                  id="personalData" 
                  checked={personalDataAccepted} 
                  onCheckedChange={(checked) => setPersonalDataAccepted(!!checked)}
                  className="mt-1"
                />
                <div className="grid gap-1.5 leading-none">
                  <div className="flex items-center">
                    <Label htmlFor="personalData" className="text-sm font-normal cursor-pointer">
                      Trattamento dati personali (nome, cognome, email)
                    </Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 ml-2 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs text-xs">Consenso al trattamento dei dati anagrafici per la gestione del profilo socio e delle prenotazioni.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Checkbox 
                  id="healthData" 
                  checked={healthDataAccepted} 
                  onCheckedChange={(checked) => setHealthDataAccepted(!!checked)}
                  className="mt-1"
                />
                <div className="grid gap-1.5 leading-none">
                  <div className="flex items-center">
                    <Label htmlFor="healthData" className="text-sm font-normal cursor-pointer">
                      Trattamento dati sanitari e accesso amministratori
                    </Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 ml-2 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs text-xs">Consenso necessario per la gestione dei certificati medici e la verifica dell'idoneità sportiva da parte del club.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground mt-4" 
              disabled={loading || !termsAccepted || !personalDataAccepted || !healthDataAccepted}
            >
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
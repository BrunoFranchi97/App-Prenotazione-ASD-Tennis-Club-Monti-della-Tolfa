"use client";

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import { MailCheck, Loader2, Mail, RefreshCw } from 'lucide-react';
import Footer from '@/components/Footer';

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const [isRegistered, setIsRegistered] = useState(false);
  const [consents, setConsents] = useState({ terms: false, personal: false, health: false });
  const navigate = useNavigate();

  // Funzione per validare il formato email
  const isValidEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Funzione per validare la password
  const isValidPassword = (password: string) => {
    return password.length >= 6;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validazioni
    if (!name.trim()) {
      showError("Inserisci il tuo nome completo.");
      return;
    }
    
    if (!isValidEmail(email)) {
      showError("Inserisci un indirizzo email valido.");
      return;
    }
    
    if (!isValidPassword(password)) {
      showError("La password deve essere di almeno 6 caratteri.");
      return;
    }
    
    if (password !== confirmPassword) {
      showError("Le password non corrispondono.");
      return;
    }
    
    if (!consents.terms || !consents.personal || !consents.health) {
      showError("Devi accettare tutti i consensi per procedere.");
      return;
    }
    
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email, 
        password,
        options: { 
          data: { 
            full_name: name, 
            terms_accepted: true, 
            personal_data_accepted: true, 
            health_data_accepted: true 
          },
          emailRedirectTo: `${window.location.origin}/auth/verify`
        }
      });
      
      if (error) {
        // Gestione specifica del rate limit
        if (error.message.includes('rate limit') || error.message.includes('too many requests')) {
          showError("Troppe richieste di registrazione. Attendi qualche minuto prima di riprovare.");
        } else if (error.message.includes('already registered')) {
          showError("Questo indirizzo email è già registrato. Prova ad accedere invece.");
        } else {
          showError(`Errore durante la registrazione: ${error.message}`);
        }
        return;
      }
      
      setIsRegistered(true);
      
    } catch (error: any) { 
      console.error("Errore durante la registrazione:", error);
      showError("Si è verificato un errore imprevisto. Riprova più tardi.");
    } finally { 
      setLoading(false); 
    }
  };

  const handleResendEmail = async () => {
    try {
      await supabase.auth.resend({ type: 'signup', email });
      showSuccess("Email di verifica inviata di nuovo!");
    } catch {
      showError("Impossibile reinviare l'email. Riprova più tardi.");
    }
  };

  if (isRegistered) return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      {/* Institutional Logos */}
      <div className="container mx-auto px-6 py-6 flex justify-between items-center">
        <div className="flex items-center justify-center p-2 bg-white rounded-xl shadow-sm border border-gray-50">
          <img src="/assets/coni.jpeg" alt="Logo CONI" className="h-8 w-auto grayscale opacity-80 hover:grayscale-0 hover:opacity-100 transition-all duration-500" />
        </div>
        <div className="flex items-center justify-center p-2 bg-white rounded-xl shadow-sm border border-gray-50">
          <img src="/assets/fitp.jpeg" alt="Logo FITP" className="h-8 w-auto grayscale opacity-80 hover:grayscale-0 hover:opacity-100 transition-all duration-500" />
        </div>
      </div>

      <div className="flex-grow flex items-center justify-center px-6 py-4">
        <Card className="w-full max-w-md border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2rem] overflow-hidden bg-white/80 backdrop-blur-xl text-center">
          <CardContent className="pt-12 pb-10 px-8 flex flex-col items-center gap-6">
            {/* Icon */}
            <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center shadow-inner">
              <Mail className="h-10 w-10 text-primary" />
            </div>

            {/* Title & description */}
            <div className="space-y-2">
              <h2 className="text-2xl font-extrabold text-gray-900">Controlla la tua email</h2>
              <p className="text-gray-500 text-sm leading-relaxed">
                Abbiamo inviato un link di verifica a<br />
                <span className="font-bold text-primary">{email}</span>
              </p>
            </div>

            {/* Steps */}
            <div className="w-full bg-gray-50 rounded-2xl p-5 space-y-3 text-left">
              {[
                { n: "1", text: "Apri la tua casella di posta" },
                { n: "2", text: "Clicca il link nell'email di conferma" },
                { n: "3", text: "Verrai reindirizzato all'app" },
              ].map(({ n, text }) => (
                <div key={n} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-black flex items-center justify-center flex-shrink-0">{n}</span>
                  <span className="text-sm text-gray-600 font-medium">{text}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-gray-400 leading-relaxed">
              Dopo la verifica il tuo account dovrà essere approvato da un amministratore prima di poter prenotare i campi.
            </p>

            {/* Actions */}
            <div className="w-full space-y-3 pt-1">
              <Link to="/login" className="block">
                <Button className="w-full h-13 bg-gradient-to-br from-primary to-[#23532f] hover:from-[#357a46] hover:to-[#23532f] text-white rounded-2xl text-base font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all hover:scale-[1.02] active:scale-[0.98]">
                  Torna al Login
                </Button>
              </Link>
              <button
                onClick={handleResendEmail}
                className="flex items-center justify-center gap-2 w-full text-sm text-gray-400 hover:text-primary transition-colors font-medium py-2"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Non hai ricevuto l'email? Reinvia
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
      <Footer />
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      {/* Institutional Logos */}
      <div className="container mx-auto px-6 py-6 flex justify-between items-center">
        <div className="flex items-center justify-center p-2 bg-white rounded-xl shadow-sm border border-gray-50">
          <img
            src="/assets/coni.jpeg"
            alt="Logo CONI"
            className="h-8 w-auto grayscale opacity-80 hover:grayscale-0 hover:opacity-100 transition-all duration-500"
          />
        </div>
        <div className="flex items-center justify-center p-2 bg-white rounded-xl shadow-sm border border-gray-50">
          <img
            src="/assets/fitp.jpeg"
            alt="Logo FITP"
            className="h-8 w-auto grayscale opacity-80 hover:grayscale-0 hover:opacity-100 transition-all duration-500"
          />
        </div>
      </div>

      <div className="flex-grow flex items-center justify-center px-6 py-4">
        <Card className="w-full max-w-md border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2rem] overflow-hidden bg-white/80 backdrop-blur-xl">
          <CardHeader className="text-center pt-10 pb-6">
            <div className="mx-auto w-20 h-20 mb-5 rounded-3xl overflow-hidden shadow-lg border-4 border-white">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
            </div>
            <CardTitle className="text-2xl font-extrabold text-gray-900 tracking-tight flex flex-col">
              <span className="text-primary">Nuovo Socio</span>
              <span className="text-gray-500 text-lg font-semibold">ASD Tennis Club Monti della Tolfa</span>
            </CardTitle>
            <CardDescription className="text-gray-500 mt-2 text-sm">Compila il modulo per unirti al circolo</CardDescription>
          </CardHeader>
          <CardContent className="px-8 space-y-5">
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome" className="text-sm font-semibold ml-1 text-gray-700">Nome Completo *</Label>
                <Input
                  id="nome"
                  name="nome"
                  aria-label="Nome Completo"
                  maxLength={50}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  placeholder="Mario Rossi"
                  className="rounded-xl border-gray-200 py-6 focus:ring-primary/20 focus:border-primary transition-all bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold ml-1 text-gray-700">Email *</Label>
                <Input
                  id="email"
                  name="email"
                  aria-label="Email"
                  maxLength={100}
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="esempio@email.com"
                  className="rounded-xl border-gray-200 py-6 focus:ring-primary/20 focus:border-primary transition-all bg-white"
                />
                {email && !isValidEmail(email) && (
                  <p className="text-xs text-red-500 ml-1">Inserisci un indirizzo email valido</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-semibold ml-1 text-gray-700">Password *</Label>
                <Input
                  id="password"
                  name="password"
                  aria-label="Password"
                  maxLength={100}
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="Minimo 6 caratteri"
                  className="rounded-xl border-gray-200 py-6 focus:ring-primary/20 focus:border-primary transition-all bg-white"
                />
                {password && !isValidPassword(password) && (
                  <p className="text-xs text-red-500 ml-1">La password deve essere di almeno 6 caratteri</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm font-semibold ml-1 text-gray-700">Conferma Password *</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  aria-label="Conferma Password"
                  maxLength={100}
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Ripeti la password"
                  className="rounded-xl border-gray-200 py-6 focus:ring-primary/20 focus:border-primary transition-all bg-white"
                />
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-red-500 ml-1">Le password non corrispondono</p>
                )}
              </div>

              <div className="space-y-3 pt-2 pb-1 px-1">
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={consents.terms}
                    onCheckedChange={v => setConsents({...consents, terms: !!v})}
                    id="terms"
                    className="mt-0.5"
                  />
                  <Label htmlFor="terms" className="text-xs cursor-pointer text-gray-600 leading-relaxed">
                    Accetto i Termini e Condizioni e l'Informativa sulla Privacy
                  </Label>
                </div>
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={consents.personal}
                    onCheckedChange={v => setConsents({...consents, personal: !!v})}
                    id="personal"
                    className="mt-0.5"
                  />
                  <Label htmlFor="personal" className="text-xs cursor-pointer text-gray-600 leading-relaxed">
                    Consento al trattamento dei miei dati personali
                  </Label>
                </div>
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={consents.health}
                    onCheckedChange={v => setConsents({...consents, health: !!v})}
                    id="health"
                    className="mt-0.5"
                  />
                  <Label htmlFor="health" className="text-xs cursor-pointer text-gray-600 leading-relaxed">
                    Consento al trattamento dei miei dati sanitari
                  </Label>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-14 bg-gradient-to-br from-primary to-[#23532f] hover:from-[#357a46] hover:to-[#23532f] text-white rounded-2xl text-lg font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Registrazione in corso...
                  </>
                ) : (
                  "Registrati al Club"
                )}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex flex-col gap-3 pb-10 px-8">
            <div className="w-full h-px bg-gray-100 my-1"></div>
            <Link to="/login" className="text-sm text-primary font-bold hover:underline text-center">
              Hai già un account? Accedi
            </Link>
          </CardFooter>
        </Card>
      </div>
      <Footer />
    </div>
  );
};

export default Register;
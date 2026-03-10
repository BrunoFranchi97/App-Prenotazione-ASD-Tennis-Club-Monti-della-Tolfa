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
import { MailCheck, Loader2 } from 'lucide-react';
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
      showSuccess("Registrazione completata! Controlla la tua email per verificare l'account.");
      
      // Reindirizza automaticamente dopo 5 secondi
      setTimeout(() => {
        navigate('/login');
      }, 5000);
      
    } catch (error: any) { 
      console.error("Errore durante la registrazione:", error);
      showError("Si è verificato un errore imprevisto. Riprova più tardi.");
    } finally { 
      setLoading(false); 
    }
  };

  if (isRegistered) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md text-center p-8">
        <MailCheck className="mx-auto h-16 w-16 text-primary mb-4" />
        <CardTitle className="text-2xl font-bold text-primary mb-4">Registrazione Completata!</CardTitle>
        <p className="mt-4 text-gray-600 mb-2">Controlla la tua casella di posta per confermare l'account.</p>
        <p className="text-sm text-gray-500 mb-6">Verrai reindirizzato alla pagina di login tra 5 secondi...</p>
        <Link to="/login">
          <Button className="w-full bg-primary hover:bg-primary/90">Vai al Login</Button>
        </Link>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="flex-grow flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Registrati</CardTitle>
            <CardDescription>Entra a far parte dell'ASD Tennis Club.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-1">
                <Label>Nome Completo *</Label>
                <Input 
                  maxLength={50} 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  required 
                  placeholder="Mario Rossi" 
                />
              </div>
              <div className="space-y-1">
                <Label>Email *</Label>
                <Input 
                  maxLength={100} 
                  type="email" 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  required 
                  placeholder="esempio@email.com"
                />
                {email && !isValidEmail(email) && (
                  <p className="text-xs text-red-500 mt-1">Inserisci un indirizzo email valido</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Password *</Label>
                <Input 
                  maxLength={100} 
                  type="password" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  required 
                  placeholder="Minimo 6 caratteri"
                />
                {password && !isValidPassword(password) && (
                  <p className="text-xs text-red-500 mt-1">La password deve essere di almeno 6 caratteri</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Conferma Password *</Label>
                <Input 
                  maxLength={100} 
                  type="password" 
                  value={confirmPassword} 
                  onChange={e => setConfirmPassword(e.target.value)} 
                  required 
                  placeholder="Ripeti la password"
                />
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-red-500 mt-1">Le password non corrispondono</p>
                )}
              </div>
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2">
                  <Checkbox 
                    checked={consents.terms} 
                    onCheckedChange={v => setConsents({...consents, terms: !!v})} 
                    id="terms" 
                  /> 
                  <Label htmlFor="terms" className="text-xs cursor-pointer">
                    Accetto i Termini e Condizioni e l'Informativa sulla Privacy
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox 
                    checked={consents.personal} 
                    onCheckedChange={v => setConsents({...consents, personal: !!v})} 
                    id="personal" 
                  /> 
                  <Label htmlFor="personal" className="text-xs cursor-pointer">
                    Consento al trattamento dei miei dati personali
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox 
                    checked={consents.health} 
                    onCheckedChange={v => setConsents({...consents, health: !!v})} 
                    id="health" 
                  /> 
                  <Label htmlFor="health" className="text-xs cursor-pointer">
                    Consento al trattamento dei miei dati sanitari
                  </Label>
                </div>
              </div>
              <Button 
                type="submit" 
                className="w-full bg-primary hover:bg-primary/90" 
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Registrazione in corso...
                  </>
                ) : (
                  "Registrati"
                )}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="justify-center text-sm">
            <Link to="/login" className="text-primary hover:underline">
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
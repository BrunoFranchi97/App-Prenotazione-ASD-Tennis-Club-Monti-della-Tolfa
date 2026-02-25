"use client";

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';
import { MailCheck } from 'lucide-react';
import Footer from '@/components/Footer';

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [consents, setConsents] = useState({ terms: false, personal: false, health: false });

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consents.terms || !consents.personal || !consents.health) return showError("Accetta tutti i consensi.");
    if (password !== confirmPassword) return showError("Le password non corrispondono.");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: name, terms_accepted: true, personal_data_accepted: true, health_data_accepted: true } }
      });
      if (error) throw error;
      setIsRegistered(true);
    } catch (error: any) { showError(error.message); }
    finally { setLoading(false); }
  };

  if (isRegistered) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md text-center p-8">
        <MailCheck className="mx-auto h-16 w-16 text-primary mb-4" />
        <CardTitle>Verifica Email Inviata</CardTitle>
        <p className="mt-4 text-gray-600">Controlla la tua casella di posta per confermare l'account.</p>
        <Link to="/login"><Button className="w-full mt-6">Torna al Login</Button></Link>
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
                <Label>Nome Completo</Label>
                <Input maxLength={50} value={name} onChange={e => setName(e.target.value)} required placeholder="Mario Rossi" />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input maxLength={100} type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>Password</Label>
                <Input maxLength={100} type="password" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>Conferma Password</Label>
                <Input maxLength={100} type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
              </div>
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2"><Checkbox checked={consents.terms} onCheckedChange={v => setConsents({...consents, terms: !!v})} /> <Label className="text-xs">Accetto Termini e Privacy</Label></div>
                <div className="flex items-center gap-2"><Checkbox checked={consents.personal} onCheckedChange={v => setConsents({...consents, personal: !!v})} /> <Label className="text-xs">Consento trattamento dati personali</Label></div>
                <div className="flex items-center gap-2"><Checkbox checked={consents.health} onCheckedChange={v => setConsents({...consents, health: !!v})} /> <Label className="text-xs">Consento trattamento dati sanitari</Label></div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>Registrati</Button>
            </form>
          </CardContent>
          <CardFooter className="justify-center text-sm"><Link to="/login" className="text-primary hover:underline">Hai già un account? Accedi</Link></CardFooter>
        </Card>
      </div>
      <Footer />
    </div>
  );
};

export default Register;
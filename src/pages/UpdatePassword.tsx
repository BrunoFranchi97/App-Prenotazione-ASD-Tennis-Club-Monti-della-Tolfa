"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';

const UpdatePassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Verifica se l'utente è arrivato qui con un token di recupero valido
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showError("Sessione scaduta o non valida. Richiedi un nuovo link di reset.");
        navigate('/login');
      }
    };
    checkSession();
  }, [navigate]);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      showError("Le password non corrispondono.");
      return;
    }

    if (password.length < 6) {
      showError("La password deve essere di almeno 6 caratteri.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      showSuccess("Password aggiornata con successo! Ora puoi accedere.");
      await supabase.auth.signOut();
      navigate('/login');
    } catch (error: any) {
      showError(error.message || "Errore durante l'aggiornamento della password.");
    } finally {
      setLoading(false);
    }
  };

  return (
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
        <Card className="w-full max-w-md border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2rem] overflow-hidden bg-white/80 backdrop-blur-xl">
          <CardHeader className="text-center pt-10 pb-6">
            <div className="mx-auto w-20 h-20 mb-5 rounded-3xl overflow-hidden shadow-lg border-4 border-white">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
            </div>
            <CardTitle className="text-2xl font-extrabold text-gray-900 tracking-tight">
              <span className="text-primary">Nuova password</span>
            </CardTitle>
            <CardDescription className="text-gray-500 mt-2 text-sm">Imposta la tua nuova password di accesso</CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-10">
            <form onSubmit={handleUpdatePassword} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-semibold ml-1 text-gray-700">Nuova Password</Label>
                <Input
                  id="password"
                  name="password"
                  aria-label="Nuova Password"
                  type="password"
                  placeholder="Minimo 6 caratteri"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="rounded-xl border-gray-200 py-6 focus:ring-primary/20 focus:border-primary transition-all bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm font-semibold ml-1 text-gray-700">Conferma Password</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  aria-label="Conferma Password"
                  type="password"
                  placeholder="Ripeti la password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="rounded-xl border-gray-200 py-6 focus:ring-primary/20 focus:border-primary transition-all bg-white"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-14 bg-gradient-to-br from-primary to-[#23532f] hover:from-[#357a46] hover:to-[#23532f] text-white rounded-2xl text-base font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all hover:scale-[1.02] active:scale-[0.98] mt-2"
                disabled={loading}
              >
                {loading ? "Aggiornamento..." : "Salva Nuova Password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default UpdatePassword;
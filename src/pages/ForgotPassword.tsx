"use client";

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`, // Reindirizza a una pagina per aggiornare la password
      });

      if (error) {
        showError(error.message);
      } else {
        showSuccess("Link per il reset della password inviato! Controlla la tua email.");
      }
    } catch (error: any) {
      showError(error.message || "Errore durante la richiesta di reset password.");
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
              <span className="text-primary">Password dimenticata?</span>
            </CardTitle>
            <CardDescription className="text-gray-500 mt-2 text-sm">Inserisci la tua email per ricevere il link di reset</CardDescription>
          </CardHeader>
          <CardContent className="px-8 space-y-5 pb-6">
            <form onSubmit={handleResetPassword} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold ml-1 text-gray-700">Email</Label>
                <Input
                  id="email"
                  name="email"
                  aria-label="Email"
                  type="email"
                  placeholder="nome@esempio.it"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="rounded-xl border-gray-200 py-6 focus:ring-primary/20 focus:border-primary transition-all bg-white"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-14 bg-gradient-to-br from-primary to-[#23532f] hover:from-[#357a46] hover:to-[#23532f] text-white rounded-2xl text-base font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
                disabled={loading}
              >
                {loading ? "Invio in corso..." : "Invia Link di Reset"}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex justify-center pb-10 px-8">
            <Link to="/login" className="text-sm text-primary font-bold hover:underline">
              ← Torna al Login
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default ForgotPassword;
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white p-4">
      <Card className="w-full max-w-md shadow-lg rounded-lg">
        <CardHeader className="text-center">
          <img src="/logo.png" alt="ASD Tennis Club Monti della Tolfa Logo" className="mx-auto h-20 w-20 mb-4" />
          <CardTitle className="text-3xl font-bold text-primary">Password Dimenticata?</CardTitle>
          <CardDescription className="text-gray-600 mt-2">Inserisci la tua email per ricevere un link di reset.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="Inserisci la tua email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={loading}>
              {loading ? "Invio in corso..." : "Invia Link di Reset"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="text-sm text-center">
          <Link to="/login" className="text-primary hover:underline">Torna al Login</Link>
        </CardFooter>
      </Card>
    </div>
  );
};

export default ForgotPassword;
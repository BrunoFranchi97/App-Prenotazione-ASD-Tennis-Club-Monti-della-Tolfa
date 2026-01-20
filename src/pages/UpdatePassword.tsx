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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white p-4">
      <Card className="w-full max-w-md shadow-lg rounded-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-primary">Nuova Password</CardTitle>
          <CardDescription className="text-gray-600 mt-2">Imposta la tua nuova password di accesso.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Nuova Password</Label>
              <Input 
                id="password" 
                type="password" 
                placeholder="Minimo 6 caratteri" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Conferma Password</Label>
              <Input 
                id="confirm-password" 
                type="password" 
                placeholder="Ripeti la password" 
                value={confirmPassword} 
                onChange={(e) => setConfirmPassword(e.target.value)} 
                required 
              />
            </div>
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={loading}>
              {loading ? "Aggiornamento..." : "Aggiorna Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default UpdatePassword;
"use client";

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  // const [membershipNumber, setMembershipNumber] = useState(''); // Rimosso
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (password !== confirmPassword) {
      showError("Le password non corrispondono.");
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
            // membership_number: membershipNumber, // Rimosso
          },
        },
      });

      if (error) {
        showError(error.message);
      } else if (data.user) {
        showSuccess("Registrazione avvenuta con successo! Controlla la tua email per la verifica.");
        navigate('/login');
      }
    } catch (error: any) {
      showError(error.message || "Errore durante la registrazione.");
    } finally {
      setLoading(false);
    }
  };

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
            {/* Rimosso il campo Numero Tessera */}
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
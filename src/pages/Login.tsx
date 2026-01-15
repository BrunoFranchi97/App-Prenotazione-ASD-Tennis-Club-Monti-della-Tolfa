"use client";

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import Footer from '@/components/Footer';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        showError(error.message);
      } else {
        showSuccess("Accesso effettuato con successo!");
        navigate('/dashboard'); // Reindirizza alla dashboard dopo il login
      }
    } catch (error: any) {
      showError(error.message || "Errore durante l'accesso.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-green-50 to-white">
      {/* Institutional Logos at top corners */}
      <div className="container mx-auto px-4 py-4 flex justify-between items-start">
        <div className="relative h-10 flex items-center justify-start">
          <img 
            src="/assets/coni.jpeg" 
            alt="Logo CONI" 
            className="h-10 w-auto object-contain mix-blend-darken filter brightness-110 contrast-125"
            style={{ 
              backgroundColor: 'transparent',
              isolation: 'isolate'
            }}
          />
        </div>
        <div className="relative h-10 flex items-center justify-end">
          <img 
            src="/assets/fitp.jpeg" 
            alt="Logo FITP" 
            className="h-10 w-auto object-contain mix-blend-darken filter brightness-110 contrast-125"
            style={{ 
              backgroundColor: 'transparent',
              isolation: 'isolate'
            }}
          />
        </div>
      </div>

      {/* Login Form */}
      <div className="flex-grow flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg rounded-lg">
          <CardHeader className="text-center">
            <img src="/logo.png" alt="ASD Tennis Club Monti della Tolfa Logo" className="mx-auto h-24 w-24 mb-4" />
            <CardTitle className="text-3xl font-bold text-primary">ASD Tennis Club Monti della Tolfa</CardTitle>
            <CardDescription className="text-gray-600 mt-2">Accedi al tuo account per prenotare un campo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="Inserisci la tua email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" placeholder="Inserisci password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={loading}>
                {loading ? "Accesso in corso..." : "Accedi"}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex flex-col gap-2 text-sm text-center">
            <Link to="/register" className="text-primary hover:underline">Non hai un account? Registrati</Link>
            <Link to="/forgot-password" className="text-gray-500 hover:underline">Password dimenticata?</Link>
          </CardFooter>
        </Card>
      </div>
      <Footer />
    </div>
  );
};

export default Login;
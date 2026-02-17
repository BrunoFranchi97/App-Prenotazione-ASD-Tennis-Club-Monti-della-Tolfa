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
        navigate('/dashboard');
      }
    } catch (error: any) {
      showError(error.message || "Errore durante l'accesso.");
    } finally {
      setLoading(false);
    }
  };

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

      {/* Login Form */}
      <div className="flex-grow flex items-center justify-center p-6">
        <Card className="w-full max-w-md border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[2rem] overflow-hidden bg-white/80 backdrop-blur-xl">
          <CardHeader className="text-center pt-10 pb-6">
            <div className="mx-auto w-24 h-24 mb-6 rounded-3xl overflow-hidden shadow-lg border-4 border-white">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
            </div>
            <CardTitle className="text-3xl font-extrabold text-gray-900 tracking-tight flex flex-col">
              <span className="text-primary">ASD Tennis Club</span>
              <span className="text-gray-500 text-2xl font-semibold">Monti della Tolfa</span>
            </CardTitle>
            <CardDescription className="text-gray-500 mt-3 text-base">Inserisci le tue credenziali per accedere</CardDescription>
          </CardHeader>
          <CardContent className="px-8 space-y-6">
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold ml-1 text-gray-700">Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="nome@esempio.it" 
                  className="rounded-xl border-gray-200 py-6 focus:ring-primary/20 focus:border-primary transition-all bg-white"
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  required 
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center ml-1">
                  <Label htmlFor="password" className="text-sm font-semibold text-gray-700">Password</Label>
                </div>
                <Input 
                  id="password" 
                  type="password" 
                  placeholder="••••••••" 
                  className="rounded-xl border-gray-200 py-6 focus:ring-primary/20 focus:border-primary transition-all bg-white"
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  required 
                />
              </div>
              <Button 
                type="submit" 
                className="w-full h-14 bg-gradient-to-br from-primary to-[#23532f] hover:from-[#357a46] hover:to-[#23532f] text-white rounded-2xl text-lg font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all hover:scale-[1.02] active:scale-[0.98]" 
                disabled={loading}
              >
                {loading ? "Accesso..." : "Accedi al Club"}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 pb-10 px-8">
            <div className="w-full h-px bg-gray-100 my-2"></div>
            <div className="flex flex-col gap-3 text-sm text-center">
              <Link to="/register" className="text-primary font-bold hover:underline">Nuovo socio? Registrati qui</Link>
              <Link to="/forgot-password" shaking-text="true" className="text-gray-400 hover:text-gray-600 transition-colors">Hai dimenticato la password?</Link>
            </div>
          </CardFooter>
        </Card>
      </div>
      <Footer />
    </div>
  );
};

export default Login;
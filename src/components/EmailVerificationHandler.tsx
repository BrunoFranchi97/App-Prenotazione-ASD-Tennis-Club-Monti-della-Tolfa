"use client";

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

const EmailVerificationHandler = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const handleEmailVerification = async () => {
      const token = searchParams.get('token');
      const type = searchParams.get('type');

      console.log('Email verification params:', { token, type, allParams: Object.fromEntries(searchParams.entries()) });

      // Se non ci sono parametri, esci
      if (!token || type !== 'email') {
        setLoading(false);
        navigate('/dashboard');
        return;
      }

      try {
        console.log('Attempting email verification with token...');
        
        // Il token dovrebbe essere gestito automaticamente da Supabase quando la pagina viene caricata
        // Controlla se c'è già una sessione attiva
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('Session error:', sessionError);
          setError('Errore nella verifica della sessione');
          return;
        }

        if (session) {
          console.log('User already has session, email verified successfully');
          setSuccess(true);
          showSuccess('Email verificata con successo!');
          
          // Reindirizza alla dashboard dopo breve attesa
          setTimeout(() => {
            navigate('/dashboard');
          }, 2000);
        } else {
          // Prova a fare l'accesso con il token
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: token,
            type: 'email',
          });

          if (verifyError) {
            console.error('Verification error:', verifyError);
            setError(`Errore nella verifica: ${verifyError.message}`);
          } else {
            console.log('Email verification successful');
            setSuccess(true);
            showSuccess('Email verificata con successo!');
            
            // Reindirizza alla dashboard dopo breve attesa
            setTimeout(() => {
              navigate('/dashboard');
            }, 2000);
          }
        }
      } catch (err: any) {
        console.error('Unexpected error during email verification:', err);
        setError(`Errore imprevisto: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    handleEmailVerification();
  }, [searchParams, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white p-4">
        <Card className="w-full max-w-md shadow-lg rounded-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-primary">Verifica Email in corso...</CardTitle>
            <CardDescription>Stiamo completando la verifica del tuo account</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center space-y-4">
            <Loader2 className="h-12 w-12 text-primary animate-spin" />
            <p className="text-sm text-gray-600 text-center">
              Attendere prego...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white p-4">
        <Card className="w-full max-w-md shadow-lg rounded-lg">
          <CardHeader className="text-center">
            <XCircle className="mx-auto h-16 w-16 text-red-500 mb-4" />
            <CardTitle className="text-red-600">Verifica Fallita</CardTitle>
            <CardDescription>Non è stato possibile verificare il tuo account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-700 text-center">{error}</p>
            <p className="text-sm text-gray-600 text-center">
              Il link di verifica potrebbe essere scaduto o non valido.
            </p>
            <div className="pt-4">
              <Button 
                onClick={() => navigate('/login')} 
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                Vai al Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white p-4">
        <Card className="w-full max-w-md shadow-lg rounded-lg">
          <CardHeader className="text-center">
            <CheckCircle className="mx-auto h-16 w-16 text-green-500 mb-4" />
            <CardTitle className="text-green-600">Email Verificata!</CardTitle>
            <CardDescription>Il tuo account è stato verificato con successo</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-700 text-center">
              Il tuo indirizzo email è stato verificato. Stai per essere reindirizzato...
            </p>
            <p className="text-sm text-gray-600 text-center">
              Ricorda che il tuo account dovrà essere approvato da un amministratore prima di poter prenotare.
            </p>
            <div className="pt-4">
              <Button 
                onClick={() => navigate('/dashboard')} 
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                Vai alla Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
};

export default EmailVerificationHandler;
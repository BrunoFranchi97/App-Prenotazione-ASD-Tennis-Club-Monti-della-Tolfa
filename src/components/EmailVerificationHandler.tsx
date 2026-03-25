"use client";

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { Card, CardContent } from "@/components/ui/card";
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

  const PageShell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
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
          {children}
        </Card>
      </div>
    </div>
  );

  if (loading) {
    return (
      <PageShell>
        <CardContent className="pt-12 pb-10 px-8 flex flex-col items-center gap-6 text-center">
          <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center shadow-inner">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-extrabold text-gray-900">Verifica in corso…</h2>
            <p className="text-gray-500 text-sm">Stiamo completando la verifica del tuo account</p>
          </div>
        </CardContent>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <CardContent className="pt-12 pb-10 px-8 flex flex-col items-center gap-6 text-center">
          <div className="w-20 h-20 rounded-3xl bg-red-50 flex items-center justify-center shadow-inner">
            <XCircle className="h-10 w-10 text-red-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-extrabold text-gray-900">Verifica fallita</h2>
            <p className="text-gray-500 text-sm leading-relaxed">
              Il link potrebbe essere scaduto o già utilizzato.
            </p>
          </div>
          <div className="w-full bg-red-50 rounded-2xl px-5 py-4">
            <p className="text-sm text-red-600 font-medium">{error}</p>
          </div>
          <div className="w-full space-y-3 pt-1">
            <Button
              onClick={() => navigate('/register')}
              className="w-full h-13 bg-gradient-to-br from-primary to-[#23532f] hover:from-[#357a46] hover:to-[#23532f] text-white rounded-2xl text-base font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              Torna alla Registrazione
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate('/login')}
              className="w-full rounded-2xl text-gray-400 hover:text-primary font-medium"
            >
              Vai al Login
            </Button>
          </div>
        </CardContent>
      </PageShell>
    );
  }

  if (success) {
    return (
      <PageShell>
        <CardContent className="pt-12 pb-10 px-8 flex flex-col items-center gap-6 text-center">
          <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center shadow-inner">
            <CheckCircle className="h-10 w-10 text-primary" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-extrabold text-gray-900">Email verificata!</h2>
            <p className="text-gray-500 text-sm leading-relaxed">
              Il tuo account è stato confermato con successo.
            </p>
          </div>
          <div className="w-full bg-gray-50 rounded-2xl p-5 text-left space-y-1">
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Prossimo step</p>
            <p className="text-sm text-gray-600 leading-relaxed">
              Un amministratore del circolo dovrà approvare il tuo account prima che tu possa prenotare i campi. Riceverai una notifica via email.
            </p>
          </div>
          <Button
            onClick={() => navigate('/dashboard')}
            className="w-full h-13 bg-gradient-to-br from-primary to-[#23532f] hover:from-[#357a46] hover:to-[#23532f] text-white rounded-2xl text-base font-bold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            Entra nell'App
          </Button>
        </CardContent>
      </PageShell>
    );
  }

  return null;
};

export default EmailVerificationHandler;
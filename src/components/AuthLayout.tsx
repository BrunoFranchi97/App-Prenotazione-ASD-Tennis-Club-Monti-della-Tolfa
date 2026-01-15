"use client";

import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Session } from '@supabase/supabase-js';
import { showError } from '@/utils/toast';

interface AuthLayoutProps {
  children: React.ReactNode;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Gestisce i parametri di conferma email da Supabase
  useEffect(() => {
    const hash = window.location.hash;
    
    // Se c'è un hash con access_token, refresh_token, etc., significa che è un redirect di conferma email
    if (hash && hash.includes('access_token') && hash.includes('type=email')) {
      console.log('Email confirmation redirect detected');
      // Supabase gestirà automaticamente il token e aggiornerà la sessione
      // Dopo la conferma, reindirizziamo alla dashboard
      setTimeout(() => {
        navigate('/dashboard');
      }, 1000);
    }
  }, [navigate]);

  const ensureProfileExists = async (userId: string, userEmail: string | undefined, rawMetaData: any) => {
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('is_admin, approved')
      .eq('id', userId)
      .single();

    if (fetchError && fetchError.code === 'PGRST116') {
      console.warn("Profile missing for user, attempting manual creation.");
      
      const fullName = rawMetaData?.full_name || userEmail || 'Socio';

      const { error: insertError } = await supabase
        .from('profiles')
        .insert({ 
          id: userId, 
          full_name: fullName,
        });

      if (insertError) {
        showError("Errore critico: Impossibile creare il profilo utente. Contatta l'amministratore.");
        console.error("Manual profile creation failed:", insertError);
        await supabase.auth.signOut();
        navigate('/login');
        return null;
      }
      
      return { is_admin: false, approved: false };
    } else if (fetchError) {
      console.error("Error fetching profile:", fetchError);
      showError("Errore nel recupero del profilo utente.");
      return null;
    }
    
    return profile;
  };

  const checkAuthAndRedirect = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    setSession(session);

    const publicRoutes = ['/login', '/register', '/forgot-password'];
    const isPublicAuthRoute = publicRoutes.includes(location.pathname);
    const isAdminRoute = location.pathname.startsWith('/admin');

    if (session) {
      const user = session.user;
      
      const profile = await ensureProfileExists(user.id, user.email, user.user_metadata);
      
      if (!profile) {
        setLoading(false);
        return;
      }
      
      const isAdmin = profile.is_admin || false;

      if (location.pathname === '/') {
        navigate('/dashboard');
      } else if (!isAdmin && isAdminRoute) {
        navigate('/dashboard');
      } else if (isPublicAuthRoute) {
        navigate('/dashboard');
      }
    } else {
      if (location.pathname === '/') {
        navigate('/login');
      } else if (!isPublicAuthRoute && !isAdminRoute) {
        navigate('/login');
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    checkAuthAndRedirect();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      checkAuthAndRedirect();
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [navigate, location.pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Caricamento...</h1>
          <p className="text-xl text-gray-600">Verifica stato autenticazione.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default AuthLayout;
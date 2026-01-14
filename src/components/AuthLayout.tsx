"use client";

import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Session } from '@supabase/supabase-js';

interface AuthLayoutProps {
  children: React.ReactNode;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setLoading(false);
    };

    getSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!loading) {
      const publicRoutes = ['/login', '/register', '/forgot-password'];
      const isPublicRoute = publicRoutes.includes(location.pathname);

      if (session && isPublicRoute) {
        // Se l'utente è autenticato e tenta di accedere a una rotta pubblica, reindirizza alla dashboard
        navigate('/dashboard');
      } else if (!session && !isPublicRoute) {
        // Se l'utente non è autenticato e tenta di accedere a una rotta protetta, reindirizza al login
        navigate('/login');
      }
    }
  }, [session, loading, navigate, location.pathname]);

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
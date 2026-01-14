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
    const getSessionAndProfile = async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);

      if (session) {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', session.user.id)
          .single();

        const isAdmin = profile?.is_admin || false;
        const publicRoutes = ['/login', '/register', '/forgot-password'];
        const isPublicRoute = publicRoutes.includes(location.pathname);
        const isAdminRoute = location.pathname.startsWith('/admin');

        // Se l'utente NON è admin ma tenta di accedere a una rotta admin, reindirizza alla dashboard socio
        if (!isAdmin && isAdminRoute) {
          navigate('/dashboard');
        } 
        // Se l'utente è autenticato (sia admin che non admin) e tenta di accedere a una rotta pubblica, reindirizza alla dashboard socio
        else if (session && isPublicRoute) {
          navigate('/dashboard');
        } 
        // Se l'utente non è autenticato e tenta di accedere a una rotta protetta, reindirizza al login
        else if (!session && !isPublicRoute) {
          navigate('/login');
        }
        // Altrimenti, l'utente è autenticato e sulla rotta corretta (admin su admin, o qualsiasi utente su non-admin/non-pubblica)
        // Non facciamo nulla, lasciamo che il children venga renderizzato.
      } else {
        // Utente non autenticato
        const publicRoutes = ['/login', '/register', '/forgot-password', '/'];
        const isPublicRoute = publicRoutes.includes(location.pathname);
        if (!isPublicRoute) {
          navigate('/login');
        }
      }
      setLoading(false);
    };

    getSessionAndProfile();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      // Rilancia la logica di reindirizzamento al cambio di stato dell'autenticazione
      getSessionAndProfile(); 
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
"use client";

import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Session } from '@supabase/supabase-js';
import { showError } from '@/utils/toast'; // Import showError

interface AuthLayoutProps {
  children: React.ReactNode;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  const ensureProfileExists = async (userId: string, userEmail: string | undefined, rawMetaData: any) => {
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('is_admin, approved')
      .eq('id', userId)
      .single();

    if (fetchError && fetchError.code === 'PGRST116') { // Profile not found (No rows returned)
      console.warn("Profile missing for user, attempting manual creation.");
      
      const fullName = rawMetaData?.full_name || userEmail || 'Socio';

      const { error: insertError } = await supabase
        .from('profiles')
        .insert({ 
          id: userId, 
          full_name: fullName,
          // Altre colonne useranno i default del DB
        });

      if (insertError) {
        showError("Errore critico: Impossibile creare il profilo utente. Contatta l'amministratore.");
        console.error("Manual profile creation failed:", insertError);
        // Se fallisce la creazione manuale, disconnettiamo l'utente per evitare loop
        await supabase.auth.signOut();
        navigate('/login');
        return null;
      }
      
      // Profile created successfully, return default profile structure
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
      // L'utente è autenticato
      const user = session.user;
      
      // 1. Assicurati che il profilo esista (gestisce i vecchi bug del trigger)
      const profile = await ensureProfileExists(user.id, user.email, user.user_metadata);
      
      if (!profile) {
        // ensureProfileExists ha fallito e ha già gestito il reindirizzamento/logout
        setLoading(false);
        return;
      }
      
      const isAdmin = profile.is_admin || false;

      if (location.pathname === '/') {
        // Utenti autenticati che atterrano sulla root vanno alla dashboard socio
        navigate('/dashboard');
      } else if (!isAdmin && isAdminRoute) {
        // Utente non admin che tenta di accedere a una rotta admin
        navigate('/dashboard');
      } else if (isPublicAuthRoute) {
        // Utente autenticato su una rotta di autenticazione pubblica (login, register, forgot-password)
        navigate('/dashboard');
      }
      // Altrimenti, l'utente autenticato è su una rotta protetta valida o una rotta admin (se admin), renderizza i children
    } else {
      // L'utente NON è autenticato
      if (location.pathname === '/') {
        // Utenti non autenticati che atterrano sulla root vanno al login
        navigate('/login');
      } else if (!isPublicAuthRoute && !isAdminRoute) { // Se non è una rotta pubblica di auth e non è una rotta admin
        // Utente non autenticato su una rotta protetta
        navigate('/login');
      }
      // Altrimenti, l'utente non autenticato è su una rotta di autenticazione pubblica valida, renderizza i children
    }
    setLoading(false);
  };

  useEffect(() => {
    checkAuthAndRedirect();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      // Rilancia la logica di controllo e reindirizzamento al cambio di stato dell'autenticazione
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
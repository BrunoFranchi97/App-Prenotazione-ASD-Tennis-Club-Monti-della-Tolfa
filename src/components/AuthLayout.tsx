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

  useEffect(() => {
    const token = searchParams.get('token');
    const type = searchParams.get('type');
    
    if (token && type && location.pathname === '/dashboard' && type === 'email') {
      navigate(`/auth/verify?token=${token}&type=${type}`);
    }
  }, [searchParams, location, navigate]);

  const ensureProfileExists = async (userId: string, userEmail: string | undefined, rawMetaData: any) => {
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('is_admin, status, approved')
      .eq('id', userId)
      .single();

    if (fetchError && fetchError.code === 'PGRST116') {
      const fullName = rawMetaData?.full_name || userEmail || 'Socio';
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({ 
          id: userId, 
          full_name: fullName,
          status: 'pending'
        });

      if (insertError) {
        showError("Errore critico: Impossibile creare il profilo utente.");
        await supabase.auth.signOut();
        navigate('/login');
        return null;
      }
      return { is_admin: false, status: 'pending', approved: false };
    }
    
    return profile;
  };

  const checkAuthAndRedirect = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    setSession(session);

    const publicRoutes = ['/login', '/register', '/forgot-password', '/auth/verify'];
    const isPublicAuthRoute = publicRoutes.includes(location.pathname);
    const isAdminRoute = location.pathname.startsWith('/admin');

    if (session) {
      const profile = await ensureProfileExists(session.user.id, session.user.email, session.user.user_metadata);
      if (!profile) {
        setLoading(false);
        return;
      }
      
      const isAdmin = profile.is_admin || false;
      const status = profile.status || (profile.approved ? 'approved' : 'pending');

      // Se l'utente non è approvato o è rifiutato, può stare solo in dashboard o profilo
      if (status !== 'approved' && !isAdmin) {
        const allowedNonApprovedRoutes = ['/dashboard', '/profile', '/medical-certificates'];
        if (!allowedNonApprovedRoutes.includes(location.pathname)) {
          navigate('/dashboard');
        }
      }

      if (location.pathname === '/') {
        navigate('/dashboard');
      } else if (!isAdmin && isAdminRoute) {
        navigate('/dashboard');
      } else if (isPublicAuthRoute && !location.pathname.includes('/auth/verify')) {
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
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      checkAuthAndRedirect();
    });
    return () => authListener.subscription.unsubscribe();
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
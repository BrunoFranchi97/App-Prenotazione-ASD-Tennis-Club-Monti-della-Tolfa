"use client";

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';

/**
 * Hook per verificare se l'utente è approvato.
 * Se non è approvato, mostra un errore e reindirizza alla dashboard.
 * @returns {boolean} True se l'utente è approvato o se lo stato è ancora in caricamento.
 */
export function useApprovalCheck() {
  const navigate = useNavigate();
  const [isApproved, setIsApproved] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkApproval = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        // L'AuthLayout dovrebbe già gestire il reindirizzamento al login, ma per sicurezza
        navigate('/login');
        return;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('approved')
        .eq('id', user.id)
        .single();

      if (error || !profile) {
        console.error("Error fetching approval status:", error?.message);
        // Se c'è un errore o il profilo non esiste, assumiamo non approvato o errore grave
        setIsApproved(false);
        showError("Impossibile verificare lo stato di approvazione. Riprova.");
        navigate('/dashboard');
        return;
      }

      if (!profile.approved) {
        setIsApproved(false);
        showError("Il tuo account non è ancora stato approvato dall'amministratore.");
        navigate('/dashboard');
      } else {
        setIsApproved(true);
      }
      setLoading(false);
    };

    checkApproval();
  }, [navigate]);

  return { isApproved, loading };
}
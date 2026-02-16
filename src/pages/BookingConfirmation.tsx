"use client";

import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BookingSuccessDialog from '@/components/BookingSuccessDialog';
import { Reservation } from '@/types/supabase';

interface BookingConfirmationState {
  reservations?: Reservation[];
  courtName?: string;
  bookedFor?: string;
}

const BookingConfirmation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as BookingConfirmationState;
  
  const [showPopup, setShowPopup] = useState(false);

  useEffect(() => {
    if (!state || !state.reservations || state.reservations.length === 0) {
      navigate('/dashboard');
      return;
    }

    // Forza l'apertura del pop-up al caricamento
    setShowPopup(true);
  }, [state, navigate]);

  if (!state || !state.reservations) return null;

  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      {/* Sfondo bianco assoluto. Il pop-up si apre sopra tramite lo stato showPopup */}
      <BookingSuccessDialog 
        open={showPopup} 
        onOpenChange={setShowPopup} 
        reservations={state.reservations} 
        courtName={state.courtName || 'Campo'} 
        bookedFor={state.bookedFor}
      />
    </div>
  );
};

export default BookingConfirmation;
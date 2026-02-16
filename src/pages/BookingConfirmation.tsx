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
    // Se non ci sono dati, torniamo alla dashboard per sicurezza
    if (!state || !state.reservations || state.reservations.length === 0) {
      navigate('/dashboard');
      return;
    }

    // Apriamo il pop-up appena la pagina bianca viene caricata
    setShowPopup(true);
  }, [state, navigate]);

  if (!state || !state.reservations) return null;

  return (
    <div className="min-h-screen bg-white">
      {/* Pagina interamente bianca sotto il pop-up */}
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
"use client";

import React from 'react';

const Index = () => {
  // AuthLayout gestirà il reindirizzamento in base allo stato di autenticazione
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Benvenuto!</h1>
        <p className="text-xl text-gray-600">Caricamento dell'applicazione...</p>
      </div>
    </div>
  );
};

export default Index;
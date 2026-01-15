"use client";

import React from 'react';
import { MadeWithDyad } from './made-with-dyad';

const Footer = () => {
  const clubDetails = {
    name: "ASD Tennis Club Monti della Tolfa",
    address: "Via Braccianese Claudia, snc",
    location: "Località Canepacce - 00059 TOLFA",
    cf: "C.F. 91004980586",
    email: "tennisclubmontidellatolfa@gmail.com",
  };

  return (
    <footer className="bg-gray-50 border-t border-gray-200 mt-12 pt-8 pb-4 dark:bg-gray-900 dark:border-gray-800">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Club Details - Simplified without logos */}
        <div className="text-center text-sm text-gray-600 dark:text-gray-400 space-y-1 mb-6">
          <p className="font-bold text-lg text-primary dark:text-primary-foreground">{clubDetails.name}</p>
          <p>{clubDetails.address}</p>
          <p>{clubDetails.location}</p>
          <p>{clubDetails.cf}</p>
          <p>Email: <a href={`mailto:${clubDetails.email}`} className="hover:underline text-club-orange">{clubDetails.email}</a></p>
        </div>

        {/* Dyad Credit */}
        <MadeWithDyad />
      </div>
    </footer>
  );
};

export default Footer;
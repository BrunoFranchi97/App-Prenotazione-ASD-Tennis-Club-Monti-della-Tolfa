"use client";

import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { CalendarDays, History, LogOut } from 'lucide-react';

const MemberDashboard = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-primary">Benvenuto, Socio!</h1>
        <Button variant="outline" className="text-primary border-primary hover:bg-secondary">
          <LogOut className="mr-2 h-4 w-4" /> Esci
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-primary flex items-center">
              <CalendarDays className="mr-2 h-5 w-5" /> Prenota un Campo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 mb-4">Scegli la data e l'orario per la tua prossima partita.</p>
            <Link to="/book">
              <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">Vai al Calendario</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-primary flex items-center">
              <History className="mr-2 h-5 w-5" /> Storico Prenotazioni
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 mb-4">Visualizza le tue prenotazioni passate e future.</p>
            <Link to="/history">
              <Button variant="outline" className="w-full text-primary border-primary hover:bg-secondary">Vedi Storico</Button>
            </Link>
          </CardContent>
        </Card>

        {/* Placeholder per altre card, es. Profilo, Notifiche */}
      </div>
    </div>
  );
};

export default MemberDashboard;
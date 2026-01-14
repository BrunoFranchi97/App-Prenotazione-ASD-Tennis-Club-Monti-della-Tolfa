"use client";

import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { CalendarPlus, Lock, BarChart2, LogOut } from 'lucide-react';

const AdminDashboard = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-primary">Pannello Amministrativo</h1>
        <Button variant="outline" className="text-primary border-primary hover:bg-secondary">
          <LogOut className="mr-2 h-4 w-4" /> Esci
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-primary flex items-center">
              <CalendarPlus className="mr-2 h-5 w-5" /> Gestisci Orari
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 mb-4">Aggiungi o modifica gli orari disponibili per i campi.</p>
            <Link to="/admin/manage-schedules">
              <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">Gestisci</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-primary flex items-center">
              <Lock className="mr-2 h-5 w-5" /> Blocca Slot
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 mb-4">Blocca fasce orarie per manutenzione o tornei.</p>
            <Link to="/admin/block-slots">
              <Button variant="outline" className="w-full text-primary border-primary hover:bg-secondary">Blocca</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-primary flex items-center">
              <BarChart2 className="mr-2 h-5 w-5" /> Statistiche Utilizzo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 mb-4">Visualizza le statistiche di utilizzo per ciascun campo.</p>
            <Link to="/admin/usage-stats">
              <Button variant="outline" className="w-full text-primary border-primary hover:bg-secondary">Vedi Statistiche</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;
"use client";

import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO, isAfter, startOfDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, FileText, Plus, AlertTriangle, Clock, Download, Upload, X, File } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import type { MedicalCertificate, CertificateType } from '@/types/supabase';

const MedicalCertificates = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [certificates, setCertificates] = useState<MedicalCertificate[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [certificateType, setCertificateType] = useState<CertificateType>("agonistico");
  const [notes, setNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fetchCertificates = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('medical_certificates').select('*').eq('user_id', user.id).order('expiry_date', { ascending: false });
      setCertificates(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchCertificates(); }, []);

  const handleSave = async () => {
    if (!issueDate || !expiryDate) return showError("Compila le date.");
    if (isAfter(parseISO(issueDate), startOfDay(new Date()))) return showError("La data di rilascio non può essere nel futuro.");
    if (isAfter(parseISO(issueDate), parseISO(expiryDate))) return showError("La data di scadenza deve essere dopo quella di rilascio.");
    if (!selectedFile) return showError("Carica il file.");

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${user?.id}/${Date.now()}.${fileExt}`;
      const { error: upErr } = await supabase.storage.from('medical-certificates').upload(fileName, selectedFile);
      if (upErr) throw upErr;

      const { error } = await supabase.from('medical_certificates').insert({
        user_id: user?.id,
        issue_date: issueDate,
        expiry_date: expiryDate,
        certificate_type: certificateType,
        notes: notes.trim().substring(0, 500),
        file_url: fileName
      });
      if (error) throw error;
      showSuccess("Certificato salvato!");
      setDialogOpen(false);
      fetchCertificates();
    } catch (err: any) {
      showError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Caricamento...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-8">
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center">
          <Link to="/dashboard" className="mr-4"><Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <h1 className="text-3xl font-bold text-primary">Certificato Medico</h1>
        </div>
        <Button onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4"/> Aggiungi</Button>
      </header>

      <div className="grid gap-6">
        {certificates.map(c => (
          <Card key={c.id}><CardContent className="p-4 flex justify-between items-center">
            <div>
              <p className="font-bold capitalize">{c.certificate_type.replace('_', ' ')}</p>
              <p className="text-sm text-gray-500">Scadenza: {format(parseISO(c.expiry_date), 'dd/MM/yyyy')}</p>
              {c.notes && <p className="text-xs italic mt-1">"{c.notes}"</p>}
            </div>
            <Badge variant={isAfter(parseISO(c.expiry_date), new Date()) ? "default" : "destructive"}>
              {isAfter(parseISO(c.expiry_date), new Date()) ? "Valido" : "Scaduto"}
            </Badge>
          </CardContent></Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Carica Certificato</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Data Rilascio</Label><Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} max={new Date().toISOString().split('T')[0]} /></div>
            <div><Label>Data Scadenza</Label><Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} /></div>
            <div><Label>File (PDF/JPG)</Label><Input type="file" onChange={e => setSelectedFile(e.target.files?.[0] || null)} /></div>
            <div>
              <Label className="flex justify-between">Note <span>{notes.length}/500</span></Label>
              <Textarea maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Dettagli..." />
            </div>
          </div>
          <DialogFooter><Button onClick={handleSave} disabled={saving}>{saving ? "Salvataggio..." : "Salva"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MedicalCertificates;
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ArrowLeft, FileText, Plus, AlertTriangle, Clock, Download, Upload, X, File, Calendar, ShieldCheck, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import UserNav from '@/components/UserNav';
import type { MedicalCertificate, CertificateType } from '@/types/supabase';

const MedicalCertificates = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [certificates, setCertificates] = useState<MedicalCertificate[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [certificateType, setCertificateType] = useState<CertificateType>("agonistico");
  const [notes, setNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fetchCertificates = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('medical_certificates').select('*').eq('user_id', user.id).order('expiry_date', { ascending: false });
        setCertificates(data || []);
      }
    } catch (err: any) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCertificates(); }, []);

  const handleSave = async () => {
    if (!issueDate || !expiryDate) return showError("Compila le date di rilascio e scadenza.");
    if (isAfter(parseISO(issueDate), startOfDay(new Date()))) return showError("La data di rilascio non può essere nel futuro.");
    if (isAfter(parseISO(issueDate), parseISO(expiryDate))) return showError("La data di scadenza deve essere successiva a quella di rilascio.");
    if (!selectedFile) return showError("Devi caricare il file del certificato.");

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
      
      showSuccess("Certificato medico caricato con successo!");
      setDialogOpen(false);
      resetForm();
      fetchCertificates();
    } catch (err: any) {
      showError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async (certificate: MedicalCertificate) => {
    if (!certificate.file_url) {
      showError("File non trovato.");
      return;
    }

    setDownloadingId(certificate.id);
    try {
      const { data, error } = await supabase.storage
        .from('medical-certificates')
        .createSignedUrl(certificate.file_url, 60); // URL valido per 60 secondi

      if (error) throw error;

      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (err: any) {
      showError("Impossibile aprire il documento: " + err.message);
    } finally {
      setDownloadingId(null);
    }
  };

  const resetForm = () => {
    setIssueDate("");
    setExpiryDate("");
    setCertificateType("agonistico");
    setNotes("");
    setSelectedFile(null);
  };

  if (loading) return <div className="p-8 text-center">Caricamento...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center">
          <Link to="/dashboard" className="mr-4">
            <Button variant="outline" size="icon" className="text-primary border-primary hover:bg-secondary">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-primary flex items-center">
            <FileText className="mr-2 h-7 w-7" /> Certificato Medico
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            className="bg-primary hover:bg-primary/90" 
            onClick={() => {
              resetForm();
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4"/> Aggiungi Nuovo
          </Button>
          <UserNav />
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {certificates.length === 0 ? (
          <Card className="col-span-full py-12 text-center text-muted-foreground shadow-lg">
            <ShieldCheck className="mx-auto h-12 w-12 mb-4 opacity-20" />
            <p>Nessun certificato caricato. Carica il tuo certificato per poter giocare.</p>
          </Card>
        ) : (
          certificates.map(c => {
            const isValid = isAfter(parseISO(c.expiry_date), startOfDay(new Date()));
            const isDownloading = downloadingId === c.id;

            return (
              <Card key={c.id} className={`shadow-lg border-t-4 ${isValid ? 'border-t-primary' : 'border-t-destructive'}`}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <Badge variant={isValid ? "default" : "destructive"} className="uppercase text-[10px]">
                      {isValid ? "Valido" : "Scaduto"}
                    </Badge>
                    <Badge variant="outline" className="capitalize">
                      {c.certificate_type.replace('_', ' ')}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg mt-2 flex items-center">
                    <Calendar className="mr-2 h-4 w-4 text-club-orange" /> 
                    Scade il {format(parseISO(c.expiry_date), 'dd/MM/yyyy')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-sm text-gray-600">
                    <p><span className="font-semibold">Rilasciato il:</span> {format(parseISO(c.issue_date), 'dd/MM/yyyy')}</p>
                    {c.notes && <p className="mt-2 italic text-xs">"{c.notes}"</p>}
                  </div>
                  <div className="pt-2 border-t">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="w-full text-primary hover:text-primary hover:bg-secondary"
                      onClick={() => handleDownload(c)}
                      disabled={isDownloading}
                    >
                      {isDownloading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="mr-2 h-4 w-4" />
                      )}
                      {isDownloading ? "Apertura..." : "Vedi Documento"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-primary flex items-center">
              <Upload className="mr-2 h-5 w-5" /> Carica Certificato
            </DialogTitle>
            <DialogDescription>
              Inserisci i dati del tuo certificato e carica una scansione leggibile.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data Rilascio</Label>
                <Input 
                  type="date" 
                  value={issueDate} 
                  onChange={e => setIssueDate(e.target.value)} 
                  max={new Date().toISOString().split('T')[0]} 
                />
              </div>
              <div className="space-y-2">
                <Label>Data Scadenza</Label>
                <Input 
                  type="date" 
                  value={expiryDate} 
                  onChange={e => setExpiryDate(e.target.value)} 
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tipo Certificato</Label>
              <Select value={certificateType} onValueChange={v => setCertificateType(v as CertificateType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="agonistico">Agonistico</SelectItem>
                  <SelectItem value="non_agonistico">Non Agonistico</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>File Certificato (PDF o Immagine)</Label>
              <div 
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${selectedFile ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-primary/50'}`}
                onClick={() => fileInputRef.current?.click()}
              >
                {selectedFile ? (
                  <div className="flex flex-col items-center">
                    <File className="h-8 w-8 text-primary mb-2" />
                    <span className="text-sm font-medium truncate max-w-xs">{selectedFile.name}</span>
                    <Button variant="ghost" size="sm" className="mt-2 text-destructive" onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}>Rimuovi</Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <Upload className="h-8 w-8 text-gray-400 mb-2" />
                    <span className="text-sm text-gray-500">Trascina o clicca per caricare</span>
                  </div>
                )}
                <input 
                  ref={fileInputRef}
                  type="file" 
                  className="hidden" 
                  accept=".pdf,image/*" 
                  onChange={e => setSelectedFile(e.target.files?.[0] || null)} 
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex justify-between">Note <span>{notes.length}/500</span></Label>
              <Textarea 
                maxLength={500} 
                value={notes} 
                onChange={e => setNotes(e.target.value)} 
                placeholder="Eventuali annotazioni del medico..." 
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button 
              className="bg-primary hover:bg-primary/90" 
              onClick={handleSave} 
              disabled={saving}
            >
              {saving ? "Salvataggio..." : "Salva Certificato"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MedicalCertificates;
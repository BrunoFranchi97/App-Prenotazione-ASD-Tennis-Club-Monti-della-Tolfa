"use client";

import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO, differenceInDays } from 'date-fns';
import { it } from 'date-fns/locale';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, LogOut, FileText, Plus, AlertTriangle, CheckCircle, Clock, Trash2, Edit, Upload, Download, X, File } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import type { MedicalCertificate, CertificateType } from '@/types/supabase';

const MedicalCertificates = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [certificates, setCertificates] = useState<MedicalCertificate[]>([]);
  
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCertificate, setEditingCertificate] = useState<MedicalCertificate | null>(null);
  
  // Form state
  const [issueDate, setIssueDate] = useState<string>("");
  const [expiryDate, setExpiryDate] = useState<string>("");
  const [certificateType, setCertificateType] = useState<CertificateType>("agonistico");
  const [notes, setNotes] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [existingFileUrl, setExistingFileUrl] = useState<string | null>(null);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) showError(error.message);
    else {
      showSuccess("Disconnessione effettuata!");
      navigate('/login');
    }
  };

  const fetchCertificates = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }

      const { data, error } = await supabase
        .from('medical_certificates')
        .select('*')
        .eq('user_id', user.id)
        .order('expiry_date', { ascending: false });

      if (error) throw error;
      setCertificates(data || []);

    } catch (err: any) {
      showError("Errore nel caricamento: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCertificates();
  }, []);

  const openCreateDialog = () => {
    setEditingCertificate(null);
    setIssueDate("");
    setExpiryDate("");
    setCertificateType("agonistico");
    setNotes("");
    setSelectedFile(null);
    setExistingFileUrl(null);
    setDialogOpen(true);
  };

  const openEditDialog = (cert: MedicalCertificate) => {
    setEditingCertificate(cert);
    setIssueDate(cert.issue_date);
    setExpiryDate(cert.expiry_date);
    setCertificateType(cert.certificate_type);
    setNotes(cert.notes || "");
    setSelectedFile(null);
    setExistingFileUrl(cert.file_url || null);
    setDialogOpen(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
      if (!allowedTypes.includes(file.type)) {
        showError("Formato file non supportato. Usa PDF, JPG o PNG.");
        return;
      }
      // Validate file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        showError("Il file è troppo grande. Massimo 5MB.");
        return;
      }
      setSelectedFile(file);
    }
  };

  const removeSelectedFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadFile = async (userId: string): Promise<string | null> => {
    if (!selectedFile) return existingFileUrl;

    setUploading(true);
    try {
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${userId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('medical-certificates')
        .upload(fileName, selectedFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Get the file URL
      const { data: { publicUrl } } = supabase.storage
        .from('medical-certificates')
        .getPublicUrl(fileName);

      return fileName; // Store the path, not the public URL (since bucket is private)
    } catch (err: any) {
      showError("Errore upload file: " + err.message);
      return null;
    } finally {
      setUploading(false);
    }
  };

  const deleteOldFile = async (fileUrl: string | null) => {
    if (!fileUrl) return;
    try {
      await supabase.storage
        .from('medical-certificates')
        .remove([fileUrl]);
    } catch (err) {
      console.error("Error deleting old file:", err);
    }
  };

  const handleSave = async () => {
    if (!issueDate || !expiryDate || !certificateType) {
      showError("Compila tutti i campi obbligatori.");
      return;
    }

    if (new Date(issueDate) > new Date(expiryDate)) {
      showError("La data di scadenza deve essere successiva alla data di rilascio.");
      return;
    }

    // Require file for new certificates
    if (!editingCertificate && !selectedFile) {
      showError("Carica il file del certificato medico.");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }

      // Upload file if selected
      const fileUrl = await uploadFile(user.id);

      if (editingCertificate) {
        // If new file uploaded, delete old one
        if (selectedFile && editingCertificate.file_url) {
          await deleteOldFile(editingCertificate.file_url);
        }

        // Update existing
        const { error } = await supabase
          .from('medical_certificates')
          .update({
            issue_date: issueDate,
            expiry_date: expiryDate,
            certificate_type: certificateType,
            notes: notes.trim() || null,
            file_url: fileUrl,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingCertificate.id);

        if (error) throw error;
        showSuccess("Certificato aggiornato!");
      } else {
        // Create new
        const { error } = await supabase
          .from('medical_certificates')
          .insert({
            user_id: user.id,
            issue_date: issueDate,
            expiry_date: expiryDate,
            certificate_type: certificateType,
            notes: notes.trim() || null,
            file_url: fileUrl
          });

        if (error) throw error;
        showSuccess("Certificato aggiunto!");
      }

      setDialogOpen(false);
      await fetchCertificates();

    } catch (err: any) {
      showError("Errore: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cert: MedicalCertificate) => {
    try {
      // Delete file from storage
      if (cert.file_url) {
        await deleteOldFile(cert.file_url);
      }

      const { error } = await supabase
        .from('medical_certificates')
        .delete()
        .eq('id', cert.id);

      if (error) throw error;
      showSuccess("Certificato eliminato.");
      await fetchCertificates();
    } catch (err: any) {
      showError("Errore: " + err.message);
    }
  };

  const downloadFile = async (fileUrl: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('medical-certificates')
        .download(fileUrl);

      if (error) throw error;

      // Create download link
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileUrl.split('/').pop() || 'certificato';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      showError("Errore download: " + err.message);
    }
  };

  const getStatusInfo = (cert: MedicalCertificate) => {
    const today = new Date();
    const expiry = parseISO(cert.expiry_date);
    const daysUntilExpiry = differenceInDays(expiry, today);

    if (daysUntilExpiry < 0) {
      return {
        status: 'expired',
        label: 'Scaduto',
        color: 'bg-red-100 text-red-800',
        icon: AlertTriangle,
        message: `Scaduto da ${Math.abs(daysUntilExpiry)} giorni`
      };
    } else if (daysUntilExpiry <= 30) {
      return {
        status: 'expiring',
        label: 'In scadenza',
        color: 'bg-amber-100 text-amber-800',
        icon: Clock,
        message: `Scade tra ${daysUntilExpiry} giorni`
      };
    } else {
      return {
        status: 'valid',
        label: 'Valido',
        color: 'bg-green-100 text-green-800',
        icon: CheckCircle,
        message: `Valido fino al ${format(expiry, 'd MMMM yyyy', { locale: it })}`
      };
    }
  };

  // Get the most recent valid certificate
  const currentCertificate = certificates.find(c => {
    const expiry = parseISO(c.expiry_date);
    return expiry >= new Date();
  });

  const expiredCertificates = certificates.filter(c => {
    const expiry = parseISO(c.expiry_date);
    return expiry < new Date();
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-white">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4 text-primary">Caricamento...</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4 sm:p-6 lg:p-8">
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center">
          <Link to="/dashboard" className="mr-4">
            <Button variant="outline" size="icon" className="text-primary border-primary hover:bg-secondary">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-primary">Certificato Medico</h1>
        </div>
        <Button variant="outline" className="text-primary border-primary hover:bg-secondary" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" /> Esci
        </Button>
      </header>

      {/* Alert for expiring/expired certificates */}
      {currentCertificate && getStatusInfo(currentCertificate).status === 'expiring' && (
        <Card className="mb-6 border-amber-300 bg-amber-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
              <div>
                <p className="font-semibold text-amber-800">Certificato in scadenza!</p>
                <p className="text-sm text-amber-700">
                  Il tuo certificato medico scadrà tra {differenceInDays(parseISO(currentCertificate.expiry_date), new Date())} giorni. 
                  Ricordati di rinnovarlo.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!currentCertificate && certificates.length > 0 && (
        <Card className="mb-6 border-red-300 bg-red-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-red-600" />
              <div>
                <p className="font-semibold text-red-800">Certificato scaduto!</p>
                <p className="text-sm text-red-700">
                  Il tuo certificato medico è scaduto. Carica un nuovo certificato per poter prenotare i campi.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Current Certificate */}
        <Card className="shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-primary flex items-center">
                <FileText className="mr-2 h-5 w-5" /> Certificato Attuale
              </CardTitle>
              <Button onClick={openCreateDialog} size="sm">
                <Plus className="mr-2 h-4 w-4" /> Aggiungi
              </Button>
            </div>
            <CardDescription>Il tuo certificato medico attivo</CardDescription>
          </CardHeader>
          <CardContent>
            {currentCertificate ? (
              <div className="space-y-4">
                {(() => {
                  const statusInfo = getStatusInfo(currentCertificate);
                  const StatusIcon = statusInfo.icon;
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <Badge className={statusInfo.color}>
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {statusInfo.label}
                        </Badge>
                        <Badge variant="outline">
                          {currentCertificate.certificate_type === 'agonistico' ? 'Agonistico' : 'Non Agonistico'}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Data rilascio</p>
                          <p className="font-medium">
                            {format(parseISO(currentCertificate.issue_date), 'd MMMM yyyy', { locale: it })}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Data scadenza</p>
                          <p className="font-medium">
                            {format(parseISO(currentCertificate.expiry_date), 'd MMMM yyyy', { locale: it })}
                          </p>
                        </div>
                      </div>

                      <p className="text-sm text-muted-foreground">{statusInfo.message}</p>

                      {currentCertificate.file_url && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full"
                          onClick={() => downloadFile(currentCertificate.file_url!)}
                        >
                          <Download className="mr-2 h-4 w-4" /> Scarica Certificato
                        </Button>
                      )}

                      {currentCertificate.notes && (
                        <p className="text-sm text-gray-600 italic border-t pt-2">
                          Note: {currentCertificate.notes}
                        </p>
                      )}

                      <div className="flex gap-2 pt-2">
                        <Button variant="outline" size="sm" onClick={() => openEditDialog(currentCertificate)}>
                          <Edit className="mr-2 h-4 w-4" /> Modifica
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm">
                              <Trash2 className="mr-2 h-4 w-4" /> Elimina
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Eliminare il certificato?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Questa azione è irreversibile. Il file del certificato verrà eliminato.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annulla</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(currentCertificate)}>
                                Conferma
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>Nessun certificato medico valido.</p>
                <p className="text-sm mt-2">Aggiungi il tuo certificato per poter prenotare.</p>
                <Button onClick={openCreateDialog} className="mt-4">
                  <Plus className="mr-2 h-4 w-4" /> Aggiungi Certificato
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Certificate History */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-primary flex items-center">
              <Clock className="mr-2 h-5 w-5" /> Storico Certificati
            </CardTitle>
            <CardDescription>I tuoi certificati precedenti</CardDescription>
          </CardHeader>
          <CardContent>
            {expiredCertificates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Nessun certificato precedente.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {expiredCertificates.map((cert) => (
                  <div key={cert.id} className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-gray-500">
                          {cert.certificate_type === 'agonistico' ? 'Agonistico' : 'Non Agonistico'}
                        </Badge>
                        <Badge className="bg-gray-100 text-gray-600">Scaduto</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Scaduto il {format(parseISO(cert.expiry_date), 'd MMMM yyyy', { locale: it })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {cert.file_url && (
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => downloadFile(cert.file_url!)}
                        >
                          <Download className="h-4 w-4 text-gray-500" />
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4 text-gray-400" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Eliminare il certificato?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Questa azione è irreversibile.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annulla</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(cert)}>
                              Conferma
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingCertificate ? 'Modifica Certificato' : 'Aggiungi Certificato'}
            </DialogTitle>
            <DialogDescription>
              Carica il tuo certificato medico sportivo in formato PDF o immagine.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* File Upload */}
            <div>
              <Label>File certificato {!editingCertificate && <span className="text-red-500">*</span>}</Label>
              <div className="mt-2">
                {selectedFile ? (
                  <div className="flex items-center gap-2 p-3 border rounded-lg bg-green-50 border-green-200">
                    <File className="h-5 w-5 text-green-600" />
                    <span className="flex-1 text-sm truncate">{selectedFile.name}</span>
                    <Button variant="ghost" size="icon" onClick={removeSelectedFile}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : existingFileUrl ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-3 border rounded-lg bg-blue-50 border-blue-200">
                      <File className="h-5 w-5 text-blue-600" />
                      <span className="flex-1 text-sm">File già caricato</span>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => downloadFile(existingFileUrl)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Seleziona un nuovo file per sostituire quello esistente
                    </p>
                  </div>
                ) : null}
                
                <div className="mt-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="certificate-file"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {selectedFile || existingFileUrl ? 'Cambia file' : 'Seleziona file'}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">
                    Formati accettati: PDF, JPG, PNG (max 5MB)
                  </p>
                </div>
              </div>
            </div>

            <div>
              <Label>Tipo di certificato</Label>
              <Select value={certificateType} onValueChange={(v) => setCertificateType(v as CertificateType)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agonistico">Agonistico</SelectItem>
                  <SelectItem value="non_agonistico">Non Agonistico</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Data rilascio <span className="text-red-500">*</span></Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </div>
              <div>
                <Label>Data scadenza <span className="text-red-500">*</span></Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label>Note (opzionale)</Label>
              <Textarea
                className="mt-1"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Es. Rilasciato da Dr. Rossi..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleSave} disabled={saving || uploading}>
              {uploading ? "Caricamento file..." : saving ? "Salvataggio..." : "Salva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MedicalCertificates;
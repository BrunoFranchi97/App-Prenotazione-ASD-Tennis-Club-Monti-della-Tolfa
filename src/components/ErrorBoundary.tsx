"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="flex justify-center">
              <div className="p-4 bg-red-100 rounded-full">
                <AlertTriangle className="h-12 w-12 text-red-600" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Oops, qualcosa è andato storto</h1>
            <p className="text-gray-600">
              Si è verificato un errore imprevisto durante il caricamento della pagina.
            </p>
            {this.state.error && (
              <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto max-h-32 text-left">
                {this.state.error.message}
              </pre>
            )}
            <Button 
              onClick={() => window.location.reload()} 
              className="w-full bg-primary hover:bg-primary/90"
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Ricarica la pagina
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
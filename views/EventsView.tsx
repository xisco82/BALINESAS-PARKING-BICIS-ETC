import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useToast } from '../components/Toast';
import ServicesView from './ServicesView';
import DocumentEditorModal from '../components/DocumentEditorModal';
import { UserRole } from '../types';

interface EventsViewProps {
  dbError: string | null;
  isDbInitialized: boolean;
  isAuthReady: boolean;
  userRole: UserRole;
  onRetryAuth: () => void;
}

export interface EventPdf {
  id: string;
  month: string;
  pdfUrl?: string;
  fileName: string;
  uploadedAt: string;
  eventDate?: string; // YYYY-MM-DD
  content?: string;   // Rich text HTML document written directly in the app
}

const MONTHS = [
  'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre'
];

const EventsView: React.FC<EventsViewProps> = ({ dbError, isDbInitialized, isAuthReady, userRole, onRetryAuth }) => {
  const [activeTab, setActiveTab] = useState<'pdfs' | 'summary'>('summary');
  const [pdfs, setPdfs] = useState<EventPdf[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<EventPdf | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeMonth, setActiveMonth] = useState<string>(MONTHS[0]);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<EventPdf | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (!isDbInitialized || !isAuthReady) return;

    const unsubscribe = onSnapshot(collection(db, 'event_pdfs'), (snapshot) => {
      const pdfData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as EventPdf[];
      setPdfs(pdfData);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching PDFs:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [isDbInitialized, isAuthReady]);

  // Escape key handler for the full-screen viewer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedDoc) {
        setSelectedDoc(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDoc]);

  const handleDeletePdf = async (pdf: EventPdf) => {
    if (!window.confirm(`¿Estás seguro de que quieres eliminar el documento "${pdf.fileName}"?`)) return;

    try {
      try {
        await deleteDoc(doc(db, 'event_pdfs', pdf.id));
      } catch (clientErr) {
        console.warn("Client delete failed, attempting backend delete proxy:", clientErr);
        await fetch(`/api/event-documents/${pdf.id}`, { method: 'DELETE' });
      }
      showToast('Documento eliminado correctamente', 'success');
      if (selectedDoc?.id === pdf.id) {
        setSelectedDoc(null);
      }
    } catch (error) {
      console.error("Error deleting PDF:", error);
      showToast('Error al eliminar el documento', 'error');
    }
  };

  const handleSaveDocument = async (docData: { fileName: string; eventDate: string; content: string }) => {
    const isEditing = Boolean(editingDoc?.id);
    const payload = {
      month: activeMonth,
      fileName: docData.fileName.trim(),
      content: docData.content,
      pdfUrl: editingDoc?.pdfUrl || 'document',
      eventDate: docData.eventDate || null,
      uploadedAt: editingDoc?.uploadedAt || new Date().toISOString()
    };

    try {
      if (isEditing && editingDoc) {
        try {
          await updateDoc(doc(db, 'event_pdfs', editingDoc.id), payload);
        } catch (clientErr) {
          console.warn("Client updateDoc failed, attempting backend proxy:", clientErr);
          await fetch('/api/event-documents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: editingDoc.id, ...payload })
          });
        }
        showToast('Documento actualizado correctamente', 'success');
        // Update local viewer state if this doc is currently open
        if (selectedDoc?.id === editingDoc.id) {
          setSelectedDoc({ ...editingDoc, ...payload });
        }
      } else {
        try {
          await addDoc(collection(db, 'event_pdfs'), payload);
        } catch (clientErr) {
          console.warn("Client addDoc failed, attempting backend proxy:", clientErr);
          await fetch('/api/event-documents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        }
        showToast('Documento guardado correctamente', 'success');

        // Send notification via server to Apps Script
        try {
          await fetch('/api/notifications/novedad', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: docData.fileName.trim(),
              description: `Nuevo documento añadido para ${activeMonth}: ${docData.fileName.trim()}\n\nREVISA LOS CAMBIOS EN ESTE ENLACE: https://balinesas-parking-bicis-etc.vercel.app/`,
              month: activeMonth,
              eventDate: docData.eventDate || null,
              type: 'event_pdf'
            })
          });
        } catch (e) {
          console.error("Notification fetch failed:", e);
        }
      }

      setEditingDoc(null);
      setIsEditorOpen(false);
    } catch (error) {
      console.error("Error saving document:", error);
      showToast('Error al guardar el documento', 'error');
      throw error;
    }
  };

  const handleEditPdf = (pdf: EventPdf) => {
    setEditingDoc(pdf);
    setIsEditorOpen(true);
  };

  const handlePrint = () => {
    window.print();
  };

  const activeMonthPdfs = pdfs
    .filter(p => p.month === activeMonth)
    .sort((a, b) => {
      if (!a.eventDate && !b.eventDate) return 0;
      if (!a.eventDate) return 1;
      if (!b.eventDate) return -1;
      return a.eventDate.localeCompare(b.eventDate);
    });
  const hasPdfs = activeMonthPdfs.length > 0;

  return (
    <div className="flex flex-col h-full">
      <Header title="Eventos" />

      {/* Embedded print styles for crisp, paper-sized output */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-doc-sheet, #printable-doc-sheet * {
            visibility: visible !important;
          }
          #printable-doc-sheet {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 12mm 16mm !important;
            box-shadow: none !important;
            border: none !important;
            background: white !important;
            color: #111827 !important;
          }
          #printable-doc-sheet table {
            width: 100% !important;
            border-collapse: collapse !important;
            page-break-inside: avoid;
          }
          #printable-doc-sheet th, #printable-doc-sheet td {
            border: 1px solid #9ca3af !important;
            padding: 8px 12px !important;
          }
          #printable-doc-sheet img {
            max-width: 100% !important;
            page-break-inside: avoid;
          }
        }
        
        /* Document body styling */
        .document-render-sheet h1 {
          font-size: 1.85rem;
          font-weight: 800;
          color: #111827;
          margin-top: 1.25rem;
          margin-bottom: 0.5rem;
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 0.25rem;
        }
        .document-render-sheet h2 {
          font-size: 1.45rem;
          font-weight: 700;
          color: #1f2937;
          margin-top: 1rem;
          margin-bottom: 0.4rem;
        }
        .document-render-sheet h3 {
          font-size: 1.2rem;
          font-weight: 700;
          color: #374151;
          margin-top: 0.85rem;
          margin-bottom: 0.35rem;
        }
        .document-render-sheet p {
          margin-bottom: 0.75rem;
          line-height: 1.65;
          color: #1f2937;
        }
        .document-render-sheet ul {
          list-style-type: disc;
          padding-left: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .document-render-sheet ol {
          list-style-type: decimal;
          padding-left: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .document-render-sheet li {
          margin-bottom: 0.25rem;
        }
        .document-render-sheet table {
          width: 100%;
          max-width: 100%;
          table-layout: fixed;
          border-collapse: collapse;
          margin: 1rem 0;
          border: 1px solid #d1d5db;
          word-break: break-word;
        }
        .document-render-sheet th {
          border: 1px solid #d1d5db;
          padding: 8px 12px;
          background-color: #f3f4f6;
          font-weight: 700;
          text-align: left;
        }
        .document-render-sheet td {
          border: 1px solid #d1d5db;
          padding: 8px 12px;
          vertical-align: top;
        }
        .document-render-sheet hr {
          border: 0;
          border-top: 1px solid #d1d5db;
          margin: 1.5rem 0;
        }
        .document-render-sheet img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          margin: 1rem auto;
          display: block;
        }
        .document-render-sheet a {
          color: #2563eb;
          text-decoration: underline;
        }
      `}</style>

      <div className="p-4 max-w-5xl mx-auto w-full flex-grow flex flex-col">
        {dbError && (
          <div className="bg-red-100/80 dark:bg-red-900/80 backdrop-blur-sm border-l-4 border-red-500 text-red-700 dark:text-red-200 p-4 rounded-lg mb-4" role="alert">
            <p className="font-bold">Error de Conexión</p>
            <p className="whitespace-pre-line">{dbError}</p>
            <button 
              onClick={onRetryAuth} 
              className="mt-3 bg-red-600 text-white px-4 py-1 rounded-md text-sm font-bold hover:bg-red-700 transition-colors"
            >
              Reintentar Conexión
            </button>
          </div>
        )}

        <div className="flex space-x-4 mb-6 justify-center">
          <button 
            onClick={() => setActiveTab('summary')} 
            className={`px-6 py-2 rounded-full font-semibold transition-colors shadow-sm ${activeTab === 'summary' ? 'bg-blue-600 text-white' : 'bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
          >
            Eventos Anuales
          </button>
          <button 
            onClick={() => setActiveTab('pdfs')} 
            className={`px-6 py-2 rounded-full font-semibold transition-colors shadow-sm ${activeTab === 'pdfs' ? 'bg-blue-600 text-white' : 'bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
          >
            Resumen de eventos mensuales
          </button>
        </div>

        {activeTab === 'summary' ? (
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md rounded-xl shadow-md border border-gray-200/50 dark:border-gray-700/50 flex-grow">
            <ServicesView 
              dbError={dbError}
              isDbInitialized={isDbInitialized}
              isAuthReady={isAuthReady}
              userRole={userRole}
              title="Eventos Anuales"
              tableName="events_bookings"
              onRetryAuth={onRetryAuth}
              hideHeader={true}
            />
          </div>
        ) : (
          <>
            {/* MONTH SELECTOR BAR */}
            <div className="mb-6 overflow-x-auto pb-2 scrollbar-hide">
              <div className="flex space-x-2 min-w-max">
                {MONTHS.map(month => (
                  <button
                    key={month}
                    onClick={() => setActiveMonth(month)}
                    className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                      activeMonth === month 
                        ? 'bg-blue-600 text-white shadow-md' 
                        : 'bg-white/50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 hover:bg-white/80 dark:hover:bg-gray-700/80'
                    }`}
                  >
                    {month}
                  </button>
                ))}
              </div>
            </div>

            {isLoading ? (
              <div className="text-center py-10 text-gray-500 dark:text-gray-400">Cargando...</div>
            ) : (
              <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md rounded-xl shadow-md p-6 border border-gray-200/50 dark:border-gray-700/50 flex-grow flex flex-col">
                <div className="flex justify-between items-center mb-6 border-b border-gray-200 dark:border-gray-700 pb-4">
                  <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Documentos de {activeMonth}</h2>
                  {userRole === 'editor' && (
                    <button 
                      onClick={() => {
                        setEditingDoc(null);
                        setIsEditorOpen(true);
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors flex items-center space-x-2 shadow-sm"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                      </svg>
                      <span>Añadir Documento</span>
                    </button>
                  )}
                </div>

                <div className="flex-grow flex flex-col space-y-3">
                  {!hasPdfs ? (
                    <div className="flex-grow flex items-center justify-center text-gray-500 dark:text-gray-400 italic">
                      No hay documentos para {activeMonth}.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {activeMonthPdfs.map(pdf => (
                        <div key={pdf.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl group border border-gray-100 dark:border-gray-600 hover:shadow-md transition-shadow">
                          <button 
                            onClick={() => setSelectedDoc(pdf)}
                            className="flex items-center space-x-4 overflow-hidden hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex-grow text-left"
                          >
                            <div className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-2 rounded-lg shrink-0">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 100 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <div className="flex flex-col overflow-hidden">
                              <span className="text-base font-semibold truncate text-gray-800 dark:text-gray-200" title={pdf.fileName}>
                                {pdf.fileName}
                              </span>
                              <div className="flex items-center space-x-2">
                                {pdf.eventDate && (
                                  <span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded">
                                    {new Date(pdf.eventDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                                  </span>
                                )}
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  Subido: {new Date(pdf.uploadedAt).toLocaleDateString('es-ES')}
                                </span>
                              </div>
                            </div>
                          </button>
                          
                          {userRole === 'editor' && (
                            <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-all shrink-0 ml-2">
                              <button 
                                onClick={() => handleEditPdf(pdf)}
                                className="text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 p-2 rounded-lg transition-all"
                                title="Editar Documento"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                </svg>
                              </button>
                              <button 
                                onClick={() => handleDeletePdf(pdf)}
                                className="text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition-all"
                                title="Eliminar Documento"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* FULLSCREEN DARK VIEWER (HOJA BLANCA CENTRADA TIPO PDF) */}
      {selectedDoc && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-md">
          {/* Header of Viewer */}
          <div className="flex items-center justify-between p-4 bg-gray-900 text-white shadow-lg border-b border-gray-800 shrink-0">
            <div className="flex flex-col overflow-hidden mr-4">
              <h3 className="font-bold truncate text-sm md:text-base text-white">{selectedDoc.fileName}</h3>
              <div className="flex items-center gap-2 text-[10px] md:text-xs text-gray-400">
                {selectedDoc.eventDate && (
                  <span className="text-blue-400 font-semibold">
                    {new Date(selectedDoc.eventDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                )}
                <span>•</span>
                <span>Mes: {selectedDoc.month}</span>
                <span>•</span>
                <span>Subido: {new Date(selectedDoc.uploadedAt).toLocaleDateString('es-ES')}</span>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              {/* Botón Imprimir / PDF */}
              <button
                onClick={handlePrint}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center space-x-1.5 text-xs md:text-sm font-semibold shadow-sm"
                title="Imprimir o Guardar como PDF"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 md:h-5 md:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                <span>Imprimir / PDF</span>
              </button>

              {/* Botón Editar (si eres editor) */}
              {userRole === 'editor' && (
                <button
                  onClick={() => {
                    const docToEdit = selectedDoc;
                    setSelectedDoc(null);
                    handleEditPdf(docToEdit);
                  }}
                  className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center space-x-1.5 text-xs md:text-sm font-semibold shadow-sm"
                  title="Editar documento"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 md:h-5 md:w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                  </svg>
                  <span>Editar</span>
                </button>
              )}

              {/* Legacy fallback: open Drive link if present */}
              {selectedDoc.pdfUrl && selectedDoc.pdfUrl !== 'document' && (
                <a 
                  href={selectedDoc.pdfUrl.replace('/preview', '/view')} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg transition-colors flex items-center space-x-1 text-xs"
                  title="Abrir en pestaña nueva"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 md:h-5 md:w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                    <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                  </svg>
                </a>
              )}

              {/* Botón Cerrar (X) */}
              <button
                onClick={() => setSelectedDoc(null)}
                className="p-2 bg-gray-800 hover:bg-red-600 text-white rounded-lg transition-colors"
                title="Cerrar (Escape)"
              >
                <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Centered Document Sheet (Hoja DIN A4 como si fuera un PDF) */}
          <div className="flex-grow overflow-y-auto overflow-x-auto p-3 sm:p-6 pb-28 flex justify-center bg-black/85">
            {selectedDoc.content ? (
              <div
                id="printable-doc-sheet"
                className="document-render-sheet bg-white text-gray-900 shadow-2xl rounded-sm w-full max-w-[794px] min-h-[1123px] my-4 p-8 sm:p-14 pb-28 font-sans leading-relaxed text-base box-border mx-auto"
                style={{
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word',
                }}
              >
                {/* Header inside sheet */}
                <div className="border-b border-gray-300 pb-4 mb-6">
                  <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-2">
                    {selectedDoc.fileName}
                  </h1>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    {selectedDoc.eventDate && (
                      <span className="font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
                        Fecha del evento: {new Date(selectedDoc.eventDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </span>
                    )}
                    <span>Mes: <strong>{selectedDoc.month}</strong></span>
                    <span>•</span>
                    <span>Subido: {new Date(selectedDoc.uploadedAt).toLocaleDateString('es-ES')}</span>
                  </div>
                </div>

                {/* HTML Document Body */}
                <div
                  className="document-content-area"
                  dangerouslySetInnerHTML={{ __html: selectedDoc.content }}
                />
              </div>
            ) : selectedDoc.pdfUrl ? (
              /* Legacy Fallback for existing PDF or Drive embeds */
              <div className="w-full h-[85vh] relative overflow-hidden bg-white max-w-[794px] rounded-lg shadow-xl my-4 mx-auto">
                <iframe
                  src={selectedDoc.pdfUrl.includes('drive.google.com') ? selectedDoc.pdfUrl : `${selectedDoc.pdfUrl}#view=FitH`}
                  className={`w-full h-full border-0 bg-white ${
                    selectedDoc.pdfUrl.includes('drive.google.com') && !selectedDoc.pdfUrl.includes('embeddedfolderview')
                      ? 'absolute top-[-56px] left-0 h-[calc(100%+56px)]' 
                      : ''
                  }`}
                  title={selectedDoc.fileName}
                  allow="autoplay"
                />
              </div>
            ) : (
              <div className="bg-white text-gray-700 p-8 rounded-lg max-w-md my-auto text-center">
                <p>El documento está vacío.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RICH DOCUMENT EDITOR MODAL */}
      <DocumentEditorModal
        isOpen={isEditorOpen}
        onClose={() => {
          setIsEditorOpen(false);
          setEditingDoc(null);
        }}
        onSave={handleSaveDocument}
        initialData={editingDoc}
        monthName={activeMonth}
      />
    </div>
  );
};

export default EventsView;

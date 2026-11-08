import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useToast } from '../components/Toast';
import ServicesView from './ServicesView';
import { UserRole } from '../types';
import RichTextEditor, { DOC_STYLES, sanitizeHtml, isHtmlEmpty, htmlByteSize } from '../components/RichTextEditor';

const MAX_CONTENT_BYTES = 900_000; // Firestore admite como máximo 1 MB por documento

interface EventsViewProps {
  dbError: string | null;
  isDbInitialized: boolean;
  isAuthReady: boolean;
  userRole: UserRole;
  onRetryAuth: () => void;
}

interface EventPdf {
  id: string;
  month: string;
  pdfUrl?: string;   // Documentos antiguos (enlace de Google Drive)
  content?: string;  // Documentos nuevos (texto con formato, HTML)
  fileName: string;
  uploadedAt: string;
  eventDate?: string; // YYYY-MM-DD
}

const MONTHS = [
  'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre'
];

const EventsView: React.FC<EventsViewProps> = ({ dbError, isDbInitialized, isAuthReady, userRole, onRetryAuth }) => {
  const [activeTab, setActiveTab] = useState<'pdfs' | 'summary'>('summary');
  const [pdfs, setPdfs] = useState<EventPdf[]>([]);
  const [selectedPdf, setSelectedPdf] = useState<EventPdf | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeMonth, setActiveMonth] = useState<string>(MONTHS[0]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingPdf, setEditingPdf] = useState<EventPdf | null>(null);
  const [editorHtml, setEditorHtml] = useState('');
  const [editorKey, setEditorKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [driveName, setDriveName] = useState('');
  const [eventDate, setEventDate] = useState('');
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

  const handleDeletePdf = async (pdf: EventPdf) => {
    if (!window.confirm(`¿Estás seguro de que quieres eliminar el documento "${pdf.fileName}"?`)) return;

    try {
      await deleteDoc(doc(db, 'event_pdfs', pdf.id));
      showToast('Documento eliminado correctamente', 'success');
    } catch (error) {
      console.error("Error deleting PDF:", error);
      showToast('Error al eliminar el documento', 'error');
    }
  };

  // Cerrar el visor con la tecla Escape
  useEffect(() => {
    if (!selectedPdf) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedPdf(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedPdf]);

  const isLegacyDrive = !!editingPdf?.pdfUrl && !editingPdf?.content;
  const contentIsEmpty = isHtmlEmpty(editorHtml);
  const canSave = !!driveName.trim() && (!contentIsEmpty || isLegacyDrive) && !isSaving;

  const handleSaveDocument = async () => {
    if (!canSave) return;

    const cleanContent = contentIsEmpty ? '' : sanitizeHtml(editorHtml);
    if (htmlByteSize(cleanContent) > MAX_CONTENT_BYTES) {
      showToast('El documento es demasiado grande. Reduce el número o tamaño de las imágenes.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      if (editingPdf) {
        const updates: Record<string, unknown> = {
          month: activeMonth,
          fileName: driveName.trim(),
          eventDate: eventDate || null
        };
        if (cleanContent) {
          updates.content = cleanContent;
          // Si era un enlace de Drive antiguo, se sustituye por el texto
          if (editingPdf.pdfUrl) updates.pdfUrl = deleteField();
        }
        await updateDoc(doc(db, 'event_pdfs', editingPdf.id), updates);
        showToast('Documento actualizado correctamente', 'success');
        setIsAddModalOpen(false);
      } else {
        await addDoc(collection(db, 'event_pdfs'), {
          month: activeMonth,
          content: cleanContent,
          fileName: driveName.trim(),
          uploadedAt: new Date().toISOString(),
          eventDate: eventDate || null
        });
        showToast('Documento añadido correctamente', 'success');
        setIsAddModalOpen(false);

        // Send notification via server to Apps Script
        try {
          await fetch('/api/notifications/novedad', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: driveName.trim(),
              description: `Nuevo documento añadido para ${activeMonth}: ${driveName.trim()}\n\nREVISA LOS CAMBIOS EN ESTE ENLACE: https://balinesas-parking-bicis-etc.vercel.app/`,
              month: activeMonth,
              pdfUrl: null,
              eventDate: eventDate || null,
              type: 'event_pdf'
            })
          });
        } catch (e) {
          console.error("Notification fetch failed:", e);
        }
      }
      setEditingPdf(null);
      setEditorHtml('');
      setDriveName('');
      setEventDate('');
    } catch (error) {
      console.error("Error saving document:", error);
      showToast('Error al guardar el documento', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingPdf(null);
    setDriveName('');
    setEventDate('');
    setEditorHtml('');
    setEditorKey(k => k + 1);
    setIsAddModalOpen(true);
  };

  const handlePrint = (item: EventPdf) => {
    const win = window.open('', '_blank');
    if (!win) {
      showToast('Permite las ventanas emergentes para imprimir', 'error');
      return;
    }
    const safeTitle = item.fileName.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] as string));
    win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${safeTitle}</title>
      <style>${DOC_STYLES} body{margin:0;padding:32px;background:#fff;} @page{margin:16mm;}</style></head>
      <body><div class="doc-content">${sanitizeHtml(item.content || '')}</div></body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  const handleEditPdf = (pdf: EventPdf) => {
    setEditingPdf(pdf);
    setDriveName(pdf.fileName);
    setEditorHtml(pdf.content || '');
    setEditorKey(k => k + 1);
    setEventDate(pdf.eventDate || '');
    setIsAddModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsAddModalOpen(false);
    setEditingPdf(null);
    setEditorHtml('');
    setDriveName('');
    setEventDate('');
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
                      onClick={handleOpenAdd}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors flex items-center space-x-2"
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
                      {activeMonthPdfs.map(pdf => {
                        const isFolder = !pdf.content && !!pdf.pdfUrl?.includes('embeddedfolderview');
                        return (
                        <div key={pdf.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl group border border-gray-100 dark:border-gray-600 hover:shadow-md transition-shadow">
                          <button 
                            onClick={() => setSelectedPdf(pdf)}
                            className="flex items-center space-x-4 overflow-hidden hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex-grow text-left"
                          >
                            <div className={`${isFolder ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'} p-2 rounded-lg shrink-0`}>
                              {isFolder ? (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                                </svg>
                              ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 100 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                                </svg>
                              )}
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
                      )})}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {selectedPdf && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-md">
          {/* Header for the Viewer */}
          <div className="flex items-center justify-between p-4 bg-gray-900 text-white shadow-lg">
            <div className="flex flex-col overflow-hidden mr-4">
              <h3 className="font-bold truncate text-sm md:text-base">{selectedPdf.fileName}</h3>
              <p className="text-[10px] md:text-xs text-gray-400">
                Vista previa del documento
                {selectedPdf.eventDate && ` · ${new Date(selectedPdf.eventDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}`}
              </p>
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              {selectedPdf.content ? (
                <>
                  {userRole === 'editor' && (
                    <button
                      onClick={() => { const d = selectedPdf; setSelectedPdf(null); handleEditPdf(d); }}
                      className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center space-x-2 text-xs md:text-sm font-semibold"
                      title="Editar documento"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 md:h-5 md:w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                      </svg>
                      <span className="hidden sm:inline">Editar</span>
                    </button>
                  )}
                  <button
                    onClick={() => handlePrint(selectedPdf)}
                    className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center space-x-2 text-xs md:text-sm font-semibold"
                    title="Imprimir o guardar como PDF"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 md:h-5 md:w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clipRule="evenodd" />
                    </svg>
                    <span className="hidden sm:inline">Imprimir / PDF</span>
                    <span className="sm:hidden">PDF</span>
                  </button>
                </>
              ) : (
                <a 
                  href={(selectedPdf.pdfUrl || '').replace('/preview', '/view')} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center space-x-2 text-xs md:text-sm font-semibold"
                  title="Abrir en pestaña nueva para zoom completo"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 md:h-5 md:w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                    <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                  </svg>
                  <span className="hidden sm:inline">Abrir en pestaña nueva</span>
                  <span className="sm:hidden">Abrir</span>
                </a>
              )}
              <button
                onClick={() => setSelectedPdf(null)}
                className="p-2 bg-gray-700 hover:bg-red-600 text-white rounded-lg transition-colors"
                title="Cerrar"
              >
                <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content Area */}
          {selectedPdf.content ? (
            <div className="flex-grow w-full overflow-y-auto bg-gray-600/40 p-3 sm:p-8">
              <style>{DOC_STYLES}</style>
              <div
                className="doc-content bg-white mx-auto max-w-[850px] min-h-full shadow-2xl rounded-sm p-5 sm:p-12"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedPdf.content) }}
              />
            </div>
          ) : (
            <div className="flex-grow w-full relative overflow-hidden bg-white">
              <iframe
                src={(selectedPdf.pdfUrl || '').includes('drive.google.com') ? selectedPdf.pdfUrl : `${selectedPdf.pdfUrl}#view=FitH`}
                className={`w-full h-full border-0 bg-white ${
                  (selectedPdf.pdfUrl || '').includes('drive.google.com') && !(selectedPdf.pdfUrl || '').includes('embeddedfolderview')
                    ? 'absolute top-[-56px] left-0 h-[calc(100%+56px)]' 
                    : ''
                }`}
                title={selectedPdf.fileName}
                allow="autoplay"
              />
              
              {/* Mobile Zoom Hint */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[10px] px-3 py-1 rounded-full pointer-events-none sm:hidden">
                Usa el botón superior para zoom completo
              </div>
            </div>
          )}
        </div>
      )}

      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-5xl h-[95vh] flex flex-col overflow-hidden">
            <div className="flex justify-between items-center px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {editingPdf ? 'Editar Documento' : `Añadir Documento a ${activeMonth}`}
              </h3>
              <button onClick={handleCloseModal} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex-grow flex flex-col min-h-0 p-4 sm:p-5 gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre del documento</label>
                  <input
                    type="text"
                    value={driveName}
                    onChange={(e) => setDriveName(e.target.value)}
                    placeholder="Ej: 24/04 Sala de conferencias"
                    className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha del evento (opcional)</label>
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
              </div>

              {isLegacyDrive && (
                <div className="shrink-0 text-xs sm:text-sm bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-2">
                  Este documento es un enlace de Google Drive antiguo. Si escribes contenido abajo, se sustituirá por el texto. Si lo dejas vacío, solo se guardarán el nombre y la fecha.
                </div>
              )}

              <RichTextEditor key={editorKey} initialHtml={editorHtml} onChange={setEditorHtml} />

              <div className="flex justify-end space-x-3 shrink-0">
                <button
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveDocument}
                  disabled={!canSave}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Guardando...' : editingPdf ? 'Guardar Cambios' : 'Añadir Documento'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EventsView;

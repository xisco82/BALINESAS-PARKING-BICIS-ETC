import React, { useState, useEffect, useRef } from 'react';
import Header from '../components/Header';
import { collection, onSnapshot, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../services/firebase';
import { useToast } from '../components/Toast';
import ServicesView from './ServicesView';
import { UserRole } from '../types';

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
  pdfUrl: string;
  fileName: string;
  uploadedAt: string;
}

interface UploadingPdf {
  id: string;
  month: string;
  fileName: string;
  localUrl: string;
}

const MONTHS = [
  'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre'
];

const EventsView: React.FC<EventsViewProps> = ({ dbError, isDbInitialized, isAuthReady, userRole, onRetryAuth }) => {
  const [activeTab, setActiveTab] = useState<'pdfs' | 'summary'>('pdfs');
  const [pdfs, setPdfs] = useState<EventPdf[]>([]);
  const [uploadingPdfs, setUploadingPdfs] = useState<UploadingPdf[]>([]);
  const [selectedPdf, setSelectedPdf] = useState<{pdfUrl: string, fileName: string} | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeMonth, setActiveMonth] = useState<string>(MONTHS[0]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addType, setAddType] = useState<'file' | 'drive'>('file');
  const [driveLink, setDriveLink] = useState('');
  const [driveName, setDriveName] = useState('');
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      showToast('Solo se permiten archivos PDF', 'error');
      return;
    }

    const currentMonth = activeMonth;
    const localUrl = URL.createObjectURL(file);
    const tempId = `temp_${Date.now()}`;

    setUploadingPdfs(prev => [...prev, { id: tempId, month: currentMonth, fileName: file.name, localUrl }]);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    try {
      const storageRef = ref(storage, `event_pdfs/${currentMonth}_${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      await addDoc(collection(db, 'event_pdfs'), {
        month: currentMonth,
        pdfUrl: downloadURL,
        fileName: file.name,
        uploadedAt: new Date().toISOString()
      });

      showToast('PDF subido correctamente', 'success');
    } catch (error) {
      console.error("Error uploading PDF:", error);
      showToast('Error al subir el PDF', 'error');
    } finally {
      setUploadingPdfs(prev => prev.filter(p => p.id !== tempId));
    }
  };

  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleDeletePdf = async (pdf: EventPdf) => {
    if (!window.confirm(`¿Estás seguro de que quieres eliminar el documento "${pdf.fileName}"?`)) return;

    try {
      await deleteDoc(doc(db, 'event_pdfs', pdf.id));
      
      if (pdf.pdfUrl.includes('firebasestorage.googleapis.com')) {
        try {
          const fileRef = ref(storage, pdf.pdfUrl);
          await deleteObject(fileRef);
        } catch (storageError) {
          console.warn("Could not delete file from storage", storageError);
        }
      }
      showToast('Documento eliminado correctamente', 'success');
    } catch (error) {
      console.error("Error deleting PDF:", error);
      showToast('Error al eliminar el documento', 'error');
    }
  };

  const handleAddDriveLink = async () => {
    if (!driveName.trim() || !driveLink.trim()) return;

    let finalUrl = driveLink;
    
    // Detect if it's a folder or a file
    const folderMatch = driveLink.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    const fileMatch = driveLink.match(/\/d\/([a-zA-Z0-9_-]+)/) || driveLink.match(/id=([a-zA-Z0-9_-]+)/);
    
    if (folderMatch) {
      // It's a Drive folder, use the embedded folder view
      finalUrl = `https://drive.google.com/embeddedfolderview?id=${folderMatch[1]}#list`;
    } else if (fileMatch) {
      // It's a Drive file, use the preview view
      finalUrl = `https://drive.google.com/file/d/${fileMatch[1]}/preview`;
    } else if (driveLink.includes('drive.google.com')) {
      finalUrl = driveLink.replace(/\/view.*$/, '/preview');
    }

    try {
      await addDoc(collection(db, 'event_pdfs'), {
        month: activeMonth,
        pdfUrl: finalUrl,
        fileName: driveName.trim(),
        uploadedAt: new Date().toISOString()
      });

      showToast('Enlace añadido correctamente', 'success');
      setIsAddModalOpen(false);
      setDriveLink('');
      setDriveName('');
    } catch (error) {
      console.error("Error adding Drive link:", error);
      showToast('Error al añadir el enlace', 'error');
    }
  };

  const activeMonthPdfs = pdfs.filter(p => p.month === activeMonth);
  const activeUploadingPdfs = uploadingPdfs.filter(p => p.month === activeMonth);
  const hasPdfs = activeMonthPdfs.length > 0 || activeUploadingPdfs.length > 0;

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
            onClick={() => setActiveTab('pdfs')} 
            className={`px-6 py-2 rounded-full font-semibold transition-colors shadow-sm ${activeTab === 'pdfs' ? 'bg-blue-600 text-white' : 'bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
          >
            Resumen de eventos mensuales
          </button>
          <button 
            onClick={() => setActiveTab('summary')} 
            className={`px-6 py-2 rounded-full font-semibold transition-colors shadow-sm ${activeTab === 'summary' ? 'bg-blue-600 text-white' : 'bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
          >
            Eventos Anuales
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
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="application/pdf" 
              className="hidden" 
            />

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
                      onClick={() => setIsAddModalOpen(true)}
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
                      No hay documentos PDF para {activeMonth}.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {activeUploadingPdfs.map(pdf => (
                        <div key={pdf.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl border border-gray-100 dark:border-gray-600 opacity-70">
                          <button 
                            onClick={() => setSelectedPdf({ pdfUrl: pdf.localUrl, fileName: pdf.fileName })}
                            className="flex items-center space-x-4 overflow-hidden hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex-grow text-left"
                          >
                            <div className="bg-red-100 dark:bg-red-900/30 p-2 rounded-lg shrink-0">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-600 dark:text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 100 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <div className="flex flex-col overflow-hidden">
                              <span className="text-base font-semibold truncate text-gray-800 dark:text-gray-200" title={pdf.fileName}>
                                {pdf.fileName}
                              </span>
                              <span className="text-xs text-blue-500 dark:text-blue-400 font-medium">
                                Subiendo...
                              </span>
                            </div>
                          </button>
                          <div className="shrink-0 ml-2 p-2">
                            <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          </div>
                        </div>
                      ))}
                      {activeMonthPdfs.map(pdf => {
                        const isFolder = pdf.pdfUrl.includes('embeddedfolderview');
                        return (
                        <div key={pdf.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl group border border-gray-100 dark:border-gray-600 hover:shadow-md transition-shadow">
                          <button 
                            onClick={() => setSelectedPdf({ pdfUrl: pdf.pdfUrl, fileName: pdf.fileName })}
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
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {new Date(pdf.uploadedAt).toLocaleDateString('es-ES')}
                              </span>
                            </div>
                          </button>
                          
                          {userRole === 'editor' && (
                            <button 
                              onClick={() => handleDeletePdf(pdf)}
                              className="text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all shrink-0 ml-2"
                              title="Eliminar Documento"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                            </button>
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm">
          <div className="w-full h-full flex flex-col overflow-hidden relative">
            {/* Floating Close Button */}
            <button
              onClick={() => setSelectedPdf(null)}
              className="absolute top-4 right-4 z-50 p-3 bg-black/50 hover:bg-red-600 text-white rounded-full backdrop-blur-md transition-all shadow-lg"
              title="Cerrar"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="flex-grow w-full h-full relative overflow-hidden">
              <iframe
                src={selectedPdf.pdfUrl.includes('drive.google.com') ? selectedPdf.pdfUrl : `${selectedPdf.pdfUrl}#view=FitH`}
                className={`w-full border-0 ${selectedPdf.pdfUrl.includes('drive.google.com') ? 'absolute top-[-56px] left-0 h-[calc(100%+56px)]' : 'h-full'}`}
                title={selectedPdf.fileName}
                allow="autoplay"
              />
            </div>
          </div>
        </div>
      )}

      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Añadir Documento a {activeMonth}</h3>
                <button onClick={() => setIsAddModalOpen(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              
              <div className="flex space-x-2 mb-6">
                <button
                  onClick={() => setAddType('file')}
                  className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${addType === 'file' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                >
                  Subir PDF
                </button>
                <button
                  onClick={() => setAddType('drive')}
                  className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${addType === 'drive' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                >
                  Enlace Drive
                </button>
              </div>

              {addType === 'file' ? (
                <div className="text-center py-6">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Sube un archivo PDF directamente desde tu dispositivo.</p>
                  <button
                    onClick={() => {
                      setIsAddModalOpen(false);
                      triggerFileInput();
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-semibold transition-colors w-full"
                  >
                    Seleccionar Archivo
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre del documento</label>
                    <input
                      type="text"
                      value={driveName}
                      onChange={(e) => setDriveName(e.target.value)}
                      placeholder="Ej: Menú Especial"
                      className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Enlace de Google Drive (Archivo o Carpeta)</label>
                    <input
                      type="url"
                      value={driveLink}
                      onChange={(e) => setDriveLink(e.target.value)}
                      placeholder="https://drive.google.com/..."
                      className="w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Asegúrate de que el enlace tenga permisos de lectura ("Cualquier persona con el enlace").</p>
                  </div>
                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      onClick={() => setIsAddModalOpen(false)}
                      className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors font-medium"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleAddDriveLink}
                      disabled={!driveName.trim() || !driveLink.trim()}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Añadir Enlace
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EventsView;

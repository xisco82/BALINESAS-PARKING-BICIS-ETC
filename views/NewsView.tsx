import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import Header from '../components/Header';
import Modal from '../components/Modal';
import { NewsEvent } from '../types';
import { useToast } from '../components/Toast';
import { 
  getNewsEvents, 
  addNewsEvent, 
  deleteNewsEvent, 
  updateNewsEvent,
  deleteServiceBooking,
  getAllServiceBookings,
  getEventPdfs
} from '../services/firebaseService';
import { mergeEventSources } from '../services/eventSync';

type UserRole = 'editor' | 'balinese_editor';

interface NewsViewProps {
  isSignedIn: boolean;
  gapiError: string | null;
  dbError: string | null;
  isDbInitialized: boolean;
  isAuthReady: boolean;
  userRole: UserRole;
  onRetryAuth: () => void;
}

const formatDateToYYYYMMDD = (date: Date): string => {
  if (!date || isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const TEXT_COLORS = [
  { name: 'Predeterminado', value: '#5a4a3a' },
  { name: 'Rojo Oscuro', value: '#c00000' },
  { name: 'Azul', value: '#005a9c' },
  { name: 'Verde', value: '#4b8a08' },
  { name: 'Morado', value: '#5f27cd' },
];

const HIGHLIGHT_COLORS = [
  { name: 'Sin Resaltado', value: '#fdf5e6' },
  { name: 'Amarillo', value: '#fff2a8' },
  { name: 'Verde Claro', value: '#d4edda' },
  { name: 'Azul Claro', value: '#d1ecf1' },
  { name: 'Rojo Claro', value: '#f8d7da' },
];

const autoLink = (html: string) => {
  if (!html) return '';
  // Basic auto-linking regex: matches http://, https://, or www.
  // This one is simple and avoids complex lookbehinds for better compatibility, 
  // although it might occasionally match a URL already inside a tag if not careful.
  const urlRegex = /((https?:\/\/|www\.)[^\s<]+[^<.,:;"')\s])/g;
  
  return html.replace(urlRegex, (match) => {
    // If the match is already inside an anchor tag (e.g., as part of href or text), 
    // we should ideally skip it. A simple check for surrounding tags:
    const fullUrl = match.startsWith('www.') ? `http://${match}` : match;
    return `<a href="${fullUrl}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline; font-weight: mb-1; font-weight: bold;">${match}</a>`;
  });
};

const NewsView: React.FC<NewsViewProps> = ({ isSignedIn, gapiError, dbError, isDbInitialized, isAuthReady, userRole, onRetryAuth }) => {
  const { showToast, confirm } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<NewsEvent | null>(null);
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(formatDateToYYYYMMDD(new Date()));
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [monthlyEvents, setMonthlyEvents] = useState<NewsEvent[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, event: NewsEvent } | null>(null);
  
  // Notification Recipients States
  const [isRecipientModalOpen, setIsRecipientModalOpen] = useState(false);
  const [availableRecipients, setAvailableRecipients] = useState<string[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [isSendingNotification, setIsSendingNotification] = useState(false);
  const [notificationPayload, setNotificationPayload] = useState<{title: string, description: string} | null>(null);
  
  const displayDate = selectedDate;
  const hoveredDisplayDate = hoveredDate || selectedDate;

  const events = useMemo(() => {
      return monthlyEvents.filter(e => {
        return displayDate >= e.startDate && displayDate <= e.endDate;
      });
  }, [monthlyEvents, displayDate]);

  const editorRef = useRef<HTMLDivElement>(null);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleDayClick = (dateStr: string) => {
    setSelectedDate(dateStr);
  };

  const handleAddForDate = (e: React.MouseEvent, dateStr: string) => {
    e.stopPropagation();
    setSelectedDate(dateStr);
    setFormData({
        title: '',
        description: '',
        url: '',
        startDate: dateStr,
        endDate: dateStr,
    });
    setEditingEvent(null);
    setIsModalOpen(true);
  };

  const handleEventClick = (e: React.MouseEvent, event: NewsEvent, dateStr: string) => {
    e.stopPropagation();
    if (userRole !== 'editor') {
        setSelectedDate(dateStr);
        return;
    }
    setSelectedDate(dateStr);
    if (event.type === 'news') {
        handleOpenEditModal(event);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, event: NewsEvent) => {
    // Summary documents are managed from the "Eventos" tab.
    if (userRole !== 'editor' || event.type === 'document') return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      event
    });
  };

  const closeContextMenu = () => setContextMenu(null);

  useEffect(() => {
    const handleGlobalClick = () => closeContextMenu();
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const [toolbarState, setToolbarState] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikeThrough: false,
    fontName: 'Georgia',
    fontSize: '3',
    foreColor: '#5a4a3a',
    backColor: '#fdf5e6',
  });

  const initialFormState = useMemo(() => ({
    title: '',
    description: '',
    url: '',
    startDate: selectedDate,
    endDate: selectedDate,
  }), [selectedDate]);
  
  const [formData, setFormData] = useState(initialFormState);
  
  const rgbToHex = (rgb: string) => {
    if (!rgb || !rgb.startsWith('rgb')) return rgb; // Return as-is if it's not RGB (could be hex already)
    const result = rgb.match(/\d+/g)?.map(x => {
        const hex = parseInt(x).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    });
    return result ? `#${result.join('')}` : '#000000';
  };

  const updateToolbarState = useCallback(() => {
    setTimeout(() => {
      if (!editorRef.current) return;
      const foreColor = document.queryCommandValue('foreColor');
      const backColor = document.queryCommandValue('backColor');
      setToolbarState({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strikeThrough: document.queryCommandState('strikeThrough'),
        fontName: document.queryCommandValue('fontName').replace(/['"]/g, '') || 'Georgia',
        fontSize: document.queryCommandValue('fontSize') || '3',
        foreColor: rgbToHex(foreColor),
        backColor: rgbToHex(backColor),
      });
    }, 0);
  }, []);

  useEffect(() => {
    if (isModalOpen && editorRef.current) {
        if (editingEvent) {
            editorRef.current.innerHTML = editingEvent.description;
            setFormData(prev => ({...prev, description: editingEvent.description}));
        } else {
            editorRef.current.innerHTML = '';
        }
        updateToolbarState();
    }
  }, [isModalOpen, editingEvent, updateToolbarState]);

  useEffect(() => {
    if (!isAuthReady) return;
    setIsLoading(true);
    
    let newsEvents: NewsEvent[] = [];
    let serviceEvents: any[] = [];
    let pdfDocs: any[] = [];

    // Same merge used by "Eventos Anuales": annual events, summary documents and
    // novedades are combined so the same event never appears twice on a date.
    const updateCombinedEvents = () => {
      const allEvents: NewsEvent[] = mergeEventSources(serviceEvents, newsEvents, pdfDocs).map(e => ({
        id: e.id,
        title: e.title,
        description: e.description,
        startDate: e.startDate,
        endDate: e.endDate,
        url: e.url,
        pdfId: e.pdfId,
        pdfName: e.pdfName,
        type: e.source === 'service' ? 'event' as const : e.source === 'pdf' ? 'document' as const : 'news' as const,
      }));
      setMonthlyEvents(allEvents);
      setIsLoading(false);
    };

    const unsubscribeNews = getNewsEvents((allEvents) => {
      newsEvents = allEvents;
      updateCombinedEvents();
    });

    const unsubscribeServices = getAllServiceBookings('events_bookings', (bookings) => {
      serviceEvents = bookings;
      updateCombinedEvents();
    });

    const unsubscribePdfs = getEventPdfs((pdfs) => {
      pdfDocs = pdfs;
      updateCombinedEvents();
    });

    // Pre-fetch recipients for smoother modal opening
    const fetchRecipients = async () => {
      try {
        const response = await fetch('/api/recipients');
        if (response.ok) {
          const data = await response.json();
          setAvailableRecipients(data);
          setSelectedRecipients([]); // Start empty by default
        }
      } catch (e) {
        console.error("Failed to pre-fetch recipients", e);
      }
    };
    fetchRecipients();

    return () => {
      unsubscribeNews();
      unsubscribeServices();
      unsubscribePdfs();
    };
  }, [isAuthReady]);

  const calendarDays = useMemo(() => {
    const eventsByDate = new Map<string, NewsEvent[]>();
    if (monthlyEvents.length > 0) {
      monthlyEvents.forEach(event => {
        const start = new Date(event.startDate);
        const end = new Date(event.endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return;
        
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = formatDateToYYYYMMDD(d);
          if (!eventsByDate.has(dateStr)) {
            eventsByDate.set(dateStr, []);
          }
          eventsByDate.get(dateStr)!.push(event);
        }
      });
    }

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const startDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7;
    const daysInMonth = lastDayOfMonth.getDate();
    
    const days: any[] = [];
    for (let i = 0; i < startDayOfWeek; i++) {
        days.push({ key: `pad-start-${i}`, isEmpty: true });
    }
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dateStr = formatDateToYYYYMMDD(date);
        days.push({
            key: `day-${day}`,
            date,
            day,
            isToday: formatDateToYYYYMMDD(new Date()) === dateStr,
            isSelected: selectedDate === dateStr,
            events: eventsByDate.get(dateStr) || [],
        });
    }
    return days;
  }, [currentDate, selectedDate, monthlyEvents]);

  const monthlyUniqueEvents = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Filter events that overlap with the current month
    const filtered = monthlyEvents.filter(event => {
      const start = new Date(event.startDate);
      const end = new Date(event.endDate);
      return start <= lastDay && end >= firstDay;
    });

    // Sort by start date
    return filtered.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }, [monthlyEvents, currentDate]);

  const handleOpenAddModal = () => {
    setEditingEvent(null);
    setFormData(initialFormState);
    setIsModalOpen(true);
  };
  
  const handleOpenEditModal = (event: NewsEvent) => {
    setEditingEvent(event);
    const formatForInput = (date: string | Date): string => {
      // Handles date strings from the database (e.g., 'YYYY-MM-DDTHH:mm:ss.sssZ')
      // by simply taking the date part.
      if (typeof date === 'string') {
        return date.split('T')[0];
      }
      // If it's a JS Date object, format it to YYYY-MM-DD using local timezone parts
      // to avoid the off-by-one-day error caused by toISOString().
      if (date instanceof Date && !isNaN(date.getTime())) {
        return formatDateToYYYYMMDD(date);
      }
      return '';
    };
    setFormData({
        title: event.title,
        description: event.description,
        url: event.url || '',
        startDate: formatForInput(event.startDate),
        endDate: formatForInput(event.endDate),
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingEvent(null);
  };

  const handleSaveEvent = async () => {
      // Sync description from editor Ref one last time to ensure we have the latest content for mobile browsers
      let finalDescription = formData.description;
      if (editorRef.current) {
          finalDescription = editorRef.current.innerHTML;
      }
      
      const { title, url, startDate, endDate } = formData;
      const description = finalDescription;

      if (!title || !description || description === '<br>' || description === '<div><br></div>' || !startDate || !endDate) {
        showToast("Por favor, complete todos los campos.", "error");
        return;
      }
       if (new Date(startDate) > new Date(endDate)) {
            showToast('La fecha de inicio no puede ser posterior a la fecha de fin.', "error");
            return;
        }
      
      try {
        if (editingEvent) {
             await updateNewsEvent(editingEvent.id, { ...formData });
             showToast(`Novedad "${formData.title}" actualizada correctamente`, "success");
             handleCloseModal();
        } else {
            await addNewsEvent({ ...formData });
            showToast(`Novedad "${formData.title}" guardada correctamente`, "success");
            handleCloseModal();
            
            // Send notification via server to Apps Script
            try {
              const response = await fetch('/api/notifications/novedad', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                ...formData, 
                description: `${formData.description}\n\nREVISA LOS CAMBIOS EN ESTE ENLACE: https://balinesas-parking-bicis-etc.vercel.app/`,
                type: 'new_novedad' 
              })
              });
              if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                console.error("Notification trigger failed:", errData);
                showToast("Novedad guardada, pero la notificación falló. Revisa el script.", "warning");
              }
            } catch (e) {
              console.error("Notification fetch failed:", e);
              showToast("Novedad guardada, pero hubo un error de red con la notificación.", "warning");
            }
        }
      } catch (error: any) {
        console.error("Error saving event:", error);
        showToast(`No se pudo guardar la novedad: ${error.message}`, "error");
      }
  }
  
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSaveEvent();
  };

  const handleDeleteEvent = async (event: NewsEvent) => {
    const isEvent = event.type === 'event';
    const typeName = isEvent ? 'evento' : 'novedad';
    const confirmed = await confirm(`¿Seguro que quieres eliminar el ${typeName} "${event.title}"?`);
    if (confirmed) {
      try {
        if (isEvent) {
          await deleteServiceBooking('events_bookings', event.id);
        } else {
          await deleteNewsEvent(event.id);
        }
        showToast(`${typeName.charAt(0).toUpperCase() + typeName.slice(1)} "${event.title}" eliminado correctamente`, "success");
      } catch (error: any) {
        console.error(`Error deleting ${typeName}:`, error);
        showToast(`No se pudo eliminar el ${typeName}: ${error.message}`, "error");
      }
    }
  };
  
  const getHeaderTitle = () => {
    const monthName = currentDate.toLocaleString('es-ES', { month: 'long' });
    return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} novedades`;
  };
  
  const goToPreviousMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const goToNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  
  const handleOpenRecipientModal = async (payload?: {title: string, description: string}) => {
    // If we don't have recipients yet (rare), fetch them
    if (availableRecipients.length === 0) {
      try {
        const response = await fetch('/api/recipients');
        if (response.ok) {
          const data = await response.json();
          setAvailableRecipients(data);
          setSelectedRecipients(data);
        }
      } catch (e) {
        showToast("Error al obtener la lista de contactos", "error");
        return;
      }
    } else {
      // Keep recipients unselected by default as requested
      setSelectedRecipients([]);
    }
    
    setNotificationPayload(payload || null);
    setIsRecipientModalOpen(true);
  };

  const handleToggleRecipient = (email: string) => {
    setSelectedRecipients(prev => 
      prev.includes(email) ? prev.filter(r => r !== email) : [...prev, email]
    );
  };

  const handleOpenExternalMailClient = () => {
    if (selectedRecipients.length === 0) {
      showToast("Selecciona al menos un destinatario", "warning");
      return;
    }

    const payload = notificationPayload || { 
      title: "AVISO GENERAL", 
      description: "Notificación enviada manualmente desde el panel de novedades."
    };

    // Strip HTML for mailto body
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = payload.description;
    const plainTextDescription = tempDiv.textContent || tempDiv.innerText || "";
    
    // Construct mailto URL
    const recipients = selectedRecipients.join(';');
    const subject = encodeURIComponent(payload.title);
    const body = encodeURIComponent(plainTextDescription + "\n\nREVISA LOS CAMBIOS EN ESTE ENLACE: https://balinesas-parking-bicis-etc.vercel.app/");
    
    const mailtoUrl = `mailto:${recipients}?subject=${subject}&body=${body}`;
    window.location.href = mailtoUrl;
    
    setIsRecipientModalOpen(false);
    showToast("Abriendo cliente de correo...", "success");
  };

  const handleSendTargetedNotification = async () => {
    if (selectedRecipients.length === 0) {
      showToast("Selecciona al menos un destinatario", "warning");
      return;
    }

    setIsSendingNotification(true);
    try {
      const payload = notificationPayload || { 
        title: "AVISO GENERAL", 
        description: "Notificación enviada manualmente desde el panel de novedades."
      };

      const response = await fetch('/api/notifications/novedad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...payload,
          type: "new_novedad",
          recipients: selectedRecipients
        })
      });
      
      if (response.ok) {
        showToast(`Notificación enviada con éxito a ${selectedRecipients.length} destinatario(s)`, "success");
        setIsRecipientModalOpen(false);
      } else {
        const data = await response.json().catch(() => ({}));
        showToast(`Error: ${data.error || 'No se pudo enviar'}`, "error");
      }
    } catch (e: any) {
      showToast(`Error de conexión: ${e.message}`, "error");
    } finally {
      setIsSendingNotification(false);
    }
  };

  const handleSendDayNews = () => {
    if (events.length === 0) {
      showToast("No hay novedades para enviar en este día", "warning");
      return;
    }

    const dateStr = (() => {
        const [y, m, d] = displayDate.split('-').map(Number);
        return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
    })();

    const title = `NOVEDADES: ${dateStr}`;
    let description = `<p>Resumen de novedades para el día ${dateStr}:</p><ul>`;
    
    events.forEach(event => {
        description += `<li><strong>${event.title}</strong>: ${autoLink(event.description) || 'Sin descripción'}`;
        if (event.url) {
            description += ` <a href="${event.url}">[Ver Enlace]</a>`;
        }
        description += `</li>`;
    });
    
    description += `</ul><p>Consulta el panel completo en la aplicación.</p>`;

    handleOpenRecipientModal({ title, description });
  };

  const handleFormat = (command: string, value: string | null = null) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    updateToolbarState();
  };

  const handleInput = () => {
    if (editorRef.current) {
        setFormData(prev => ({ ...prev, description: editorRef.current.innerHTML }));
        updateToolbarState();
    }
  };

  const handleCopyEmail = async () => {
    // Logic removed
  };

  return (
    <div>
      <Header title="Novedades para todos los Departamentos">
        <div className="flex items-center space-x-2">
            {userRole === 'editor' && (
              <>
                <button
                  onClick={() => window.print()}
                  className="no-print bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 p-2 rounded-xl hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                  title="Imprimir"
                  aria-label="Imprimir calendario del mes"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                </button>
                <button onClick={handleOpenAddModal} className="no-print bg-amber-400 text-slate-950 px-4 py-2 rounded-xl font-bold hover:bg-amber-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2">
                    Añadir Novedad
                </button>
              </>
            )}
        </div>
      </Header>
      <div className="p-4 print:p-0 flex flex-col gap-6 print:gap-2">
        {/* Calendar */}
        <div className="w-full p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm h-fit print:p-2 print:mt-0">
            <div className="flex justify-between items-center mb-4 px-2 print:mb-2">
                <button onClick={goToPreviousMonth} className="no-print px-6 py-2 text-4xl font-bold rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">&lt;</button>
                <h2 className="text-2xl print:text-lg font-bold text-center">{getHeaderTitle()}</h2>
                <button onClick={goToNextMonth} className="no-print px-6 py-2 text-4xl font-bold rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">&gt;</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center font-semibold text-sm mb-2 print:mb-1 text-slate-600 dark:text-slate-300">
                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1 md:gap-2">
                {calendarDays.map(d => {
                    if (d.isEmpty) return <div key={d.key} className="h-24 rounded-xl"></div>;
                    
                    let dayClasses = "h-24 print:h-16 rounded-xl cursor-pointer flex flex-col items-start p-1.5 relative transition-colors duration-200 ";
                    if (d.isSelected) {
                        dayClasses += "bg-blue-200/70 dark:bg-blue-800/50 ring-2 ring-blue-500 ring-inset";
                    } else if (d.isToday) {
                        dayClasses += "bg-blue-100/60 dark:bg-blue-900/40";
                    } else {
                        dayClasses += "bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800";
                    }

                    return (
                        <div 
                            key={d.key} 
                            onClick={() => handleDayClick(formatDateToYYYYMMDD(d.date))} 
                            onMouseEnter={() => setHoveredDate(formatDateToYYYYMMDD(d.date))}
                            onMouseLeave={() => setHoveredDate(null)}
                            className={`${dayClasses} group relative`}
                        >
                            <div className="w-full flex justify-between items-start mb-0.5">
                                <span className={`font-semibold text-sm ${d.isSelected ? 'text-blue-800 dark:text-white' : 'text-slate-800 dark:text-slate-100'}`}>{d.day}</span>
                                {userRole === 'editor' && (
                                    <button 
                                        onClick={(e) => handleAddForDate(e, formatDateToYYYYMMDD(d.date))}
                                        className="opacity-0 group-hover:opacity-100 bg-amber-400 text-slate-950 p-0.5 rounded-full hover:bg-amber-300 transition-opacity shadow-sm z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
                                        title="Añadir novedad para este día"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                             <div className="w-full space-y-0.5 text-left overflow-hidden">
                                {d.events.slice(0, 2).map((event: NewsEvent) => (
                                    <div 
                                        key={event.id} 
                                        onClick={(e) => handleEventClick(e, event, formatDateToYYYYMMDD(d.date))}
                                        onContextMenu={(e) => handleContextMenu(e, event)}
                                        className={`text-xs text-black font-medium rounded px-1.5 py-0.5 truncate shadow-sm transition-transform hover:scale-[1.02] ${event.type === 'event' ? 'bg-purple-400' : event.type === 'document' ? 'bg-blue-300' : 'bg-rose-400 hover:bg-rose-300'}`}
                                        title={event.type === 'news' && userRole === 'editor' ? 'Clic para editar, clic derecho para eliminar' : ''}
                                    >
                                        {event.title}
                                    </div>
                                ))}
                                {d.events.length > 2 && (
                                    <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 pl-1">
                                        + {d.events.length - 2} más...
                                    </div>
                                )}
                            </div>
                            {userRole === 'editor' && (
                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block w-48 bg-slate-900 text-white text-xs rounded py-1 px-2 text-center z-50 shadow-lg pointer-events-none">
                                    Clic en el día para añadir novedad.<br/>Clic en la novedad para editarla.
                                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-slate-900"></div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>

        {/* Print only: All events of the month */}
        <div className="hidden print:block w-full mt-2">
            <h3 className="text-xl font-bold mb-2 border-b-2 border-slate-800 pb-1 text-center">
                Resumen de Novedades - {getHeaderTitle()}
            </h3>
            <div className="space-y-2">
                {monthlyUniqueEvents.length === 0 ? (
                    <p className="text-center italic text-slate-600">No hay novedades registradas para este mes.</p>
                ) : (
                    monthlyUniqueEvents.map(event => (
                        <div key={event.id} className="break-inside-avoid border-b border-slate-100 pb-1">
                            <div className="flex justify-between items-start mb-0.5">
                                <h4 className="font-bold text-base text-slate-900">{event.title}</h4>
                                <span className="text-xs font-medium text-slate-600">
                                    {new Date(event.startDate + 'T00:00:00Z').toLocaleDateString('es-ES')} 
                                    {event.startDate !== event.endDate ? ` - ${new Date(event.endDate + 'T00:00:00Z').toLocaleDateString('es-ES')}` : ''}
                                </span>
                            </div>
                            <div className="text-xs text-slate-800 leading-tight" dangerouslySetInnerHTML={{ __html: autoLink(event.description) }} />
                        </div>
                    ))
                )}
            </div>
        </div>

        {/* News for selected/hovered day (Hidden in print) */}
        <div className="no-print w-full flex flex-col space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h3 className="text-xl font-bold flex items-center gap-2">
                    Novedades para el {(() => {
                        const [y, m, day] = displayDate.split('-').map(Number);
                        return new Date(y, m - 1, day).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
                    })()}
                </h3>
                {userRole === 'editor' && events.length > 0 && (
                    <button 
                        onClick={handleSendDayNews}
                        className="flex items-center justify-center gap-2 bg-amber-100 text-amber-700 px-3 py-1.5 rounded-xl text-sm font-bold hover:bg-amber-200 transition-colors border border-amber-200"
                        title="Enviar estas novedades por correo"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        Enviar novedades de este día
                    </button>
                )}
            </div>
        {dbError && (
            <div className="bg-rose-100/80 dark:bg-rose-900/80 p-4 rounded-xl mb-4 border-l-4 border-rose-500">
                <p className="font-bold text-rose-700 dark:text-rose-200">Error de Conexión</p>
                <p className="text-rose-700 dark:text-rose-200 whitespace-pre-line">{dbError}</p>
                <button 
                    onClick={onRetryAuth} 
                    className="mt-3 bg-rose-600 text-white px-4 py-1 rounded-md text-sm font-bold hover:bg-rose-700 transition-colors"
                >
                    Reintentar Conexión
                </button>
            </div>
        )}
        {isLoading ? (
            <div className="text-center py-10 text-slate-500 dark:text-slate-400">Cargando...</div>
        ) : !dbError && events.length > 0 ? (
            <div className="flex flex-col space-y-4">
                {events.map(event => (
                    <div 
                        key={event.id} 
                        onClick={() => {
                            if (userRole === 'editor' && event.type === 'news') {
                                handleOpenEditModal(event);
                            }
                        }}
                        onContextMenu={(e) => handleContextMenu(e, event)}
                        className={`w-full bg-white dark:bg-slate-900 backdrop-blur-sm p-4 rounded-xl shadow-md relative animate-fade-in border-l-4 ${event.type === 'event' ? 'border-purple-500' : event.type === 'document' ? 'border-blue-500' : 'border-rose-500'} ${userRole === 'editor' && event.type === 'news' ? 'cursor-pointer hover:bg-white/100 dark:hover:bg-slate-700/90' : ''}`}
                    >
                        <h4 className="font-semibold text-lg text-slate-900 dark:text-slate-100 pr-24">{event.title}</h4>
                        <div className="text-sm text-black mt-2 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: autoLink(event.description) }} />
                        {event.pdfName && (
                          <p className="mt-2 text-xs font-semibold text-blue-700">
                            📄 Documento en Eventos → Resumen de eventos mensuales: {event.pdfName}
                          </p>
                        )}
                        
                        {/* Action buttons for individual news */}
                        <div className="absolute top-2 right-12 flex items-center space-x-1 no-print">
                           {userRole === 'editor' && (
                             <button 
                               onClick={(e) => {
                                 e.stopPropagation();
                                 const dateStr = new Date(event.startDate + 'T00:00:00Z').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
                                 handleOpenRecipientModal({
                                   title: `AVISO: ${event.title}`,
                                   description: `<p>Novedad publicada para el ${dateStr}:</p><p><strong>${event.title}</strong></p><div>${event.description}</div>`
                                 });
                               }}
                               className="p-1.5 bg-amber-50 text-amber-600 rounded-md hover:bg-amber-100 transition-colors border border-amber-200 shadow-sm"
                               title="Enviar esta novedad"
                             >
                               <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                               </svg>
                             </button>
                           )}
                        </div>
                        
                        {event.url && (
                          <div className="mt-3 no-print">
                            <a 
                              href={event.url} 
                              target="_blank" 
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-2 rounded-xl text-sm font-bold hover:bg-blue-100 transition-colors border border-blue-200"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              {event.url.includes('drive.google.com') ? 'Ver Documento' : 'Abrir Enlace'}
                            </a>
                            
                            {/* Optional: Embed preview for Google Drive links if they end in /preview */}
                            {event.url.includes('drive.google.com') && event.url.includes('/preview') && (
                              <div className="mt-3 rounded-xl overflow-hidden border border-slate-200 shadow-sm aspect-video">
                                <iframe 
                                  src={event.url} 
                                  className="w-full h-full" 
                                  allow="autoplay"
                                  title="Vista previa del documento"
                                ></iframe>
                              </div>
                            )}
                          </div>
                        )}

                        {userRole === 'editor' && event.type === 'news' && (
                          <div className="absolute top-2 right-2 flex items-center space-x-1 no-print">
                              <button onClick={(e) => { e.stopPropagation(); handleOpenEditModal(event); }} className="p-1"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg></button>
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteEvent(event); }} className="p-1"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
                          </div>
                        )}
                    </div>
                ))}
            </div>
        ) : (
           !dbError && <div className="text-center py-10 text-slate-800 dark:text-slate-200 bg-slate-50/90 dark:bg-slate-900 backdrop-blur-sm rounded-xl">No hay novedades registradas para esta fecha.</div>
        )}
        </div>
      </div>

       <Modal isOpen={isModalOpen} onClose={handleCloseModal} title="" maxWidth="max-w-6xl">
          <div className="old-paper-modal-content">
            <h3 className="text-xl font-bold text-center">{editingEvent ? "Editar Novedad" : "Escribir Novedad"}</h3>
            <form onSubmit={handleFormSubmit}>
                <div className="space-y-6">
                    <div className="space-y-2">
                        <label className="block text-sm font-bold text-amber-900">Título de la novedad</label>
                        <input type="text" placeholder="Título..." value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="paper-input" />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-bold text-amber-900">Enlace (Opcional - Google Drive, etc.)</label>
                        <input 
                            type="url" 
                            placeholder="https://drive.google.com/..." 
                            value={formData.url} 
                            onChange={(e) => setFormData({ ...formData, url: e.target.value })} 
                            className="paper-input" 
                        />
                        <p className="text-[10px] text-amber-700/60 italic">Si es un enlace de Google Drive, asegúrate de que termine en /preview para que se vea la vista previa.</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block mb-1 text-sm font-semibold">Desde:</label>
                            <input 
                                type="date" 
                                value={formData.startDate} 
                                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                                className="paper-input"
                            />
                        </div>
                        <div>
                            <label className="block mb-1 text-sm font-semibold">Hasta:</label>
                            <input 
                                type="date" 
                                value={formData.endDate}
                                min={formData.startDate}
                                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                                className="paper-input"
                            />
                        </div>
                    </div>

                    <div className="editor-toolbar">
                      <select value={toolbarState.fontName} onChange={(e) => handleFormat('fontName', e.target.value)} className="toolbar-select" title="Fuente">
                          <option value="Georgia">Georgia</option>
                          <option value="Arial">Arial</option>
                          <option value="Verdana">Verdana</option>
                          <option value="Courier New">Courier</option>
                      </select>
                      <select value={toolbarState.fontSize} onChange={(e) => handleFormat('fontSize', e.target.value)} className="toolbar-select" title="Tamaño">
                          <option value="3">Normal</option>
                          <option value="5">Grande</option>
                          <option value="7">Muy Grande</option>
                      </select>
                      <div className="toolbar-separator"></div>
                      <button type="button" onClick={() => handleFormat('bold')} className={`toolbar-button ${toolbarState.bold ? 'active' : ''}`} title="Negrita"><b>B</b></button>
                      <button type="button" onClick={() => handleFormat('italic')} className={`toolbar-button ${toolbarState.italic ? 'active' : ''}`} title="Cursiva"><i>I</i></button>
                      <button type="button" onClick={() => handleFormat('underline')} className={`toolbar-button ${toolbarState.underline ? 'active' : ''}`} title="Subrayado"><u>U</u></button>
                      <button type="button" onClick={() => handleFormat('strikeThrough')} className={`toolbar-button ${toolbarState.strikeThrough ? 'active' : ''}`} title="Tachado"><span style={{textDecoration:'line-through'}}>S</span></button>
                      <div className="toolbar-separator"></div>
                      
                      <div className="color-palette" title="Color de Texto">
                        {TEXT_COLORS.map(color => (
                          <button
                            key={color.value}
                            type="button"
                            className={`color-swatch ${toolbarState.foreColor === color.value ? 'active' : ''}`}
                            style={{ backgroundColor: color.value }}
                            onClick={() => handleFormat('foreColor', color.value)}
                            title={color.name}
                          />
                        ))}
                      </div>

                      <div className="toolbar-separator"></div>

                      <div className="color-palette" title="Color de Resaltado">
                        {HIGHLIGHT_COLORS.map(color => (
                          <button
                            key={color.value}
                            type="button"
                            className={`color-swatch ${toolbarState.backColor === color.value ? 'active' : ''}`}
                            style={{ backgroundColor: color.value }}
                            onClick={() => handleFormat('hiliteColor', color.value)}
                            title={color.name}
                          />
                        ))}
                      </div>
                    </div>

                    <div
                      ref={editorRef}
                      onInput={handleInput}
                      onMouseUp={updateToolbarState}
                      onKeyUp={updateToolbarState}
                      contentEditable="true"
                      className="paper-textarea"
                      style={{ minHeight: '10rem', maxHeight: '40vh', overflowY: 'auto' }}
                      aria-label="Contenido de la novedad"
                    ></div>

                    <div className="pb-8">
                      <button type="submit" className="w-full paper-button">
                          {editingEvent ? 'Guardar Cambios' : 'Guardar Novedad'}
                      </button>
                    </div>
                </div>
            </form>
          </div>
        </Modal>

        {/* Recipient Selection Modal */}
        <Modal 
          isOpen={isRecipientModalOpen} 
          onClose={() => setIsRecipientModalOpen(false)} 
          title="Preparar Envío de Notificación"
          maxWidth="max-w-3xl"
        >
          <div className="p-0 flex flex-col md:flex-row h-[70vh] md:h-auto overflow-hidden">
            {/* Left side: Preview */}
            <div className="flex-1 p-6 bg-amber-50/50 dark:bg-amber-900/10 border-b md:border-b-0 md:border-r border-amber-100 dark:border-amber-900/30 overflow-y-auto">
              <h4 className="text-xs font-bold text-amber-600 dark:text-amber-500 uppercase tracking-widest mb-4">Vista Previa</h4>
              <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-amber-200/50 dark:border-amber-900/20">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                  {notificationPayload?.title || "AVISO GENERAL"}
                </h2>
                <div 
                  className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed prose dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ 
                    __html: autoLink(notificationPayload?.description) || "Notificación enviada manualmente desde el panel de novedades." 
                  }}
                />
                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 font-mono italic">
                  Este mensaje se enviará a los destinatarios seleccionados.
                </div>
              </div>
            </div>

            {/* Right side: Recipients */}
            <div className="w-full md:w-[320px] p-6 flex flex-col bg-white dark:bg-slate-800">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Destinatarios</h4>
              
              <div className="flex justify-between items-center mb-4">
                <span className="text-xs text-slate-500">{selectedRecipients.length} seleccionados</span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setSelectedRecipients(availableRecipients)}
                    className="text-[10px] font-bold text-blue-600 hover:bg-blue-50 px-2 py-0.5 rounded"
                  >
                    Todos
                  </button>
                  <button 
                    onClick={() => setSelectedRecipients([])}
                    className="text-[10px] font-bold text-rose-600 hover:bg-rose-50 px-2 py-0.5 rounded"
                  >
                    Ninguno
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-1 mb-6 max-h-[300px]">
                {availableRecipients.map(email => (
                  <label 
                    key={email} 
                    className={`flex items-center p-2 rounded-xl cursor-pointer transition-colors ${selectedRecipients.includes(email) ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                  >
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-amber-200 dark:focus:ring-amber-500/30 mr-3"
                      checked={selectedRecipients.includes(email)}
                      onChange={() => handleToggleRecipient(email)}
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-200 truncate">{email}</span>
                  </label>
                ))}
              </div>

              <div className="space-y-3">
                <button 
                  onClick={handleSendTargetedNotification}
                  disabled={isSendingNotification || selectedRecipients.length === 0}
                  className={`w-full py-3 bg-amber-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-amber-500/20 hover:bg-amber-600 transition-all active:scale-95 flex items-center justify-center gap-2 ${isSendingNotification ? 'opacity-70' : ''}`}
                >
                  {isSendingNotification ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      Envío Automático (Apps Script)
                    </>
                  )}
                </button>

                <button 
                  onClick={handleOpenExternalMailClient}
                  disabled={selectedRecipients.length === 0}
                  className="w-full py-3 bg-amber-400 text-slate-950 rounded-xl text-sm font-bold shadow-lg shadow-amber-500/10 hover:bg-amber-300 transition-all active:scale-95 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Abrir en Outlook / Gmail
                </button>

                <button 
                  onClick={() => setIsRecipientModalOpen(false)}
                  className="w-full py-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </Modal>
       
      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="fixed z-[100] bg-white dark:bg-slate-800 shadow-xl rounded-xl border border-slate-200 dark:border-slate-700 py-1 min-w-[180px] animate-fade-in"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700 mb-1">
            Opciones
          </div>
          {contextMenu.event.type === 'news' && (
            <button 
              onClick={() => {
                handleOpenEditModal(contextMenu.event);
                closeContextMenu();
              }}
              className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Editar Novedad
            </button>
          )}
          <button 
            onClick={() => {
              handleDeleteEvent(contextMenu.event);
              closeContextMenu();
            }}
            className="w-full text-left px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 flex items-center transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Eliminar {contextMenu.event.type === 'event' ? 'Evento' : 'Novedad'}
          </button>
          <div className="border-t border-slate-100 dark:border-slate-700 mt-1">
            <button 
              onClick={closeContextMenu}
              className="w-full text-left px-4 py-2 text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewsView;
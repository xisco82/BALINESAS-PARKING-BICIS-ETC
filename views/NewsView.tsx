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
  getEmailRecipients,
  getAllServiceBookings,
  sendManualNotification
} from '../services/firebaseService';

type UserRole = 'editor' | 'balinese_editor';

interface EmailRecipient {
  id: string;
  department: string;
  email: string;
}

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

const NewsView: React.FC<NewsViewProps> = ({ isSignedIn, gapiError, dbError, isDbInitialized, isAuthReady, userRole, onRetryAuth }) => {
  const { showToast, confirm } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<NewsEvent | null>(null);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isNewsSelectionModalOpen, setIsNewsSelectionModalOpen] = useState(false);
  const [selectedNewsIds, setSelectedNewsIds] = useState<Set<string>>(new Set());
  const [emailContent, setEmailContent] = useState({ subject: '', bodyPlainText: '', bodyHtml: '' });
  const [emailRecipients, setEmailRecipients] = useState<EmailRecipient[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [isFetchingRecipients, setIsFetchingRecipients] = useState(false);
  const [copyButtonText, setCopyButtonText] = useState('Copiar Correo');
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(formatDateToYYYYMMDD(new Date()));
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [monthlyEvents, setMonthlyEvents] = useState<NewsEvent[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, event: NewsEvent } | null>(null);
  
  const displayDate = hoveredDate || selectedDate;

  const events = useMemo(() => {
      return monthlyEvents.filter(e => {
        const start = new Date(e.startDate);
        const end = new Date(e.endDate);
        const current = new Date(displayDate);
        return current >= start && current <= end;
      });
  }, [monthlyEvents, displayDate]);

  const editorRef = useRef<HTMLDivElement>(null);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleDayClick = (dateStr: string) => {
    if (userRole !== 'editor') {
        setSelectedDate(dateStr);
        return;
    }
    setSelectedDate(dateStr);
    setFormData({
        title: '',
        description: '',
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
    if (event.type !== 'event') {
        handleOpenEditModal(event);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, event: NewsEvent) => {
    if (userRole !== 'editor') return;
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
    let serviceEvents: NewsEvent[] = [];

    const updateCombinedEvents = () => {
      const allEvents = [...newsEvents, ...serviceEvents];
      setMonthlyEvents(allEvents);
      setIsLoading(false);
    };

    const unsubscribeNews = getNewsEvents((allEvents) => {
      newsEvents = allEvents.map(e => ({ ...e, type: 'news' as const }));
      updateCombinedEvents();
    });

    const unsubscribeServices = getAllServiceBookings('events_bookings', (bookings) => {
      serviceEvents = bookings.map(b => ({
        id: b.id,
        title: b.guestName,
        description: b.description,
        startDate: b.startDate,
        endDate: b.endDate,
        type: 'event' as const
      }));
      updateCombinedEvents();
    });

    return () => {
      unsubscribeNews();
      unsubscribeServices();
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
      const { title, description, startDate, endDate } = formData;
      if (!title || !description || !startDate || !endDate) {
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
        } else {
            await addNewsEvent({ ...formData });
            showToast(`Novedad "${formData.title}" guardada correctamente`, "success");
        }
      } catch (error: any) {
        console.error("Error saving event:", error);
        showToast(`No se pudo guardar la novedad: ${error.message}`, "error");
      }
      handleCloseModal();
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
  
  const handlePrepareEmailNotification = async (eventsToNotify: NewsEvent[]) => {
    setIsEmailModalOpen(true);
    setCopyButtonText('Copiar Correo');
    setIsFetchingRecipients(true);
    setSelectedRecipients([]);

    try {
        const recipientsResult = await getEmailRecipients();
        setEmailRecipients(recipientsResult as any);
    } catch (error) {
        console.error("Error fetching email recipients:", error);
        showToast("No se pudieron cargar los destinatarios de la base de datos.", "error");
    } finally {
        setIsFetchingRecipients(false);
    }
    
    const date = new Date(selectedDate + 'T00:00:00Z');
    const formattedDate = date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    
    const subject = eventsToNotify.length === 1 
        ? `Novedad: ${eventsToNotify[0].title}`
        : `Novedades del ${formattedDate}`;
    
    const bodyPlainText = eventsToNotify.map(event => {
        const title = `*${event.title}*`;
        const description = event.description
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n')
          .replace(/<[^>]*>?/gm, '');
        return `${title}\n${description}`;
    }).join('\n\n---\n\n');

    const bodyHtml = eventsToNotify.map(event => {
        return `
            <h4 style="font-family: Georgia, serif; color: #8B4513; border-bottom: 1px solid #cdab7d; padding-bottom: 5px; margin-top: 15px; margin-bottom: 10px;">
                ${event.title}
            </h4>
            <div style="font-family: Georgia, serif; color: #5a4a3a; line-height: 1.6;">
                ${event.description}
            </div>
        `;
    }).join('');

    setEmailContent({ subject, bodyPlainText, bodyHtml });
  };
  
  const handleOpenEmailModal = () => {
    if (events.length === 0) {
      showToast("No hay novedades para notificar en la fecha seleccionada.", "info");
      return;
    }

    if (events.length > 1) {
        // Pre-select all events when opening the selection modal
        setSelectedNewsIds(new Set(events.map(e => e.id)));
        setIsNewsSelectionModalOpen(true);
    } else {
        // If only one event, proceed directly to preparing the email
        handlePrepareEmailNotification(events);
    }
  };
  
  const handleProceedWithSelection = () => {
    const selectedEvents = events.filter(event => selectedNewsIds.has(event.id));
    if (selectedEvents.length === 0) {
        showToast('Por favor, seleccione al menos una novedad para continuar.', "error");
        return;
    }
    setIsNewsSelectionModalOpen(false);
    handlePrepareEmailNotification(selectedEvents);
  };

  const handleNewsSelectionChange = (eventId: string) => {
    setSelectedNewsIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(eventId)) {
            newSet.delete(eventId);
        } else {
            newSet.add(eventId);
        }
        return newSet;
    });
  };

  const handleSelectAllNews = (isChecked: boolean) => {
    if (isChecked) {
        setSelectedNewsIds(new Set(events.map(e => e.id)));
    } else {
        setSelectedNewsIds(new Set());
    }
  };

  const handleSendScriptNotification = async () => {
    const selectedEvents = events.filter(event => selectedNewsIds.has(event.id));
    if (selectedEvents.length === 0) return;
    
    setIsSendingScript(true);
    try {
      const success = await sendManualNotification(selectedEvents);
      if (success) {
        showToast("Notificación automática enviada correctamente.", "success");
      } else {
        showToast("Error al enviar la notificación automática.", "error");
      }
    } catch (error) {
      console.error("Error sending script notification:", error);
      showToast("Error al enviar la notificación automática.", "error");
    } finally {
      setIsSendingScript(false);
    }
  };

  const handleSendMailto = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedRecipients.length === 0) {
        showToast("Por favor, seleccione al menos un destinatario.", "error");
        return;
    }
    const to = selectedRecipients.join(';');
    const { subject, bodyPlainText } = emailContent;
    const mailtoLink = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyPlainText)}`;
    window.location.href = mailtoLink;
    setIsEmailModalOpen(false);
  };
  
  const [isSendingScript, setIsSendingScript] = useState(false);
  
  const goToPreviousMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const goToNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

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
    if (!emailContent.bodyHtml) return;
    try {
        const htmlBlob = new Blob([emailContent.bodyHtml], { type: 'text/html' });
        const textBlob = new Blob([emailContent.bodyPlainText], { type: 'text/plain' });
        const data = [new ClipboardItem({
            'text/html': htmlBlob,
            'text/plain': textBlob,
        })];

        await navigator.clipboard.write(data);
        
        showToast('Contenido copiado al portapapeles', 'success');
        setCopyButtonText('¡Copiado!');
        setTimeout(() => setCopyButtonText('Copiar Correo'), 2000);
    } catch (error) {
        console.error("Error copying to clipboard:", error);
        showToast('No se pudo copiar el contenido. Por favor, cópielo manualmente (Ctrl+C).', 'error');
        setCopyButtonText('Error al copiar');
        setTimeout(() => setCopyButtonText('Copiar Correo'), 2000);
    }
  };

  return (
    <div>
      <Header title="Novedades para todos los Departamentos">
        <div className="flex items-center space-x-2">
            {userRole === 'editor' && (
              <>
                <button
                  onClick={() => window.print()}
                  className="no-print bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 p-2 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  title="Imprimir"
                  aria-label="Imprimir calendario del mes"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                </button>
                <button 
                  onClick={handleOpenEmailModal} 
                  className="no-print bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                  </svg>
                  Notificar
                </button>
                <button onClick={handleOpenAddModal} className="no-print bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
                    Añadir Novedad
                </button>
              </>
            )}
        </div>
      </Header>
      <div className="p-4 flex flex-col gap-6">
        {/* Calendar */}
        <div className="w-full p-4 bg-white/20 dark:bg-gray-800/20 backdrop-blur-md rounded-xl shadow-sm h-fit">
            <div className="flex justify-between items-center mb-4 px-2">
                <button onClick={goToPreviousMonth} className="no-print px-6 py-2 text-4xl font-bold rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">&lt;</button>
                <h2 className="text-2xl font-bold text-center">{getHeaderTitle()}</h2>
                <button onClick={goToNextMonth} className="no-print px-6 py-2 text-4xl font-bold rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">&gt;</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center font-semibold text-sm mb-2 text-gray-600 dark:text-gray-300">
                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1 md:gap-2">
                {calendarDays.map(d => {
                    if (d.isEmpty) return <div key={d.key} className="h-24 rounded-lg"></div>;
                    
                    let dayClasses = "h-24 rounded-lg cursor-pointer flex flex-col items-start p-1.5 relative transition-colors duration-200 ";
                    if (d.isSelected) {
                        dayClasses += "bg-blue-200/70 dark:bg-blue-800/50 ring-2 ring-blue-500 ring-inset";
                    } else if (d.isToday) {
                        dayClasses += "bg-blue-100/60 dark:bg-blue-900/40";
                    } else {
                        dayClasses += "bg-white/10 dark:bg-gray-800/10 hover:bg-gray-200/40 dark:hover:bg-gray-700/40";
                    }

                    return (
                        <div 
                            key={d.key} 
                            onClick={() => handleDayClick(formatDateToYYYYMMDD(d.date))} 
                            onMouseEnter={() => setHoveredDate(formatDateToYYYYMMDD(d.date))}
                            onMouseLeave={() => setHoveredDate(null)}
                            onContextMenu={(e) => {
                                if (userRole === 'editor') {
                                    e.preventDefault();
                                    // No context menu for the day itself, just for events
                                }
                            }}
                            className={`${dayClasses} group`}
                        >
                            <span className={`font-semibold mb-1 text-sm ${d.isSelected ? 'text-blue-800 dark:text-white' : 'text-gray-800 dark:text-gray-100'}`}>{d.day}</span>
                             <div className="w-full space-y-0.5 text-left">
                                {d.events.slice(0, 2).map((event: NewsEvent) => (
                                    <div 
                                        key={event.id} 
                                        onClick={(e) => handleEventClick(e, event, formatDateToYYYYMMDD(d.date))}
                                        onContextMenu={(e) => handleContextMenu(e, event)}
                                        className={`text-xs text-black font-medium rounded px-1.5 py-0.5 truncate shadow-sm transition-transform hover:scale-[1.02] ${event.type === 'event' ? 'bg-purple-400' : 'bg-red-400 hover:bg-red-300'}`}
                                        title={event.type !== 'event' && userRole === 'editor' ? 'Clic para editar, clic derecho para eliminar' : ''}
                                    >
                                        {event.title}
                                    </div>
                                ))}
                                {d.events.length > 2 && (
                                    <div className="text-[11px] text-gray-600 dark:text-gray-400 mt-1 pl-1">
                                        + {d.events.length - 2} más...
                                    </div>
                                )}
                            </div>
                            {userRole === 'editor' && (
                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block w-48 bg-gray-900 text-white text-xs rounded py-1 px-2 text-center z-50 shadow-lg pointer-events-none">
                                    Clic en el día para añadir novedad.<br/>Clic en la novedad para editarla.
                                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>

        {/* News for selected/hovered day */}
        <div className="w-full flex flex-col space-y-4">
            <h3 className="text-xl font-bold">Novedades para el {new Date(displayDate + 'T00:00:00Z').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}</h3>
        {dbError && (
            <div className="bg-red-100/80 dark:bg-red-900/80 p-4 rounded-lg mb-4 border-l-4 border-red-500">
                <p className="font-bold text-red-700 dark:text-red-200">Error de Conexión</p>
                <p className="text-red-700 dark:text-red-200 whitespace-pre-line">{dbError}</p>
                <button 
                    onClick={onRetryAuth} 
                    className="mt-3 bg-red-600 text-white px-4 py-1 rounded-md text-sm font-bold hover:bg-red-700 transition-colors"
                >
                    Reintentar Conexión
                </button>
            </div>
        )}
        {isLoading ? (
            <div className="text-center py-10 text-gray-500 dark:text-gray-400">Cargando...</div>
        ) : !dbError && events.length > 0 ? (
            <div className="flex flex-col space-y-4">
                {events.map(event => (
                    <div 
                        key={event.id} 
                        onClick={() => {
                            if (userRole === 'editor' && event.type !== 'event') {
                                handleOpenEditModal(event);
                            }
                        }}
                        onContextMenu={(e) => handleContextMenu(e, event)}
                        className={`w-full bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm p-4 rounded-xl shadow-md relative animate-fade-in border-l-4 ${event.type === 'event' ? 'border-purple-500' : 'border-red-500'} ${userRole === 'editor' && event.type !== 'event' ? 'cursor-pointer hover:bg-white/100 dark:hover:bg-gray-700/90' : ''}`}
                    >
                        <h4 className="font-semibold text-lg text-gray-900 dark:text-gray-100 pr-16">{event.title}</h4>
                        <div className="text-sm text-black mt-2 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: event.description }} />
                        {userRole === 'editor' && event.type !== 'event' && (
                          <div className="absolute top-2 right-2 flex items-center space-x-1 no-print">
                              <button onClick={(e) => { e.stopPropagation(); handleOpenEditModal(event); }} className="p-1"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg></button>
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteEvent(event); }} className="p-1"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
                          </div>
                        )}
                    </div>
                ))}
            </div>
        ) : (
           !dbError && <div className="text-center py-10 text-gray-800 dark:text-gray-200 bg-gray-50/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg">No hay novedades registradas para esta fecha.</div>
        )}
        </div>
      </div>

       <Modal isOpen={isModalOpen} onClose={handleCloseModal} title="" maxWidth="max-w-6xl">
          <div className="old-paper-modal-content">
            <h3 className="text-xl font-bold text-center">{editingEvent ? "Editar Novedad" : "Escribir Novedad"}</h3>
            <form onSubmit={handleFormSubmit}>
                <div className="space-y-6">
                    <input type="text" placeholder="Título..." value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="paper-input" required />
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block mb-1 text-sm font-semibold">Desde:</label>
                            <input 
                                type="date" 
                                value={formData.startDate} 
                                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                                className="paper-input"
                                required
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
                                required
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
                      style={{ minHeight: '15rem', maxHeight: '50vh', overflowY: 'auto' }}
                      aria-label="Contenido de la novedad"
                    ></div>

                    <button type="submit" className="w-full paper-button">
                        {editingEvent ? 'Guardar Cambios' : 'Guardar Novedad'}
                    </button>
                </div>
            </form>
          </div>
       </Modal>
       
       <Modal isOpen={isNewsSelectionModalOpen} onClose={() => setIsNewsSelectionModalOpen(false)} title="Seleccionar Novedades a Notificar">
            <div className="space-y-4">
                <div className="border-b pb-2 mb-2">
                    <label className="flex items-center space-x-2 font-semibold cursor-pointer">
                        <input
                            type="checkbox"
                            className="h-5 w-5 rounded"
                            checked={selectedNewsIds.size === events.length}
                            onChange={(e) => handleSelectAllNews(e.target.checked)}
                        />
                        <span>Seleccionar Todas</span>
                    </label>
                </div>
                <div className="max-h-60 overflow-y-auto space-y-2">
                    {events.map(event => (
                        <div key={event.id}>
                            <label className="flex items-center space-x-2 cursor-pointer p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">
                                <input
                                    type="checkbox"
                                    className="h-5 w-5 rounded"
                                    checked={selectedNewsIds.has(event.id)}
                                    onChange={() => handleNewsSelectionChange(event.id)}
                                />
                                <span className="text-gray-800 dark:text-gray-200">{event.title}</span>
                            </label>
                        </div>
                    ))}
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                    <button
                        onClick={() => setIsNewsSelectionModalOpen(false)}
                        className="px-4 py-2 rounded-lg font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleProceedWithSelection}
                        disabled={selectedNewsIds.size === 0}
                        className="px-4 py-2 rounded-lg font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                        Continuar
                    </button>
                </div>
            </div>
        </Modal>

       <Modal isOpen={isEmailModalOpen} onClose={() => setIsEmailModalOpen(false)} title="Preparar Notificación por Email">
            <form onSubmit={handleSendMailto}>
                <div className="space-y-4">
                    <div>
                        <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Destinatarios</label>
                        {isFetchingRecipients ? (
                            <div className="text-center p-4">Cargando...</div>
                        ) : (
                            <div className="mt-2 p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg border border-gray-300 dark:border-gray-600 max-h-48 overflow-y-auto">
                                <div className="flex items-center border-b pb-2 mb-2"><input type="checkbox" id="select-all" onChange={(e) => setSelectedRecipients(e.target.checked ? emailRecipients.map(r => r.email) : [])} className="h-4 w-4" /><label htmlFor="select-all" className="ml-2 font-semibold">Seleccionar Todos</label></div>
                                {emailRecipients.map(r => <div key={r.id} className="py-1"><input type="checkbox" id={`r-${r.id}`} value={r.email} checked={selectedRecipients.includes(r.email)} onChange={(e) => setSelectedRecipients(p => e.target.checked ? [...p, r.email] : p.filter(em => em !== r.email))} className="h-4 w-4" /><label htmlFor={`r-${r.id}`} className="ml-2">{r.department}</label></div>)}
                            </div>
                        )}
                    </div>
                     <div>
                        <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Asunto</label>
                        <input type="text" value={emailContent.subject} onChange={(e) => setEmailContent({ ...emailContent, subject: e.target.value })} className="w-full p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg border border-gray-300 dark:border-gray-600" required />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Contenido del Correo</label>
                        <div className="mt-1 p-2 flex justify-between items-center text-sm bg-yellow-100/80 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200 rounded-md">
                           <p><strong>Importante:</strong> Para conservar el formato, copie este contenido.</p>
                           <button
                                type="button"
                                onClick={handleCopyEmail}
                                className="bg-yellow-700 text-white px-3 py-1 rounded-md text-xs font-bold hover:bg-yellow-800 transition-colors flex-shrink-0"
                            >
                                {copyButtonText}
                            </button>
                        </div>
                        <div
                          className="mt-2 w-full p-4 bg-white dark:bg-gray-100 rounded-lg border border-gray-300 dark:border-gray-600 min-h-[200px] max-h-60 overflow-y-auto"
                          dangerouslySetInnerHTML={{ __html: emailContent.bodyHtml }}
                        />
                    </div>
                    <div className="flex flex-col space-y-3">
                        <button type="submit" className="w-full bg-green-600 text-white p-3 rounded-lg font-semibold hover:bg-green-700 flex items-center justify-center transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                            </svg>
                            Abrir Cliente de Correo
                        </button>
                    </div>
                </div>
            </form>
       </Modal>
      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="fixed z-[100] bg-white dark:bg-gray-800 shadow-xl rounded-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[180px] animate-fade-in"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700 mb-1">
            Opciones
          </div>
          {contextMenu.event.type !== 'event' && (
            <button 
              onClick={() => {
                handleOpenEditModal(contextMenu.event);
                closeContextMenu();
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center transition-colors"
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
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Eliminar {contextMenu.event.type === 'event' ? 'Evento' : 'Novedad'}
          </button>
          <div className="border-t border-gray-100 dark:border-gray-700 mt-1">
            <button 
              onClick={closeContextMenu}
              className="w-full text-left px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center transition-colors"
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
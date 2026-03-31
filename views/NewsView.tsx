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
  getAllServiceBookings
} from '../services/firebaseService';

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
            
            // Send notification via server to Apps Script
            try {
              const response = await fetch('/api/notifications/novedad', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...formData, type: 'new_novedad' })
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
                  className="no-print bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 p-2 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  title="Imprimir"
                  aria-label="Imprimir calendario del mes"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                </button>
                <button
                  onClick={async () => {
                    const confirmed = await confirm("¿Quieres enviar una notificación de prueba?");
                    if (!confirmed) return;
                    try {
                      const response = await fetch('/api/notifications/novedad', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title: "TEST", description: "Prueba de notificación", type: "new_novedad" })
                      });
                      const data = await response.json();
                      if (response.ok) {
                        showToast("Notificación de prueba enviada con éxito", "success");
                      } else {
                        showToast(`Error: ${data.error || 'Fallo desconocido'}`, "error");
                      }
                    } catch (e: any) {
                      showToast(`Error de red: ${e.message}`, "error");
                    }
                  }}
                  className="no-print bg-amber-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-amber-600 transition-colors"
                  title="Probar Notificación"
                >
                  Probar Notificación
                </button>
                <button onClick={handleOpenAddModal} className="no-print bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
                    Añadir Novedad
                </button>
              </>
            )}
        </div>
      </Header>
      <div className="p-4 print:p-0 flex flex-col gap-6 print:gap-2">
        {/* Calendar */}
        <div className="w-full p-4 bg-white/20 dark:bg-gray-800/20 backdrop-blur-md rounded-xl shadow-sm h-fit print:p-2 print:mt-0">
            <div className="flex justify-between items-center mb-4 px-2 print:mb-2">
                <button onClick={goToPreviousMonth} className="no-print px-6 py-2 text-4xl font-bold rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">&lt;</button>
                <h2 className="text-2xl print:text-lg font-bold text-center">{getHeaderTitle()}</h2>
                <button onClick={goToNextMonth} className="no-print px-6 py-2 text-4xl font-bold rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">&gt;</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center font-semibold text-sm mb-2 print:mb-1 text-gray-600 dark:text-gray-300">
                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1 md:gap-2">
                {calendarDays.map(d => {
                    if (d.isEmpty) return <div key={d.key} className="h-24 rounded-lg"></div>;
                    
                    let dayClasses = "h-24 print:h-16 rounded-lg cursor-pointer flex flex-col items-start p-1.5 relative transition-colors duration-200 ";
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

        {/* Print only: All events of the month */}
        <div className="hidden print:block w-full mt-2">
            <h3 className="text-xl font-bold mb-2 border-b-2 border-gray-800 pb-1 text-center">
                Resumen de Novedades - {getHeaderTitle()}
            </h3>
            <div className="space-y-2">
                {monthlyUniqueEvents.length === 0 ? (
                    <p className="text-center italic text-gray-600">No hay novedades registradas para este mes.</p>
                ) : (
                    monthlyUniqueEvents.map(event => (
                        <div key={event.id} className="break-inside-avoid border-b border-gray-100 pb-1">
                            <div className="flex justify-between items-start mb-0.5">
                                <h4 className="font-bold text-base text-gray-900">{event.title}</h4>
                                <span className="text-xs font-medium text-gray-600">
                                    {new Date(event.startDate + 'T00:00:00Z').toLocaleDateString('es-ES')} 
                                    {event.startDate !== event.endDate ? ` - ${new Date(event.endDate + 'T00:00:00Z').toLocaleDateString('es-ES')}` : ''}
                                </span>
                            </div>
                            <div className="text-xs text-gray-800 leading-tight" dangerouslySetInnerHTML={{ __html: event.description }} />
                        </div>
                    ))
                )}
            </div>
        </div>

        {/* News for selected/hovered day (Hidden in print) */}
        <div className="no-print w-full flex flex-col space-y-4">
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

import React, { useState, useEffect, useCallback } from 'react';
import { RestaurantBooking } from '../types';
import Header from '../components/Header';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import { 
  getServiceBookings, 
  getAllServiceBookings,
  addServiceBooking, 
  deleteServiceBooking, 
  updateServiceBooking,
  toggleServiceBookingCheckIn,
  getNewsEvents,
  getEventPdfs
} from '../services/firebaseService';
import ExtraFBSection from '../components/ExtraFBSection';

type UserRole = 'editor' | 'balinese_editor';

interface ServicesViewProps {
  dbError: string | null;
  isDbInitialized: boolean;
  isAuthReady: boolean;
  userRole: UserRole;
  title: string;
  tableName: string;
  onRetryAuth: () => void;
  hideHeader?: boolean;
}

const ServicesView: React.FC<ServicesViewProps> = ({ dbError, isDbInitialized, isAuthReady, userRole, title, tableName, onRetryAuth, hideHeader }) => {
    const { showToast, confirm } = useToast();
    const [bookings, setBookings] = useState<RestaurantBooking[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingBooking, setEditingBooking] = useState<RestaurantBooking | null>(null);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [showFullYear, setShowFullYear] = useState(false);
    const [mealFilter, setMealFilter] = useState<'todos' | 'desayuno' | 'cena'>('todos');
    const [checkedInFilter, setCheckedInFilter] = useState<'pending' | 'all'>('pending');
    const [newBooking, setNewBooking] = useState({ 
        guestName: '', 
        roomNumber: '', 
        description: '',
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        guestsCount: 1,
        mealType: 'cena' as 'desayuno' | 'cena' | 'MP'
    });

    useEffect(() => {
        if (!isAuthReady) return;
        setIsLoading(true);

        let serviceBookings: RestaurantBooking[] = [];
        let newsBookings: RestaurantBooking[] = [];
        let pdfBookings: RestaurantBooking[] = [];

        const updateCombinedBookings = () => {
            let allBookings = [...serviceBookings, ...newsBookings, ...pdfBookings];
            
            if (tableName === 'events_bookings') {
                const uniqueBookings = new Map<string, RestaurantBooking>();
                
                // We sort by origin priority: pdf (1) < news (2) < service (3)
                // This way, if there's a match, the more "authoritative" or editable one (service) wins.
                const priority = { 'service': 3, 'news': 2, 'pdf': 1 };
                
                // Sort allBookings by priority ascending so higher priority items are processed last and overwrite others in the Map
                const sortedByPriority = [...allBookings].sort((a, b) => priority[a.origin] - priority[b.origin]);
                
                sortedByPriority.forEach(b => {
                    // Create a unique key based on title (case-insensitive) and start date
                    const key = `${b.guestName.toLowerCase().trim()}_${b.startDate}`;
                    uniqueBookings.set(key, b);
                });
                
                allBookings = Array.from(uniqueBookings.values());
                
                // Filter by date if not showing full year
                if (!showFullYear) {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    allBookings = allBookings.filter(b => {
                        const eventDate = new Date(b.startDate);
                        eventDate.setHours(0, 0, 0, 0);
                        return eventDate >= today;
                    });
                }

                allBookings.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
            } else {
                allBookings.sort((a, b) => {
                    if (tableName === 'restaurant_bookings') {
                        const mealPriority: Record<string, number> = { 'desayuno': 1, 'MP': 2, 'cena': 3 };
                        const priorityA = mealPriority[a.mealType || ''] || 4;
                        const priorityB = mealPriority[b.mealType || ''] || 4;
                        if (priorityA !== priorityB) return priorityA - priorityB;
                    }
                    return a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
                });
            }
            
            setBookings(allBookings);
            setIsLoading(false);
        };

        let unsubscribeServices: () => void = () => {};
        if (tableName === 'events_bookings') {
            unsubscribeServices = getAllServiceBookings(tableName, (allBookings) => {
                serviceBookings = allBookings
                    .filter(b => b.startDate.startsWith(selectedYear.toString()) || b.endDate.startsWith(selectedYear.toString()))
                    .map(b => ({ ...b, origin: 'service' as const }));
                updateCombinedBookings();
            });
        } else {
            unsubscribeServices = getServiceBookings(tableName, selectedDate, (allBookings) => {
                serviceBookings = allBookings.map(b => ({ ...b, origin: 'service' as const }));
                updateCombinedBookings();
            });
        }

        let unsubscribeNews: () => void = () => {};
        let unsubscribePdfs: () => void = () => {};
        if (tableName === 'events_bookings') {
            unsubscribeNews = getNewsEvents((allEvents) => {
                newsBookings = allEvents
                    .filter(e => e.startDate.startsWith(selectedYear.toString()) || e.endDate.startsWith(selectedYear.toString()))
                    .map(e => ({
                        id: e.id,
                        guestName: e.title,
                        roomNumber: '',
                        description: e.description,
                        startDate: e.startDate,
                        endDate: e.endDate,
                        origin: 'news' as const
                    }));
                updateCombinedBookings();
            });

            unsubscribePdfs = getEventPdfs((allPdfs) => {
                pdfBookings = allPdfs
                    .filter(p => p.eventDate && p.eventDate.startsWith(selectedYear.toString()))
                    .map(p => ({
                        id: p.id,
                        guestName: p.fileName,
                        roomNumber: '',
                        description: `Documento PDF disponible: ${p.fileName}`,
                        startDate: p.eventDate,
                        endDate: p.eventDate,
                        origin: 'pdf' as const
                    }));
                updateCombinedBookings();
            });
        }

        return () => {
            unsubscribeServices();
            unsubscribeNews();
            unsubscribePdfs();
        };
    }, [isAuthReady, tableName, selectedDate, selectedYear, showFullYear]);

    const handleToggleCheckIn = async (booking: RestaurantBooking) => {
        if (!booking.id) return;
        try {
            await toggleServiceBookingCheckIn(tableName, booking.id, !!booking.checkedIn);
        } catch (error) {
            console.error("Error toggling check-in:", error);
        }
    };

    const handleOpenModal = (booking?: RestaurantBooking) => {
        if (booking && typeof booking === 'object') {
            setEditingBooking(booking);
            setNewBooking({
                guestName: booking.guestName,
                roomNumber: booking.roomNumber,
                description: booking.description,
                startDate: booking.startDate,
                endDate: booking.endDate,
                guestsCount: booking.guestsCount || 1,
                mealType: booking.mealType || 'cena'
            });
        } else {
            setEditingBooking(null);
            setNewBooking({
                guestName: '',
                roomNumber: '',
                description: '',
                startDate: selectedDate,
                endDate: '',
                guestsCount: 1,
                mealType: 'cena'
            });
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingBooking(null);
        setNewBooking({ 
            guestName: '', 
            roomNumber: '', 
            description: '',
            startDate: new Date().toISOString().split('T')[0],
            endDate: '',
            guestsCount: 1,
            mealType: 'cena'
        });
    };

    const handleAddBooking = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newBooking.guestName || !newBooking.startDate || !newBooking.endDate || !newBooking.description) {
            showToast("Por favor, complete todos los campos.", "error");
            return;
        }
        if (tableName !== 'events_bookings' && !newBooking.roomNumber) {
            showToast("Por favor, complete todos los campos.", "error");
            return;
        }
        if (newBooking.startDate > newBooking.endDate) {
            showToast('La fecha de inicio no puede ser posterior a la fecha de fin.', "error");
            return;
        }
        
        try {
            if (editingBooking) {
                await updateServiceBooking(tableName, editingBooking.id, newBooking);
                showToast("Servicio actualizado correctamente", "success");
                handleCloseModal();
            } else {
                await addServiceBooking(tableName, newBooking);
                showToast("Servicio guardado correctamente", "success");
                handleCloseModal();
                
                // Send notification via server to Apps Script (ONLY for events_bookings)
                if (tableName === 'events_bookings') {
                  try {
                    const response = await fetch('/api/notifications/novedad', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        ...newBooking,
                        title: newBooking.guestName, // Map guestName to title for consistency
                        description: `${newBooking.description}\n\nREVISA LOS CAMBIOS EN ESTE ENLACE: https://balinesas-parking-bicis-etc.vercel.app/`,
                        collection: tableName,
                        type: 'new_novedad'
                      })
                    });
                    if (!response.ok) {
                      const errData = await response.json().catch(() => ({}));
                      console.error("Notification trigger failed:", errData);
                      showToast("Servicio guardado, pero la notificación falló. Revisa el script.", "warning");
                    }
                  } catch (e) {
                    console.error("Notification fetch failed:", e);
                    showToast("Servicio guardado, pero hubo un error de red con la notificación.", "warning");
                  }
                }
            }
        } catch (error: any) {
            console.error(`Error saving ${tableName}:`, error);
            const errorMessage = error.message || 'Error desconocido.';
            showToast(`No se pudo guardar el servicio: ${errorMessage}`, "error");
        }
    };
    
    const handleDeleteBooking = async (id: string) => {
        const confirmed = await confirm("¿Seguro que quieres eliminar este servicio?");
        if (confirmed) {
           try {
                await deleteServiceBooking(tableName, id);
                showToast("Servicio eliminado correctamente", "success");
           } catch (error: any) {
               console.error(`Error deleting ${tableName}:`, error);
               const errorMessage = error.message || 'Error desconocido.';
               showToast(`No se pudo eliminar el servicio: ${errorMessage}`, "error");
           }
        }
    };
    
    const formatDate = (dateString: string) => {
        if (!dateString) {
            return '';
        }

        // The database driver creates a Date object based on the local timezone
        // from a timezone-less DATE column. Previously, formatting this with
        // `timeZone: 'UTC'` caused an off-by-one-day error for timezones ahead of UTC.
        // By removing the `timeZone` option, `toLocaleDateString` now correctly uses the
        // browser's local timezone for formatting, matching how the date was created.
        const date = new Date(dateString);
        
        if (isNaN(date.getTime())) {
            return '';
        }

        return date.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
        });
    }

    const filteredBookings = bookings.filter(b => {
        if (tableName !== 'restaurant_bookings') return true;
        
        // Filter by meal type
        const matchesMeal = mealFilter === 'todos' || b.mealType === mealFilter || b.mealType === 'MP';
        if (!matchesMeal) return false;

        // Filter by check-in status
        if (checkedInFilter === 'pending') {
            return !b.checkedIn;
        }
        
        return true;
    });

    const totalGuests = filteredBookings.reduce((sum, b) => sum + (b.guestsCount || 0), 0);

    return (
        <div>
            {!hideHeader && (
                <Header title={title}>
                  <div className="flex flex-col items-end gap-2">
                    {tableName === 'restaurant_bookings' && (
                      <div className="bg-amber-50 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-800 px-2 py-1 rounded text-[10px] font-bold text-amber-800 dark:text-amber-100 max-w-[200px] text-right leading-tight shadow-sm no-print">
                        TICAR CTA. CASA: SOLO PROPIEDAD O AUTORIZADOS POR DIRECCIÓN
                      </div>
                    )}
                    {userRole === 'editor' && (
                      <button onClick={() => handleOpenModal()} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
                          Añadir {title}
                      </button>
                    )}
                  </div>
                </Header>
            )}

            <div className="p-4 space-y-2">
                <div className="mb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="w-full md:w-auto">
                        {tableName === 'events_bookings' ? (
                        <div className="flex flex-col sm:flex-row sm:items-end space-y-4 sm:space-y-0 sm:space-x-4">
                            <div className="w-full sm:w-auto">
                                <label htmlFor="service-year-picker" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white bg-gray-900/50 rounded-md p-1 w-fit">Seleccionar Año:</label>
                                <select 
                                    id="service-year-picker"
                                    value={selectedYear}
                                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                                    className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-300/50 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                                >
                                    {[...Array(5)].map((_, i) => {
                                        const year = new Date().getFullYear() - 2 + i;
                                        return <option key={year} value={year}>{year}</option>;
                                    })}
                                </select>
                            </div>
                            <div className="w-full sm:w-auto">
                                <button
                                    onClick={() => setShowFullYear(!showFullYear)}
                                    className={`w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm flex items-center justify-center space-x-2 ${
                                        showFullYear 
                                            ? 'bg-blue-600 text-white hover:bg-blue-700' 
                                            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    <span>{showFullYear ? 'Ver solo próximos' : 'Ver año completo'}</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                            <div className="w-full sm:w-auto">
                                <label htmlFor="service-date-picker" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white bg-gray-900/50 rounded-md p-1 w-fit">Seleccionar Fecha:</label>
                                <input 
                                    type="date" 
                                    id="service-date-picker"
                                    value={selectedDate} 
                                    onChange={(e) => setSelectedDate(e.target.value)} 
                                    className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-300/50 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                                />
                            </div>
                            
                            {tableName === 'restaurant_bookings' && (
                                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                                    <div className="flex bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border border-gray-300/50 rounded-lg overflow-hidden h-[42px] shadow-sm">
                                        <button 
                                            onClick={() => setMealFilter('todos')}
                                            className={`px-4 py-2 text-sm font-semibold transition-all ${mealFilter === 'todos' ? 'bg-blue-600 text-white shadow-inner' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                                        >
                                            Todos
                                        </button>
                                        <button 
                                            onClick={() => setMealFilter('desayuno')}
                                            className={`px-4 py-2 text-sm font-semibold border-l border-gray-300/50 transition-all ${mealFilter === 'desayuno' ? 'bg-blue-600 text-white shadow-inner' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                                        >
                                            Desayuno
                                        </button>
                                        <button 
                                            onClick={() => setMealFilter('cena')}
                                            className={`px-4 py-2 text-sm font-semibold border-l border-gray-300/50 transition-all ${mealFilter === 'cena' ? 'bg-blue-600 text-white shadow-inner' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                                        >
                                            Cena
                                        </button>
                                    </div>
                                    <div className="flex bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border border-gray-300/50 rounded-lg overflow-hidden h-[42px] shadow-sm">
                                        <button 
                                            onClick={() => setCheckedInFilter('pending')}
                                            className={`px-4 py-2 text-sm font-semibold transition-all ${checkedInFilter === 'pending' ? 'bg-emerald-600 text-white shadow-inner' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                                        >
                                            Pendientes
                                        </button>
                                        <button 
                                            onClick={() => setCheckedInFilter('all')}
                                            className={`px-4 py-2 text-sm font-semibold border-l border-gray-300/50 transition-all ${checkedInFilter === 'all' ? 'bg-indigo-600 text-white shadow-inner' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                                        >
                                            Ver Todos
                                        </button>
                                    </div>
                                    <div className="hidden lg:flex items-center px-3 py-1 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                                        <span className="text-xs font-bold text-blue-800 dark:text-blue-300">
                                            💡 Clica MARCAR ENTRADA cuando lleguen
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    </div>
                    {userRole === 'editor' && (
                        <button onClick={() => handleOpenModal()} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-md transform active:scale-95">
                            Añadir {title}
                        </button>
                    )}
                </div>
                
                {tableName === 'restaurant_bookings' && !isLoading && !dbError && (
                    <div className="space-y-2 mb-4">
                        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 p-3 rounded-lg flex justify-between items-center shadow-sm">
                            <span className="text-blue-800 dark:text-blue-200 font-bold">
                                {checkedInFilter === 'all' ? 'Total Personas:' : 'Personas Pendientes:'}
                            </span>
                            <span className="text-4xl font-black text-blue-900 dark:text-blue-100">{totalGuests}</span>
                        </div>
                        {mealFilter === 'todos' && (
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-yellow-50/80 dark:bg-yellow-900/20 border border-yellow-200/50 dark:border-yellow-800/30 p-2.5 rounded-lg flex flex-col items-center justify-center text-center">
                                    <span className="text-yellow-800 dark:text-yellow-300 text-xs uppercase font-bold tracking-wider mb-2">
                                        {checkedInFilter === 'all' ? 'Total Desayuno (+MP)' : 'Pendientes Desayuno (+MP)'}
                                    </span>
                                    <span className="text-6xl font-black text-yellow-900 dark:text-yellow-100">
                                        {bookings.filter(b => (b.mealType === 'desayuno' || b.mealType === 'MP') && (checkedInFilter === 'all' ? true : !b.checkedIn)).reduce((sum, b) => sum + (b.guestsCount || 0), 0)}
                                    </span>
                                </div>
                                <div className="bg-indigo-50/80 dark:bg-indigo-900/20 border border-indigo-200/50 dark:border-indigo-800/30 p-2.5 rounded-lg flex flex-col items-center justify-center text-center">
                                    <span className="text-indigo-800 dark:text-indigo-300 text-xs uppercase font-bold tracking-wider mb-2">
                                        {checkedInFilter === 'all' ? 'Total Cena (+MP)' : 'Pendientes Cena (+MP)'}
                                    </span>
                                    <span className="text-6xl font-black text-indigo-900 dark:text-indigo-100">
                                        {bookings.filter(b => (b.mealType === 'cena' || b.mealType === 'MP') && (checkedInFilter === 'all' ? true : !b.checkedIn)).reduce((sum, b) => sum + (b.guestsCount || 0), 0)}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
                
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
                {isLoading ? (
                     <div className="text-center py-10">Cargando...</div>
                ) : !dbError && filteredBookings.length > 0 ? (
                    <div className="flex flex-col space-y-4">
                    {filteredBookings.map(booking => (
                        <div key={booking.id} className={`group cursor-pointer w-full bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm px-4 py-3 rounded-lg shadow-md animate-fade-in border-l-4 transition-all duration-300 ${booking.origin === 'news' ? 'border-red-500' : booking.origin === 'pdf' ? 'border-blue-500' : 'border-purple-500'}`}>
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                    <div className="text-black dark:text-gray-300 font-medium text-xs bg-gray-200/60 dark:bg-gray-700/60 px-2 py-1 rounded-md w-fit">
                                        <span>{formatDate(booking.startDate)}</span>
                                        {booking.startDate !== booking.endDate && (
                                          <>
                                            <span className="mx-1">-</span>
                                            <span>{formatDate(booking.endDate)}</span>
                                          </>
                                        )}
                                    </div>
                                    {tableName === 'restaurant_bookings' && booking.mealType && (
                                        <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                                            booking.mealType === 'desayuno' ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' : 
                                            booking.mealType === 'cena' ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' : 
                                            booking.mealType === 'MP' ? 'bg-green-100 text-green-800 border border-green-200' :
                                            'bg-gray-100 text-gray-800 border border-gray-200'
                                        }`}>
                                            {booking.mealType}
                                        </span>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    {tableName === 'restaurant_bookings' && booking.origin !== 'news' && booking.origin !== 'pdf' && (
                                        <button 
                                            onClick={() => handleToggleCheckIn(booking)}
                                            className={`px-3 py-1 rounded-md text-xs font-bold font-mono shadow-sm transition-all transform active:scale-95 ${
                                                booking.checkedIn 
                                                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' 
                                                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                                            }`}
                                        >
                                            {booking.checkedIn ? '✓ ENTRADO' : 'MARCAR ENTRADA'}
                                        </button>
                                    )}

                                    {userRole === 'editor' && booking.origin !== 'news' && booking.origin !== 'pdf' && (
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => handleOpenModal(booking)} 
                                                className="bg-blue-500 text-white px-2 py-0.5 text-xs rounded-md font-semibold hover:bg-blue-600 transition-colors"
                                            >
                                                Editar
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteBooking(booking.id)} 
                                                className="bg-red-500 text-white px-2 py-0.5 text-xs rounded-md font-semibold hover:bg-red-600 transition-colors"
                                                aria-label="Cancelar servicio"
                                            >
                                                Cancelar
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            <div className="flex justify-between items-center">
                                <h3 className="font-bold text-lg leading-tight text-gray-900 dark:text-gray-100">{booking.guestName}</h3>
                                <div className="flex flex-col items-end">
                                    {booking.roomNumber && <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">Hab. {booking.roomNumber}</p>}
                                    {tableName === 'restaurant_bookings' && booking.guestsCount && (
                                        <p className="text-sm font-medium text-blue-600 dark:text-blue-400">{booking.guestsCount} {booking.guestsCount === 1 ? 'persona' : 'personas'}</p>
                                    )}
                                </div>
                            </div>
                            
                            <div className="overflow-hidden transition-all duration-300">
                                {booking.origin === 'news' ? (
                                    <div className="text-black text-base my-1 whitespace-pre-wrap line-clamp-1 group-hover:line-clamp-none" dangerouslySetInnerHTML={{ __html: booking.description }} />
                                ) : (
                                    <p className="text-black text-base my-1 line-clamp-1 group-hover:line-clamp-none">{booking.description}</p>
                                )}
                            </div>
                        </div>
                    ))}
                    </div>
                ) : (
                    !dbError && <div className="text-center py-10 text-gray-800 dark:text-gray-200 bg-gray-50/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg">
                        {tableName === 'events_bookings' ? 'No hay eventos registrados para este año.' : 'No hay servicios activos para esta fecha.'}
                    </div>
                )}
            </div>
            
            {tableName === 'restaurant_bookings' && (
                <div className="p-4 pt-0 no-print">
                    <ExtraFBSection userRole={userRole} />
                </div>
            )}
            
            <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={editingBooking ? `Editar ${title}` : `Añadir Nuevo ${title}`}>
                <form onSubmit={handleAddBooking}>
                    <div className="space-y-4">
                        <input type="text" placeholder={tableName === 'events_bookings' ? "Título" : "Nombre del Huésped"} value={newBooking.guestName} onChange={(e) => setNewBooking({ ...newBooking, guestName: e.target.value })} className="w-full p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                        {tableName !== 'events_bookings' && (
                            <input type="text" placeholder="Nº Habitación" value={newBooking.roomNumber} onChange={(e) => setNewBooking({ ...newBooking, roomNumber: e.target.value })} className="w-full p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                        )}
                        {tableName === 'restaurant_bookings' && (
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Nº de Personas</label>
                                    <input 
                                        type="number" 
                                        min="1"
                                        value={newBooking.guestsCount} 
                                        onChange={(e) => setNewBooking({ ...newBooking, guestsCount: parseInt(e.target.value) || 1 })} 
                                        className="w-full p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" 
                                        required 
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Tipo de Servicio</label>
                                    <select 
                                        value={newBooking.mealType} 
                                        onChange={(e) => setNewBooking({ ...newBooking, mealType: e.target.value as any })} 
                                        className="w-full p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="desayuno">Desayuno</option>
                                        <option value="cena">Cena</option>
                                        <option value="MP">Media Pensión (MP)</option>
                                    </select>
                                </div>
                            </div>
                        )}
                        <textarea placeholder="Descripción del servicio" value={newBooking.description} onChange={(e) => setNewBooking({ ...newBooking, description: e.target.value })} className="w-full p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" rows={3} required></textarea>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Fecha Inicio</label>
                                <input type="date" value={newBooking.startDate} onChange={(e) => setNewBooking({ ...newBooking, startDate: e.target.value })} className="w-full p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" required/>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Fecha Fin</label>
                                <input type="date" value={newBooking.endDate} onChange={(e) => setNewBooking({ ...newBooking, endDate: e.target.value })} className="w-full p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" required/>
                            </div>
                        </div>
                        <button type="submit" className="w-full bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
                            {editingBooking ? 'Guardar Cambios' : `Guardar ${title}`}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default ServicesView;

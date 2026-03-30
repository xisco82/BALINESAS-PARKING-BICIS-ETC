
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
  getNewsEvents
} from '../services/firebaseService';

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
    const [newBooking, setNewBooking] = useState({ 
        guestName: '', 
        roomNumber: '', 
        description: '',
        startDate: new Date().toISOString().split('T')[0],
        endDate: ''
    });

    useEffect(() => {
        if (!isAuthReady) return;
        setIsLoading(true);

        let serviceBookings: RestaurantBooking[] = [];
        let newsBookings: RestaurantBooking[] = [];

        const updateCombinedBookings = () => {
            const allBookings = [...serviceBookings, ...newsBookings];
            if (tableName === 'events_bookings') {
                allBookings.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
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
        }

        return () => {
            unsubscribeServices();
            unsubscribeNews();
        };
    }, [isAuthReady, tableName, selectedDate, selectedYear]);

    const handleOpenModal = (booking?: RestaurantBooking) => {
        if (booking && typeof booking === 'object') {
            setEditingBooking(booking);
            setNewBooking({
                guestName: booking.guestName,
                roomNumber: booking.roomNumber,
                description: booking.description,
                startDate: booking.startDate,
                endDate: booking.endDate
            });
        } else {
            setEditingBooking(null);
            setNewBooking({
                guestName: '',
                roomNumber: '',
                description: '',
                startDate: selectedDate,
                endDate: ''
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
            endDate: ''
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
            } else {
                await addServiceBooking(tableName, newBooking);
                showToast("Servicio guardado correctamente", "success");
                
                // Send notification via server to Apps Script
                try {
                  fetch('/api/notifications/novedad', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      ...newBooking,
                      title: newBooking.guestName, // Map guestName to title for consistency
                      collection: tableName
                    })
                  }).catch(err => console.error("Notification trigger failed:", err));
                } catch (e) {
                  console.error("Notification fetch failed:", e);
                }
            }
        } catch (error: any) {
            console.error(`Error saving ${tableName}:`, error);
            const errorMessage = error.message || 'Error desconocido.';
            showToast(`No se pudo guardar el servicio: ${errorMessage}`, "error");
        }
        
        handleCloseModal();
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

    return (
        <div>
            {!hideHeader && (
                <Header title={title}>
                  {userRole === 'editor' && (
                    <button onClick={() => handleOpenModal()} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
                        Añadir {title}
                    </button>
                  )}
                </Header>
            )}

            <div className="p-4 space-y-2">
                 <div className="mb-4 flex justify-between items-center">
                    <div>
                        {tableName === 'events_bookings' ? (
                        <>
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
                        </>
                    ) : (
                        <>
                            <label htmlFor="service-date-picker" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white bg-gray-900/50 rounded-md p-1 w-fit">Seleccionar Fecha:</label>
                            <input 
                                type="date"
                                id="service-date-picker"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-300/50 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                            />
                        </>
                    )}
                    </div>
                    {hideHeader && userRole === 'editor' && (
                        <button onClick={() => handleOpenModal()} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors h-fit">
                            Añadir {title}
                        </button>
                    )}
                </div>
                
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
                ) : !dbError && bookings.length > 0 ? (
                    <div className="flex flex-col space-y-4">
                    {bookings.map(booking => (
                        <div key={booking.id} className={`group cursor-pointer w-full bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm px-4 py-3 rounded-lg shadow-md animate-fade-in border-l-4 transition-all duration-300 ${booking.origin === 'news' ? 'border-red-500' : 'border-purple-500'}`}>
                            <div className="flex justify-between items-start mb-2">
                                <div className="text-black dark:text-gray-300 font-medium text-xs bg-gray-200/60 dark:bg-gray-700/60 px-2 py-1 rounded-md w-fit">
                                    <span>{formatDate(booking.startDate)}</span>
                                    <span className="mx-1">-</span>
                                    <span>{formatDate(booking.endDate)}</span>
                                </div>
                                {userRole === 'editor' && booking.origin !== 'news' && (
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
                            
                            <div className="flex justify-between items-center">
                                <h3 className="font-bold text-lg leading-tight text-gray-900 dark:text-gray-100">{booking.guestName}</h3>
                                {booking.roomNumber && <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">Hab. {booking.roomNumber}</p>}
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
            
            <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={editingBooking ? `Editar ${title}` : `Añadir Nuevo ${title}`}>
                <form onSubmit={handleAddBooking}>
                    <div className="space-y-4">
                        <input type="text" placeholder={tableName === 'events_bookings' ? "Título" : "Nombre del Huésped"} value={newBooking.guestName} onChange={(e) => setNewBooking({ ...newBooking, guestName: e.target.value })} className="w-full p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                        {tableName !== 'events_bookings' && (
                            <input type="text" placeholder="Nº Habitación" value={newBooking.roomNumber} onChange={(e) => setNewBooking({ ...newBooking, roomNumber: e.target.value })} className="w-full p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
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

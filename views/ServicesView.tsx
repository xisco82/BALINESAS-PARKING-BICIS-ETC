
import React, { useState, useEffect, useCallback } from 'react';
import { RestaurantBooking } from '../types';
import Header from '../components/Header';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import { 
  getServiceBookings, 
  addServiceBooking, 
  deleteServiceBooking, 
  updateServiceBooking 
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
}

const ServicesView: React.FC<ServicesViewProps> = ({ dbError, isDbInitialized, isAuthReady, userRole, title, tableName, onRetryAuth }) => {
    const { showToast, confirm } = useToast();
    const [bookings, setBookings] = useState<RestaurantBooking[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingBooking, setEditingBooking] = useState<RestaurantBooking | null>(null);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
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
        const unsubscribe = getServiceBookings(tableName, selectedDate, (allBookings) => {
            setBookings(allBookings);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [isAuthReady, tableName, selectedDate]);

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
        if (!newBooking.guestName || !newBooking.roomNumber || !newBooking.startDate || !newBooking.endDate || !newBooking.description) {
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
            <Header title={title}>
              {userRole === 'editor' && (
                <button onClick={() => handleOpenModal()} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
                    Añadir {title}
                </button>
              )}
            </Header>

            <div className="p-4 space-y-2">
                 <div className="mb-4">
                    <label htmlFor="service-date-picker" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white bg-gray-900/50 rounded-md p-1 w-fit">Seleccionar Fecha:</label>
                    <input 
                        type="date"
                        id="service-date-picker"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-300/50 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                    />
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
                    bookings.map(booking => (
                        <div key={booking.id} className="bg-white/30 dark:bg-gray-800/30 backdrop-blur-sm px-3 py-1.5 rounded-lg shadow-md animate-fade-in">
                            <div className="flex justify-between items-center">
                                <h3 className="font-bold text-lg leading-tight text-gray-900 dark:text-gray-100">{booking.guestName}</h3>
                                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">Hab. {booking.roomNumber}</p>
                            </div>
                            
                            <p className="text-gray-700 dark:text-gray-200 text-base my-1">{booking.description}</p>
                            
                            <div className="flex justify-between items-end text-xs">
                                <div className="text-black dark:text-gray-300 font-medium">
                                    <span>{formatDate(booking.startDate)}</span>
                                    <span className="mx-1">-</span>
                                    <span>{formatDate(booking.endDate)}</span>
                                </div>
                                {userRole === 'editor' && (
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
                    ))
                ) : (
                    !dbError && <div className="text-center py-10 text-gray-800 dark:text-gray-200 bg-gray-50/30 dark:bg-gray-800/30 backdrop-blur-sm rounded-lg">
                        No hay servicios activos para esta fecha.
                    </div>
                )}
            </div>
            
            <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={editingBooking ? `Editar ${title}` : `Añadir Nuevo ${title}`}>
                <form onSubmit={handleAddBooking}>
                    <div className="space-y-4">
                        <input type="text" placeholder="Nombre del Huésped" value={newBooking.guestName} onChange={(e) => setNewBooking({ ...newBooking, guestName: e.target.value })} className="w-full p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                        <input type="text" placeholder="Nº Habitación" value={newBooking.roomNumber} onChange={(e) => setNewBooking({ ...newBooking, roomNumber: e.target.value })} className="w-full p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
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

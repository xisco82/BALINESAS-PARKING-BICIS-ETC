import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { AccessibilityBooking, UserRole } from '../types';
import Header from '../components/Header';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import { 
  getAccessibilityBookings, 
  addAccessibilityBooking, 
  deleteAccessibilityBooking 
} from '../services/firebaseService';

interface DisabilityViewProps {
  dbError: string | null;
  isDbInitialized: boolean;
  isAuthReady: boolean;
  userRole: UserRole;
  onRetryAuth: () => void;
}

const formatDate = (dateString: string) => {
    if (!dateString) return '';
    // The database driver returns an ISO 8601 string for DATE types.
    // Directly creating a new Date object from this string correctly
    // parses it, avoiding timezone issues.
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
        return '';
    }
    return date.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
};

const AccessibilityCard: React.FC<{ booking: AccessibilityBooking, onDelete: (id: string) => void, userRole: UserRole }> = ({ booking, onDelete, userRole }) => (
    <div className="bg-white/30 dark:bg-gray-800/30 backdrop-blur-sm p-3 rounded-xl shadow-md animate-fade-in hover:shadow-lg transition-shadow duration-300">
        <div className="flex justify-between items-start">
            <div>
                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">{booking.guestName}</h3>
                <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">Habitación {booking.roomNumber}</p>
            </div>
            <div className="text-right text-sm font-medium text-gray-700 dark:text-gray-300 flex-shrink-0 ml-2">
                <p><span className="font-semibold">Llegada:</span> {formatDate(booking.arrivalDate)}</p>
                <p><span className="font-semibold">Salida:</span> {formatDate(booking.departureDate)}</p>
            </div>
        </div>
        
        <div className="pt-2 mt-2 border-t border-gray-200/80 dark:border-gray-700/80">
             <p className="text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{booking.disabilityInfo}</p>
        </div>
        
        {userRole === 'editor' && (
          <div className="flex justify-end mt-2">
              <button 
                  onClick={() => onDelete(booking.id)} 
                  className="bg-red-500 text-white px-3 py-1 text-xs rounded-md font-semibold hover:bg-red-600 transition-colors"
                  aria-label="Eliminar registro"
              >
                  Eliminar
              </button>
          </div>
        )}
    </div>
);

const DisabilityView: React.FC<DisabilityViewProps> = ({ dbError, isDbInitialized, isAuthReady, userRole, onRetryAuth }) => {
    const { showToast, confirm } = useToast();
    const [bookings, setBookings] = useState<AccessibilityBooking[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newBooking, setNewBooking] = useState({
        guestName: '',
        roomNumber: '',
        arrivalDate: new Date().toISOString().split('T')[0],
        departureDate: '',
        disabilityInfo: ''
    });

    useEffect(() => {
        if (!isAuthReady) return;
        setIsLoading(true);
        const unsubscribe = getAccessibilityBookings((bookingsData) => {
            setBookings(bookingsData);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [isAuthReady]);

    const sortedBookings = useMemo(() => {
      // Sorts bookings by arrival date ascending, then by room number.
      return [...bookings].sort((a, b) => {
          const dateA = new Date(a.arrivalDate);
          const dateB = new Date(b.arrivalDate);
          const dateComparison = dateA.getTime() - dateB.getTime();
          
          if (dateComparison !== 0) {
              return dateComparison;
          }
          return a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
      });
    }, [bookings]);


    const handleAddBooking = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newBooking.guestName || !newBooking.roomNumber || !newBooking.arrivalDate || !newBooking.departureDate || !newBooking.disabilityInfo) {
            showToast('Por favor, complete todos los campos.', "error");
            return;
        }
        if (newBooking.arrivalDate > newBooking.departureDate) {
            showToast('La fecha de llegada no puede ser posterior a la fecha de salida.', "error");
            return;
        }
        
        try {
            await addAccessibilityBooking(newBooking);
            showToast("Registro de accesibilidad guardado correctamente", "success");
            setIsModalOpen(false);
            setNewBooking({
                guestName: '',
                roomNumber: '',
                arrivalDate: new Date().toISOString().split('T')[0],
                departureDate: '',
                disabilityInfo: ''
            });
        } catch (error: any) {
            console.error("Error adding accessibility booking:", error);
            const errorMessage = error.message || 'Error desconocido.';
            showToast(`No se pudo guardar el registro: ${errorMessage}`, "error");
        }
    };

    const handleDeleteBooking = async (id: string) => {
        const confirmed = await confirm("¿Seguro que quieres eliminar este registro?");
        if (confirmed) {
            try {
                await deleteAccessibilityBooking(id);
                showToast("Registro eliminado correctamente", "success");
            } catch (error: any) {
                console.error("Error deleting accessibility booking:", error);
                const errorMessage = error.message || 'Error desconocido.';
                showToast(`No se pudo eliminar el registro: ${errorMessage}`, "error");
            }
        }
    };
    
    return (
        <div>
            <Header title="Minusvalías">
                {userRole === 'editor' && (
                  <button onClick={() => setIsModalOpen(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
                      Añadir Huésped
                  </button>
                )}
            </Header>
            <div className="p-4 space-y-4">
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
                ) : !dbError && sortedBookings.length > 0 ? (
                    sortedBookings.map(booking => (
                        <AccessibilityCard key={booking.id} booking={booking} onDelete={handleDeleteBooking} userRole={userRole} />
                    ))
                ) : (
                    !dbError && <div className="text-center py-10 text-gray-800 dark:text-gray-200 bg-gray-50/30 dark:bg-gray-800/30 backdrop-blur-sm rounded-lg">
                        No hay registros de minusvalías en este momento.
                    </div>
                )}
            </div>
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Añadir Registro de Minusvalía">
                <form onSubmit={handleAddBooking}>
                    <div className="space-y-4">
                        <input type="text" placeholder="Nombre del Huésped" value={newBooking.guestName} onChange={(e) => setNewBooking({ ...newBooking, guestName: e.target.value })} className="w-full p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                        <input type="text" placeholder="Nº Habitación" value={newBooking.roomNumber} onChange={(e) => setNewBooking({ ...newBooking, roomNumber: e.target.value })} className="w-full p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Fecha Llegada</label>
                                <input type="date" value={newBooking.arrivalDate} onChange={(e) => setNewBooking({ ...newBooking, arrivalDate: e.target.value })} className="w-full p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Fecha Salida</label>
                                <input type="date" value={newBooking.departureDate} onChange={(e) => setNewBooking({ ...newBooking, departureDate: e.target.value })} className="w-full p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                            </div>
                        </div>
                        <textarea placeholder="Descripción de la discapacidad o necesidad especial" value={newBooking.disabilityInfo} onChange={(e) => setNewBooking({ ...newBooking, disabilityInfo: e.target.value })} className="w-full p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" rows={4} required></textarea>
                        <button type="submit" className="w-full bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
                            Guardar Registro
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default DisabilityView;
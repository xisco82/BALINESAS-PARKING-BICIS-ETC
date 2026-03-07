
import React, { useState, useEffect, useCallback } from 'react';
import { BalineseBedBooking, UserRole } from '../types';
import Header from '../components/Header';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import { 
  getBalineseBookings, 
  addBalineseBooking, 
  deleteBalineseBooking 
} from '../services/firebaseService';

const TOTAL_BEDS = 6;

interface BalineseViewProps {
  dbError: string | null;
  isDbInitialized: boolean;
  isAuthReady: boolean;
  userRole: UserRole;
  onRetryAuth: () => void;
}

const formatBookingTime = (isoString: string) => {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        // Check if date is valid
        if (isNaN(date.getTime())) return '';

        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${day}/${month} ${hours}:${minutes}`;
    } catch (e) {
        return ''; // Return empty string if date is invalid
    }
};


const BalineseBed: React.FC<{ bedId: number; booking: BalineseBedBooking | undefined; onBook: (bedId: number) => void; onCancel: (bedId: number) => void; }> = ({ bedId, booking, onBook, onCancel }) => {
    const isBooked = !!booking;
    return (
        <div className={`p-4 rounded-xl shadow-lg text-center transition-all duration-300 backdrop-blur-sm ${isBooked ? 'bg-red-200/30 dark:bg-red-900/20' : 'bg-green-200/30 dark:bg-green-800/20'}`}>
            <h3 className="font-bold text-2xl text-gray-800 dark:text-gray-100">Cama {bedId}</h3>
            {isBooked ? (
                <div className="mt-2 text-red-800 dark:text-red-100">
                    <p className="font-semibold">{booking.guestName}</p>
                    <p className="text-sm">Hab. {booking.roomNumber}</p>
                     {booking.createdBy && booking.createdAt && (
                        <p className="text-xs mt-1 text-gray-600 dark:text-gray-400">
                            Por: {booking.createdBy} &bull; {formatBookingTime(booking.createdAt)}
                        </p>
                    )}
                    <button onClick={() => onCancel(bedId)} className="mt-3 bg-red-500 text-white px-3 py-1 text-sm rounded-md hover:bg-red-600 transition">Cancelar</button>
                </div>
            ) : (
                <div className="mt-2 text-green-800 dark:text-green-100">
                    <p className="font-semibold">Disponible</p>
                    <button onClick={() => onBook(bedId)} className="mt-3 bg-green-600 text-white px-3 py-1 text-sm rounded-md hover:bg-green-700 transition">Reservar</button>
                </div>
            )}
        </div>
    );
}

const BalineseView: React.FC<BalineseViewProps> = ({ dbError, isDbInitialized, isAuthReady, userRole, onRetryAuth }) => {
    const { showToast, confirm } = useToast();
    const [bookings, setBookings] = useState<BalineseBedBooking[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentBedId, setCurrentBedId] = useState<number | null>(null);
    const [newBooking, setNewBooking] = useState({ guestName: '', roomNumber: '' });
    
    useEffect(() => {
        if (!isAuthReady) return;
        setIsLoading(true);
        const unsubscribe = getBalineseBookings(selectedDate, (bookingsData) => {
            setBookings(bookingsData);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [isAuthReady, selectedDate]);

    const handleOpenModal = (bedId: number) => {
        setCurrentBedId(bedId);
        setIsModalOpen(true);
    };
    
    const handleCloseModal = () => {
        setIsModalOpen(false);
        setCurrentBedId(null);
        setNewBooking({ guestName: '', roomNumber: '' });
    };

    const handleBookBed = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentBedId || !newBooking.guestName || !newBooking.roomNumber) return;

        try {
            await addBalineseBooking({
                bedId: currentBedId,
                date: selectedDate,
                guestName: newBooking.guestName,
                roomNumber: newBooking.roomNumber,
                createdBy: userRole
            });
            showToast("Cama Balinesa reservada correctamente", "success");
        } catch (error: any) {
            console.error("Error booking bed:", error);
            const errorMessage = error.message || 'Error desconocido. Revise la consola del navegador para más detalles.';
            showToast(`No se pudo guardar la reserva. Puede que ya exista una para esa cama en esta fecha: ${errorMessage}`, "error");
        }
        
        handleCloseModal();
    };
    
    const handleCancelBooking = async (bedId: number) => {
        const confirmed = await confirm("¿Seguro que quieres cancelar esta reserva?");
        if (confirmed) {
            try {
                await deleteBalineseBooking(bedId, selectedDate);
                showToast("Reserva cancelada correctamente", "success");
            } catch (error: any) {
                console.error("Error canceling booking:", error);
                const errorMessage = error.message || 'Error desconocido.';
                showToast(`No se pudo cancelar la reserva: ${errorMessage}`, "error");
            }
        }
    };

    return (
        <div>
            <Header title="Control de Balinesas" />
            <div className="p-4">
                <div className="mb-6">
                    <label htmlFor="date-picker" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white bg-gray-900/50 rounded-md p-1 w-fit">Seleccionar Fecha:</label>
                    <input 
                        type="date"
                        id="date-picker"
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
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {Array.from({ length: TOTAL_BEDS }, (_, i) => i + 1).map(bedId => (
                            <BalineseBed 
                                key={bedId} 
                                bedId={bedId} 
                                booking={bookings.find(b => b.bedId === bedId)}
                                onBook={handleOpenModal}
                                onCancel={handleCancelBooking}
                            />
                        ))}
                    </div>
                )}
            </div>
            
            <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={`Reservar Cama ${currentBedId}`}>
                <form onSubmit={handleBookBed}>
                    <div className="space-y-4">
                        <input type="text" placeholder="Nombre del Huésped" value={newBooking.guestName} onChange={(e) => setNewBooking({ ...newBooking, guestName: e.target.value })} className="w-full p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                        <input type="text" placeholder="Número de Habitación" value={newBooking.roomNumber} onChange={(e) => setNewBooking({ ...newBooking, roomNumber: e.target.value })} className="w-full p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                        <button type="submit" className="w-full bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
                            Confirmar Reserva
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default BalineseView;

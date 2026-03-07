import React, { useState, useEffect, useCallback } from 'react';
import { BikeBooking, UserRole } from '../types';
import Header from '../components/Header';
import Modal from '../components/Modal';
import { 
  getBikeBookings, 
  addBikeBooking, 
  deleteBikeBooking,
  getBikeAvailability,
  updateBikeAvailability
} from '../services/firebaseService';

const TOTAL_BIKES = 15;

interface BikesViewProps {
  dbError: string | null;
  isDbInitialized: boolean;
  isAuthReady: boolean;
  userRole: UserRole;
}

const Bike: React.FC<{ 
    bikeId: number; 
    booking: BikeBooking | undefined; 
    onBook: (bikeId: number) => void; 
    onCancel: (bikeId: number) => void;
    userRole: UserRole;
    isAvailable: boolean;
    onToggleAvailability: (bikeId: number) => void;
}> = ({ bikeId, booking, onBook, onCancel, userRole, isAvailable, onToggleAvailability }) => {
    const isBooked = !!booking;
    const availableRing = isAvailable ? 'ring-2 ring-offset-2 ring-offset-gray-800/10 dark:ring-offset-gray-900/10 ring-sky-500' : '';
    return (
        <div className={`p-3 rounded-xl shadow-lg text-center transition-all duration-300 flex flex-col items-center justify-center min-h-[120px] backdrop-blur-sm relative ${availableRing} ${isBooked ? 'bg-red-200/30 dark:bg-red-900/20' : 'bg-green-200/30 dark:bg-green-800/20'}`}>
            {userRole === 'editor' && (
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleAvailability(bikeId); }}
                    className={`absolute top-1.5 right-1.5 px-2 py-0.5 text-[11px] font-semibold rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                        isAvailable 
                        ? 'bg-sky-500 text-white hover:bg-sky-600 focus:ring-sky-400' 
                        : 'bg-gray-300/80 text-gray-700 hover:bg-gray-400/80 focus:ring-gray-400'
                    }`}
                >
                    {isAvailable ? 'OK Fuera' : 'Marcar'}
                </button>
            )}
            
            <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100 mt-4">Bici {bikeId}</h3>
            {isBooked ? (
                <div className="mt-2 text-red-800 dark:text-red-100">
                    <p className="font-semibold text-sm break-all">{booking.guestName}</p>
                    <p className="text-xs">Hab. {booking.roomNumber}</p>
                    {userRole === 'editor' && <button onClick={() => onCancel(bikeId)} className="mt-2 bg-red-500 text-white px-3 py-1 text-xs rounded-md hover:bg-red-600 transition">Cancelar</button>}
                </div>
            ) : (
                <div className="mt-2 text-green-800 dark:text-green-100">
                    <p className="font-semibold text-sm">Disponible</p>
                    {userRole === 'editor' && <button onClick={() => onBook(bikeId)} className="mt-2 bg-green-600 text-white px-3 py-1 text-xs rounded-md hover:bg-green-700 transition">Reservar</button>}
                </div>
            )}
        </div>
    );
}

const BikesView: React.FC<BikesViewProps> = ({ dbError, isDbInitialized, isAuthReady, userRole }) => {
    const [bookings, setBookings] = useState<BikeBooking[]>([]);
    const [availableBikes, setAvailableBikes] = useState<Set<number>>(new Set());
    const [isLoading, setIsLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentBikeId, setCurrentBikeId] = useState<number | null>(null);
    const [newBooking, setNewBooking] = useState({ guestName: '', roomNumber: '' });
    
    useEffect(() => {
        if (!isAuthReady) return;
        setIsLoading(true);
        
        const unsubscribeBookings = getBikeBookings(selectedDate, (bookingsData) => {
            setBookings(bookingsData);
        });

        const unsubscribeAvailability = getBikeAvailability(selectedDate, (ids) => {
            setAvailableBikes(new Set(ids));
            setIsLoading(false);
        });

        return () => {
            unsubscribeBookings();
            unsubscribeAvailability();
        };
    }, [isAuthReady, selectedDate]);

    const handleOpenModal = (bikeId: number) => {
        setCurrentBikeId(bikeId);
        setIsModalOpen(true);
    };
    
    const handleCloseModal = () => {
        setIsModalOpen(false);
        setCurrentBikeId(null);
        setNewBooking({ guestName: '', roomNumber: '' });
    };

    const handleBookBike = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentBikeId || !newBooking.guestName || !newBooking.roomNumber) return;
        
        try {
            await addBikeBooking({
                bikeId: currentBikeId,
                date: selectedDate,
                guestName: newBooking.guestName,
                roomNumber: newBooking.roomNumber
            });
        } catch (error: any) {
            console.error("Error booking bike:", error);
            const errorMessage = error.message || 'Error desconocido.';
            alert(`No se pudo guardar la reserva. Puede que la bici ya esté ocupada en esta fecha.\n\nError: ${errorMessage}`);
        }
        
        handleCloseModal();
    };
    
    const handleCancelBooking = async (bikeId: number) => {
        if (window.confirm("¿Seguro que quieres cancelar esta reserva?")) {
            try {
                await deleteBikeBooking(bikeId, selectedDate);
            } catch (error: any) {
                console.error("Error canceling booking:", error);
                const errorMessage = error.message || 'Error desconocido.';
                alert(`No se pudo cancelar la reserva.\n\nError: ${errorMessage}`);
            }
        }
    };

    const handleToggleAvailability = async (bikeId: number) => {
        const isCurrentlyAvailable = availableBikes.has(bikeId);

        try {
            await updateBikeAvailability(bikeId, selectedDate, !isCurrentlyAvailable);
        } catch (error) {
            console.error("Error updating bike availability:", error);
            alert("No se pudo actualizar el estado de la bicicleta.");
        }
    };

    return (
        <div>
            <Header title="Control de Bicis" />
            <div className="p-4">
                <div className="mb-6">
                    <label htmlFor="date-picker-bikes" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white bg-gray-900/50 rounded-md p-1 w-fit">Seleccionar Fecha:</label>
                    <input 
                        type="date"
                        id="date-picker-bikes"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-300/50 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                    />
                </div>

                 {dbError && (
                    <div className="bg-red-100/80 dark:bg-red-900/80 backdrop-blur-sm border-l-4 border-red-500 text-red-700 dark:text-red-200 p-4 rounded-lg mb-4" role="alert">
                        <p className="font-bold">Error de Base de Datos</p>
                        <p>{dbError}</p>
                    </div>
                )}

                {isLoading ? (
                    <div className="text-center py-10">Cargando...</div>
                ) : (
                    <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
                        {Array.from({ length: TOTAL_BIKES }, (_, i) => i + 1).map(bikeId => (
                            <Bike
                                key={bikeId} 
                                bikeId={bikeId} 
                                booking={bookings.find(b => b.bikeId === bikeId)}
                                onBook={handleOpenModal}
                                onCancel={handleCancelBooking}
                                userRole={userRole}
                                isAvailable={availableBikes.has(bikeId)}
                                onToggleAvailability={handleToggleAvailability}
                            />
                        ))}
                    </div>
                )}
            </div>
            
            <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={`Reservar Bici ${currentBikeId}`}>
                <form onSubmit={handleBookBike}>
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

export default BikesView;
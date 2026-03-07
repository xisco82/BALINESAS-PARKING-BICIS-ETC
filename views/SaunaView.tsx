
import React, { useState, useEffect, useCallback } from 'react';
import { SaunaBooking, UserRole } from '../types';
import Header from '../components/Header';
import Modal from '../components/Modal';
import { 
  getSaunaBookings, 
  addSaunaBooking, 
  deleteSaunaBooking 
} from '../services/firebaseService';

interface SaunaViewProps {
  dbError: string | null;
  isDbInitialized: boolean;
  isAuthReady: boolean;
  userRole: UserRole;
}

// Helper to generate time slots from 09:00 to 19:30
const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 9; hour < 20; hour++) {
        for (let minute of [0, 30]) {
            if (hour === 19 && minute > 30) continue; // Should not happen with current loop
             if (hour === 20 && minute > 0) continue; // Should not happen
            
            if (hour < 20) { // To avoid 20:30
                slots.push(
                    `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
                );
            }
        }
    }
    // The loop above generates 20:00, let's remove it if present. Last slot should be 19:30
    return slots.filter(slot => slot !== "20:00");
};


const TIME_SLOTS = generateTimeSlots();

const TimeSlot: React.FC<{ 
    time: string; 
    booking: SaunaBooking | undefined; 
    onBook: (time: string) => void; 
    onCancel: (time: string) => void;
    userRole: UserRole;
}> = ({ time, booking, onBook, onCancel, userRole }) => {
    const isBooked = !!booking;
    
    const baseClasses = "p-3 rounded-xl shadow-lg text-center transition-all duration-300 flex flex-col items-center justify-center min-h-[120px] backdrop-blur-sm";
    const bookedClasses = 'bg-red-200/30 dark:bg-red-900/20';
    const availableClasses = 'bg-green-200/30 dark:bg-green-800/20';

    return (
        <div className={`${baseClasses} ${isBooked ? bookedClasses : availableClasses}`}>
            <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100">{time}</h3>
            {isBooked ? (
                <div className="mt-2 text-red-800 dark:text-red-100">
                    <p className="font-semibold text-sm break-all">{booking.guestName}</p>
                    <p className="text-xs">Hab. {booking.roomNumber}</p>
                    {userRole === 'editor' && <button onClick={() => onCancel(time)} className="mt-2 bg-red-500 text-white px-3 py-1 text-xs rounded-md hover:bg-red-600 transition">Cancelar</button>}
                </div>
            ) : (
                <div className="mt-2 text-green-800 dark:text-green-100">
                    <p className="font-semibold text-sm">Disponible</p>
                    {userRole === 'editor' && <button onClick={() => onBook(time)} className="mt-2 bg-green-600 text-white px-3 py-1 text-xs rounded-md hover:bg-green-700 transition">Reservar</button>}
                </div>
            )}
        </div>
    );
}


const SaunaView: React.FC<SaunaViewProps> = ({ dbError, isDbInitialized, isAuthReady, userRole }) => {
    const [bookings, setBookings] = useState<SaunaBooking[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentTimeSlot, setCurrentTimeSlot] = useState<string | null>(null);
    const [newBooking, setNewBooking] = useState({ guestName: '', roomNumber: '' });

    useEffect(() => {
        if (!isAuthReady) return;
        setIsLoading(true);
        const unsubscribe = getSaunaBookings(selectedDate, (bookingsData) => {
            setBookings(bookingsData);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [isAuthReady, selectedDate]);

    const handleOpenModal = (time: string) => {
        setCurrentTimeSlot(time);
        setIsModalOpen(true);
    };
    
    const handleCloseModal = () => {
        setIsModalOpen(false);
        setCurrentTimeSlot(null);
        setNewBooking({ guestName: '', roomNumber: '' });
    };

    const handleBookSlot = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentTimeSlot || !newBooking.guestName || !newBooking.roomNumber) return;
        
        try {
            await addSaunaBooking({
                date: selectedDate,
                timeSlot: currentTimeSlot,
                guestName: newBooking.guestName,
                roomNumber: newBooking.roomNumber
            });
        } catch (error: any) {
            console.error("Error booking sauna slot:", error);
            const errorMessage = error.message || 'Error desconocido.';
            alert(`No se pudo guardar la reserva. Puede que la franja horaria ya esté ocupada.\n\nError: ${errorMessage}`);
        }

        handleCloseModal();
    };
    
    const handleCancelBooking = async (time: string) => {
        if (window.confirm("¿Seguro que quieres cancelar esta reserva?")) {
            try {
                await deleteSaunaBooking(selectedDate, time);
            } catch (error: any) {
                console.error("Error canceling sauna booking:", error);
                const errorMessage = error.message || 'Error desconocido.';
                alert(`No se pudo cancelar la reserva.\n\nError: ${errorMessage}`);
            }
        }
    };

    return (
        <div>
            <Header title="Control de Sauna" />
            <div className="p-4">
                <div className="mb-6">
                    <label htmlFor="date-picker-sauna" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white bg-gray-900/50 rounded-md p-1 w-fit">Seleccionar Fecha:</label>
                    <input 
                        type="date"
                        id="date-picker-sauna"
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
                    <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
                        {TIME_SLOTS.map(time => (
                            <TimeSlot 
                                key={time} 
                                time={time} 
                                booking={bookings.find(b => b.timeSlot === time)}
                                onBook={handleOpenModal}
                                onCancel={handleCancelBooking}
                                userRole={userRole}
                            />
                        ))}
                    </div>
                )}
            </div>
            
            <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={`Reservar Sauna - ${currentTimeSlot}`}>
                <form onSubmit={handleBookSlot}>
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

export default SaunaView;

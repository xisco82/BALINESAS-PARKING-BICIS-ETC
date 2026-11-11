import React, { useState, useEffect } from 'react';
import { BikeBooking, BlockedBike, UserRole } from '../types';
import Header from '../components/Header';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import { 
  getBikeBookings, 
  addBikeBooking, 
  deleteBikeBooking,
  getBikeAvailability,
  updateBikeAvailability,
  getBlockedBikes,
  blockBike,
  unblockBike
} from '../services/firebaseService';

const TOTAL_BIKES = 15;

interface BikesViewProps {
  dbError: string | null;
  isDbInitialized: boolean;
  isAuthReady: boolean;
  userRole: UserRole;
  onRetryAuth: () => void;
}

const Bike: React.FC<{ 
    bikeId: number; 
    booking: BikeBooking | undefined; 
    blockedInfo: BlockedBike | undefined;
    onBook: (bikeId: number) => void; 
    onCancel: (bikeId: number) => void;
    onBlock: (bikeId: number) => void;
    onUnblock: (bikeId: number) => void;
    userRole: UserRole;
    isAvailable: boolean;
    onToggleAvailability: (bikeId: number) => void;
}> = ({ bikeId, booking, blockedInfo, onBook, onCancel, onBlock, onUnblock, userRole, isAvailable, onToggleAvailability }) => {
    const isBooked = !!booking;
    const isBlocked = !!blockedInfo;
    
    let cardBg = 'bg-emerald-200/30 dark:bg-emerald-800/20';
    let ringColor = 'ring-sky-500';
    if (isBlocked) {
        cardBg = 'bg-slate-300/40 dark:bg-slate-800/40 border-2 border-dashed border-slate-400 dark:border-slate-600 opacity-90';
    } else if (isBooked) {
        cardBg = 'bg-rose-200/30 dark:bg-rose-900/20';
    }
    
    const availableRing = isAvailable && !isBlocked ? `ring-2 ring-offset-2 ring-offset-slate-800/10 dark:ring-offset-slate-900/10 ${ringColor}` : '';
    
    const formatReservationTime = (isoString?: string) => {
        if (!isoString) return '';
        try {
            const dateObj = new Date(isoString);
            const day = String(dateObj.getDate()).padStart(2, '0');
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const hour = String(dateObj.getHours()).padStart(2, '0');
            const minute = String(dateObj.getMinutes()).padStart(2, '0');
            return `${day}/${month} ${hour}:${minute}`;
        } catch {
            return '';
        }
    };
    
    return (
        <div className={`p-4 rounded-xl shadow-lg text-center transition-all duration-300 flex flex-col items-center justify-between min-h-[145px] backdrop-blur-sm relative ${availableRing} ${cardBg}`}>
            {userRole === 'editor' && !isBlocked && (
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleAvailability(bikeId); }}
                    className={`absolute top-1.5 right-1.5 px-2 py-0.5 text-[10px] font-semibold rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                        isAvailable 
                        ? 'bg-sky-500 text-white hover:bg-sky-600 focus:ring-sky-400' 
                        : 'bg-slate-300/80 text-slate-700 hover:bg-slate-400/80 focus:ring-slate-400'
                    }`}
                >
                    {isAvailable ? 'OK Fuera' : 'Marcar'}
                </button>
            )}
            <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 mt-2">Bici {bikeId}</h3>
            
            {isBlocked ? (
                <div className="mt-2 text-slate-700 dark:text-slate-300 w-full flex flex-col items-center">
                    <p className="font-bold text-xs uppercase text-rose-600 dark:text-rose-400 flex items-center gap-1">
                        <span>🚫 BLOQUEADA</span>
                    </p>
                    <p className="text-xs italic mt-1 break-all px-1 line-clamp-2 max-w-[150px]">
                        "{blockedInfo.reason}"
                    </p>
                    {blockedInfo.createdAt && (
                        <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-1">
                            Bloqueada desde: <span className="font-semibold text-rose-700 dark:text-rose-400 font-mono">{formatReservationTime(blockedInfo.createdAt)}</span>
                        </p>
                    )}
                    {userRole === 'editor' && (
                        <button 
                            onClick={() => onUnblock(bikeId)} 
                            className="mt-3 bg-slate-500 hover:bg-slate-600 text-white px-2.5 py-1 text-xs font-semibold rounded-md transition"
                        >
                            Desbloquear
                        </button>
                    )}
                </div>
            ) : isBooked ? (
                <div className="mt-2 text-rose-800 dark:text-rose-100">
                    <p className="font-semibold text-sm break-all">{booking.guestName}</p>
                    <p className="text-xs">Hab. {booking.roomNumber}</p>
                    {booking.createdAt && (
                        <p className="text-[10px] font-semibold tracking-wide mt-1 text-rose-700 dark:text-rose-300 font-mono">
                            📅 {formatReservationTime(booking.createdAt)}
                        </p>
                    )}
                    <div className="flex flex-col gap-1.5 mt-3 w-full min-w-[90px]">
                        {userRole === 'editor' && (
                            <>
                                <button onClick={() => onCancel(bikeId)} className="bg-rose-500 text-white px-2.5 py-1 text-xs font-semibold rounded-md hover:bg-rose-600 transition">Cancelar</button>
                                <button onClick={() => onBlock(bikeId)} className="text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 border border-amber-600/20 hover:border-amber-600/40 bg-amber-600/5 hover:bg-amber-600/10 py-0.5 text-[10px] font-medium rounded transition">Bloquear</button>
                            </>
                        )}
                    </div>
                </div>
            ) : (
                <div className="mt-2 text-emerald-800 dark:text-emerald-100">
                    <p className="font-semibold text-sm">Disponible</p>
                    <div className="flex flex-col gap-1.5 mt-3 w-full min-w-[90px]">
                        {userRole === 'editor' && (
                            <>
                                <button onClick={() => onBook(bikeId)} className="bg-emerald-600 text-white px-2.5 py-1 text-xs font-semibold rounded-md hover:bg-emerald-700 transition">Reservar</button>
                                <button onClick={() => onBlock(bikeId)} className="text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 border border-amber-600/20 hover:border-amber-600/40 bg-amber-600/5 hover:bg-amber-600/10 py-0.5 text-[10px] font-medium rounded transition">Bloquear</button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

const BikesView: React.FC<BikesViewProps> = ({ dbError, isDbInitialized, isAuthReady, userRole, onRetryAuth }) => {
    const { showToast, confirm } = useToast();
    const [bookings, setBookings] = useState<BikeBooking[]>([]);
    const [availableBikes, setAvailableBikes] = useState<Set<number>>(new Set());
    const [blockedBikes, setBlockedBikes] = useState<BlockedBike[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
    const [currentBikeId, setCurrentBikeId] = useState<number | null>(null);
    const [newBooking, setNewBooking] = useState({ guestName: '', roomNumber: '' });
    const [blockReason, setBlockReason] = useState('');
    
    useEffect(() => {
        if (!isAuthReady) return;
        setIsLoading(true);
        
        const unsubscribeBookings = getBikeBookings(selectedDate, (bookingsData) => {
            setBookings(bookingsData);
        });

        const unsubscribeAvailability = getBikeAvailability(selectedDate, (ids) => {
            setAvailableBikes(new Set(ids));
        });

        const unsubscribeBlocked = getBlockedBikes((blockedData) => {
            setBlockedBikes(blockedData);
            setIsLoading(false);
        });

        return () => {
            unsubscribeBookings();
            unsubscribeAvailability();
            unsubscribeBlocked();
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

    const handleOpenBlockModal = (bikeId: number) => {
        setCurrentBikeId(bikeId);
        setIsBlockModalOpen(true);
    };

    const handleCloseBlockModal = () => {
        setIsBlockModalOpen(false);
        setCurrentBikeId(null);
        setBlockReason('');
    };

    const handleBookBike = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentBikeId || !newBooking.guestName || !newBooking.roomNumber) return;
        
        try {
            await addBikeBooking({
                bikeId: currentBikeId,
                date: selectedDate,
                guestName: newBooking.guestName,
                roomNumber: newBooking.roomNumber,
                createdAt: new Date().toISOString()
            });
            showToast("Bicicleta reservada correctamente", "success");
        } catch (error: any) {
            console.error("Error booking bike:", error);
            const errorMessage = error.message || 'Error desconocido.';
            showToast(`No se pudo guardar la reserva. Puede que la bici ya esté ocupada en esta fecha: ${errorMessage}`, "error");
        }
        
        handleCloseModal();
    };
    
    const handleCancelBooking = async (bikeId: number) => {
        const confirmed = await confirm("¿Seguro que quieres cancelar esta reserva?");
        if (confirmed) {
            try {
                await deleteBikeBooking(bikeId, selectedDate);
                showToast("Reserva cancelada correctamente", "success");
            } catch (error: any) {
                console.error("Error canceling booking:", error);
                const errorMessage = error.message || 'Error desconocido.';
                showToast(`No se pudo cancelar la reserva: ${errorMessage}`, "error");
            }
        }
    };

    const handleToggleAvailability = async (bikeId: number) => {
        const isCurrentlyAvailable = availableBikes.has(bikeId);

        try {
            await updateBikeAvailability(bikeId, selectedDate, !isCurrentlyAvailable);
            showToast(`Bicicleta ${bikeId} marcada como ${!isCurrentlyAvailable ? 'disponible/fuera' : 'no disponible/dentro'}`, "info");
        } catch (error) {
            console.error("Error updating bike availability:", error);
            showToast("No se pudo actualizar el estado de la bicicleta.", "error");
        }
    };

    const handleBlockBikeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentBikeId || !blockReason) return;

        try {
            await blockBike(currentBikeId, blockReason);
            showToast(`Bicicleta ${currentBikeId} bloqueada correctamente`, "success");
        } catch (error: any) {
            console.error("Error blocking bike:", error);
            showToast("No se pudo bloquear la bicicleta.", "error");
        }

        handleCloseBlockModal();
    };

    const handleUnblockBike = async (bikeId: number) => {
        const confirmed = await confirm(`¿Seguro que quieres desbloquear la Bici ${bikeId}?`);
        if (confirmed) {
            try {
                await unblockBike(bikeId);
                showToast(`Bicicleta ${bikeId} desbloqueada correctamente`, "success");
            } catch (error: any) {
                console.error("Error unblocking bike:", error);
                showToast("No se pudo desbloquear la bicicleta.", "error");
            }
        }
    };

    return (
        <div>
            <Header title="Control de Bicis" />
            <div className="p-4">
                <div className="mb-6">
                    <label htmlFor="date-picker-bikes" className="block mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">Seleccionar Fecha:</label>
                    <input 
                        type="date"
                        id="date-picker-bikes"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="bg-white dark:bg-slate-900 backdrop-blur-sm border border-slate-200 text-slate-900 dark:text-white text-sm rounded-xl focus:ring-amber-200 dark:focus:ring-amber-500/30 focus:border-amber-500 block w-full p-2.5"
                    />
                </div>

                 {dbError && (
                    <div className="bg-rose-100/80 dark:bg-rose-900/80 backdrop-blur-sm border-l-4 border-rose-500 text-rose-700 dark:text-rose-200 p-4 rounded-xl mb-4" role="alert">
                        <p className="font-bold">Error de Conexión</p>
                        <p className="whitespace-pre-line">{dbError}</p>
                        <button 
                            onClick={onRetryAuth} 
                            className="mt-3 bg-rose-600 text-white px-4 py-1 rounded-md text-sm font-bold hover:bg-rose-700 transition-colors"
                        >
                            Reintentar Conexión
                        </button>
                    </div>
                )}

                {isLoading ? (
                    <div className="text-center py-10">Cargando...</div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        {Array.from({ length: TOTAL_BIKES }, (_, i) => i + 1).map(bikeId => (
                            <Bike
                                key={bikeId} 
                                bikeId={bikeId} 
                                booking={bookings.find(b => b.bikeId === bikeId)}
                                blockedInfo={blockedBikes.find(b => b.bikeId === bikeId)}
                                onBook={handleOpenModal}
                                onCancel={handleCancelBooking}
                                onBlock={handleOpenBlockModal}
                                onUnblock={handleUnblockBike}
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
                        <input type="text" placeholder="Nombre del Huésped" value={newBooking.guestName} onChange={(e) => setNewBooking({ ...newBooking, guestName: e.target.value })} className="w-full p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-500/30" required />
                        <input type="text" placeholder="Número de Habitación" value={newBooking.roomNumber} onChange={(e) => setNewBooking({ ...newBooking, roomNumber: e.target.value })} className="w-full p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-500/30" required />
                        <button type="submit" className="w-full bg-amber-400 text-slate-950 p-3 rounded-xl font-bold hover:bg-amber-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2">
                            Confirmar Reserva
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={isBlockModalOpen} onClose={handleCloseBlockModal} title={`Bloquear Bici ${currentBikeId}`}>
                <form onSubmit={handleBlockBikeSubmit}>
                    <div className="space-y-4 text-left">
                        <div>
                            <label className="block text-sm font-semibold mb-2 text-slate-700 dark:text-slate-300">Seleccione un motivo rápido:</label>
                            <div className="flex flex-wrap gap-2 mb-3">
                                {['Robo / Hurto', 'Avería mecánica', 'Pinchazo rueda', 'Mantenimiento preventivo'].map((preset) => (
                                    <button 
                                        key={preset}
                                        type="button"
                                        onClick={() => setBlockReason(preset)}
                                        className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
                                            blockReason === preset 
                                            ? 'bg-amber-600 text-white border-amber-600' 
                                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700'
                                        }`}
                                    >
                                        {preset}
                                    </button>
                                ))}
                            </div>
                        </div>
                        
                        <div>
                            <label className="block text-sm font-semibold mb-2 text-slate-700 dark:text-slate-300">O escriba un motivo detallado:</label>
                            <input 
                                type="text" 
                                placeholder="Escriba el motivo aquí..." 
                                value={blockReason} 
                                onChange={(e) => setBlockReason(e.target.value)} 
                                className="w-full p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-500/30" 
                                required 
                            />
                        </div>

                        <button type="submit" className="w-full bg-amber-600 text-white p-3 rounded-xl font-semibold hover:bg-amber-700 transition-colors">
                            Bloquear Bicicleta
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default BikesView;
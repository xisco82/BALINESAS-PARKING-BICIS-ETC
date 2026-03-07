

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ParkingBooking } from '../types';
import Header from '../components/Header';
import Modal from '../components/Modal';
import { DisabilityIcon } from '../components/icons/NavIcons';
import { useToast } from '../components/Toast';
import { 
  getParkingBookings, 
  addParkingBooking, 
  deleteParkingBooking 
} from '../services/firebaseService';

const TOTAL_SPOTS = 13;
const DISABILITY_SPOT_ID = 1;

type UserRole = 'editor' | 'balinese_editor';

const formatDateToYYYYMMDD = (date: Date): string => {
  if (!date || isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDateString = (date: string | Date | null | undefined): string => {
    if (!date) return '';
    if (typeof date === 'string') {
        return date.substring(0, 10);
    }
    return formatDateToYYYYMMDD(date);
};

interface ParkingViewProps {
  dbError: string | null;
  isDbInitialized: boolean;
  isAuthReady: boolean;
  userRole: UserRole;
  onRetryAuth: () => void;
}

const ParkingView: React.FC<ParkingViewProps> = ({ dbError, isDbInitialized, isAuthReady, userRole, onRetryAuth }) => {
    const { showToast, confirm } = useToast();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [monthlyBookings, setMonthlyBookings] = useState<ParkingBooking[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [bookingToView, setBookingToView] = useState<ParkingBooking | null>(null);
    const [editingBooking, setEditingBooking] = useState<ParkingBooking | null>(null);

    const [newBooking, setNewBooking] = useState({
        guestName: '',
        roomNumber: '',
        spotId: 1,
        startDate: formatDateToYYYYMMDD(new Date()),
        endDate: formatDateToYYYYMMDD(new Date()),
    });
    
    useEffect(() => {
        if (!isAuthReady) return;
        setIsLoading(true);
        const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        
        const unsubscribe = getParkingBookings(
            formatDateToYYYYMMDD(firstDay),
            formatDateToYYYYMMDD(lastDay),
            (bookings) => {
                setMonthlyBookings(bookings);
                setIsLoading(false);
            }
        );
        return () => unsubscribe();
    }, [isAuthReady, currentDate]);

    const bookingsMap = useMemo(() => {
        const map = new Map<string, ParkingBooking>();
        monthlyBookings.forEach(booking => {
            const dateStr = getDateString(booking.date);
            const key = `${dateStr}-${booking.spotId}`;
            map.set(key, booking);
        });
        return map;
    }, [monthlyBookings]);

    const handleOpenBookingModal = () => setIsBookingModalOpen(true);

    const handleCloseBookingModal = () => {
        setIsBookingModalOpen(false);
        setEditingBooking(null);
        const today = formatDateToYYYYMMDD(new Date());
        setNewBooking({ guestName: '', roomNumber: '', spotId: 1, startDate: today, endDate: today });
    };

    const handleCloseDetailModal = () => {
        setIsDetailModalOpen(false);
        setBookingToView(null);
    };

    const handleCellClick = (day: number, spotId: number) => {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        const dateStr = formatDateToYYYYMMDD(date);
        const booking = bookingsMap.get(`${dateStr}-${spotId}`);

        if (booking) {
            setBookingToView(booking);
            setIsDetailModalOpen(true);
        } else if (userRole === 'editor') {
            setNewBooking({
                guestName: '',
                roomNumber: '',
                spotId: spotId,
                startDate: dateStr,
                endDate: dateStr,
            });
            handleOpenBookingModal();
        }
    };
    
    const getReservationRange = (booking: ParkingBooking, returnDateObjects = false) => {
        const guestReservations = monthlyBookings.filter(b => 
            b.spotId === booking.spotId && 
            b.guestName === booking.guestName && 
            b.roomNumber === booking.roomNumber
        );
        if (guestReservations.length === 0) {
            const bookingDate = new Date(getDateString(booking.date) + 'T00:00:00');
            return returnDateObjects 
                ? { start: bookingDate, end: bookingDate }
                : { start: booking.date, end: booking.date };
        }

        const dates = guestReservations.map(b => new Date(getDateString(b.date)).getTime());
        const startDate = new Date(Math.min(...dates));
        const endDate = new Date(Math.max(...dates));

        if (returnDateObjects) {
            return { start: startDate, end: endDate };
        }

        return {
            start: startDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
            end: endDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
        };
    };

    const handleOpenEditModal = (booking: ParkingBooking | null) => {
        if (!booking) return;

        const range = getReservationRange(booking, true);
        
        setEditingBooking(booking);
        setNewBooking({
            guestName: booking.guestName,
            roomNumber: booking.roomNumber,
            spotId: booking.spotId,
            startDate: formatDateToYYYYMMDD(range.start as Date),
            endDate: formatDateToYYYYMMDD(range.end as Date),
        });

        handleCloseDetailModal();
        handleOpenBookingModal();
    };

    const handleBookSpot = async (e: React.FormEvent) => {
        e.preventDefault();
        const { guestName, roomNumber, spotId, startDate, endDate } = newBooking;
        if (!guestName || !roomNumber || !spotId || !startDate || !endDate) {
            showToast("Por favor, complete todos los campos.", "error");
            return;
        }
        if (new Date(startDate) > new Date(endDate)) {
            showToast('La fecha de inicio no puede ser posterior a la fecha de fin.', "error");
            return;
        }
        
        try {
            if (editingBooking) {
                // --- UPDATE LOGIC ---
                const oldRange = getReservationRange(editingBooking, true);
                const oldStart = oldRange.start as Date;
                const oldEnd = oldRange.end as Date;
                
                const deletePromises = [];
                for (let d = new Date(oldStart); d <= oldEnd; d.setDate(d.getDate() + 1)) {
                    deletePromises.push(deleteParkingBooking(editingBooking.spotId, formatDateToYYYYMMDD(d)));
                }
                await Promise.all(deletePromises);
            }

            // Insert new booking dates
            const start = new Date(startDate + 'T00:00:00');
            const end = new Date(endDate + 'T00:00:00');
            const bookingPromises = [];

            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                bookingPromises.push(addParkingBooking({
                    spotId,
                    date: formatDateToYYYYMMDD(d),
                    guestName,
                    roomNumber
                }));
            }
            await Promise.all(bookingPromises);
            
            showToast(editingBooking ? "Reserva actualizada correctamente" : "Reserva realizada correctamente", "success");
            handleCloseBookingModal();
        } catch (error: any) {
            console.error("Error saving parking spot reservation:", error);
            showToast(`No se pudo guardar la reserva: ${error.message}`, "error");
        }
    };
    
    const handleCancelBooking = async (bookingToCancel: ParkingBooking) => {
        const confirmed = await confirm(`¿Cancelar reserva de la plaza ${bookingToCancel.spotId} para ${bookingToCancel.guestName}?`);
        if (!confirmed) {
            return;
        }
        
        // Find all reservations for this guest in this spot to check for multi-day
        const guestReservations = monthlyBookings.filter(b => 
            b.spotId === bookingToCancel.spotId && 
            b.guestName === bookingToCancel.guestName && 
            b.roomNumber === bookingToCancel.roomNumber
        );
    
        const isMultiDay = guestReservations.length > 1;
        let deleteAll = false;
        const dateToCancel = new Date(getDateString(bookingToCancel.date) + 'T00:00:00');
    
        if (isMultiDay) {
            const deleteFull = await confirm(`Esta es una reserva de varios días. ¿Quieres eliminar la reserva completa? (Si no, sólo se borrará el día ${dateToCancel.toLocaleDateString('es-ES')})`);
            if (deleteFull) {
                deleteAll = true;
            }
        }
        
        try {
            if (deleteAll) {
                const deletePromises = guestReservations.map(b => 
                    deleteParkingBooking(b.spotId, getDateString(b.date))
                );
                await Promise.all(deletePromises);
            } else {
                await deleteParkingBooking(bookingToCancel.spotId, getDateString(bookingToCancel.date));
            }
            
            showToast("Reserva cancelada correctamente", "success");
            handleCloseDetailModal();
        } catch (error: any) {
            console.error("Error canceling booking:", error);
            showToast(`No se pudo cancelar la reserva: ${error.message}`, "error");
        }
    };
    
    const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i);
    const months = Array.from({ length: 12 }, (_, i) => new Date(0, i).toLocaleString('es-ES', { month: 'long' }));
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();

    const ParkingGrid = ({ startDay, endDay }: { startDay: number, endDay: number }) => {
        if (startDay > daysInMonth) return null;
        const rows = Array.from({ length: Math.min(endDay, daysInMonth) - startDay + 1 }, (_, i) => startDay + i);

        return (
            <div className="overflow-x-auto shadow-lg rounded-lg mb-8 backdrop-blur-sm bg-white/30 dark:bg-gray-900/30">
                <table className="min-w-full text-xs sm:text-sm">
                    <thead>
                        <tr className="bg-gray-200/80 dark:bg-gray-700/80">
                            <th className="p-2 border-r border-gray-300 dark:border-gray-600 font-semibold text-gray-700 dark:text-gray-200 sticky left-0 bg-gray-200/80 dark:bg-gray-700/80 z-10">Día</th>
                            {Array.from({ length: TOTAL_SPOTS }, (_, i) => i + 1).map(spotId => (
                                <th key={spotId} className={`p-1 sm:p-2 border-r border-gray-300 dark:border-gray-600 font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap ${spotId === DISABILITY_SPOT_ID ? 'bg-blue-200/80 dark:bg-blue-800/80' : ''}`}>
                                    <div className="flex items-center justify-center gap-1">
                                      {spotId === DISABILITY_SPOT_ID && <div className="w-4 h-4"><DisabilityIcon /></div>}
                                      <span>Nº {spotId}</span>
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(day => {
                            const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
                            const dayOfWeek = date.getDay();
                            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                            return (
                                <tr key={day} className={`text-center ${isWeekend ? 'bg-gray-500/10' : 'bg-transparent'}`}>
                                    <td className="p-2 border-r border-gray-300 dark:border-gray-600 font-bold text-gray-800 dark:text-gray-100 sticky left-0 z-10 bg-inherit">{day}</td>
                                    {Array.from({ length: TOTAL_SPOTS }, (_, i) => i + 1).map(spotId => {
                                        const dateStr = formatDateToYYYYMMDD(date);
                                        const booking = bookingsMap.get(`${dateStr}-${spotId}`);
                                        const cellClasses = userRole === 'editor' || !booking ? 'cursor-pointer' : 'cursor-default';
                                        return (
                                            <td 
                                                key={spotId} 
                                                onClick={() => handleCellClick(day, spotId)}
                                                className={`p-1 h-12 border-r border-t border-gray-300 dark:border-gray-600 transition-colors duration-200 ${cellClasses} ${booking ? 'bg-yellow-200/50 dark:bg-yellow-800/40 text-gray-800 dark:text-yellow-100 font-bold' : 'hover:bg-green-200/50 dark:hover:bg-green-700/40'}`}
                                            >
                                                {booking ? booking.roomNumber : ''}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div>
            <Header title="ALQUILER PARKING">
              {userRole === 'editor' && (
                <button onClick={handleOpenBookingModal} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-md">
                    Reservar Plaza
                </button>
              )}
            </Header>
            <div className="p-4">
                <div className="flex justify-center items-center gap-4 mb-4 p-3 bg-white/50 dark:bg-gray-800/50 backdrop-blur-md rounded-xl shadow-sm">
                    <select
                        value={currentDate.getMonth()}
                        onChange={(e) => setCurrentDate(new Date(currentDate.getFullYear(), parseInt(e.target.value), 1))}
                        className="bg-white/80 dark:bg-gray-700/80 rounded-md p-2 border border-gray-300/50 dark:border-gray-600/50 font-semibold"
                    >
                        {months.map((month, index) => <option key={month} value={index}>{month.charAt(0).toUpperCase() + month.slice(1)}</option>)}
                    </select>
                    <select
                        value={currentDate.getFullYear()}
                        onChange={(e) => setCurrentDate(new Date(parseInt(e.target.value), currentDate.getMonth(), 1))}
                        className="bg-white/80 dark:bg-gray-700/80 rounded-md p-2 border border-gray-300/50 dark:border-gray-600/50 font-semibold"
                    >
                        {years.map(year => <option key={year} value={year}>{year}</option>)}
                    </select>
                </div>

                {dbError && (
                    <div className="bg-red-100/80 dark:bg-red-900/80 border-l-4 border-red-500 text-red-700 dark:text-red-200 p-4 rounded-lg mb-4" role="alert">
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
                
                {isLoading ? <div className="text-center py-10">Cargando...</div> : (
                    <>
                        <ParkingGrid startDay={1} endDay={15} />
                        <ParkingGrid startDay={16} endDay={daysInMonth} />
                    </>
                )}
            </div>

            <Modal isOpen={isDetailModalOpen} onClose={handleCloseDetailModal} title={`Detalles Plaza ${bookingToView?.spotId}`}>
                {bookingToView && (() => {
                    const range = getReservationRange(bookingToView);
                    return (
                        <div className="space-y-3 text-gray-800 dark:text-gray-100">
                            <p className="text-lg"><strong className="font-semibold">Huésped:</strong> {bookingToView.guestName}</p>
                            <p className="text-lg"><strong className="font-semibold">Habitación:</strong> {bookingToView.roomNumber}</p>
                            <p className="text-lg"><strong className="font-semibold">Periodo:</strong> {range.start instanceof Date ? range.start.toLocaleDateString() : range.start} - {range.end instanceof Date ? range.end.toLocaleDateString() : range.end}</p>
                            {userRole === 'editor' && (
                                <div className="pt-4 flex justify-end space-x-2">
                                     <button
                                        onClick={() => handleOpenEditModal(bookingToView)}
                                        className="bg-yellow-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-yellow-600 transition-colors"
                                    >
                                        Editar
                                    </button>
                                    <button
                                        onClick={() => handleCancelBooking(bookingToView)}
                                        className="bg-red-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-600 transition-colors"
                                    >
                                        Cancelar Reserva
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })()}
            </Modal>
            
            <Modal isOpen={isBookingModalOpen} onClose={handleCloseBookingModal} title={editingBooking ? "Editar Reserva de Parking" : "Nueva Reserva de Parking"}>
                <form onSubmit={handleBookSpot}>
                    <div className="space-y-4">
                        <input type="text" placeholder="Nombre del Huésped" value={newBooking.guestName} onChange={(e) => setNewBooking({ ...newBooking, guestName: e.target.value })} className="w-full p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                        <input type="text" placeholder="Número de Habitación" value={newBooking.roomNumber} onChange={(e) => setNewBooking({ ...newBooking, roomNumber: e.target.value })} className="w-full p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                        <div>
                            <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Nº de Plaza</label>
                            <select value={newBooking.spotId} onChange={(e) => setNewBooking({ ...newBooking, spotId: parseInt(e.target.value) })} className="w-full p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
                                {Array.from({ length: TOTAL_SPOTS }, (_, i) => i + 1).map(id => <option key={id} value={id}>{id}{id === DISABILITY_SPOT_ID ? ' (Accesible)' : ''}</option>)}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Fecha Inicio</label>
                                <input type="date" value={newBooking.startDate} onChange={(e) => setNewBooking({ ...newBooking, startDate: e.target.value, endDate: e.target.value > newBooking.endDate ? e.target.value : newBooking.endDate })} className="w-full p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Fecha Fin</label>
                                <input type="date" min={newBooking.startDate} value={newBooking.endDate} onChange={(e) => setNewBooking({ ...newBooking, endDate: e.target.value })} className="w-full p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                            </div>
                        </div>
                        <button type="submit" className="w-full bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
                            {editingBooking ? 'Actualizar Reserva' : 'Confirmar Reserva'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default ParkingView;
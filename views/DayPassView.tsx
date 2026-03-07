import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DayPassBooking, UserRole } from '../types';
import Header from '../components/Header';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import { 
  getDayPassBookings, 
  addDayPassBooking, 
  deleteDayPassBooking,
  updateDayPassBooking
} from '../services/firebaseService';

interface DayPassViewProps {
  dbError: string | null;
  isDbInitialized: boolean;
  isAuthReady: boolean;
  userRole: UserRole;
  onRetryAuth: () => void;
}

const DAY_PASS_OPTIONS = [
  { id: '1. Desayuno', name: 'Desayuno' },
  { id: '2. Day Pass con Desayuno', name: 'Day Pass con Desayuno' },
  { id: '3. Day Pass con Almuerzo', name: 'Day Pass con Almuerzo' },
  { id: '6. Day Pass con Cama Balinesa + Almuerzo', name: 'Day Pass con Cama Balinesa + Almuerzo' },
  { id: '4. Day Pass con Cena Buffet', name: 'Day Pass con Cena Buffet' },
  { id: '5. Day Pass de Tarde con Cena Buffet & Cocktail', name: 'Day Pass de Tarde con Cena Buffet & Cocktail' },
];

const initialFormState = {
    clientName: '',
    serviceType: DAY_PASS_OPTIONS[0].id,
    numberOfPeople: 1,
    notes: '',
    createdFrom: 'direct',
};

const DayPassView: React.FC<DayPassViewProps> = ({ dbError, isDbInitialized, isAuthReady, userRole, onRetryAuth }) => {
    const { showToast, confirm } = useToast();
    const [bookings, setBookings] = useState<DayPassBooking[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [editingBooking, setEditingBooking] = useState<DayPassBooking | null>(null);
    const [formData, setFormData] = useState(initialFormState);
    const [selectedServices, setSelectedServices] = useState<string[]>([]);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const filterRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isAuthReady) return;
        setIsLoading(true);
        const unsubscribe = getDayPassBookings(selectedDate, (bookingsData) => {
            setBookings(bookingsData);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [isAuthReady, selectedDate]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
                setIsFilterOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [filterRef]);
    
    const handleOpenAddModal = () => {
        setEditingBooking(null);
        setFormData(initialFormState);
        setIsModalOpen(true);
    };

    const handleOpenEditModal = (booking: DayPassBooking) => {
        setEditingBooking(booking);
        setFormData({
            clientName: booking.clientName,
            serviceType: booking.serviceType,
            numberOfPeople: booking.numberOfPeople || 1,
            notes: booking.notes || '',
            createdFrom: booking.createdFrom || 'direct',
        });
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingBooking(null);
        setFormData(initialFormState);
    };

    const handleSaveBooking = async (e: React.FormEvent) => {
        e.preventDefault();
        const { clientName, serviceType, notes, numberOfPeople, createdFrom } = formData;
        if (!clientName || !serviceType || !numberOfPeople || numberOfPeople < 1) {
            showToast("Por favor, complete todos los campos requeridos y asegúrese de que el número de personas sea al menos 1.", "error");
            return;
        }
        
        try {
            if (editingBooking) {
                await updateDayPassBooking(editingBooking.id, {
                    clientName,
                    serviceType,
                    notes: notes || null,
                    numberOfPeople,
                    createdFrom
                });
                showToast("Day Pass actualizado correctamente", "success");
            } else {
                await addDayPassBooking({
                    date: selectedDate,
                    clientName,
                    serviceType,
                    notes: notes || null,
                    createdBy: userRole,
                    numberOfPeople,
                    createdFrom
                });
                showToast("Day Pass guardado correctamente", "success");
            }
        } catch (error: any) {
            console.error("Error saving day pass:", error);
            const errorMessage = error.message || 'Error desconocido.';
            showToast(`No se pudo guardar el Day Pass: ${errorMessage}`, "error");
        }
        
        handleCloseModal();
    };
    
    const handleDeleteBooking = async (id: string) => {
        const confirmed = await confirm("¿Seguro que quieres eliminar este Day Pass?");
        if (confirmed) {
           try {
                await deleteDayPassBooking(id);
                showToast("Day Pass eliminado correctamente", "success");
           } catch (error: any) {
               console.error("Error deleting day pass:", error);
               const errorMessage = error.message || 'Error desconocido.';
               showToast(`No se pudo eliminar el Day Pass: ${errorMessage}`, "error");
           }
        }
    };

    const handleFilterChange = (serviceId: string) => {
        setSelectedServices(prev => 
            prev.includes(serviceId) 
                ? prev.filter(id => id !== serviceId) 
                : [...prev, serviceId]
        );
    };
    
    const dailySummary = useMemo(() => {
        const summaryMap = new Map<string, number>();
        bookings.forEach(booking => {
            const currentPax = summaryMap.get(booking.serviceType) || 0;
            summaryMap.set(booking.serviceType, currentPax + (booking.numberOfPeople || 1));
        });

        return DAY_PASS_OPTIONS.map(option => ({
            serviceName: option.name,
            totalPax: summaryMap.get(option.id) || 0,
        }));
    }, [bookings]);

    const selectionSummary = useMemo(() => {
        if (selectedServices.length === 0) return { totalPax: 0 };
        
        const filteredBookings = bookings.filter(b => selectedServices.includes(b.serviceType));
        const totalPax = filteredBookings.reduce((sum, booking) => sum + (booking.numberOfPeople || 1), 0);

        return { totalPax };
    }, [bookings, selectedServices]);
    
    const totalPeopleToday = useMemo(() => {
        // Calculate the total from the summary to ensure it matches what's displayed.
        // This prevents discrepancies if bookings have service types not in DAY_PASS_OPTIONS.
        return dailySummary.reduce((sum, service) => sum + service.totalPax, 0);
    }, [dailySummary]);

    const groupedAndFilteredBookings = useMemo(() => {
        const filtered = selectedServices.length === 0
            ? bookings
            : bookings.filter(booking => selectedServices.includes(booking.serviceType));

        const groups = new Map<string, DayPassBooking[]>();
        filtered.forEach(booking => {
            if (!groups.has(booking.serviceType)) {
                groups.set(booking.serviceType, []);
            }
            groups.get(booking.serviceType)!.push(booking);
        });
        
        return groups;
    }, [bookings, selectedServices]);

    return (
        <div>
            <Header title="Day Pass">
              {userRole === 'editor' && (
                <button onClick={handleOpenAddModal} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
                    Añadir Day Pass
                </button>
              )}
            </Header>

            <div className="p-4 space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="daypass-date-picker" className="block mb-2 text-sm font-medium text-gray-900 dark:text-white bg-gray-900/50 rounded-md p-1 w-fit">Seleccionar Fecha:</label>
                        <input 
                            type="date"
                            id="daypass-date-picker"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-300/50 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                        />
                    </div>
                    <div ref={filterRef}>
                        <label className="block mb-2 text-sm font-medium text-gray-900 dark:text-white bg-gray-900/50 rounded-md p-1 w-fit">Filtrar por Servicio:</label>
                        <div className="relative">
                            <button
                                onClick={() => setIsFilterOpen(prev => !prev)}
                                className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-300/50 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 text-left flex justify-between items-center"
                            >
                                <span>{selectedServices.length > 0 ? `${selectedServices.length} seleccionado(s)` : 'Todos los servicios'}</span>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                            </button>
                            {isFilterOpen && (
                                <div className="absolute z-10 mt-1 w-full bg-white/95 dark:bg-gray-800/95 backdrop-blur-md rounded-lg shadow-xl border border-gray-200/50 dark:border-gray-700/50 max-h-60 overflow-y-auto">
                                    <div className="p-2">
                                         <label className="flex items-center w-full px-2 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 rounded"
                                                checked={selectedServices.length === DAY_PASS_OPTIONS.length}
                                                onChange={() => setSelectedServices(prev => prev.length === DAY_PASS_OPTIONS.length ? [] : DAY_PASS_OPTIONS.map(o => o.id))}
                                            />
                                            <span className="ml-2 font-semibold">{selectedServices.length === DAY_PASS_OPTIONS.length ? 'Deseleccionar Todos' : 'Seleccionar Todos'}</span>
                                        </label>
                                        <hr className="my-1 border-gray-200 dark:border-gray-600"/>
                                        {DAY_PASS_OPTIONS.map(opt => (
                                            <label key={opt.id} className="flex items-center w-full px-2 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="h-4 w-4 rounded"
                                                    checked={selectedServices.includes(opt.id)}
                                                    onChange={() => handleFilterChange(opt.id)}
                                                />
                                                <span className="ml-2">{opt.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
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
                
                {!isLoading && !dbError && totalPeopleToday > 0 && (
                    <div className="bg-white/50 dark:bg-gray-800/50 backdrop-blur-md rounded-xl shadow-md p-4 animate-fade-in">
                        <h3 className="font-bold text-lg mb-3 pb-2 border-b border-gray-300/50 dark:border-gray-600/50 text-gray-900 dark:text-gray-100">Resumen del Día</h3>
                        <dl className="space-y-2 text-sm">
                            {dailySummary.map(({ serviceName, totalPax }) => (
                                <div key={serviceName} className="flex justify-between items-center">
                                    <dt className="text-gray-600 dark:text-gray-300">{serviceName}</dt>
                                    <dd className={`font-semibold rounded-full px-3 py-1 text-xs ${totalPax > 0 ? 'text-gray-900 dark:text-white bg-gray-200/60 dark:bg-gray-700/60' : 'text-gray-400 dark:text-gray-500'}`}>
                                        {totalPax} {totalPax === 1 ? 'pax' : 'pax'}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                        <hr className="my-3 border-gray-300/50 dark:border-gray-600/50" />
                        <div className="flex justify-between items-center">
                            <dt className="font-bold text-gray-700 dark:text-gray-200">Total del Día:</dt>
                            <dd className="font-bold text-xl text-green-700 dark:text-green-300">
                                {totalPeopleToday} Personas
                            </dd>
                        </div>
                    </div>
                )}

                {!isLoading && !dbError && selectedServices.length > 0 && (
                    <div className="bg-blue-100/60 dark:bg-blue-900/30 backdrop-blur-md rounded-xl shadow-md p-4 animate-fade-in border border-blue-300/50 dark:border-blue-700/50">
                        <h3 className="font-bold text-lg mb-2 text-blue-800 dark:text-blue-200">Total de la Selección</h3>
                        <div className="flex justify-between items-center">
                            <dt className="font-bold text-blue-700 dark:text-blue-200">Suma de personas:</dt>
                            <dd className="font-bold text-2xl text-blue-700 dark:text-blue-200">
                                {selectionSummary.totalPax} Personas
                            </dd>
                        </div>
                    </div>
                )}


                <div className="space-y-4">
                    {isLoading ? (
                         <div className="text-center py-10">Cargando...</div>
                    ) : !dbError && groupedAndFilteredBookings.size > 0 ? (
                        DAY_PASS_OPTIONS.map(option => {
                            const bookingsForService = groupedAndFilteredBookings.get(option.id);
                            if (!bookingsForService || bookingsForService.length === 0) {
                                return null;
                            }
                            return (
                                <div key={option.id} className="animate-fade-in">
                                    <h4 className="font-bold text-lg mt-4 mb-2 pl-2 text-gray-800 dark:text-gray-100">{option.name}</h4>
                                    <div className="space-y-2">
                                        {bookingsForService.map(booking => {
                                            let cardClasses = 'bg-white/30 dark:bg-gray-800/30'; // Default
                                            if (booking.createdFrom === 'direct') {
                                                cardClasses = 'bg-red-600/50 dark:bg-red-800/40 border border-red-500/60 dark:border-red-600/60';
                                            } else if (booking.createdFrom === 'hoteltreats') {
                                                cardClasses = 'bg-blue-300/40 dark:bg-blue-900/20 border border-blue-400/50 dark:border-blue-700/50';
                                            }

                                            return (
                                                <div key={booking.id} className={`flex justify-between items-center ${cardClasses} backdrop-blur-sm px-4 py-3 rounded-lg shadow-md`}>
                                                    <div className="min-w-0 flex items-baseline space-x-3">
                                                        <p className="font-bold text-gray-900 dark:text-gray-100 truncate flex items-center" title={booking.clientName}>
                                                            {booking.clientName}
                                                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200/80 dark:bg-gray-700/80 text-gray-800 dark:text-gray-200">
                                                                {booking.numberOfPeople || 1} {booking.numberOfPeople > 1 ? 'pax' : 'pax'}
                                                            </span>
                                                        </p>
                                                        <p className="text-sm text-black dark:text-gray-400 truncate flex-shrink" title={booking.serviceType}>{booking.serviceType.replace(/^\d+\.\s/, '')}</p>
                                                    </div>

                                                    <div className="ml-4 flex-shrink-0 flex items-center space-x-3">
                                                        {booking.createdFrom && (
                                                            <span className={`inline-block w-32 text-center px-2.5 py-1 rounded-full text-xs font-bold ${
                                                                booking.createdFrom === 'direct' 
                                                                    ? 'bg-red-200/80 text-red-800 dark:bg-red-900/60 dark:text-red-200' 
                                                                    : 'bg-blue-200/80 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200'
                                                            }`}>
                                                                {booking.createdFrom === 'direct' ? 'DIR DAY PASS' : 'DIR HOTELTREATS'}
                                                            </span>
                                                        )}
                                                        
                                                        {booking.notes && (
                                                            <div title={booking.notes}>
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 dark:text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                                                                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2-2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                                                                </svg>
                                                            </div>
                                                        )}

                                                        {userRole === 'editor' && (
                                                            <>
                                                                <button 
                                                                    onClick={() => handleOpenEditModal(booking)}
                                                                    className="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-300 p-2 rounded-full transition-colors"
                                                                    aria-label="Editar Day Pass"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                                        <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
                                                                        <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
                                                                    </svg>
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleDeleteBooking(booking.id)} 
                                                                    className="text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 p-2 rounded-full transition-colors"
                                                                    aria-label="Eliminar Day Pass"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                                                    </svg>
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        !dbError && <div className="text-center py-10 text-gray-800 dark:text-gray-200 bg-gray-50/30 dark:bg-gray-800/30 backdrop-blur-sm rounded-lg">
                            No hay ventas de Day Pass para esta fecha {selectedServices.length > 0 ? `con el filtro seleccionado` : ''}.
                        </div>
                    )}
                </div>
            </div>
            
            <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={editingBooking ? "Editar Day Pass" : "Añadir Day Pass"}>
                <form onSubmit={handleSaveBooking}>
                    <div className="space-y-4">
                        <input type="text" placeholder="Nombre del Cliente" value={formData.clientName} onChange={(e) => setFormData({ ...formData, clientName: e.target.value })} className="w-full p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                        
                        <div className="grid grid-cols-3 gap-4">
                            <div className="col-span-2">
                                <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Tipo de Servicio</label>
                                <select value={formData.serviceType} onChange={(e) => setFormData(prev => ({ ...prev, serviceType: e.target.value }))} className="w-full p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                                    {DAY_PASS_OPTIONS.map(opt => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
                                </select>
                            </div>
                             <div>
                                <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Nº Personas</label>
                                <input type="number" min="1" value={formData.numberOfPeople} onChange={(e) => setFormData({ ...formData, numberOfPeople: parseInt(e.target.value) || 1 })} className="w-full p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                            </div>
                        </div>
                        
                        <div>
                            <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Origen de la reserva</label>
                            <div className="mt-2 flex space-x-4 p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg">
                                <label className="flex items-center">
                                    <input
                                        type="radio"
                                        name="createdFrom"
                                        value="direct"
                                        checked={formData.createdFrom === 'direct'}
                                        onChange={(e) => setFormData({ ...formData, createdFrom: e.target.value })}
                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                                    />
                                    <span className="ml-2 text-gray-700 dark:text-gray-200">DIR DAY PASS</span>
                                </label>
                                <label className="flex items-center">
                                    <input
                                        type="radio"
                                        name="createdFrom"
                                        value="hoteltreats"
                                        checked={formData.createdFrom === 'hoteltreats'}
                                        onChange={(e) => setFormData({ ...formData, createdFrom: e.target.value })}
                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                                    />
                                    <span className="ml-2 text-gray-700 dark:text-gray-200">DIR HOTELTREATS</span>
                                </label>
                            </div>
                        </div>

                        <textarea placeholder="Notas (opcional)" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="w-full p-3 bg-gray-100/80 dark:bg-gray-700/80 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" rows={3}></textarea>
                        
                        <button type="submit" className="w-full bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
                            {editingBooking ? 'Guardar Cambios' : 'Guardar Day Pass'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default DayPassView;
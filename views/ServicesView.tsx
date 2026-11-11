
import React, { useState, useEffect, useMemo } from 'react';
import { RestaurantBooking, NewsEvent } from '../types';
import { mergeEventSources } from '../services/eventSync';
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
  /** Opens a monthly summary document (used by "Eventos Anuales"). */
  onOpenDocument?: (pdfId: string) => void;
}

const ServicesView: React.FC<ServicesViewProps> = ({ dbError, isDbInitialized, isAuthReady, userRole, title, tableName, onRetryAuth, hideHeader, onOpenDocument }) => {
    const { showToast, confirm } = useToast();
    const [bookings, setBookings] = useState<RestaurantBooking[]>([]);
    const [allRestaurantBookings, setAllRestaurantBookings] = useState<RestaurantBooking[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingBooking, setEditingBooking] = useState<RestaurantBooking | null>(null);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [showFullYear, setShowFullYear] = useState(false);
    
    // Daily view filters
    const [mealFilter, setMealFilter] = useState<'todos' | 'total_desayunos' | 'total_cenas' | 'desayuno' | 'desayuno_compensacion' | 'desayuno_cena' | 'desayuno_cena_compensacion' | 'solo_bebidas' | 'cena' | 'cena_compensacion' | 'MP'>('todos');
    const [checkedInFilter, setCheckedInFilter] = useState<'pending' | 'all'>('all');
    
    // Restaurant view mode: daily vs monthly/period
    const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('daily');
    const [periodFilterMode, setPeriodFilterMode] = useState<'month' | 'custom'>('month');
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [customStartDate, setCustomStartDate] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    });
    const [customEndDate, setCustomEndDate] = useState(() => {
        const d = new Date();
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    });
    const [monthlyMealFilter, setMonthlyMealFilter] = useState<'todos' | 'total_desayunos' | 'total_cenas' | 'desayuno' | 'desayuno_compensacion' | 'desayuno_cena' | 'desayuno_cena_compensacion' | 'solo_bebidas' | 'cena' | 'cena_compensacion' | 'MP'>('todos');
    const [monthlyTab, setMonthlyTab] = useState<'days' | 'bookings'>('days');
    const [monthlySearchQuery, setMonthlySearchQuery] = useState('');
    const [onlyDaysWithBookings, setOnlyDaysWithBookings] = useState(true);
    const [expandedMonthDays, setExpandedMonthDays] = useState<Record<string, boolean>>({});

    const [newBooking, setNewBooking] = useState({ 
        guestName: '', 
        roomNumber: '', 
        description: '',
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        guestsCount: 1,
        mealType: 'desayuno_cena' as 'desayuno' | 'desayuno_compensacion' | 'desayuno_cena' | 'desayuno_cena_compensacion' | 'solo_bebidas' | 'cena' | 'cena_compensacion' | 'MP' | 'almuerzo'
    });

    useEffect(() => {
        if (!isAuthReady) return;
        setIsLoading(true);

        let serviceBookings: RestaurantBooking[] = [];
        let rawNews: NewsEvent[] = [];
        let rawPdfs: any[] = [];

        const updateCombinedBookings = () => {
            let allBookings = [...serviceBookings];
            
            if (tableName === 'events_bookings') {
                // Same merge used by "Novedades" so both tabs never repeat a date.
                allBookings = mergeEventSources(serviceBookings, rawNews, rawPdfs)
                    .filter(e => e.startDate.startsWith(selectedYear.toString()) || e.endDate.startsWith(selectedYear.toString()))
                    .map(e => ({
                        id: e.id,
                        guestName: e.title,
                        roomNumber: '',
                        description: e.description,
                        startDate: e.startDate,
                        endDate: e.endDate,
                        origin: e.source,
                        pdfId: e.pdfId,
                        pdfName: e.pdfName,
                    }));
                
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
                        const mealPriority: Record<string, number> = { 
                            'desayuno': 1, 
                            'desayuno_compensacion': 2, 
                            'desayuno_cena': 3, 
                            'MP': 3, 
                            'desayuno_cena_compensacion': 4, 
                            'solo_bebidas': 5, 
                            'almuerzo': 5, 
                            'cena': 6, 
                            'cena_compensacion': 7 
                        };
                        const priorityA = mealPriority[a.mealType || ''] || 8;
                        const priorityB = mealPriority[b.mealType || ''] || 8;
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
        } else if (tableName === 'restaurant_bookings') {
            // For restaurant, subscribe to all bookings so both daily and monthly calculations are immediately reactive
            unsubscribeServices = getAllServiceBookings(tableName, (allBookings) => {
                setAllRestaurantBookings(allBookings);
                const dailyActive = allBookings
                    .filter(b => b.startDate <= selectedDate && b.endDate >= selectedDate)
                    .map(b => ({ ...b, origin: 'service' as const }));
                serviceBookings = dailyActive;
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
                rawNews = allEvents;
                updateCombinedBookings();
            });

            unsubscribePdfs = getEventPdfs((allPdfs) => {
                rawPdfs = allPdfs;
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
            // A booking is considered "checkedIn" for today if it matches the selected date
            const isCurrentlyCheckedIn = booking.checkedIn && booking.checkedInDate === selectedDate;
            await toggleServiceBookingCheckIn(tableName, booking.id, isCurrentlyCheckedIn, selectedDate);
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
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            return '';
        }
        return date.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
        });
    };

    // Helper to get styled badge for meal types
    const getMealTypeBadge = (mealType?: string) => {
        switch (mealType) {
            case 'desayuno':
                return {
                    label: 'Desayuno',
                    className: 'bg-yellow-100 text-yellow-800 border border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-200 dark:border-yellow-800'
                };
            case 'desayuno_compensacion':
                return {
                    label: 'Desayuno Compensación',
                    className: 'bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-900/50 dark:text-amber-200 dark:border-amber-700'
                };
            case 'desayuno_cena':
            case 'MP':
                return {
                    label: 'Desayuno + Cena',
                    className: 'bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-800'
                };
            case 'desayuno_cena_compensacion':
                return {
                    label: 'Desayuno + Cena Comp.',
                    className: 'bg-teal-100 text-teal-900 border border-teal-300 dark:bg-teal-900/50 dark:text-teal-200 dark:border-teal-700'
                };
            case 'solo_bebidas':
            case 'almuerzo':
                return {
                    label: 'Solo Bebidas',
                    className: 'bg-cyan-100 text-cyan-800 border border-cyan-200 dark:bg-cyan-900/40 dark:text-cyan-200 dark:border-cyan-800'
                };
            case 'cena':
                return {
                    label: 'Cena',
                    className: 'bg-indigo-100 text-indigo-800 border border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-200 dark:border-indigo-800'
                };
            case 'cena_compensacion':
                return {
                    label: 'Cena Compensación',
                    className: 'bg-purple-100 text-purple-900 border border-purple-300 dark:bg-purple-900/50 dark:text-purple-200 dark:border-purple-700'
                };
            default:
                return {
                    label: mealType || 'Servicio',
                    className: 'bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600'
                };
        }
    };

    // Helper to match meal type for filtering
    const matchesMealType = (bMealType: string | undefined, filter: string) => {
        if (filter === 'todos') return true;
        if (filter === 'total_desayunos') {
            return bMealType === 'desayuno' || 
                   bMealType === 'desayuno_compensacion' || 
                   bMealType === 'desayuno_cena' || 
                   bMealType === 'desayuno_cena_compensacion' || 
                   bMealType === 'MP';
        }
        if (filter === 'total_cenas') {
            return bMealType === 'cena' || 
                   bMealType === 'cena_compensacion' || 
                   bMealType === 'desayuno_cena' || 
                   bMealType === 'desayuno_cena_compensacion' || 
                   bMealType === 'MP';
        }
        if (filter === 'desayuno') return bMealType === 'desayuno';
        if (filter === 'desayuno_compensacion') return bMealType === 'desayuno_compensacion';
        if (filter === 'desayuno_cena' || filter === 'MP') return bMealType === 'desayuno_cena' || bMealType === 'MP';
        if (filter === 'desayuno_cena_compensacion') return bMealType === 'desayuno_cena_compensacion';
        if (filter === 'solo_bebidas') return bMealType === 'solo_bebidas' || bMealType === 'almuerzo';
        if (filter === 'cena') return bMealType === 'cena';
        if (filter === 'cena_compensacion') return bMealType === 'cena_compensacion';
        return false;
    };

    // Month / Period calculation
    const [monthYearStr, monthNumStr] = selectedMonth.split('-');
    const monthYear = parseInt(monthYearStr, 10) || new Date().getFullYear();
    const monthNum = parseInt(monthNumStr, 10) || (new Date().getMonth() + 1);
    const daysInSelectedMonth = new Date(monthYear, monthNum, 0).getDate();
    const monthStartStr = `${selectedMonth}-01`;
    const monthEndStr = `${selectedMonth}-${String(daysInSelectedMonth).padStart(2, '0')}`;

    const effectiveStartDate = useMemo(() => {
        if (periodFilterMode === 'month') return monthStartStr;
        if (!customStartDate) return monthStartStr;
        if (customEndDate && customStartDate > customEndDate) return customEndDate;
        return customStartDate;
    }, [periodFilterMode, monthStartStr, customStartDate, customEndDate]);

    const effectiveEndDate = useMemo(() => {
        if (periodFilterMode === 'month') return monthEndStr;
        if (!customEndDate) return monthEndStr;
        if (customStartDate && customStartDate > customEndDate) return customStartDate;
        return customEndDate;
    }, [periodFilterMode, monthEndStr, customStartDate, customEndDate]);

    const periodFormattedName = useMemo(() => {
        if (periodFilterMode === 'month') {
            const d = new Date(monthYear, monthNum - 1, 1);
            const name = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
            return name.charAt(0).toUpperCase() + name.slice(1);
        }
        if (effectiveStartDate === effectiveEndDate) {
            return `Día ${formatDate(effectiveStartDate)}`;
        }
        return `Del ${formatDate(effectiveStartDate)} al ${formatDate(effectiveEndDate)}`;
    }, [periodFilterMode, monthYear, monthNum, effectiveStartDate, effectiveEndDate]);

    const monthFormattedName = periodFormattedName;

    // Period Day-by-Day Stats
    const monthlyDayStats = useMemo(() => {
        if (tableName !== 'restaurant_bookings') return [];
        if (!effectiveStartDate || !effectiveEndDate) return [];

        const days = [];
        const sourceBookings = allRestaurantBookings.filter(b => b.startDate <= effectiveEndDate && b.endDate >= effectiveStartDate);
        
        const [sY, sM, sD] = effectiveStartDate.split('-').map(Number);
        const [eY, eM, eD] = effectiveEndDate.split('-').map(Number);
        const current = new Date(sY, sM - 1, sD);
        const end = new Date(eY, eM - 1, eD);

        let count = 0;
        // Limit to max 366 days to protect render
        while (current <= end && count < 366) {
            const y = current.getFullYear();
            const m = String(current.getMonth() + 1).padStart(2, '0');
            const d = String(current.getDate()).padStart(2, '0');
            const dayStr = `${y}-${m}-${d}`;
            const dayOfWeek = current.toLocaleDateString('es-ES', { weekday: 'short' });
            const dayNumber = current.getDate();

            const dayActiveBookings = sourceBookings.filter(b => b.startDate <= dayStr && b.endDate >= dayStr);
            const filteredDayBookings = dayActiveBookings.filter(b => matchesMealType(b.mealType, monthlyMealFilter));
            
            const desayunoCount = dayActiveBookings
                .filter(b => b.mealType === 'desayuno')
                .reduce((sum, b) => sum + (b.guestsCount || 1), 0);

            const desayunoCompCount = dayActiveBookings
                .filter(b => b.mealType === 'desayuno_compensacion')
                .reduce((sum, b) => sum + (b.guestsCount || 1), 0);

            const desayunoCenaCount = dayActiveBookings
                .filter(b => b.mealType === 'desayuno_cena' || b.mealType === 'MP')
                .reduce((sum, b) => sum + (b.guestsCount || 1), 0);

            const desayunoCenaCompCount = dayActiveBookings
                .filter(b => b.mealType === 'desayuno_cena_compensacion')
                .reduce((sum, b) => sum + (b.guestsCount || 1), 0);
                
            const soloBebidasCount = dayActiveBookings
                .filter(b => b.mealType === 'solo_bebidas' || b.mealType === 'almuerzo')
                .reduce((sum, b) => sum + (b.guestsCount || 1), 0);
                
            const cenaCount = dayActiveBookings
                .filter(b => b.mealType === 'cena')
                .reduce((sum, b) => sum + (b.guestsCount || 1), 0);

            const cenaCompCount = dayActiveBookings
                .filter(b => b.mealType === 'cena_compensacion')
                .reduce((sum, b) => sum + (b.guestsCount || 1), 0);
                
            const totalGuestsDay = filteredDayBookings.reduce((sum, b) => sum + (b.guestsCount || 1), 0);

            days.push({
                dayNumber,
                dateStr: dayStr,
                dayOfWeek,
                desayunoCount,
                desayunoCompCount,
                desayunoCenaCount,
                desayunoCenaCompCount,
                soloBebidasCount,
                cenaCount,
                cenaCompCount,
                totalGuestsDay,
                bookings: filteredDayBookings,
                allDayBookings: dayActiveBookings
            });

            current.setDate(current.getDate() + 1);
            count++;
        }
        return days;
    }, [tableName, allRestaurantBookings, effectiveStartDate, effectiveEndDate, monthlyMealFilter]);

    // Monthly summary metrics
    const monthlyMetrics = useMemo(() => {
        if (tableName !== 'restaurant_bookings') return { 
            totalMonthPersons: 0, 
            totalDesayunos: 0, 
            totalDesayunoComp: 0,
            totalDesayunoCena: 0,
            totalDesayunoCenaComp: 0,
            totalSoloBebidas: 0, 
            totalCenas: 0, 
            totalCenaComp: 0,
            totalAllDesayunos: 0,
            totalAllCenas: 0,
            uniqueBookingsCount: 0, 
            daysWithService: 0, 
            totalDaysInPeriod: 0,
            avgDailyPersons: '0' 
        };
        
        const totalMonthPersons = monthlyDayStats.reduce((acc, d) => acc + d.totalGuestsDay, 0);
        const totalDesayunos = monthlyDayStats.reduce((acc, d) => acc + d.desayunoCount, 0);
        const totalDesayunoComp = monthlyDayStats.reduce((acc, d) => acc + d.desayunoCompCount, 0);
        const totalDesayunoCena = monthlyDayStats.reduce((acc, d) => acc + d.desayunoCenaCount, 0);
        const totalDesayunoCenaComp = monthlyDayStats.reduce((acc, d) => acc + d.desayunoCenaCompCount, 0);
        const totalSoloBebidas = monthlyDayStats.reduce((acc, d) => acc + d.soloBebidasCount, 0);
        const totalCenas = monthlyDayStats.reduce((acc, d) => acc + d.cenaCount, 0);
        const totalCenaComp = monthlyDayStats.reduce((acc, d) => acc + d.cenaCompCount, 0);

        const totalAllDesayunos = totalDesayunos + totalDesayunoComp + totalDesayunoCena + totalDesayunoCenaComp;
        const totalAllCenas = totalCenas + totalCenaComp + totalDesayunoCena + totalDesayunoCenaComp;
        
        const activeInPeriodMatching = allRestaurantBookings.filter(b => 
            b.startDate <= effectiveEndDate && 
            b.endDate >= effectiveStartDate && 
            matchesMealType(b.mealType, monthlyMealFilter)
        );
        
        const daysWithService = monthlyDayStats.filter(d => d.totalGuestsDay > 0).length;
        const totalDaysInPeriod = monthlyDayStats.length;
        const avgDailyPersons = daysWithService > 0 ? (totalMonthPersons / daysWithService).toFixed(1) : '0';

        return {
            totalMonthPersons,
            totalDesayunos,
            totalDesayunoComp,
            totalDesayunoCena,
            totalDesayunoCenaComp,
            totalSoloBebidas,
            totalCenas,
            totalCenaComp,
            totalAllDesayunos,
            totalAllCenas,
            uniqueBookingsCount: activeInPeriodMatching.length,
            daysWithService,
            totalDaysInPeriod,
            avgDailyPersons
        };
    }, [tableName, monthlyDayStats, allRestaurantBookings, effectiveStartDate, effectiveEndDate, monthlyMealFilter]);

    // Filtered bookings list for monthly view
    const monthlyFilteredBookingsList = useMemo(() => {
        if (tableName !== 'restaurant_bookings') return [];
        return allRestaurantBookings.filter(b => {
            const inPeriod = b.startDate <= effectiveEndDate && b.endDate >= effectiveStartDate;
            if (!inPeriod) return false;
            
            if (!matchesMealType(b.mealType, monthlyMealFilter)) return false;
            
            if (monthlySearchQuery.trim()) {
                const q = monthlySearchQuery.toLowerCase();
                const matchName = (b.guestName || '').toLowerCase().includes(q);
                const matchRoom = (b.roomNumber || '').toLowerCase().includes(q);
                const matchDesc = (b.description || '').toLowerCase().includes(q);
                if (!matchName && !matchRoom && !matchDesc) return false;
            }
            
            return true;
        }).sort((a, b) => a.startDate.localeCompare(b.startDate));
    }, [tableName, allRestaurantBookings, effectiveStartDate, effectiveEndDate, monthlyMealFilter, monthlySearchQuery]);

    const handlePrevMonth = () => {
        const d = new Date(monthYear, monthNum - 2, 1);
        setSelectedMonth(d.toISOString().slice(0, 7));
    };

    const handleNextMonth = () => {
        const d = new Date(monthYear, monthNum, 1);
        setSelectedMonth(d.toISOString().slice(0, 7));
    };

    const handleCurrentMonth = () => {
        setSelectedMonth(new Date().toISOString().slice(0, 7));
    };

    const handleSetRangeToday = () => {
        const today = new Date().toISOString().split('T')[0];
        setCustomStartDate(today);
        setCustomEndDate(today);
        setPeriodFilterMode('custom');
    };

    const handleSetRangeThisWeek = () => {
        const d = new Date();
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        
        const pad = (n: number) => String(n).padStart(2, '0');
        const monStr = `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
        const sunStr = `${sunday.getFullYear()}-${pad(sunday.getMonth() + 1)}-${pad(sunday.getDate())}`;
        
        setCustomStartDate(monStr);
        setCustomEndDate(sunStr);
        setPeriodFilterMode('custom');
    };

    const handleSetRangeThisMonth = () => {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const last = new Date(y, d.getMonth() + 1, 0).getDate();
        setCustomStartDate(`${y}-${m}-01`);
        setCustomEndDate(`${y}-${m}-${String(last).padStart(2, '0')}`);
        setSelectedMonth(`${y}-${m}`);
    };

    const handleSetRangeNext7Days = () => {
        const start = new Date();
        const end = new Date();
        end.setDate(start.getDate() + 6);
        const pad = (n: number) => String(n).padStart(2, '0');
        setCustomStartDate(`${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`);
        setCustomEndDate(`${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`);
        setPeriodFilterMode('custom');
    };

    const handleSetRangeNext30Days = () => {
        const start = new Date();
        const end = new Date();
        end.setDate(start.getDate() + 29);
        const pad = (n: number) => String(n).padStart(2, '0');
        setCustomStartDate(`${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`);
        setCustomEndDate(`${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`);
        setPeriodFilterMode('custom');
    };

    const toggleExpandDay = (dayStr: string) => {
        setExpandedMonthDays(prev => ({
            ...prev,
            [dayStr]: !prev[dayStr]
        }));
    };

    const handleJumpToDailyView = (dayStr: string) => {
        setSelectedDate(dayStr);
        setViewMode('daily');
        showToast(`Mostrando reservas para el ${formatDate(dayStr)}`, 'info');
    };

    const filteredBookings = bookings.filter(b => {
        if (tableName !== 'restaurant_bookings') return true;
        
        // Filter by meal type
        if (!matchesMealType(b.mealType, mealFilter)) return false;

        // Filter by check-in status
        if (checkedInFilter === 'pending') {
            return !b.checkedIn || b.checkedInDate !== selectedDate;
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
                      <button onClick={() => handleOpenModal()} className="bg-amber-400 text-slate-950 px-4 py-2 rounded-xl font-bold hover:bg-amber-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2">
                          Añadir {title}
                      </button>
                    )}
                  </div>
                </Header>
            )}

            <div className="p-4 space-y-4">
                {/* View Switcher for Restaurant */}
                {tableName === 'restaurant_bookings' && (
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white dark:bg-slate-900 backdrop-blur-sm p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm">
                        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700/60 p-1 rounded-xl">
                            <button
                                onClick={() => setViewMode('daily')}
                                className={`px-4 py-2 rounded-md text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 ${
                                    viewMode === 'daily'
                                        ? 'bg-sky-600/10 text-sky-700 dark:text-sky-300 ring-1 ring-sky-600/20 shadow-sm'
                                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                                }`}
                            >
                                <span>📅 Vista Diaria</span>
                            </button>
                            <button
                                onClick={() => setViewMode('monthly')}
                                className={`px-4 py-2 rounded-md text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 ${
                                    viewMode === 'monthly'
                                        ? 'bg-sky-600/10 text-sky-700 dark:text-sky-300 ring-1 ring-sky-600/20 shadow-sm'
                                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                                }`}
                            >
                                <span>📊 Vista Mensual y Totales</span>
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            {viewMode === 'daily' ? (
                                <button
                                    onClick={() => setViewMode('monthly')}
                                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                                >
                                    <span>Ver estadísticas de {monthFormattedName} →</span>
                                </button>
                            ) : (
                                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                    Total Personas calculadas por servicio activo
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* DAILY VIEW CONTROLS & CONTENT */}
                {viewMode === 'daily' && (
                    <>
                        <div className="mb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div className="w-full md:w-auto">
                                {tableName === 'events_bookings' ? (
                                <div className="flex flex-col sm:flex-row sm:items-end space-y-4 sm:space-y-0 sm:space-x-4">
                                    <div className="w-full sm:w-auto">
                                        <label htmlFor="service-year-picker" className="block mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">Seleccionar Año:</label>
                                        <select 
                                            id="service-year-picker"
                                            value={selectedYear}
                                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                                            className="bg-white dark:bg-slate-900 backdrop-blur-sm border border-slate-200 text-slate-900 dark:text-white text-sm rounded-xl focus:ring-amber-200 dark:focus:ring-amber-500/30 focus:border-amber-500 block w-full p-2.5"
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
                                            className={`w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm flex items-center justify-center space-x-2 ${
                                                showFullYear 
                                                    ? 'bg-sky-600/10 text-sky-700 dark:text-sky-300 ring-1 ring-sky-600/20' 
                                                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
                                            }`}
                                        >
                                            <span>{showFullYear ? 'Ver solo próximos' : 'Ver año completo'}</span>
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                                    <div className="w-full sm:w-auto">
                                        <label htmlFor="service-date-picker" className="block mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">Seleccionar Fecha:</label>
                                        <input 
                                            type="date" 
                                            id="service-date-picker"
                                            value={selectedDate} 
                                            onChange={(e) => setSelectedDate(e.target.value)} 
                                            className="bg-white dark:bg-slate-900 backdrop-blur-sm border border-slate-200 text-slate-900 dark:text-white text-sm rounded-xl focus:ring-amber-200 dark:focus:ring-amber-500/30 focus:border-amber-500 block w-full p-2.5"
                                        />
                                    </div>
                                    
                                    {tableName === 'restaurant_bookings' && (
                                        <div className="flex flex-col xl:flex-row gap-3 items-start xl:items-center">
                                            <div className="flex flex-wrap bg-white dark:bg-slate-900 backdrop-blur-sm border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                                <button 
                                                    onClick={() => setMealFilter('todos')}
                                                    className={`px-3 py-2 text-xs font-semibold transition-all ${mealFilter === 'todos' ? 'bg-sky-600/10 text-sky-700 dark:text-sky-300 ring-1 ring-sky-600/20 shadow-inner' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                                                >
                                                    Todos
                                                </button>
                                                <button 
                                                    onClick={() => setMealFilter('total_desayunos')}
                                                    className={`px-2.5 py-2 text-xs font-bold border-l border-slate-200 transition-all ${mealFilter === 'total_desayunos' ? 'bg-amber-500 text-white shadow-inner ring-1 ring-amber-300' : 'text-amber-800 dark:text-amber-300 bg-amber-50/50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40'}`}
                                                >
                                                    Total Desayunos
                                                </button>
                                                <button 
                                                    onClick={() => setMealFilter('total_cenas')}
                                                    className={`px-2.5 py-2 text-xs font-bold border-l border-slate-200 transition-all ${mealFilter === 'total_cenas' ? 'bg-indigo-700 text-white shadow-inner ring-1 ring-indigo-400' : 'text-indigo-800 dark:text-indigo-300 bg-indigo-50/50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40'}`}
                                                >
                                                    Total Cenas
                                                </button>
                                                <button 
                                                    onClick={() => setMealFilter('desayuno')}
                                                    className={`px-2.5 py-2 text-xs font-semibold border-l border-slate-200 transition-all ${mealFilter === 'desayuno' ? 'bg-yellow-500 text-white shadow-inner' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                                                >
                                                    Desayuno
                                                </button>
                                                <button 
                                                    onClick={() => setMealFilter('desayuno_compensacion')}
                                                    className={`px-2.5 py-2 text-xs font-semibold border-l border-slate-200 transition-all ${mealFilter === 'desayuno_compensacion' ? 'bg-amber-600 text-white shadow-inner' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                                                >
                                                    Desayuno Comp.
                                                </button>
                                                <button 
                                                    onClick={() => setMealFilter('desayuno_cena')}
                                                    className={`px-2.5 py-2 text-xs font-semibold border-l border-slate-200 transition-all ${mealFilter === 'desayuno_cena' ? 'bg-emerald-600 text-white shadow-inner' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                                                >
                                                    Desayuno + Cena
                                                </button>
                                                <button 
                                                    onClick={() => setMealFilter('desayuno_cena_compensacion')}
                                                    className={`px-2.5 py-2 text-xs font-semibold border-l border-slate-200 transition-all ${mealFilter === 'desayuno_cena_compensacion' ? 'bg-teal-600 text-white shadow-inner' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                                                >
                                                    Des.+Cena Comp.
                                                </button>
                                                <button 
                                                    onClick={() => setMealFilter('solo_bebidas')}
                                                    className={`px-2.5 py-2 text-xs font-semibold border-l border-slate-200 transition-all ${mealFilter === 'solo_bebidas' ? 'bg-cyan-600 text-white shadow-inner' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                                                >
                                                    Solo Bebidas
                                                </button>
                                                <button 
                                                    onClick={() => setMealFilter('cena')}
                                                    className={`px-2.5 py-2 text-xs font-semibold border-l border-slate-200 transition-all ${mealFilter === 'cena' ? 'bg-indigo-600 text-white shadow-inner' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                                                >
                                                    Cena
                                                </button>
                                                <button 
                                                    onClick={() => setMealFilter('cena_compensacion')}
                                                    className={`px-2.5 py-2 text-xs font-semibold border-l border-slate-200 transition-all ${mealFilter === 'cena_compensacion' ? 'bg-purple-600 text-white shadow-inner' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                                                >
                                                    Cena Comp.
                                                </button>
                                            </div>
                                            <div className="flex bg-white dark:bg-slate-900 backdrop-blur-sm border border-slate-200 rounded-xl overflow-hidden h-[38px] shadow-sm">
                                                <button 
                                                    onClick={() => setCheckedInFilter('pending')}
                                                    className={`px-3 py-2 text-xs font-semibold transition-all ${checkedInFilter === 'pending' ? 'bg-emerald-600 text-white shadow-inner' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                                                >
                                                    Pendientes
                                                </button>
                                                <button 
                                                    onClick={() => setCheckedInFilter('all')}
                                                    className={`px-3 py-2 text-xs font-semibold border-l border-slate-200 transition-all ${checkedInFilter === 'all' ? 'bg-indigo-600 text-white shadow-inner' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                                                >
                                                    Ver Todos
                                                </button>
                                            </div>
                                            <div className="hidden 2xl:flex items-center px-3 py-1 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-xl">
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
                                <button onClick={() => handleOpenModal()} className="bg-amber-400 text-slate-950 px-4 py-2 rounded-xl font-bold hover:bg-amber-300 transition-colors shadow-md transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2">
                                    Añadir {title}
                                </button>
                            )}
                        </div>
                        
                        {tableName === 'restaurant_bookings' && !isLoading && !dbError && (
                            <div className="space-y-2 mb-4">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 p-3 rounded-xl flex justify-between items-center shadow-sm">
                                        <div>
                                            <span className="text-blue-800 dark:text-blue-200 font-bold block text-sm">
                                                {checkedInFilter === 'all' ? 'Total Personas:' : 'Pendientes:'}
                                            </span>
                                            <span className="text-[10px] text-blue-600 dark:text-blue-300">
                                                {mealFilter === 'todos' ? 'Todos los servicios' : mealFilter === 'total_desayunos' ? 'Filtro Total Desayunos' : mealFilter === 'total_cenas' ? 'Filtro Total Cenas' : 'Filtro seleccionado'}
                                            </span>
                                        </div>
                                        <span className="text-3xl sm:text-4xl font-black text-blue-900 dark:text-blue-100">{totalGuests}</span>
                                    </div>

                                    <div className="bg-amber-50/90 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800/60 p-3 rounded-xl flex justify-between items-center shadow-sm">
                                        <div>
                                            <span className="text-amber-900 dark:text-amber-200 font-bold block text-sm">
                                                ☕ Total Desayunos:
                                            </span>
                                            <span className="text-[10px] text-amber-700 dark:text-amber-300">
                                                Desayunos + D+C + Comp.
                                            </span>
                                        </div>
                                        <span className="text-3xl sm:text-4xl font-black text-amber-900 dark:text-amber-100">
                                            {bookings.filter(b => (b.mealType === 'desayuno' || b.mealType === 'desayuno_compensacion' || b.mealType === 'desayuno_cena' || b.mealType === 'desayuno_cena_compensacion' || b.mealType === 'MP') && (checkedInFilter === 'all' ? true : (b.checkedInDate !== selectedDate))).reduce((sum, b) => sum + (b.guestsCount || 0), 0)}
                                        </span>
                                    </div>

                                    <div className="bg-indigo-50/90 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800/60 p-3 rounded-xl flex justify-between items-center shadow-sm">
                                        <div>
                                            <span className="text-indigo-900 dark:text-indigo-200 font-bold block text-sm">
                                                🍲 Total Cenas:
                                            </span>
                                            <span className="text-[10px] text-indigo-700 dark:text-indigo-300">
                                                Cenas + D+C + Comp.
                                            </span>
                                        </div>
                                        <span className="text-3xl sm:text-4xl font-black text-indigo-900 dark:text-indigo-100">
                                            {bookings.filter(b => (b.mealType === 'cena' || b.mealType === 'cena_compensacion' || b.mealType === 'desayuno_cena' || b.mealType === 'desayuno_cena_compensacion' || b.mealType === 'MP') && (checkedInFilter === 'all' ? true : (b.checkedInDate !== selectedDate))).reduce((sum, b) => sum + (b.guestsCount || 0), 0)}
                                        </span>
                                    </div>
                                </div>
                                {mealFilter === 'todos' && (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
                                        <div className="bg-yellow-50/80 dark:bg-yellow-900/20 border border-yellow-200/50 dark:border-yellow-800/30 p-2 rounded-xl flex flex-col items-center justify-center text-center">
                                            <span className="text-yellow-800 dark:text-yellow-300 text-[8px] uppercase font-bold tracking-wider mb-1">
                                                {checkedInFilter === 'all' ? 'Desayuno' : 'Pend. Desayuno'}
                                            </span>
                                            <span className="text-2xl font-black text-yellow-900 dark:text-yellow-100">
                                                {bookings.filter(b => b.mealType === 'desayuno' && (checkedInFilter === 'all' ? true : (b.checkedInDate !== selectedDate))).reduce((sum, b) => sum + (b.guestsCount || 0), 0)}
                                            </span>
                                        </div>
                                        <div className="bg-amber-50/80 dark:bg-amber-900/20 border border-amber-200/50 dark:border-amber-800/30 p-2 rounded-xl flex flex-col items-center justify-center text-center">
                                            <span className="text-amber-800 dark:text-amber-300 text-[8px] uppercase font-bold tracking-wider mb-1">
                                                {checkedInFilter === 'all' ? 'Desayuno Comp.' : 'Pend. Des. Comp.'}
                                            </span>
                                            <span className="text-2xl font-black text-amber-900 dark:text-amber-100">
                                                {bookings.filter(b => b.mealType === 'desayuno_compensacion' && (checkedInFilter === 'all' ? true : (b.checkedInDate !== selectedDate))).reduce((sum, b) => sum + (b.guestsCount || 0), 0)}
                                            </span>
                                        </div>
                                        <div className="bg-emerald-50/80 dark:bg-emerald-900/20 border border-emerald-200/50 dark:border-emerald-800/30 p-2 rounded-xl flex flex-col items-center justify-center text-center">
                                            <span className="text-emerald-800 dark:text-emerald-300 text-[8px] uppercase font-bold tracking-wider mb-1">
                                                {checkedInFilter === 'all' ? 'Desayuno + Cena' : 'Pend. Des.+Cena'}
                                            </span>
                                            <span className="text-2xl font-black text-emerald-900 dark:text-emerald-100">
                                                {bookings.filter(b => (b.mealType === 'desayuno_cena' || b.mealType === 'MP') && (checkedInFilter === 'all' ? true : (b.checkedInDate !== selectedDate))).reduce((sum, b) => sum + (b.guestsCount || 0), 0)}
                                            </span>
                                        </div>
                                        <div className="bg-teal-50/80 dark:bg-teal-900/20 border border-teal-200/50 dark:border-teal-800/30 p-2 rounded-xl flex flex-col items-center justify-center text-center">
                                            <span className="text-teal-800 dark:text-teal-300 text-[8px] uppercase font-bold tracking-wider mb-1">
                                                {checkedInFilter === 'all' ? 'D+C Comp.' : 'Pend. D+C Comp.'}
                                            </span>
                                            <span className="text-2xl font-black text-teal-900 dark:text-teal-100">
                                                {bookings.filter(b => b.mealType === 'desayuno_cena_compensacion' && (checkedInFilter === 'all' ? true : (b.checkedInDate !== selectedDate))).reduce((sum, b) => sum + (b.guestsCount || 0), 0)}
                                            </span>
                                        </div>
                                        <div className="bg-cyan-50/80 dark:bg-cyan-900/20 border border-cyan-200/50 dark:border-cyan-800/30 p-2 rounded-xl flex flex-col items-center justify-center text-center">
                                            <span className="text-cyan-800 dark:text-cyan-300 text-[8px] uppercase font-bold tracking-wider mb-1">
                                                {checkedInFilter === 'all' ? 'Solo Bebidas' : 'Pend. Bebidas'}
                                            </span>
                                            <span className="text-2xl font-black text-cyan-900 dark:text-cyan-100">
                                                {bookings.filter(b => (b.mealType === 'solo_bebidas' || b.mealType === 'almuerzo') && (checkedInFilter === 'all' ? true : (b.checkedInDate !== selectedDate))).reduce((sum, b) => sum + (b.guestsCount || 0), 0)}
                                            </span>
                                        </div>
                                        <div className="bg-indigo-50/80 dark:bg-indigo-900/20 border border-indigo-200/50 dark:border-indigo-800/30 p-2 rounded-xl flex flex-col items-center justify-center text-center">
                                            <span className="text-indigo-800 dark:text-indigo-300 text-[8px] uppercase font-bold tracking-wider mb-1">
                                                {checkedInFilter === 'all' ? 'Cena' : 'Pend. Cena'}
                                            </span>
                                            <span className="text-2xl font-black text-indigo-900 dark:text-indigo-100">
                                                {bookings.filter(b => b.mealType === 'cena' && (checkedInFilter === 'all' ? true : (b.checkedInDate !== selectedDate))).reduce((sum, b) => sum + (b.guestsCount || 0), 0)}
                                            </span>
                                        </div>
                                        <div className="bg-purple-50/80 dark:bg-purple-900/20 border border-purple-200/50 dark:border-purple-800/30 p-2 rounded-xl flex flex-col items-center justify-center text-center">
                                            <span className="text-purple-800 dark:text-purple-300 text-[8px] uppercase font-bold tracking-wider mb-1">
                                                {checkedInFilter === 'all' ? 'Cena Comp.' : 'Pend. Cena Comp.'}
                                            </span>
                                            <span className="text-2xl font-black text-purple-900 dark:text-purple-100">
                                                {bookings.filter(b => b.mealType === 'cena_compensacion' && (checkedInFilter === 'all' ? true : (b.checkedInDate !== selectedDate))).reduce((sum, b) => sum + (b.guestsCount || 0), 0)}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        
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
                        ) : !dbError && filteredBookings.length > 0 ? (
                            <div className="flex flex-col space-y-4">
                            {filteredBookings.map(booking => (
                                <div key={booking.id} className={`group cursor-pointer w-full bg-white dark:bg-slate-900 backdrop-blur-sm px-4 py-3 rounded-xl shadow-md animate-fade-in border-l-4 transition-all duration-300 ${booking.origin === 'news' ? 'border-rose-500' : booking.origin === 'pdf' ? 'border-blue-500' : 'border-purple-500'}`}>
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className="text-black dark:text-slate-300 font-medium text-xs bg-slate-200/60 dark:bg-slate-700/60 px-2 py-1 rounded-md w-fit">
                                                <span>{formatDate(booking.startDate)}</span>
                                                {booking.startDate !== booking.endDate && (
                                                <>
                                                    <span className="mx-1">-</span>
                                                    <span>{formatDate(booking.endDate)}</span>
                                                </>
                                                )}
                                            </div>
                                            {tableName === 'restaurant_bookings' && booking.mealType && (
                                                <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${getMealTypeBadge(booking.mealType).className}`}>
                                                    {getMealTypeBadge(booking.mealType).label}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            {tableName === 'restaurant_bookings' && booking.origin !== 'news' && booking.origin !== 'pdf' && (
                                                <button 
                                                    onClick={() => handleToggleCheckIn(booking)}
                                                    className={`px-3 py-1 rounded-md text-xs font-bold font-mono shadow-sm transition-all transform active:scale-95 ${
                                                        (booking.checkedIn && booking.checkedInDate === selectedDate)
                                                        ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' 
                                                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                                                    }`}
                                                >
                                                    {(booking.checkedIn && booking.checkedInDate === selectedDate) ? '✓ ENTRADO' : 'MARCAR ENTRADA'}
                                                </button>
                                            )}

                                            {userRole === 'editor' && booking.origin !== 'news' && booking.origin !== 'pdf' && (
                                                <div className="flex gap-2">
                                                    <button 
                                                        onClick={() => handleOpenModal(booking)} 
                                                        className="bg-amber-400 text-slate-950 px-2 py-0.5 text-xs rounded-md font-bold hover:bg-amber-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
                                                    >
                                                        Editar
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDeleteBooking(booking.id)} 
                                                        className="bg-rose-500 text-white px-2 py-0.5 text-xs rounded-md font-semibold hover:bg-rose-600 transition-colors"
                                                        aria-label="Cancelar servicio"
                                                    >
                                                        Cancelar
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="flex justify-between items-center">
                                        <h3 className="font-bold text-lg leading-tight text-slate-900 dark:text-slate-100">{booking.guestName}</h3>
                                        <div className="flex flex-col items-end">
                                            {booking.roomNumber && <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">Hab. {booking.roomNumber}</p>}
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
                                    {tableName === 'events_bookings' && booking.pdfId && (
                                        <button
                                            onClick={() => onOpenDocument?.(booking.pdfId!)}
                                            disabled={!onOpenDocument}
                                            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded-md hover:bg-blue-100 transition-colors disabled:cursor-default"
                                            title="Abrir documento del resumen mensual"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" /></svg>
                                            <span>Documento: {booking.pdfName}</span>
                                        </button>
                                    )}
                                </div>
                            ))}
                            </div>
                        ) : (
                            !dbError && <div className="text-center py-10 text-slate-800 dark:text-slate-200 bg-slate-50/90 dark:bg-slate-900 backdrop-blur-sm rounded-xl">
                                {tableName === 'events_bookings' ? 'No hay eventos registrados para este año.' : 'No hay servicios activos para esta fecha.'}
                            </div>
                        )}
                    </>
                )}

                {/* MONTHLY VIEW & SERVICE FILTER */}
                {viewMode === 'monthly' && tableName === 'restaurant_bookings' && (
                    <div className="space-y-4">
                        {/* Period Selector Bar & Action */}
                        <div className="bg-white dark:bg-slate-900 backdrop-blur-sm p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm space-y-3">
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-2 border-b border-slate-100 dark:border-slate-700/60">
                                {/* Type toggle */}
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mr-1">
                                        Modo de Consulta:
                                    </span>
                                    <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-700/70 p-0.5 border border-slate-200 dark:border-slate-600">
                                        <button
                                            onClick={() => setPeriodFilterMode('month')}
                                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                                                periodFilterMode === 'month'
                                                    ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                                                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                                            }`}
                                        >
                                            <span>📅</span>
                                            <span>Mes Completo</span>
                                        </button>
                                        <button
                                            onClick={() => setPeriodFilterMode('custom')}
                                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                                                periodFilterMode === 'custom'
                                                    ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                                                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                                            }`}
                                        >
                                            <span>📆</span>
                                            <span>Rango (Desde / Hasta)</span>
                                        </button>
                                    </div>
                                </div>

                                {userRole === 'editor' && (
                                    <button 
                                        onClick={() => handleOpenModal()} 
                                        className="bg-amber-400 text-slate-950 px-4 py-2 rounded-xl font-bold hover:bg-amber-300 transition-colors shadow-md text-sm self-start lg:self-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
                                    >
                                        + Añadir Reserva
                                    </button>
                                )}
                            </div>

                            {/* Controls depending on mode */}
                            {periodFilterMode === 'month' ? (
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                            Seleccionar Mes:
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={handlePrevMonth}
                                                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                                title="Mes anterior"
                                            >
                                                ◀
                                            </button>
                                            <input
                                                type="month"
                                                value={selectedMonth}
                                                onChange={(e) => setSelectedMonth(e.target.value)}
                                                className="px-3 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-500/30 focus:outline-none"
                                            />
                                            <button
                                                onClick={handleNextMonth}
                                                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                                title="Mes siguiente"
                                            >
                                                ▶
                                            </button>
                                        </div>
                                        <button
                                            onClick={handleCurrentMonth}
                                            className="px-3 py-1.5 text-xs font-bold rounded-xl bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-colors"
                                        >
                                            Mes Actual
                                        </button>
                                    </div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/50 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                                        Período: <span className="font-bold text-slate-800 dark:text-slate-200">{formatDate(monthStartStr)} al {formatDate(monthEndStr)}</span> ({daysInSelectedMonth} días)
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-2.5">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <div className="flex items-center gap-1.5">
                                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                                Desde:
                                            </label>
                                            <input
                                                type="date"
                                                value={customStartDate}
                                                onChange={(e) => setCustomStartDate(e.target.value)}
                                                className="px-3 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-500/30 focus:outline-none"
                                            />
                                        </div>

                                        <div className="flex items-center gap-1.5">
                                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                                Hasta:
                                            </label>
                                            <input
                                                type="date"
                                                value={customEndDate}
                                                onChange={(e) => setCustomEndDate(e.target.value)}
                                                className="px-3 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-500/30 focus:outline-none"
                                            />
                                        </div>

                                        <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/50 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 ml-auto">
                                            Total días en rango: <span className="font-bold text-slate-800 dark:text-slate-200">{monthlyDayStats.length} días</span>
                                        </div>
                                    </div>

                                    {/* Presets */}
                                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mr-1">
                                            Rangos Rápidos:
                                        </span>
                                        <button
                                            onClick={handleSetRangeToday}
                                            className="px-2.5 py-1 text-xs font-semibold rounded-md bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 transition-colors"
                                        >
                                            Hoy
                                        </button>
                                        <button
                                            onClick={handleSetRangeThisWeek}
                                            className="px-2.5 py-1 text-xs font-semibold rounded-md bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 transition-colors"
                                        >
                                            Esta Semana
                                        </button>
                                        <button
                                            onClick={handleSetRangeThisMonth}
                                            className="px-2.5 py-1 text-xs font-semibold rounded-md bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 transition-colors"
                                        >
                                            Este Mes
                                        </button>
                                        <button
                                            onClick={handleSetRangeNext7Days}
                                            className="px-2.5 py-1 text-xs font-semibold rounded-md bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 transition-colors"
                                        >
                                            Próximos 7 Días
                                        </button>
                                        <button
                                            onClick={handleSetRangeNext30Days}
                                            className="px-2.5 py-1 text-xs font-semibold rounded-md bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 transition-colors"
                                        >
                                            Próximos 30 Días
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Filter by Service Bar */}
                        <div className="bg-white dark:bg-slate-900 backdrop-blur-sm p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm space-y-2">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                                    <span>🔍 Filtrar Total de Personas por Servicio:</span>
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                    Mostrando cómputo de <span className="font-bold text-slate-800 dark:text-slate-200">{monthFormattedName}</span> ({monthlyDayStats.length} días)
                                </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2 pt-1">
                                <button
                                    onClick={() => setMonthlyMealFilter('todos')}
                                    className={`px-2 py-2.5 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center text-center ${
                                        monthlyMealFilter === 'todos'
                                            ? 'bg-sky-600/10 text-sky-700 dark:text-sky-300 ring-2 ring-sky-600/40 shadow-md'
                                            : 'bg-slate-100 dark:bg-slate-700/70 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600'
                                    }`}
                                >
                                    <span>Todos</span>
                                    <span className="text-[10px] opacity-80 mt-0.5 font-normal">Cómputo Global</span>
                                </button>

                                <button
                                    onClick={() => setMonthlyMealFilter('total_desayunos')}
                                    className={`px-2 py-2.5 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center text-center ${
                                        monthlyMealFilter === 'total_desayunos'
                                            ? 'bg-amber-500 text-white shadow-md ring-2 ring-amber-300 dark:ring-amber-800'
                                            : 'bg-amber-50/90 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-300/80 dark:border-amber-700/60'
                                    }`}
                                >
                                    <span className="flex items-center gap-1">☕ Total Desayunos</span>
                                    <span className="text-[10px] opacity-80 mt-0.5 font-normal">Todos Desayunos</span>
                                </button>

                                <button
                                    onClick={() => setMonthlyMealFilter('total_cenas')}
                                    className={`px-2 py-2.5 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center text-center ${
                                        monthlyMealFilter === 'total_cenas'
                                            ? 'bg-indigo-700 text-white shadow-md ring-2 ring-indigo-300 dark:ring-indigo-800'
                                            : 'bg-indigo-50/90 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-200 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-300/80 dark:border-indigo-700/60'
                                    }`}
                                >
                                    <span className="flex items-center gap-1">🍲 Total Cenas</span>
                                    <span className="text-[10px] opacity-80 mt-0.5 font-normal">Todas Cenas</span>
                                </button>

                                <button
                                    onClick={() => setMonthlyMealFilter('desayuno')}
                                    className={`px-2 py-2.5 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center text-center ${
                                        monthlyMealFilter === 'desayuno'
                                            ? 'bg-yellow-500 text-white shadow-md ring-2 ring-yellow-300 dark:ring-yellow-800'
                                            : 'bg-yellow-50/80 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-900/40 border border-yellow-200/60 dark:border-yellow-800/40'
                                    }`}
                                >
                                    <span>Desayuno</span>
                                    <span className="text-[10px] opacity-80 mt-0.5 font-normal">Desayuno</span>
                                </button>

                                <button
                                    onClick={() => setMonthlyMealFilter('desayuno_compensacion')}
                                    className={`px-2 py-2.5 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center text-center ${
                                        monthlyMealFilter === 'desayuno_compensacion'
                                            ? 'bg-amber-600 text-white shadow-md ring-2 ring-amber-300 dark:ring-amber-800'
                                            : 'bg-amber-50/80 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-200/60 dark:border-amber-800/40'
                                    }`}
                                >
                                    <span>Desayuno Comp.</span>
                                    <span className="text-[10px] opacity-80 mt-0.5 font-normal">Compensación</span>
                                </button>

                                <button
                                    onClick={() => setMonthlyMealFilter('desayuno_cena')}
                                    className={`px-2 py-2.5 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center text-center ${
                                        monthlyMealFilter === 'desayuno_cena' || monthlyMealFilter === 'MP'
                                            ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-300 dark:ring-emerald-800'
                                            : 'bg-emerald-50/80 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border border-emerald-200/60 dark:border-emerald-800/40'
                                    }`}
                                >
                                    <span>Desayuno + Cena</span>
                                    <span className="text-[10px] opacity-80 mt-0.5 font-normal">D+C</span>
                                </button>

                                <button
                                    onClick={() => setMonthlyMealFilter('desayuno_cena_compensacion')}
                                    className={`px-2 py-2.5 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center text-center ${
                                        monthlyMealFilter === 'desayuno_cena_compensacion'
                                            ? 'bg-teal-600 text-white shadow-md ring-2 ring-teal-300 dark:ring-teal-800'
                                            : 'bg-teal-50/80 dark:bg-teal-900/20 text-teal-800 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/40 border border-teal-200/60 dark:border-teal-800/40'
                                    }`}
                                >
                                    <span>Des.+Cena Comp.</span>
                                    <span className="text-[10px] opacity-80 mt-0.5 font-normal">Compensación</span>
                                </button>

                                <button
                                    onClick={() => setMonthlyMealFilter('solo_bebidas')}
                                    className={`px-2 py-2.5 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center text-center ${
                                        monthlyMealFilter === 'solo_bebidas'
                                            ? 'bg-cyan-600 text-white shadow-md ring-2 ring-cyan-300 dark:ring-cyan-800'
                                            : 'bg-cyan-50/80 dark:bg-cyan-900/20 text-cyan-800 dark:text-cyan-300 hover:bg-cyan-100 dark:hover:bg-cyan-900/40 border border-cyan-200/60 dark:border-cyan-800/40'
                                    }`}
                                >
                                    <span>Solo Bebidas</span>
                                    <span className="text-[10px] opacity-80 mt-0.5 font-normal">Bebidas</span>
                                </button>

                                <button
                                    onClick={() => setMonthlyMealFilter('cena')}
                                    className={`px-2 py-2.5 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center text-center ${
                                        monthlyMealFilter === 'cena'
                                            ? 'bg-indigo-600 text-white shadow-md ring-2 ring-indigo-300 dark:ring-indigo-800'
                                            : 'bg-indigo-50/80 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 border border-indigo-200/60 dark:border-indigo-800/40'
                                    }`}
                                >
                                    <span>Cena</span>
                                    <span className="text-[10px] opacity-80 mt-0.5 font-normal">Cena</span>
                                </button>

                                <button
                                    onClick={() => setMonthlyMealFilter('cena_compensacion')}
                                    className={`px-2 py-2.5 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center text-center ${
                                        monthlyMealFilter === 'cena_compensacion'
                                            ? 'bg-purple-600 text-white shadow-md ring-2 ring-purple-300 dark:ring-purple-800'
                                            : 'bg-purple-50/80 dark:bg-purple-900/20 text-purple-800 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40 border border-purple-200/60 dark:border-purple-800/40'
                                    }`}
                                >
                                    <span>Cena Comp.</span>
                                    <span className="text-[10px] opacity-80 mt-0.5 font-normal">Compensación</span>
                                </button>
                            </div>
                        </div>

                        {/* HIGHLIGHTED TOTAL CARD */}
                        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-5 rounded-2xl shadow-lg relative overflow-hidden">
                            <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 opacity-10 text-9xl font-black select-none pointer-events-none">
                                📊
                            </div>
                            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs uppercase tracking-widest font-bold text-blue-200 bg-white/10 px-2.5 py-0.5 rounded-full">
                                            {periodFilterMode === 'month' ? 'Resumen Mensual' : 'Resumen por Rango'}
                                        </span>
                                        <span className="text-xs font-semibold text-blue-100">
                                            {monthFormattedName}
                                        </span>
                                    </div>
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <span>Total Personas en el Período:</span>
                                        <span className="text-xs font-normal text-blue-200 bg-black/20 px-2 py-0.5 rounded-md">
                                            Filtro: {
                                                monthlyMealFilter === 'todos' ? 'Todos los Servicios' :
                                                monthlyMealFilter === 'total_desayunos' ? 'Total Desayunos' :
                                                monthlyMealFilter === 'total_cenas' ? 'Total Cenas' :
                                                monthlyMealFilter === 'desayuno' ? 'Desayuno' :
                                                monthlyMealFilter === 'desayuno_compensacion' ? 'Desayuno Compensación' :
                                                monthlyMealFilter === 'desayuno_cena' || monthlyMealFilter === 'MP' ? 'Desayuno + Cena' :
                                                monthlyMealFilter === 'desayuno_cena_compensacion' ? 'Desayuno + Cena Compensación' :
                                                monthlyMealFilter === 'solo_bebidas' ? 'Solo Bebidas' :
                                                monthlyMealFilter === 'cena' ? 'Cena' :
                                                'Cena Compensación'
                                            }
                                        </span>
                                    </h3>
                                    <p className="text-xs text-blue-100/80 mt-0.5">
                                        Suma agregada de personas activas en los {monthlyMetrics.totalDaysInPeriod} días del período seleccionado
                                    </p>
                                </div>

                                <div className="flex items-baseline gap-2 bg-white/10 backdrop-blur-md px-5 py-2.5 rounded-xl border border-white/20">
                                    <span className="text-4xl md:text-5xl font-black tracking-tight text-white">
                                        {monthlyMetrics.totalMonthPersons}
                                    </span>
                                    <span className="text-sm font-semibold text-blue-100 uppercase tracking-wider">
                                        {monthlyMetrics.totalMonthPersons === 1 ? 'persona' : 'personas'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* TOTAL DESAYUNOS & TOTAL CENAS CARDS */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className={`p-4 rounded-xl border transition-all flex items-center justify-between ${
                                monthlyMealFilter === 'total_desayunos'
                                    ? 'bg-amber-100 dark:bg-amber-900/50 border-amber-400 dark:border-amber-600 ring-2 ring-amber-400 shadow-md'
                                    : 'bg-white dark:bg-slate-900 border-amber-200/80 dark:border-amber-800/60 shadow-sm'
                            }`}>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center text-xl shadow-xs font-bold">
                                        ☕
                                    </div>
                                    <div>
                                        <span className="text-xs uppercase font-bold text-amber-900 dark:text-amber-200 block">
                                            Total Desayunos (Período)
                                        </span>
                                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                            Desayunos + D+C + Compensaciones
                                        </span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="text-3xl font-black text-amber-900 dark:text-amber-100 block leading-none">
                                        {monthlyMetrics.totalAllDesayunos}
                                    </span>
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase">personas</span>
                                </div>
                            </div>

                            <div className={`p-4 rounded-xl border transition-all flex items-center justify-between ${
                                monthlyMealFilter === 'total_cenas'
                                    ? 'bg-indigo-100 dark:bg-indigo-900/50 border-indigo-400 dark:border-indigo-600 ring-2 ring-indigo-400 shadow-md'
                                    : 'bg-white dark:bg-slate-900 border-indigo-200/80 dark:border-indigo-800/60 shadow-sm'
                            }`}>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-xl shadow-xs font-bold">
                                        🍲
                                    </div>
                                    <div>
                                        <span className="text-xs uppercase font-bold text-indigo-900 dark:text-indigo-200 block">
                                            Total Cenas (Período)
                                        </span>
                                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                            Cenas + D+C + Compensaciones
                                        </span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="text-3xl font-black text-indigo-900 dark:text-indigo-100 block leading-none">
                                        {monthlyMetrics.totalAllCenas}
                                    </span>
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase">personas</span>
                                </div>
                            </div>
                        </div>

                        {/* Breakdown Stat Cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                            <div className={`p-3 rounded-xl border transition-all ${
                                monthlyMealFilter === 'desayuno'
                                    ? 'bg-yellow-100/90 dark:bg-yellow-900/40 border-yellow-400 dark:border-yellow-600 ring-2 ring-yellow-400 shadow-md'
                                    : 'bg-white dark:bg-slate-900 border-yellow-200 dark:border-yellow-800/50 shadow-sm'
                            }`}>
                                <div className="flex items-center justify-between text-yellow-800 dark:text-yellow-300 mb-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Desayuno</span>
                                    <span className="text-xs">☕</span>
                                </div>
                                <div className="flex items-baseline justify-between">
                                    <span className="text-2xl font-black text-yellow-900 dark:text-yellow-100">
                                        {monthlyMetrics.totalDesayunos}
                                    </span>
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400">pers.</span>
                                </div>
                            </div>

                            <div className={`p-3 rounded-xl border transition-all ${
                                monthlyMealFilter === 'desayuno_compensacion'
                                    ? 'bg-amber-100/90 dark:bg-amber-900/40 border-amber-400 dark:border-amber-600 ring-2 ring-amber-400 shadow-md'
                                    : 'bg-white dark:bg-slate-900 border-amber-200 dark:border-amber-800/50 shadow-sm'
                            }`}>
                                <div className="flex items-center justify-between text-amber-800 dark:text-amber-300 mb-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Desayuno Comp.</span>
                                    <span className="text-xs">🥞</span>
                                </div>
                                <div className="flex items-baseline justify-between">
                                    <span className="text-2xl font-black text-amber-900 dark:text-amber-100">
                                        {monthlyMetrics.totalDesayunoComp}
                                    </span>
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400">pers.</span>
                                </div>
                            </div>

                            <div className={`p-3 rounded-xl border transition-all ${
                                monthlyMealFilter === 'desayuno_cena' || monthlyMealFilter === 'MP'
                                    ? 'bg-emerald-100/90 dark:bg-emerald-900/40 border-emerald-400 dark:border-emerald-600 ring-2 ring-emerald-400 shadow-md'
                                    : 'bg-white dark:bg-slate-900 border-emerald-200 dark:border-emerald-800/50 shadow-sm'
                            }`}>
                                <div className="flex items-center justify-between text-emerald-800 dark:text-emerald-300 mb-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Desayuno + Cena</span>
                                    <span className="text-xs">🍽️</span>
                                </div>
                                <div className="flex items-baseline justify-between">
                                    <span className="text-2xl font-black text-emerald-900 dark:text-emerald-100">
                                        {monthlyMetrics.totalDesayunoCena}
                                    </span>
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400">pers.</span>
                                </div>
                            </div>

                            <div className={`p-3 rounded-xl border transition-all ${
                                monthlyMealFilter === 'desayuno_cena_compensacion'
                                    ? 'bg-teal-100/90 dark:bg-teal-900/40 border-teal-400 dark:border-teal-600 ring-2 ring-teal-400 shadow-md'
                                    : 'bg-white dark:bg-slate-900 border-teal-200 dark:border-teal-800/50 shadow-sm'
                            }`}>
                                <div className="flex items-center justify-between text-teal-800 dark:text-teal-300 mb-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider">D+C Comp.</span>
                                    <span className="text-xs">✨</span>
                                </div>
                                <div className="flex items-baseline justify-between">
                                    <span className="text-2xl font-black text-teal-900 dark:text-teal-100">
                                        {monthlyMetrics.totalDesayunoCenaComp}
                                    </span>
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400">pers.</span>
                                </div>
                            </div>

                            <div className={`p-3 rounded-xl border transition-all ${
                                monthlyMealFilter === 'solo_bebidas'
                                    ? 'bg-cyan-100/90 dark:bg-cyan-900/40 border-cyan-400 dark:border-cyan-600 ring-2 ring-cyan-400 shadow-md'
                                    : 'bg-white dark:bg-slate-900 border-cyan-200 dark:border-cyan-800/50 shadow-sm'
                            }`}>
                                <div className="flex items-center justify-between text-cyan-800 dark:text-cyan-300 mb-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Solo Bebidas</span>
                                    <span className="text-xs">🥤</span>
                                </div>
                                <div className="flex items-baseline justify-between">
                                    <span className="text-2xl font-black text-cyan-900 dark:text-cyan-100">
                                        {monthlyMetrics.totalSoloBebidas}
                                    </span>
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400">pers.</span>
                                </div>
                            </div>

                            <div className={`p-3 rounded-xl border transition-all ${
                                monthlyMealFilter === 'cena'
                                    ? 'bg-indigo-100/90 dark:bg-indigo-900/40 border-indigo-400 dark:border-indigo-600 ring-2 ring-indigo-400 shadow-md'
                                    : 'bg-white dark:bg-slate-900 border-indigo-200 dark:border-indigo-800/50 shadow-sm'
                            }`}>
                                <div className="flex items-center justify-between text-indigo-800 dark:text-indigo-300 mb-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Cena</span>
                                    <span className="text-xs">🍲</span>
                                </div>
                                <div className="flex items-baseline justify-between">
                                    <span className="text-2xl font-black text-indigo-900 dark:text-indigo-100">
                                        {monthlyMetrics.totalCenas}
                                    </span>
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400">pers.</span>
                                </div>
                            </div>

                            <div className={`p-3 rounded-xl border transition-all ${
                                monthlyMealFilter === 'cena_compensacion'
                                    ? 'bg-purple-100/90 dark:bg-purple-900/40 border-purple-400 dark:border-purple-600 ring-2 ring-purple-400 shadow-md'
                                    : 'bg-white dark:bg-slate-900 border-purple-200 dark:border-purple-800/50 shadow-sm'
                            }`}>
                                <div className="flex items-center justify-between text-purple-800 dark:text-purple-300 mb-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Cena Comp.</span>
                                    <span className="text-xs">🍷</span>
                                </div>
                                <div className="flex items-baseline justify-between">
                                    <span className="text-2xl font-black text-purple-900 dark:text-purple-100">
                                        {monthlyMetrics.totalCenaComp}
                                    </span>
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400">pers.</span>
                                </div>
                            </div>
                        </div>

                        {/* Extra KPI Bar */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-50/80 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60 text-xs">
                            <div className="flex items-center justify-between px-3 py-1.5 bg-white dark:bg-slate-800 rounded-xl shadow-2xs">
                                <span className="text-slate-500 dark:text-slate-400">Reservas en período:</span>
                                <span className="font-bold text-slate-800 dark:text-slate-100">{monthlyMetrics.uniqueBookingsCount} reservas</span>
                            </div>
                            <div className="flex items-center justify-between px-3 py-1.5 bg-white dark:bg-slate-800 rounded-xl shadow-2xs">
                                <span className="text-slate-500 dark:text-slate-400">Días con actividad:</span>
                                <span className="font-bold text-slate-800 dark:text-slate-100">{monthlyMetrics.daysWithService} de {monthlyMetrics.totalDaysInPeriod} días</span>
                            </div>
                            <div className="flex items-center justify-between px-3 py-1.5 bg-white dark:bg-slate-800 rounded-xl shadow-2xs">
                                <span className="text-slate-500 dark:text-slate-400">Promedio diario:</span>
                                <span className="font-bold text-blue-600 dark:text-blue-400">{monthlyMetrics.avgDailyPersons} personas/día</span>
                            </div>
                        </div>

                        {/* Monthly Subtabs (Day-by-Day vs Bookings list) */}
                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pt-2">
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setMonthlyTab('days')}
                                    className={`px-4 py-2 text-xs sm:text-sm font-bold border-b-2 transition-all ${
                                        monthlyTab === 'days'
                                            ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                                            : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                                    }`}
                                >
                                    📅 Desglose Día por Día ({monthlyDayStats.length} días)
                                </button>
                                <button
                                    onClick={() => setMonthlyTab('bookings')}
                                    className={`px-4 py-2 text-xs sm:text-sm font-bold border-b-2 transition-all ${
                                        monthlyTab === 'bookings'
                                            ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                                            : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                                    }`}
                                >
                                    📋 Listado de Reservas del Período ({monthlyFilteredBookingsList.length})
                                </button>
                            </div>

                            {monthlyTab === 'days' && (
                                <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={onlyDaysWithBookings}
                                        onChange={(e) => setOnlyDaysWithBookings(e.target.checked)}
                                        className="rounded text-blue-600 focus:ring-amber-200 dark:focus:ring-amber-500/30"
                                    />
                                    <span>Solo días con personas</span>
                                </label>
                            )}
                        </div>

                        {/* TAB 1: DAY BY DAY BREAKDOWN */}
                        {monthlyTab === 'days' && (
                            <div className="space-y-2">
                                {monthlyDayStats
                                    .filter(d => onlyDaysWithBookings ? d.totalGuestsDay > 0 : true)
                                    .map(day => (
                                        <div
                                            key={day.dateStr}
                                            className={`bg-white dark:bg-slate-900 backdrop-blur-sm rounded-xl border transition-all duration-200 shadow-sm ${
                                                day.totalGuestsDay > 0
                                                    ? 'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700'
                                                    : 'border-dashed border-slate-200 dark:border-slate-800 opacity-60'
                                            }`}
                                        >
                                            <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center font-bold shadow-2xs ${
                                                        day.dateStr === new Date().toISOString().split('T')[0]
                                                            ? 'bg-sky-600 text-white'
                                                            : day.totalGuestsDay > 0
                                                            ? 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                                                            : 'bg-slate-50 dark:bg-slate-800 text-slate-400'
                                                    }`}>
                                                        <span className="text-lg leading-none">{day.dayNumber}</span>
                                                        <span className="text-[10px] uppercase font-semibold">{day.dayOfWeek}</span>
                                                    </div>

                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                                                                {day.dateStr}
                                                            </span>
                                                            {day.dateStr === new Date().toISOString().split('T')[0] && (
                                                                <span className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 font-bold px-1.5 py-0.5 rounded">
                                                                    HOY
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex flex-wrap gap-1.5 mt-1">
                                                            {day.desayunoCount > 0 && (
                                                                <span className="text-[10px] bg-yellow-50 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800/40 px-1.5 py-0.5 rounded font-medium">
                                                                    ☕ Desayuno: {day.desayunoCount}
                                                                </span>
                                                            )}
                                                            {day.desayunoCompCount > 0 && (
                                                                <span className="text-[10px] bg-amber-50 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 border border-amber-300 dark:border-amber-800/50 px-1.5 py-0.5 rounded font-medium">
                                                                    🥞 Desayuno Comp.: {day.desayunoCompCount}
                                                                </span>
                                                            )}
                                                            {day.desayunoCenaCount > 0 && (
                                                                <span className="text-[10px] bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40 px-1.5 py-0.5 rounded font-medium">
                                                                    🍽️ Desayuno + Cena: {day.desayunoCenaCount}
                                                                </span>
                                                            )}
                                                            {day.desayunoCenaCompCount > 0 && (
                                                                <span className="text-[10px] bg-teal-50 text-teal-900 dark:bg-teal-900/40 dark:text-teal-200 border border-teal-300 dark:border-teal-800/50 px-1.5 py-0.5 rounded font-medium">
                                                                    ✨ D+C Comp.: {day.desayunoCenaCompCount}
                                                                </span>
                                                            )}
                                                            {day.soloBebidasCount > 0 && (
                                                                <span className="text-[10px] bg-cyan-50 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/40 px-1.5 py-0.5 rounded font-medium">
                                                                    🥤 Solo Bebidas: {day.soloBebidasCount}
                                                                </span>
                                                            )}
                                                            {day.cenaCount > 0 && (
                                                                <span className="text-[10px] bg-indigo-50 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/40 px-1.5 py-0.5 rounded font-medium">
                                                                    🍲 Cena: {day.cenaCount}
                                                                </span>
                                                            )}
                                                            {day.cenaCompCount > 0 && (
                                                                <span className="text-[10px] bg-purple-50 text-purple-900 dark:bg-purple-900/40 dark:text-purple-200 border border-purple-300 dark:border-purple-800/50 px-1.5 py-0.5 rounded font-medium">
                                                                    🍷 Cena Comp.: {day.cenaCompCount}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-700/50">
                                                    <div className="flex flex-col items-start sm:items-end">
                                                        <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">
                                                            Total del día ({
                                                                monthlyMealFilter === 'todos' ? 'Todos' :
                                                                monthlyMealFilter === 'total_desayunos' ? 'Total Desayunos' :
                                                                monthlyMealFilter === 'total_cenas' ? 'Total Cenas' :
                                                                monthlyMealFilter === 'desayuno' ? 'Desayuno' :
                                                                monthlyMealFilter === 'desayuno_compensacion' ? 'Desayuno Comp.' :
                                                                monthlyMealFilter === 'desayuno_cena' || monthlyMealFilter === 'MP' ? 'Desayuno + Cena' :
                                                                monthlyMealFilter === 'desayuno_cena_compensacion' ? 'D+C Comp.' :
                                                                monthlyMealFilter === 'solo_bebidas' ? 'Solo Bebidas' :
                                                                monthlyMealFilter === 'cena' ? 'Cena' :
                                                                'Cena Comp.'
                                                            })
                                                        </span>
                                                        <span className="text-xl font-black text-blue-600 dark:text-blue-400">
                                                            {day.totalGuestsDay} {day.totalGuestsDay === 1 ? 'persona' : 'personas'}
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center gap-1.5">
                                                        {day.bookings.length > 0 && (
                                                            <button
                                                                onClick={() => toggleExpandDay(day.dateStr)}
                                                                className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors"
                                                            >
                                                                {expandedMonthDays[day.dateStr] ? '▲ Ocultar' : `▼ Ver (${day.bookings.length})`}
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleJumpToDailyView(day.dateStr)}
                                                            className="px-2.5 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 text-xs font-semibold transition-colors border border-blue-200 dark:border-blue-800"
                                                            title="Abrir este día en la vista diaria"
                                                        >
                                                            Abrir Día ↗
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Expandable list of guests for that day */}
                                            {expandedMonthDays[day.dateStr] && day.bookings.length > 0 && (
                                                <div className="px-4 pb-3 pt-1 border-t border-slate-100 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-900 rounded-b-xl space-y-1.5">
                                                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                                                        Huéspedes con servicio este día:
                                                    </span>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                        {day.bookings.map(b => (
                                                            <div key={b.id} className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-700/70 border border-slate-200/70 dark:border-slate-600/70 text-xs shadow-2xs">
                                                                <div>
                                                                    <span className="font-bold text-slate-800 dark:text-slate-100 block">
                                                                        {b.guestName}
                                                                    </span>
                                                                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                                                                        {b.roomNumber && <span>Hab. {b.roomNumber}</span>}
                                                                        <span>•</span>
                                                                        <span>Estancia: {formatDate(b.startDate)} al {formatDate(b.endDate)}</span>
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center gap-2">
                                                                    <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${getMealTypeBadge(b.mealType).className}`}>
                                                                        {getMealTypeBadge(b.mealType).label}
                                                                    </span>
                                                                    <span className="font-black text-slate-700 dark:text-slate-200">
                                                                        {b.guestsCount || 1}p
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}

                                {monthlyDayStats.filter(d => onlyDaysWithBookings ? d.totalGuestsDay > 0 : true).length === 0 && (
                                    <div className="text-center py-10 text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                                        No hay servicios registrados para los filtros seleccionados en {monthFormattedName}.
                                    </div>
                                )}
                            </div>
                        )}

                        {/* TAB 2: MONTHLY BOOKINGS LIST */}
                        {monthlyTab === 'bookings' && (
                            <div className="space-y-3">
                                {/* Search input */}
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="Buscar por nombre de huésped, número de habitación o notas..."
                                        value={monthlySearchQuery}
                                        onChange={(e) => setMonthlySearchQuery(e.target.value)}
                                        className="w-full px-4 py-2.5 pl-10 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-sm focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-500/30 focus:outline-none"
                                    />
                                    <span className="absolute left-3.5 top-3 text-slate-400">🔍</span>
                                    {monthlySearchQuery && (
                                        <button
                                            onClick={() => setMonthlySearchQuery('')}
                                            className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600 font-bold"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>

                                {monthlyFilteredBookingsList.length > 0 ? (
                                    <div className="flex flex-col space-y-3">
                                        {monthlyFilteredBookingsList.map(booking => (
                                            <div
                                                key={booking.id}
                                                className="bg-white dark:bg-slate-900 backdrop-blur-sm p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all"
                                            >
                                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-black dark:text-slate-300 font-bold text-xs bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-md">
                                                            {formatDate(booking.startDate)} → {formatDate(booking.endDate)}
                                                        </span>
                                                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${getMealTypeBadge(booking.mealType).className}`}>
                                                            {getMealTypeBadge(booking.mealType).label}
                                                        </span>
                                                    </div>

                                                    {userRole === 'editor' && (
                                                        <div className="flex gap-2">
                                                            <button 
                                                                onClick={() => handleOpenModal(booking)} 
                                                                className="bg-amber-400 text-slate-950 px-2.5 py-1 text-xs rounded-md font-bold hover:bg-amber-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
                                                            >
                                                                Editar
                                                            </button>
                                                            <button 
                                                                onClick={() => handleDeleteBooking(booking.id)} 
                                                                className="bg-rose-500 text-white px-2.5 py-1 text-xs rounded-md font-semibold hover:bg-rose-600 transition-colors"
                                                            >
                                                                Cancelar
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">{booking.guestName}</h3>
                                                        {booking.description && (
                                                            <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{booking.description}</p>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col items-end">
                                                        {booking.roomNumber && <span className="text-xl font-bold text-slate-900 dark:text-slate-100">Hab. {booking.roomNumber}</span>}
                                                        <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{booking.guestsCount || 1} {booking.guestsCount === 1 ? 'persona' : 'personas'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-10 text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                                        No se encontraron reservas para los criterios buscados en {monthFormattedName}.
                                    </div>
                                )}
                            </div>
                        )}
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
                        <input type="text" placeholder={tableName === 'events_bookings' ? "Título" : "Nombre del Huésped"} value={newBooking.guestName} onChange={(e) => setNewBooking({ ...newBooking, guestName: e.target.value })} className="w-full p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-500/30" required />
                        {tableName !== 'events_bookings' && (
                            <input type="text" placeholder="Nº Habitación" value={newBooking.roomNumber} onChange={(e) => setNewBooking({ ...newBooking, roomNumber: e.target.value })} className="w-full p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-500/30" required />
                        )}
                        {tableName === 'restaurant_bookings' && (
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Nº de Personas</label>
                                    <input 
                                        type="number" 
                                        min="1"
                                        value={newBooking.guestsCount} 
                                        onChange={(e) => setNewBooking({ ...newBooking, guestsCount: parseInt(e.target.value) || 1 })} 
                                        className="w-full p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-500/30" 
                                        required 
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Tipo de Servicio</label>
                                    <select 
                                        value={newBooking.mealType} 
                                        onChange={(e) => setNewBooking({ ...newBooking, mealType: e.target.value as any })} 
                                        className="w-full p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-500/30"
                                    >
                                        <option value="desayuno">Desayuno</option>
                                        <option value="desayuno_compensacion">Desayuno compensación</option>
                                        <option value="desayuno_cena">Desayuno + Cena</option>
                                        <option value="desayuno_cena_compensacion">Desayuno + Cena compensación</option>
                                        <option value="solo_bebidas">Solo Bebidas</option>
                                        <option value="cena">Cena</option>
                                        <option value="cena_compensacion">Cena compensación</option>
                                    </select>
                                </div>
                            </div>
                        )}
                        <textarea placeholder="Descripción del servicio" value={newBooking.description} onChange={(e) => setNewBooking({ ...newBooking, description: e.target.value })} className="w-full p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-500/30" rows={3} required></textarea>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Fecha Inicio</label>
                                <input type="date" value={newBooking.startDate} onChange={(e) => setNewBooking({ ...newBooking, startDate: e.target.value })} className="w-full p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-500/30" required/>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Fecha Fin</label>
                                <input type="date" value={newBooking.endDate} onChange={(e) => setNewBooking({ ...newBooking, endDate: e.target.value })} className="w-full p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-500/30" required/>
                            </div>
                        </div>
                        <button type="submit" className="w-full bg-amber-400 text-slate-950 p-3 rounded-xl font-bold hover:bg-amber-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2">
                            {editingBooking ? 'Guardar Cambios' : `Guardar ${title}`}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default ServicesView;

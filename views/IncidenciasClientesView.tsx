import React, { useState, useEffect, useMemo } from 'react';
import { ClientIncident, UserRole } from '../types';
import Header from '../components/Header';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import { 
  getClientIncidents, 
  addClientIncident, 
  updateClientIncident, 
  deleteClientIncident 
} from '../services/firebaseService';

interface IncidenciasClientesViewProps {
  dbError: string | null;
  isDbInitialized: boolean;
  isAuthReady: boolean;
  userRole: UserRole;
  onRetryAuth: () => void;
}

const formatDate = (dateString: string) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return dateString;
  }
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const initialFormState = {
  clientName: '',
  roomNumber: '',
  startDate: new Date().toISOString().split('T')[0],
  endDate: '',
  notes: '',
  resolved: false,
  status: 'pendiente' as 'pendiente' | 'proceso' | 'resuelta',
};

const IncidenciasClientesView: React.FC<IncidenciasClientesViewProps> = ({ 
  dbError, 
  isDbInitialized, 
  isAuthReady, 
  userRole, 
  onRetryAuth 
}) => {
  const { showToast, confirm } = useToast();
  const [incidents, setIncidents] = useState<ClientIncident[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIncident, setEditingIncident] = useState<ClientIncident | null>(null);
  const [formData, setFormData] = useState(initialFormState);
  
  // Status tab state: 'pendientes', 'proceso' or 'resueltas'
  const [statusTab, setStatusTab] = useState<'pendientes' | 'proceso' | 'resueltas'>('pendientes');

  // Calendar & search states
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCalendar, setShowCalendar] = useState(true);

  useEffect(() => {
    if (!isAuthReady) return;
    setIsLoading(true);
    
    const unsubscribe = getClientIncidents((data) => {
      setIncidents(data);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [isAuthReady]);

  // Helper to determine status dynamically for older records or new records
  const getIncidentStatus = (incident: ClientIncident): 'pendiente' | 'proceso' | 'resuelta' => {
    if (incident.status) return incident.status;
    return incident.resolved ? 'resuelta' : 'pendiente';
  };

  // Count summary
  const pendingCount = useMemo(() => incidents.filter(i => getIncidentStatus(i) === 'pendiente').length, [incidents]);
  const processCount = useMemo(() => incidents.filter(i => getIncidentStatus(i) === 'proceso').length, [incidents]);
  const resolvedCount = useMemo(() => incidents.filter(i => getIncidentStatus(i) === 'resuelta').length, [incidents]);

  // Memoized resolved incidents list
  const resolvedIncidents = useMemo(() => {
    return incidents.filter(i => getIncidentStatus(i) === 'resuelta');
  }, [incidents]);

  // Map representing dates that have active resolved incidents
  const resolvedIncidentsByDateMap = useMemo(() => {
    const map: Record<string, ClientIncident[]> = {};
    
    resolvedIncidents.forEach(incident => {
      if (!incident.startDate || !incident.endDate) return;
      
      const start = new Date(incident.startDate);
      const end = new Date(incident.endDate);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        // Fallback: just map to startDate
        const sDate = incident.startDate;
        if (sDate) {
          if (!map[sDate]) map[sDate] = [];
          if (!map[sDate].some(i => i.id === incident.id)) {
            map[sDate].push(incident);
          }
        }
        return;
      }
      
      const current = new Date(start);
      let safetyCounter = 0;
      while (current <= end && safetyCounter < 400) {
        safetyCounter++;
        const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
        if (!map[dateStr]) map[dateStr] = [];
        if (!map[dateStr].some(i => i.id === incident.id)) {
          map[dateStr].push(incident);
        }
        
        current.setDate(current.getDate() + 1);
      }
    });
    
    return map;
  }, [resolvedIncidents]);

  // Generate 42 calendar grid days
  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const firstDayOfWeek = (firstDay.getDay() + 6) % 7; // 0 = Mon, 6 = Sun
    
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, month, 0).getDate();
    
    const days: { dateStr: string; dayNum: number; isCurrentMonth: boolean; hasIncidents: boolean; incidents: ClientIncident[] }[] = [];
    
    // Fill previous month's days
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthTotalDays - i;
      const prevMonthDate = new Date(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1, d);
      const dateStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-${String(prevMonthDate.getDate()).padStart(2, '0')}`;
      const dayIncidents = resolvedIncidentsByDateMap[dateStr] || [];
      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: false,
        hasIncidents: dayIncidents.length > 0,
        incidents: dayIncidents,
      });
    }
    
    // Fill current month's days
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayIncidents = resolvedIncidentsByDateMap[dateStr] || [];
      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: true,
        hasIncidents: dayIncidents.length > 0,
        incidents: dayIncidents,
      });
    }
    
    // Fill next month's days
    const remainingCells = 42 - days.length;
    for (let d = 1; d <= remainingCells; d++) {
      const nextMonthDate = new Date(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1, d);
      const dateStr = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-${String(nextMonthDate.getDate()).padStart(2, '0')}`;
      const dayIncidents = resolvedIncidentsByDateMap[dateStr] || [];
      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: false,
        hasIncidents: dayIncidents.length > 0,
        incidents: dayIncidents,
      });
    }
    
    return days;
  }, [calendarMonth, resolvedIncidentsByDateMap]);

  // Filtered incidents based on active status tab, search query, and calendar selection
  const filteredIncidents = useMemo(() => {
    return incidents.filter(incident => {
      const currentStatus = getIncidentStatus(incident);
      
      // 1. Status Filter
      if (statusTab === 'pendientes') {
        if (currentStatus !== 'pendiente') return false;
      } else if (statusTab === 'proceso') {
        if (currentStatus !== 'proceso') return false;
      } else {
        if (currentStatus !== 'resuelta') return false;
        
        // 2. Date Filter (Check if incident stays on/around selectedDate)
        if (selectedDate) {
          const matchDate = (incident.startDate <= selectedDate && incident.endDate >= selectedDate) ||
                            (incident.startDate === selectedDate) ||
                            (incident.endDate === selectedDate);
          if (!matchDate) return false;
        }
      }
      
      // 3. Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = incident.clientName.toLowerCase().includes(q);
        const matchRoom = incident.roomNumber.toLowerCase().includes(q);
        const matchNotes = incident.notes.toLowerCase().includes(q);
        return matchName || matchRoom || matchNotes;
      }
      
      return true;
    });
  }, [incidents, statusTab, selectedDate, searchQuery]);

  const handleOpenAddModal = () => {
    setEditingIncident(null);
    setFormData({
      clientName: '',
      roomNumber: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      notes: '',
      resolved: false,
      status: 'pendiente',
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (incident: ClientIncident) => {
    setEditingIncident(incident);
    setFormData({
      clientName: incident.clientName,
      roomNumber: incident.roomNumber,
      startDate: incident.startDate,
      endDate: incident.endDate,
      notes: incident.notes,
      resolved: incident.resolved,
      status: getIncidentStatus(incident),
    });
    setIsModalOpen(true);
  };

  const handleChangeStatus = async (incident: ClientIncident, newStatus: 'pendiente' | 'proceso' | 'resuelta') => {
    try {
      await updateClientIncident(incident.id, { 
        status: newStatus,
        resolved: newStatus === 'resuelta' 
      });
      
      const statusLabels = {
        pendiente: 'Pendiente de resolver',
        proceso: 'En proceso',
        resuelta: 'Resuelta',
      };
      
      showToast(
        `Incidencia marcada como ${statusLabels[newStatus]}.`, 
        'success'
      );
    } catch (err) {
      showToast('Error al cambiar el estado de la incidencia.', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    const isConfirmed = await confirm('¿Estás seguro de que quieres eliminar esta incidencia?');

    if (isConfirmed) {
      try {
        await deleteClientIncident(id);
        showToast('Incidencia eliminada correctamente.', 'success');
      } catch (err) {
        showToast('Error al eliminar la incidencia.', 'error');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.clientName.trim() || !formData.roomNumber.trim() || !formData.startDate || !formData.endDate || !formData.notes.trim()) {
      showToast('Por favor, rellena todos los campos obligatorios.', 'error');
      return;
    }

    try {
      if (editingIncident) {
        await updateClientIncident(editingIncident.id, {
          clientName: formData.clientName.trim(),
          roomNumber: formData.roomNumber.trim(),
          startDate: formData.startDate,
          endDate: formData.endDate,
          notes: formData.notes.trim(),
          resolved: formData.status === 'resuelta',
          status: formData.status,
        });
        showToast('Incidencia modificada correctamente.', 'success');
      } else {
        await addClientIncident({
          clientName: formData.clientName.trim(),
          roomNumber: formData.roomNumber.trim(),
          startDate: formData.startDate,
          endDate: formData.endDate,
          notes: formData.notes.trim(),
          resolved: formData.status === 'resuelta',
          status: formData.status,
        });
        showToast('Incidencia guardada correctamente.', 'success');
      }
      setIsModalOpen(false);
    } catch (err) {
      showToast('Error al guardar la incidencia.', 'error');
    }
  };

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-6">
      <Header title="Incidencias Clientes">
        <button
          onClick={handleOpenAddModal}
          className="bg-blue-600 text-white hover:bg-blue-700 transition-colors px-4 py-2 rounded-xl text-sm font-semibold flex items-center shadow-md shadow-blue-500/10 gap-1.5"
          aria-label="Añadir incidencia"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span className="hidden sm:inline">Añadir Incidencia</span>
          <span className="inline sm:hidden">Añadir</span>
        </button>
      </Header>

      {/* Internal Tabs/Pestañas */}
      <div className="flex flex-col sm:flex-row bg-gray-100 dark:bg-gray-800 p-1 rounded-xl gap-1">
        <button
          type="button"
          onClick={() => setStatusTab('pendientes')}
          className={`flex-1 py-2.5 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
            statusTab === 'pendientes'
              ? 'bg-amber-500 text-white shadow-md'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
        >
          <span>🟡 Pendientes de resolver</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            statusTab === 'pendientes' ? 'bg-white text-amber-600' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}>
            {pendingCount}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setStatusTab('proceso')}
          className={`flex-1 py-2.5 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
            statusTab === 'proceso'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
        >
          <span>🔵 En proceso</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            statusTab === 'proceso' ? 'bg-white text-blue-600' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}>
            {processCount}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setStatusTab('resueltas')}
          className={`flex-1 py-2.5 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
            statusTab === 'resueltas'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
        >
          <span>🟢 Resueltas</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            statusTab === 'resueltas' ? 'bg-white text-emerald-600' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}>
            {resolvedCount}
          </span>
        </button>
      </div>

      {dbError && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400 p-4 rounded-xl text-sm font-medium">
          <p>{dbError}</p>
          <button 
            onClick={onRetryAuth}
            className="mt-2 bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-3 rounded-lg text-xs"
          >
            Reintentar autenticación
          </button>
        </div>
      )}

      {/* Buscador & Calendario */}
      {!isLoading && (incidents.length > 0 || searchQuery.trim()) && (
        <div className="bg-white/40 dark:bg-gray-800/40 backdrop-blur-md p-4 rounded-2xl border border-gray-200/50 dark:border-gray-700/50 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Buscador de texto */}
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                placeholder={statusTab === 'resueltas' ? "Buscar por cliente, habitación u observaciones..." : "Buscar pendientes por cliente, habitación..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-9 py-2.5 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-gray-900 dark:text-white"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>

            {/* Toggle Calendario */}
            {statusTab === 'resueltas' && (
              <button
                type="button"
                onClick={() => setShowCalendar(!showCalendar)}
                className={`px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 border transition-all ${
                  showCalendar
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-800'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>{showCalendar ? 'Ocultar Calendario' : 'Mostrar Calendario'}</span>
              </button>
            )}
          </div>

          {/* Calendario de incidencias resueltas */}
          {statusTab === 'resueltas' && showCalendar && (
            <div className="pt-4 border-t border-gray-200/50 dark:border-gray-700/50 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-extrabold text-gray-800 dark:text-gray-200 uppercase tracking-wider">
                    {calendarMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                  </span>
                  <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    {resolvedCount} Resueltas
                  </span>
                </div>
                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg text-gray-600 dark:text-gray-400 transition-colors animate-press"
                    title="Mes Anterior"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCalendarMonth(new Date());
                      setSelectedDate(new Date().toISOString().split('T')[0]);
                    }}
                    className="px-2.5 py-1 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg text-xs font-bold text-gray-600 dark:text-gray-400 transition-colors"
                  >
                    Hoy
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg text-gray-600 dark:text-gray-400 transition-colors animate-press"
                    title="Mes Siguiente"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Días de la semana */}
              <div className="grid grid-cols-7 text-center text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                <div>Lu</div>
                <div>Ma</div>
                <div>Mi</div>
                <div>Ju</div>
                <div>Vi</div>
                <div>Sá</div>
                <div>Do</div>
              </div>

              {/* Grid de días */}
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, idx) => {
                  const isSelected = selectedDate === day.dateStr;
                  const isTodayStr = new Date().toISOString().split('T')[0] === day.dateStr;
                  
                  return (
                    <button
                      key={`${day.dateStr}-${idx}`}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setSelectedDate(null);
                        } else {
                          setSelectedDate(day.dateStr);
                        }
                      }}
                      className={`relative aspect-square rounded-xl flex flex-col items-center justify-center p-1 transition-all ${
                        day.isCurrentMonth 
                          ? 'text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800' 
                          : 'text-gray-400 dark:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-900/40 opacity-40'
                      } ${
                        isSelected 
                          ? 'bg-emerald-600 text-white font-extrabold scale-105 shadow-md shadow-emerald-600/25 hover:bg-emerald-700' 
                          : isTodayStr 
                            ? 'border border-amber-500 font-extrabold text-amber-600 dark:text-amber-400' 
                            : 'font-semibold'
                      }`}
                    >
                      <span className="text-xs">{day.dayNum}</span>
                      {day.hasIncidents && (
                        <span className={`absolute bottom-1 h-1.5 w-1.5 rounded-full ${
                          isSelected ? 'bg-white' : 'bg-emerald-500 animate-pulse'
                        }`} />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Leyenda y Filtros activos */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-gray-50 dark:bg-gray-950 p-2.5 rounded-xl border border-gray-100 dark:border-gray-900">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-extrabold text-gray-400 uppercase tracking-wider text-[10px]">Filtro:</span>
                  {selectedDate ? (
                    <span className="font-extrabold text-emerald-700 dark:text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20 shadow-sm">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {formatDate(selectedDate)}
                    </span>
                  ) : (
                    <span className="font-bold text-gray-500 dark:text-gray-400 italic">Todos los días</span>
                  )}
                  
                  {searchQuery.trim() && (
                    <span className="font-extrabold text-blue-700 dark:text-blue-400 flex items-center gap-1 bg-blue-500/10 px-2 py-0.5 rounded-lg border border-blue-500/20 max-w-[120px] truncate shadow-sm">
                      &quot;{searchQuery}&quot;
                    </span>
                  )}
                </div>
                
                {(selectedDate || searchQuery.trim()) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDate(null);
                      setSearchQuery('');
                    }}
                    className="font-black text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400 uppercase tracking-wider text-[10px] bg-white dark:bg-gray-900 shadow-sm border border-gray-200 dark:border-gray-800 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    Ver Todo
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
        </div>
      ) : filteredIncidents.length === 0 ? (
        <div className="text-center py-16 bg-white/20 dark:bg-gray-800/20 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400 dark:text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-gray-600 dark:text-gray-400 font-semibold">
            No hay incidencias {statusTab === 'pendientes' ? 'pendientes de resolver' : statusTab === 'proceso' ? 'en proceso' : 'resueltas'}.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredIncidents.map((incident) => {
            const currentStatus = getIncidentStatus(incident);
            return (
              <div 
                key={incident.id} 
                className="bg-white/40 dark:bg-gray-800/40 backdrop-blur-md p-5 rounded-2xl shadow-sm hover:shadow-md transition-all border border-gray-200/50 dark:border-gray-700/50 animate-fade-in"
              >
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h3 className="font-extrabold text-lg text-gray-900 dark:text-gray-100">
                      {incident.clientName}
                    </h3>
                    <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                      Habitación {incident.roomNumber}
                    </p>
                  </div>
                  {currentStatus === 'resuelta' ? (
                    <span className="text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      🟢 Resuelta
                    </span>
                  ) : currentStatus === 'proceso' ? (
                    <span className="text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      🔵 En proceso
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                      🟡 Pendiente
                    </span>
                  )}
                </div>

                {/* Dates info */}
                <div className="grid grid-cols-2 gap-4 mt-3 bg-gray-50/50 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-200/20 text-xs">
                  <div>
                    <span className="block text-gray-500 font-bold dark:text-gray-400">FECHA ENTRADA</span>
                    <span className="font-extrabold text-gray-800 dark:text-gray-200">{formatDate(incident.startDate)}</span>
                  </div>
                  <div>
                    <span className="block text-gray-500 font-bold dark:text-gray-400">FECHA SALIDA</span>
                    <span className="font-extrabold text-gray-800 dark:text-gray-200">{formatDate(incident.endDate)}</span>
                  </div>
                </div>

                {/* Observations */}
                {incident.notes && (
                  <div className="mt-4">
                    <p className="text-xs text-black bg-amber-100 border border-amber-300 px-3 py-2 rounded-lg break-words italic font-bold font-sans shadow-sm">
                      <span className="not-italic font-black text-[10px] text-black mr-1.5 uppercase font-mono">Obs:</span>
                      {incident.notes}
                    </p>
                  </div>
                )}

                {/* User action buttons */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mt-4 pt-4 border-t border-gray-200/50 dark:border-gray-700/50 gap-3">
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">
                    Creado por: {incident.createdBy?.split('@')[0] || incident.createdBy}
                  </span>
                  
                  <div className="flex items-center justify-end space-x-2 flex-wrap gap-y-2">
                    {/* Status transition buttons */}
                    {currentStatus === 'pendiente' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleChangeStatus(incident, 'proceso')}
                          className="px-2.5 py-1.5 text-xs rounded-xl font-bold transition-all bg-blue-500 text-white hover:bg-blue-600 shadow-sm shadow-blue-500/10 flex items-center gap-1"
                          title="Comenzar a trabajar"
                        >
                          <span>🔵 Comenzar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleChangeStatus(incident, 'resuelta')}
                          className="px-2.5 py-1.5 text-xs rounded-xl font-bold transition-all bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm shadow-emerald-500/10 flex items-center gap-1"
                          title="Marcar como Resuelta"
                        >
                          <span>🟢 Resolver</span>
                        </button>
                      </>
                    )}

                    {currentStatus === 'proceso' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleChangeStatus(incident, 'pendiente')}
                          className="px-2.5 py-1.5 text-xs rounded-xl font-bold transition-all bg-amber-500 text-white hover:bg-amber-600 shadow-sm shadow-amber-500/10 flex items-center gap-1"
                          title="Pausar / Volver a Pendiente"
                        >
                          <span>🟡 Pausar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleChangeStatus(incident, 'resuelta')}
                          className="px-2.5 py-1.5 text-xs rounded-xl font-bold transition-all bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm shadow-emerald-500/10 flex items-center gap-1"
                          title="Marcar como Resuelta"
                        >
                          <span>🟢 Resolver</span>
                        </button>
                      </>
                    )}

                    {currentStatus === 'resuelta' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleChangeStatus(incident, 'pendiente')}
                          className="px-2.5 py-1.5 text-xs rounded-xl font-bold transition-all bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border border-amber-200 dark:border-amber-900 flex items-center gap-1"
                          title="Volver a poner Pendiente"
                        >
                          <span>Reabrir</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleChangeStatus(incident, 'proceso')}
                          className="px-2.5 py-1.5 text-xs rounded-xl font-bold transition-all bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border border-blue-200 dark:border-blue-900 flex items-center gap-1"
                          title="Volver a poner En Proceso"
                        >
                          <span>Poner en proceso</span>
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(incident)}
                      className="p-1.5 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg transition-all"
                      title="Editar Incidencia"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(incident.id)}
                      className="p-1.5 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all"
                      title="Eliminar Incidencia"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal for Add / Edit Incidencia */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingIncident ? 'Editar Incidencia' : 'Nueva Incidencia'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-black uppercase text-gray-500 dark:text-gray-400 mb-1.5">
              Nombre de Cliente *
            </label>
            <input
              type="text"
              required
              placeholder="Ej: Juan Pérez"
              value={formData.clientName}
              onChange={(e) => setFormData(prev => ({ ...prev, clientName: e.target.value }))}
              className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase text-gray-500 dark:text-gray-400 mb-1.5">
              Número de Habitación *
            </label>
            <input
              type="text"
              required
              placeholder="Ej: 104"
              value={formData.roomNumber}
              onChange={(e) => setFormData(prev => ({ ...prev, roomNumber: e.target.value }))}
              className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-gray-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black uppercase text-gray-500 dark:text-gray-400 mb-1.5">
                Fecha Entrada *
              </label>
              <input
                type="date"
                required
                value={formData.startDate}
                onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-black uppercase text-gray-500 dark:text-gray-400 mb-1.5">
                Fecha Salida *
              </label>
              <input
                type="date"
                required
                value={formData.endDate}
                onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-black uppercase text-gray-500 dark:text-gray-400 mb-1.5">
              Observaciones / Descripción *
            </label>
            <textarea
              required
              placeholder="Ej: Aire acondicionado no enfría, se avisa a mantenimiento."
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              rows={4}
              className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase text-gray-500 dark:text-gray-400 mb-1.5">
              Estado de la Incidencia *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, status: 'pendiente' }))}
                className={`p-3 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                  formData.status === 'pendiente'
                    ? 'bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300 ring-2 ring-amber-500'
                    : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <span>🟡 Pendiente</span>
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, status: 'proceso' }))}
                className={`p-3 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                  formData.status === 'proceso'
                    ? 'bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300 ring-2 ring-blue-500'
                    : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <span>🔵 En proceso</span>
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, status: 'resuelta' }))}
                className={`p-3 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                  formData.status === 'resuelta'
                    ? 'bg-emerald-100 border-emerald-300 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300 ring-2 ring-emerald-500'
                    : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <span>🟢 Resuelta</span>
              </button>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200/50 dark:border-gray-700/50">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-500/10 transition-colors"
            >
              Guardar
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default IncidenciasClientesView;

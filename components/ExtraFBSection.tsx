
import React, { useState, useEffect } from 'react';
import { ExtraFBEntry } from '../types';
import { getExtraFBEntries, addExtraFBEntry, deleteExtraFBEntry } from '../services/firebaseService';
import { useToast } from './Toast';

const DEPARTMENTS = [
  "DIRECCIÓN/SUBDIRECCIÓN",
  "GUIAS O HUERZELER",
  "GRUPOS QUE NO APARECEN EN TIMÓN",
  "COMPENSACIONES DE H A HD",
  "COMPENSACIONES DE HD A HMP",
  "INTERCAMBIOS CENAS HM HOTELS"
];

interface ExtraFBSectionProps {
  userRole: string;
}

const ExtraFBSection: React.FC<ExtraFBSectionProps> = ({ userRole }) => {
  const { showToast, confirm } = useToast();
  const [entries, setEntries] = useState<ExtraFBEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [filterDept, setFilterDept] = useState<string>('todos');
  const [filterMeal, setFilterMeal] = useState<string>('todos');
  
  const [newEntry, setNewEntry] = useState({
    date: new Date().toISOString().split('T')[0],
    department: DEPARTMENTS[0],
    numberOfPeople: 1,
    mealType: 'cena' as 'desayuno' | 'cena'
  });

  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = getExtraFBEntries(selectedMonth, (data) => {
      setEntries(data);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [selectedMonth]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addExtraFBEntry(newEntry);
      showToast("Entrada guardada correctamente", "success");
      // Reset people count but keep date/dept/meal for quick consecutive entries
      setNewEntry(prev => ({ ...prev, numberOfPeople: 1 }));
    } catch (error: any) {
      showToast("Error al guardar: " + error.message, "error");
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirm("¿Eliminar esta entrada?");
    if (confirmed) {
      try {
        await deleteExtraFBEntry(id);
        showToast("Eliminado correctamente", "success");
      } catch (error: any) {
        showToast("Error: " + error.message, "error");
      }
    }
  };

  const filteredEntries = entries.filter(e => {
    const matchesDept = filterDept === 'todos' || e.department === filterDept;
    const matchesMeal = filterMeal === 'todos' || e.mealType === filterMeal;
    return matchesDept && matchesMeal;
  });

  const totals = filteredEntries.reduce((acc, curr) => ({
    ...acc,
    [curr.mealType]: acc[curr.mealType] + curr.numberOfPeople,
    total: acc.total + curr.numberOfPeople
  }), { desayuno: 0, cena: 0, total: 0 });

  return (
    <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm p-4 rounded-xl shadow-lg mt-8 border border-gray-200 dark:border-gray-700">
      <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
        <span className="bg-amber-100 dark:bg-amber-900/50 p-2 rounded-lg">📊</span>
        EXTRAS (NO TIMÓN)
      </h3>

      {/* Form Section */}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6 bg-amber-50/50 dark:bg-amber-900/10 p-4 rounded-lg border border-amber-100 dark:border-amber-900/30">
        <div className="md:col-span-1">
          <label className="block text-[10px] font-bold uppercase text-amber-800 dark:text-amber-300 mb-1">Fecha</label>
          <input 
            type="date" 
            value={newEntry.date}
            onChange={e => setNewEntry({...newEntry, date: e.target.value})}
            className="w-full p-2 text-sm rounded bg-white dark:bg-gray-700 border border-amber-200 dark:border-amber-800"
          />
        </div>
        <div className="md:col-span-1">
          <label className="block text-[10px] font-bold uppercase text-amber-800 dark:text-amber-300 mb-1">Concepto / Dept.</label>
          <select 
            value={newEntry.department}
            onChange={e => setNewEntry({...newEntry, department: e.target.value})}
            className="w-full p-2 text-sm rounded bg-white dark:bg-gray-700 border border-amber-200 dark:border-amber-800"
          >
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="md:col-span-1">
          <label className="block text-[10px] font-bold uppercase text-amber-800 dark:text-amber-300 mb-1">Personas</label>
          <input 
            type="number" 
            min="1"
            value={newEntry.numberOfPeople}
            onChange={e => setNewEntry({...newEntry, numberOfPeople: parseInt(e.target.value) || 1})}
            className="w-full p-2 text-sm rounded bg-white dark:bg-gray-700 border border-amber-200 dark:border-amber-800"
          />
        </div>
        <div className="md:col-span-1">
          <label className="block text-[10px] font-bold uppercase text-amber-800 dark:text-amber-300 mb-1">Servicio</label>
          <select 
            value={newEntry.mealType}
            onChange={e => setNewEntry({...newEntry, mealType: e.target.value as 'desayuno' | 'cena'})}
            className="w-full p-2 text-sm rounded bg-white dark:bg-gray-700 border border-amber-200 dark:border-amber-800"
          >
            <option value="desayuno">Desayuno</option>
            <option value="cena">Cena</option>
          </select>
        </div>
        <div className="md:col-span-1 flex items-end">
          <button 
            type="submit"
            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 rounded shadow transition-all active:scale-95"
          >
            AÑADIR
          </button>
        </div>
      </form>

      {/* Monthly Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-900 p-3 rounded-lg border border-gray-100 dark:border-gray-800 shadow-sm">
          <label className="block text-[10px] font-black text-gray-400 uppercase mb-2">Mes de Consulta</label>
          <input 
            type="month" 
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="w-full p-2 text-sm rounded border dark:bg-gray-800"
          />
        </div>
        <div className="grid grid-cols-3 gap-2 md:col-span-3">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg border border-yellow-100 dark:border-yellow-900/40 text-center">
            <span className="block text-[10px] font-bold text-yellow-700 dark:text-yellow-400 uppercase">Desayunos</span>
            <span className="text-2xl font-black text-yellow-900 dark:text-yellow-100">{totals.desayuno}</span>
          </div>
          <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-lg border border-indigo-100 dark:border-indigo-900/40 text-center">
            <span className="block text-[10px] font-bold text-indigo-700 dark:text-indigo-400 uppercase">Cenas</span>
            <span className="text-2xl font-black text-indigo-900 dark:text-indigo-100">{totals.cena}</span>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border border-green-100 dark:border-green-900/40 text-center">
            <span className="block text-[10px] font-bold text-green-700 dark:text-green-400 uppercase">Total Mensual</span>
            <span className="text-2xl font-black text-green-900 dark:text-green-100">{totals.total}</span>
          </div>
        </div>
      </div>

      {/* Filters & Table */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 items-center text-xs">
          <span className="font-bold text-gray-500 uppercase">Filtrar:</span>
          <select 
            value={filterDept}
            onChange={e => setFilterDept(e.target.value)}
            className="p-1.5 rounded border bg-gray-50 dark:bg-gray-800"
          >
            <option value="todos">Todos los Deptos.</option>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select 
            value={filterMeal}
            onChange={e => setFilterMeal(e.target.value)}
            className="p-1.5 rounded border bg-gray-50 dark:bg-gray-800"
          >
            <option value="todos">Todos los servicios</option>
            <option value="desayuno">Sólo Desayuno</option>
            <option value="cena">Sólo Cena</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-900/50 text-[10px] font-black uppercase text-gray-500">
              <tr>
                <th className="p-2 border-b dark:border-gray-700">Fecha</th>
                <th className="p-2 border-b dark:border-gray-700">Concepto</th>
                <th className="p-2 border-b dark:border-gray-700">Can.</th>
                <th className="p-2 border-b dark:border-gray-700">Serv.</th>
                <th className="p-2 border-b dark:border-gray-700 text-right">Acc.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading ? (
                <tr><td colSpan={5} className="p-4 text-center">Cargando datos...</td></tr>
              ) : filteredEntries.length === 0 ? (
                <tr><td colSpan={5} className="p-4 text-center text-gray-400 italic">No hay datos para este filtro</td></tr>
              ) : (
                filteredEntries.map(entry => (
                  <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="p-2 font-mono text-[11px]">{new Date(entry.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}</td>
                    <td className="p-2 font-bold text-xs">{entry.department}</td>
                    <td className="p-2"><span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded font-black">{entry.numberOfPeople}</span></td>
                    <td className="p-2">
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${entry.mealType === 'desayuno' ? 'bg-yellow-100 text-yellow-800' : 'bg-indigo-100 text-indigo-800'}`}>
                        {entry.mealType}
                      </span>
                    </td>
                    <td className="p-2 text-right">
                      {userRole === 'editor' && (
                        <button 
                          onClick={() => handleDelete(entry.id!)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          🗑️
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ExtraFBSection;

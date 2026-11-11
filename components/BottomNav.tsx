
import React from 'react';
import { View } from '../types';
import { 
    NewsIcon,
    ParkingIcon,
    ExtrasIcon, 
    BalineseIcon, 
    DisabilityIcon,
    BikeIcon,
    SaunaIcon,
} from './icons/NavIcons';

interface NavItemConfig {
  view: View;
  label: string;
  icon: React.ReactNode;
}

interface BottomNavProps {
  activeView: View;
  setActiveView: (view: View) => void;
  navItems: NavItemConfig[];
}

const NavItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
}> = ({ icon, label, isActive, onClick }) => {
  const activeClasses = 'bg-sky-600/10 text-sky-700 dark:text-sky-300';
  const inactiveClasses = 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5';

  return (
    <button
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${isActive ? activeClasses : inactiveClasses}`}
    >
      <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </button>
  );
};

const BottomNav: React.FC<BottomNavProps> = ({ activeView, setActiveView, navItems }) => {
  return (
    <nav className="no-print border-t border-slate-100 dark:border-white/5" aria-label="Secciones">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-1 overflow-x-auto xl:flex-wrap no-scrollbar">
        {navItems.map((item) => (
          <NavItem
            key={item.view}
            icon={item.icon}
            label={item.label}
            isActive={activeView === item.view}
            onClick={() => setActiveView(item.view)}
          />
        ))}
      </div>
    </nav>
  );
};

export default BottomNav;

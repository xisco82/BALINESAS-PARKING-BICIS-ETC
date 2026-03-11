
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
  const activeClasses = 'text-blue-600 dark:text-blue-400';
  const inactiveClasses = 'text-gray-700 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-300';

  return (
    <button onClick={onClick} className={`flex flex-col items-center justify-center w-full transition-all duration-200 ${isActive ? activeClasses : inactiveClasses}`}>
      <div className={`p-1 ${isActive ? 'scale-110' : ''}`}>{icon}</div>
      <span className={`text-[10px] leading-tight text-center ${isActive ? 'font-bold' : 'font-medium'}`}>{label}</span>
    </button>
  );
};

const BottomNav: React.FC<BottomNavProps> = ({ activeView, setActiveView, navItems }) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 h-20 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border-t border-gray-200/50 dark:border-gray-700/50 shadow-[0_-5px_15px_-5px_rgba(0,0,0,0.1)] z-30">
      <div className="flex justify-start md:justify-around items-center h-full max-w-2xl mx-auto pl-[68px] pr-4 md:px-2 overflow-x-auto gap-1 md:gap-2 pb-1">
        {navItems.map((item) => (
          <div key={item.view} className="min-w-[52px] flex-shrink-0">
            <NavItem
              icon={item.icon}
              label={item.label}
              isActive={activeView === item.view}
              onClick={() => setActiveView(item.view)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default BottomNav;
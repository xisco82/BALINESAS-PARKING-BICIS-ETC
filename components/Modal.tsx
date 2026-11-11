
import React from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, maxWidth = "max-w-md" }) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex justify-center items-start md:items-center p-4 overflow-y-auto animate-fade-in"
      onClick={onClose}
    >
      <div 
        className={`bg-white dark:bg-slate-900 border border-transparent dark:border-white/10 rounded-2xl shadow-2xl w-full ${maxWidth} my-auto transform transition-transform duration-300 scale-95 animate-scale-in max-h-fit`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-5 border-b border-slate-200 dark:border-white/10">
          <h3 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">{title}</h3>
          <button 
            onClick={onClose} 
            aria-label="Cerrar"
            className="rounded-xl p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
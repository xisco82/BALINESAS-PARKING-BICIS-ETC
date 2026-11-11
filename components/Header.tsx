
import React, { useState, useEffect } from 'react';

interface HeaderProps {
  title: React.ReactNode;
  children?: React.ReactNode;
}

const Header: React.FC<HeaderProps> = ({ title, children }) => {
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    const docEl = document.documentElement as any;
    const doc = document as any;

    if (!document.fullscreenElement && !doc.webkitFullscreenElement && !doc.mozFullScreenElement && !doc.msFullscreenElement) {
        if (docEl.requestFullscreen) {
          docEl.requestFullscreen();
        } else if (docEl.mozRequestFullScreen) { // Firefox
          docEl.mozRequestFullScreen();
        } else if (docEl.webkitRequestFullscreen) { // Chrome, Safari, Opera
          docEl.webkitRequestFullscreen();
        } else if (docEl.msRequestFullscreen) { // IE/Edge
          docEl.msRequestFullscreen();
        }
    } else {
      if (doc.exitFullscreen) {
        doc.exitFullscreen();
      } else if (doc.mozCancelFullScreen) { // Firefox
        doc.mozCancelFullScreen();
      } else if (doc.webkitExitFullscreen) { // Chrome, Safari, Opera
        doc.webkitExitFullscreen();
      } else if (doc.msExitFullscreen) { // IE/Edge
        doc.msExitFullscreen();
      }
    }
  };

  return (
    <div className="px-4 sm:px-6 pt-6 pb-2 print:p-1">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="font-display text-2xl print:text-base font-bold tracking-tight text-slate-900 dark:text-white min-w-0 break-words">{title}</h1>
        <div className="flex flex-wrap items-center gap-2">
            {children}
            <button
                onClick={toggleFullscreen}
                className="no-print bg-white dark:bg-slate-900 border border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-200 p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
                title={isFullscreen ? "Salir de Pantalla Completa" : "Pantalla Completa"}
                aria-label={isFullscreen ? "Salir de Pantalla Completa" : "Pantalla Completa"}
            >
                {isFullscreen ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 4H4v6m10-6h6v6m-6 4H4v6m16-6h-6v6" />
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4m12 0h-4v4m0-4l-6 6m-6-6l6 6m-6 6v4h4m12 0h-4v-4m0 4l-6-6" />
                    </svg>
                )}
            </button>
        </div>
      </div>
    </div>
  );
};

export default Header;
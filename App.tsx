import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View } from './types';
import BottomNav from './components/BottomNav';
import BalineseView from './views/BalineseView';
import ServicesView from './views/ServicesView';
import NewsView from './views/NewsView';
import ParkingView from './views/ParkingView';
import DisabilityView from './views/DisabilityView';
import BikesView from './views/BikesView';
import SaunaView from './views/SaunaView';
import DayPassView from './views/DayPassView';
import { initClient } from './services/googleSheetsService';
import { auth } from './services/firebase';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { seedEmailRecipients } from './services/firebaseService';
import LoginView from './views/LoginView';
import { 
    NewsIcon,
    ParkingIcon,
    ExtrasIcon, 
    BalineseIcon, 
    DisabilityIcon,
    BikeIcon,
    SaunaIcon,
    DayPassIcon,
    SkyDinnerIcon,
} from './components/icons/NavIcons';


type UserRole = 'editor' | 'balinese_editor';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [activeView, setActiveView] = useState<View>(View.News);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [gapiError, setGapiError] = useState<string | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [isDbInitialized, setIsDbInitialized] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isLogoEnlarged, setIsLogoEnlarged] = useState(false);
  const [animationClass, setAnimationClass] = useState('');
  
  const updateSigninStatus = useCallback((signedIn: boolean) => {
    setIsSignedIn(signedIn);
  }, []);
  
  useEffect(() => {
    const wasAuthenticated = sessionStorage.getItem('isAuthenticated') === 'true';
    if (wasAuthenticated) {
      setIsAuthenticated(true);
      setUserRole(sessionStorage.getItem('userRole') as UserRole | null);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        signInAnonymously(auth).catch(err => console.error("Firebase Auth Error", err));
      } else {
        setIsAuthReady(true);
        // Seed email recipients once signed in
        seedEmailRecipients();
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Initialize the Google API client for Sheets integration.
    initClient(updateSigninStatus).catch(err => {
      console.error("Fatal Error initializing GAPI client", err);
      const message = err.details || err.message || 'Failed to initialize. Check Client ID and authorized origins in Google Cloud Console.';
      setGapiError(`Google API Error: ${message}`);
    });

    setIsDbInitialized(true);
  }, [updateSigninStatus, isAuthenticated]);

  const handleLoginSuccess = (role: UserRole) => {
    sessionStorage.setItem('isAuthenticated', 'true');
    sessionStorage.setItem('userRole', role);
    setIsAuthenticated(true);
    setUserRole(role);
    if (role === 'balinese_editor') {
        setActiveView(View.Balinese);
    } else {
        setActiveView(View.News);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('isAuthenticated');
    sessionStorage.removeItem('userRole');
    setIsAuthenticated(false);
    setUserRole(null);
  };
  
  const handleLogoClick = () => {
    if (isLogoEnlarged) {
        setIsLogoEnlarged(false);
        return;
    }

    const animations = ['animate-grow-in-pulse', 'animate-grow-in-spin', 'animate-grow-in-float'];
    const chosenAnimation = animations[Math.floor(Math.random() * animations.length)];
    
    setAnimationClass(chosenAnimation);
    setIsLogoEnlarged(true);
  };
  
  const handleViewChange = (view: View) => {
    setActiveView(view);
  };

  const allNavItems = [
    { view: View.News, label: 'Novedades', icon: <NewsIcon /> },
    { view: View.Parking, label: 'Parking', icon: <ParkingIcon /> },
    { view: View.Bikes, label: 'Bicis', icon: <BikeIcon /> },
    { view: View.Balinese, label: 'Balinesas', icon: <BalineseIcon /> },
    { view: View.Sauna, label: 'Sauna', icon: <SaunaIcon /> },
    { view: View.Restaurant, label: 'Restaurante', icon: <ExtrasIcon /> },
    { view: View.DayPass, label: 'Day Pass', icon: <DayPassIcon /> },
    { view: View.SkyDinner, label: 'Cena Sky', icon: <SkyDinnerIcon /> },
    { view: View.Disability, label: 'Accesibilidad', icon: <DisabilityIcon /> },
  ];

  const visibleNavItems = allNavItems;


  const renderView = () => {
    if (!userRole) return null;
    const commonProps = {
        dbError,
        isDbInitialized,
        isAuthReady,
        userRole,
    };
    switch (activeView) {
      case View.News:
        return <NewsView 
                  isSignedIn={isSignedIn} 
                  gapiError={gapiError}
                  {...commonProps}
                />;
      case View.Parking:
        return <ParkingView {...commonProps} />;
      case View.Bikes:
        return <BikesView {...commonProps} />;
      case View.Balinese:
        return <BalineseView {...commonProps} />;
      case View.Sauna:
        return <SaunaView {...commonProps} />;
      case View.Restaurant:
        return <ServicesView {...commonProps} title="Restaurante" tableName="restaurant_bookings" />;
      case View.SkyDinner:
        return <ServicesView {...commonProps} title="Cena en el Sky" tableName="sky_dinner_bookings" />;
      case View.DayPass:
        return <DayPassView {...commonProps} />;
      case View.Disability:
        return <DisabilityView {...commonProps} />;
      default:
        return <NewsView 
                  isSignedIn={isSignedIn} 
                  gapiError={gapiError}
                  {...commonProps}
                />;
    }
  };

  return (
    <div className="min-h-screen text-gray-900 dark:text-gray-100 font-sans">
      {isAuthenticated && userRole ? (
        <>
          <main className="pb-24 max-w-2xl mx-auto">
            {renderView()}
          </main>
          <BottomNav 
              activeView={activeView} 
              setActiveView={handleViewChange}
              navItems={visibleNavItems} 
          />

          {isLogoEnlarged && (
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 animate-fade-in"
              onClick={handleLogoClick}
            />
          )}

          <img
            src="https://i.postimg.cc/3NtL1zS5/XISCO_LOGO.png"
            alt="Xisco Logo"
            onClick={handleLogoClick}
            onAnimationEnd={() => setAnimationClass('')}
            className={`fixed shadow-lg cursor-pointer
              ${isLogoEnlarged
                ? `w-3/4 max-w-[500px] h-auto z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${animationClass}`
                : 'bottom-0 left-4 w-16 h-16 opacity-90 z-20 hover:scale-110 hover:opacity-100 transition-transform'
              }`
            }
          />

          <div className="fixed bottom-4 right-4 z-20">
              <button 
                onClick={handleLogout} 
                className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md p-2 rounded-full shadow-lg text-gray-600 dark:text-gray-300 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                title="Cerrar Sesión"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
            <footer className="fixed bottom-2 left-20 text-left text-xs text-gray-400 dark:text-gray-500 pointer-events-none z-20">
              © {new Date().getFullYear()} Xisco G. H. Todos los derechos reservados.
            </footer>
        </>
        ) : (
          <LoginView onLoginSuccess={handleLoginSuccess} />
        )}
    </div>
  );
};

export default App;
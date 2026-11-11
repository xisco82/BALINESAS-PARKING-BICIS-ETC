import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View } from './types';
import BottomNav from './components/BottomNav';
import BalineseView from './views/BalineseView';
import ServicesView from './views/ServicesView';
import EventsView from './views/EventsView';
import NewsView from './views/NewsView';
import ParkingView from './views/ParkingView';
import DisabilityView from './views/DisabilityView';
import BikesView from './views/BikesView';
import SaunaView from './views/SaunaView';
import DayPassView from './views/DayPassView';
import IncidenciasClientesView from './views/IncidenciasClientesView';
import { initClient } from './services/googleSheetsService';
import { auth } from './services/firebase';
import firebaseConfig from './firebase-applet-config.json';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { ToastProvider } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import LoginView from './views/LoginView';
import { ConciergeBell, LogOut } from 'lucide-react';
import { 
    NewsIcon,
    EventsIcon,
    ParkingIcon,
    ExtrasIcon, 
    BalineseIcon, 
    DisabilityIcon,
    BikeIcon,
    SaunaIcon,
    DayPassIcon,
    SkyDinnerIcon,
    IncidentIcon,
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

  const handleRetryAuth = () => {
    setDbError(null);
    console.log("Attempting to re-authenticate...");
    signInAnonymously(auth)
      .then((userCredential) => {
        console.log("Auth success:", userCredential.user.uid);
        setIsAuthReady(true);
        setDbError(null);
      })
      .catch(err => {
        console.error("Firebase Auth Retry Error", err);
        const projectId = firebaseConfig.projectId;
        if (err.code === 'auth/admin-restricted-operation') {
          setDbError(`Error de Autenticación: La operación sigue restringida. 
            
            Pasos para solucionar:
            1. Abre la consola de Firebase: https://console.firebase.google.com/project/${projectId}/authentication/providers
            2. Asegúrate de que "Anónimo" (Anonymous) esté en estado "Habilitado".
            3. Ve a la pestaña "Ajustes" (Settings) > "Dominios autorizados" y verifica que aparezca:
               - localhost
               - ${window.location.hostname}
            4. Si usas AdBlockers o extensiones de privacidad, desactívalos temporalmente.
            5. Pulsa el botón de abajo para volver a intentar.`);
        } else {
          setDbError(`Error de Autenticación (${err.code}): ${err.message}`);
        }
      });
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsAuthReady(true);
        setDbError(null);
      } else {
        // Only attempt sign in if not already authenticated
        signInAnonymously(auth).catch(err => {
          console.error("Initial Firebase Auth Error", err);
          const projectId = firebaseConfig.projectId;
          if (err.code === 'auth/admin-restricted-operation') {
            setDbError(`Error de Autenticación: La operación está restringida. 
              1. Ve a la consola de Firebase del proyecto "${projectId}".
              2. Ve a Authentication > Sign-in method.
              3. Habilita "Anónimo" (Anonymous) y guarda los cambios.
              4. Verifica los "Dominios autorizados" en la pestaña Ajustes.`);
          } else {
            setDbError(`Error de Autenticación (${err.code}): ${err.message}`);
          }
        });
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
    { view: View.Events, label: 'Eventos', icon: <EventsIcon /> },
    { view: View.Parking, label: 'Parking', icon: <ParkingIcon /> },
    { view: View.Bikes, label: 'Bicis', icon: <BikeIcon /> },
    { view: View.Balinese, label: 'Balinesas', icon: <BalineseIcon /> },
    { view: View.Sauna, label: 'Sauna', icon: <SaunaIcon /> },
    { view: View.Restaurant, label: 'Restaurante', icon: <ExtrasIcon /> },
    { view: View.DayPass, label: 'Day Pass', icon: <DayPassIcon /> },
    { view: View.SkyDinner, label: 'Cena Sky', icon: <SkyDinnerIcon /> },
    { view: View.Disability, label: 'Minusvalías', icon: <DisabilityIcon /> },
    { view: View.ClientIncidents, label: 'Incidencias Clientes', icon: <IncidentIcon /> },
  ];

  const visibleNavItems = allNavItems;


  const renderView = () => {
    if (!userRole) return null;
    const commonProps = {
        dbError,
        isDbInitialized,
        isAuthReady,
        userRole,
        onRetryAuth: handleRetryAuth,
    };
    switch (activeView) {
      case View.News:
        return <NewsView 
                  isSignedIn={isSignedIn} 
                  gapiError={gapiError}
                  {...commonProps}
                />;
      case View.Events:
        return <EventsView {...commonProps} />;
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
      case View.ClientIncidents:
        return <IncidenciasClientesView {...commonProps} />;
      default:
        return <NewsView 
                  isSignedIn={isSignedIn} 
                  gapiError={gapiError}
                  {...commonProps}
                />;
    }
  };

  return (
    <ToastProvider>
      <ErrorBoundary>
        <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
          {isAuthenticated && userRole ? (
            <>
              <header className="no-print sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-white/10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 shrink-0 rounded-xl bg-[#0284c7] text-white flex items-center justify-center shadow-sm" aria-hidden="true">
                      <ConciergeBell className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-display text-base sm:text-lg font-bold leading-tight text-slate-900 dark:text-white truncate">Eventos, Parking, Bicis y Balinesas</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Recepción</p>
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="shrink-0 inline-flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold rounded-xl px-3 sm:px-4 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
                    title="Cerrar Sesión"
                    aria-label="Cerrar Sesión"
                  >
                    <LogOut className="h-4 w-4" />
                    <span className="hidden sm:inline">Cerrar Sesión</span>
                  </button>
                </div>
                <BottomNav
                    activeView={activeView}
                    setActiveView={handleViewChange}
                    navItems={visibleNavItems}
                />
              </header>

              <main className="flex-1 w-full pb-6 max-w-7xl mx-auto">
                {renderView()}
              </main>

              {isLogoEnlarged && (
                <div
                  className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40 animate-fade-in"
                  onClick={handleLogoClick}
                />
              )}

              <footer className="no-print text-xs text-slate-400 dark:text-slate-500 text-center py-6 flex items-center justify-center gap-2">
                <img
                  src="https://i.postimg.cc/fRsXZ0mn/Xiscologo.png"
                  alt="Xisco Logo"
                  onClick={handleLogoClick}
                  onAnimationEnd={() => setAnimationClass('')}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  className={`cursor-pointer rounded-md
                    ${isLogoEnlarged
                      ? `fixed shadow-2xl w-3/4 max-w-[500px] h-auto z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${animationClass}`
                      : 'w-6 h-6 opacity-70 hover:opacity-100 transition-opacity'
                    }`
                  }
                />
                <span>Eventos, Parking, Bicis y Balinesas · Xisco Solutions</span>
              </footer>
            </>
            ) : (
              <LoginView onLoginSuccess={handleLoginSuccess} />
            )}
        </div>
      </ErrorBoundary>
    </ToastProvider>
  );
};

export default App;
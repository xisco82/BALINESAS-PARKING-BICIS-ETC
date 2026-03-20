import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  deleteDoc, 
  doc, 
  onSnapshot,
  orderBy,
  Timestamp,
  setDoc,
  getDoc,
  updateDoc
} from 'firebase/firestore';
import { db } from './firebase';
import { auth } from './firebase';
import { 
  NewsEvent, 
  ParkingBooking, 
  BikeBooking, 
  BalineseBedBooking, 
  RestaurantBooking, 
  DayPassBooking, 
  AccessibilityBooking, 
  SaunaBooking 
} from '../types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

// Helper to handle Firestore errors
const handleFirestoreError = (error: any, operationType: OperationType, path: string | null) => {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
};

// --- News Events ---
const NOTIFICATION_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzen42pEYACVVlv2N266GS0-o-fhb6jns81lGSHsP43t1wzMwJaJifiTLyR5bJSxbfF7Q/exec';

export const sendManualNotification = async (events: NewsEvent[]) => {
  const payload = {
    asunto: events.length === 1 ? `📢 Novedad: ${events[0].title}` : `📢 Resumen de novedades (${events.length})`,
    mensaje: events.length === 1 
      ? events[0].description.replace(/<[^>]*>?/gm, '') 
      : `Se han enviado ${events.length} novedades.`,
    enlace: window.location.origin,
    autor: auth.currentUser?.displayName || "Recepción",
    timestamp: new Date().toISOString()
  };

  console.log(`[Notificación] Intentando envío a: ${NOTIFICATION_SCRIPT_URL}`);
  const jsonPayload = JSON.stringify(payload);

  try {
    // Intentamos usar navigator.sendBeacon si está disponible, ya que es más fiable
    // para peticiones que no necesitan esperar respuesta y evita problemas de descarga.
    if (navigator.sendBeacon) {
      const blob = new Blob([jsonPayload], { type: 'text/plain' });
      const success = navigator.sendBeacon(NOTIFICATION_SCRIPT_URL, blob);
      if (success) {
        console.log("[Notificación] Petición enviada vía Beacon.");
        return true;
      }
    }

    // Fallback a fetch si sendBeacon falla o no está disponible
    await fetch(NOTIFICATION_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      cache: 'no-cache',
      keepalive: true,
      headers: {
        'Content-Type': 'text/plain',
      },
      body: jsonPayload,
    });
    
    console.log("[Notificación] Petición enviada vía Fetch.");
    return true;
  } catch (error) {
    console.error("[Notificación] Error crítico:", error);
    return false;
  }
};

const sendEventNotification = async (eventData: any, action: 'create' | 'update' | 'delete') => {
  const payload = {
    asunto: `📢 ${action === 'create' ? 'NUEVO' : action === 'update' ? 'ACTUALIZADO' : 'ELIMINADO'}: ${eventData.title || eventData.guestName || 'Sin título'}`,
    mensaje: `${action === 'create' ? 'Se ha añadido' : action === 'update' ? 'Se ha actualizado' : 'Se ha eliminado'} un evento: ${eventData.title || eventData.guestName || 'Sin título'}.\n\n${(eventData.description || '').replace(/<[^>]*>?/gm, '')}`,
    enlace: "https://balinesas-parking-bicis-etc.vercel.app",
    autor: auth.currentUser?.displayName || "Recepción",
    action,
    timestamp: new Date().toISOString()
  };
  
  const jsonPayload = JSON.stringify(payload);
  
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([jsonPayload], { type: 'text/plain' });
      if (navigator.sendBeacon(NOTIFICATION_SCRIPT_URL, blob)) return;
    }

    await fetch(NOTIFICATION_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      keepalive: true,
      headers: {
        'Content-Type': 'text/plain',
      },
      body: jsonPayload,
    });
  } catch (error) {
    console.error('[Notificación] Error:', error);
  }
};

export const sendPdfNotification = async (pdfData: { fileName: string, url?: string }, action: 'create' | 'delete') => {
  const payload = {
    asunto: `📄 PDF ${action === 'create' ? 'AÑADIDO' : 'ELIMINADO'}: ${pdfData.fileName}`,
    mensaje: pdfData.url ? `Se ha subido un nuevo documento: ${pdfData.fileName}` : `Se ha eliminado el documento: ${pdfData.fileName}`,
    enlace: pdfData.url || "https://balinesas-parking-bicis-etc.vercel.app",
    autor: auth.currentUser?.displayName || "Recepción",
    action,
    timestamp: new Date().toISOString()
  };
  
  const jsonPayload = JSON.stringify(payload);

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([jsonPayload], { type: 'text/plain' });
      if (navigator.sendBeacon(NOTIFICATION_SCRIPT_URL, blob)) return;
    }

    await fetch(NOTIFICATION_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      keepalive: true,
      headers: {
        'Content-Type': 'text/plain',
      },
      body: jsonPayload,
    });
  } catch (error) {
    console.error('[Notificación PDF] Error:', error);
  }
};

export const getNewsEvents = (callback: (events: NewsEvent[]) => void) => {
  const path = 'news_events';
  const q = query(collection(db, path), orderBy('startDate', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const events = snapshot.docs.map(doc => ({
      id: doc.id as any,
      ...doc.data()
    })) as NewsEvent[];
    callback(events);
  }, (err) => handleFirestoreError(err, OperationType.GET, path));
};

export const addNewsEvent = async (event: Omit<NewsEvent, 'id'>) => {
  const path = 'news_events';
  try {
    const docRef = await addDoc(collection(db, path), event);
    sendEventNotification({ ...event, type: 'news' }, 'create');
    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
};

export const deleteNewsEvent = async (id: string) => {
  const path = `news_events/${id}`;
  try {
    const docRef = doc(db, 'news_events', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const eventData = docSnap.data();
      sendEventNotification({ ...eventData, id, type: 'news' }, 'delete');
    }
    await deleteDoc(docRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
};

export const updateNewsEvent = async (id: string, event: Partial<Omit<NewsEvent, 'id'>>) => {
  const path = `news_events/${id}`;
  try {
    await updateDoc(doc(db, 'news_events', id), event);
    
    // Obtener el documento completo para asegurar que la notificación tenga todos los campos
    const docSnap = await getDoc(doc(db, 'news_events', id));
    if (docSnap.exists()) {
      sendEventNotification({ ...docSnap.data(), id, type: 'news' }, 'update');
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
};

// --- Parking Bookings ---
export const getParkingBookings = (startDate: string, endDate: string, callback: (bookings: ParkingBooking[]) => void) => {
  const path = 'parking_bookings';
  const q = query(
    collection(db, path), 
    where('date', '>=', startDate),
    where('date', '<=', endDate)
  );
  return onSnapshot(q, (snapshot) => {
    const bookings = snapshot.docs.map(doc => doc.data() as ParkingBooking);
    callback(bookings);
  }, (err) => handleFirestoreError(err, OperationType.GET, path));
};

export const addParkingBooking = async (booking: ParkingBooking) => {
  const docId = `${booking.spotId}_${booking.date}`;
  const path = `parking_bookings/${docId}`;
  try {
    await setDoc(doc(db, 'parking_bookings', docId), booking);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
};

export const deleteParkingBooking = async (spotId: number, date: string) => {
  const docId = `${spotId}_${date}`;
  const path = `parking_bookings/${docId}`;
  try {
    await deleteDoc(doc(db, 'parking_bookings', docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
};

// --- Bike Bookings ---
export const getBikeBookings = (date: string, callback: (bookings: BikeBooking[]) => void) => {
  const path = 'bike_bookings';
  const q = query(collection(db, path), where('date', '==', date));
  return onSnapshot(q, (snapshot) => {
    const bookings = snapshot.docs.map(doc => doc.data() as BikeBooking);
    callback(bookings);
  }, (err) => handleFirestoreError(err, OperationType.GET, path));
};

export const addBikeBooking = async (booking: BikeBooking) => {
  const docId = `${booking.bikeId}_${booking.date}`;
  const path = `bike_bookings/${docId}`;
  try {
    await setDoc(doc(db, 'bike_bookings', docId), booking);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
};

export const deleteBikeBooking = async (bikeId: number, date: string) => {
  const docId = `${bikeId}_${date}`;
  const path = `bike_bookings/${docId}`;
  try {
    await deleteDoc(doc(db, 'bike_bookings', docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
};

export const getBikeAvailability = (date: string, callback: (availableBikeIds: number[]) => void) => {
  const path = 'bike_availability';
  const q = query(collection(db, path), where('date', '==', date));
  return onSnapshot(q, (snapshot) => {
    const ids = snapshot.docs.map(doc => (doc.data() as any).bikeId);
    callback(ids);
  }, (err) => handleFirestoreError(err, OperationType.GET, path));
};

export const updateBikeAvailability = async (bikeId: number, date: string, isAvailable: boolean) => {
  const docId = `${bikeId}_${date}`;
  const path = `bike_availability/${docId}`;
  try {
    if (isAvailable) {
      await setDoc(doc(db, 'bike_availability', docId), { bikeId, date });
    } else {
      await deleteDoc(doc(db, 'bike_availability', docId));
    }
  } catch (err) {
    handleFirestoreError(err, isAvailable ? OperationType.WRITE : OperationType.DELETE, path);
  }
};

// --- Balinese Bed Bookings ---
export const getBalineseBookings = (date: string, callback: (bookings: BalineseBedBooking[]) => void) => {
  const path = 'balinese_bookings';
  const q = query(collection(db, path), where('date', '==', date));
  return onSnapshot(q, (snapshot) => {
    const bookings = snapshot.docs.map(doc => doc.data() as BalineseBedBooking);
    callback(bookings);
  }, (err) => handleFirestoreError(err, OperationType.GET, path));
};

export const addBalineseBooking = async (booking: Omit<BalineseBedBooking, 'createdAt'>) => {
  const docId = `${booking.bedId}_${booking.date}`;
  const path = `balinese_bookings/${docId}`;
  try {
    await setDoc(doc(db, 'balinese_bookings', docId), {
      ...booking,
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
};

export const deleteBalineseBooking = async (bedId: number, date: string) => {
  const docId = `${bedId}_${date}`;
  const path = `balinese_bookings/${docId}`;
  try {
    await deleteDoc(doc(db, 'balinese_bookings', docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
};

// --- Service Bookings (Restaurant & Sky Dinner) ---
export const getAllServiceBookings = (tableName: string, callback: (bookings: RestaurantBooking[]) => void) => {
  const path = tableName;
  const q = query(collection(db, path), orderBy('startDate', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const bookings = snapshot.docs.map(doc => ({
      id: doc.id as any,
      ...doc.data()
    })) as RestaurantBooking[];
    callback(bookings);
  }, (err) => handleFirestoreError(err, OperationType.GET, path));
};

export const getServiceBookings = (tableName: string, date: string, callback: (bookings: RestaurantBooking[]) => void) => {
  const path = tableName;
  // Using only one where clause to avoid composite index requirement.
  // We filter the rest client-side for better performance and reliability in new projects.
  const q = query(
    collection(db, path),
    where('startDate', '<=', date)
  );
  return onSnapshot(q, (snapshot) => {
    const bookings = snapshot.docs
      .map(doc => ({
        id: doc.id as any,
        ...doc.data()
      })) as RestaurantBooking[];
    
    // Client-side filtering for endDate
    const filteredBookings = bookings.filter(b => b.endDate >= date);
    callback(filteredBookings);
  }, (err) => handleFirestoreError(err, OperationType.GET, path));
};

export const addServiceBooking = async (tableName: string, booking: Omit<RestaurantBooking, 'id'>) => {
  const path = tableName;
  try {
    const docRef = await addDoc(collection(db, path), booking);
    if (tableName === 'events_bookings') {
      sendEventNotification({
        title: booking.guestName,
        description: booking.description,
        startDate: booking.startDate,
        endDate: booking.endDate,
        type: 'event'
      }, 'create');
    }
    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
};

export const deleteServiceBooking = async (tableName: string, id: string) => {
  const path = `${tableName}/${id}`;
  try {
    const docRef = doc(db, tableName, id);
    if (tableName === 'events_bookings') {
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const booking = docSnap.data();
        sendEventNotification({
          id,
          title: booking.guestName,
          description: booking.description,
          startDate: booking.startDate,
          endDate: booking.endDate,
          type: 'event'
        }, 'delete');
      }
    }
    await deleteDoc(docRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
};

export const updateServiceBooking = async (tableName: string, id: string, booking: Partial<Omit<RestaurantBooking, 'id'>>) => {
  const path = `${tableName}/${id}`;
  try {
    await updateDoc(doc(db, tableName, id), booking);
    if (tableName === 'events_bookings') {
      // Aseguramos datos completos para la notificación
      const docSnap = await getDoc(doc(db, tableName, id));
      if (docSnap.exists()) {
        const fullBooking = docSnap.data();
        sendEventNotification({
          id,
          title: fullBooking.guestName,
          description: fullBooking.description,
          startDate: fullBooking.startDate,
          endDate: fullBooking.endDate,
          type: 'event'
        }, 'update');
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
};

// --- Day Pass Bookings ---
export const getDayPassBookings = (date: string, callback: (bookings: DayPassBooking[]) => void) => {
  const path = 'day_pass_bookings';
  const q = query(collection(db, path), where('date', '==', date));
  return onSnapshot(q, (snapshot) => {
    const bookings = snapshot.docs.map(doc => ({
      id: doc.id as any,
      ...doc.data()
    })) as DayPassBooking[];
    callback(bookings);
  }, (err) => handleFirestoreError(err, OperationType.GET, path));
};

export const addDayPassBooking = async (booking: Omit<DayPassBooking, 'id' | 'createdAt'>) => {
  const path = 'day_pass_bookings';
  try {
    const docRef = await addDoc(collection(db, path), {
      ...booking,
      createdAt: new Date().toISOString()
    });
    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
};

export const deleteDayPassBooking = async (id: string) => {
  const path = `day_pass_bookings/${id}`;
  try {
    await deleteDoc(doc(db, 'day_pass_bookings', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
};

export const updateDayPassBooking = async (id: string, booking: Partial<Omit<DayPassBooking, 'id' | 'createdAt'>>) => {
  const path = `day_pass_bookings/${id}`;
  try {
    await updateDoc(doc(db, 'day_pass_bookings', id), booking);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
};

// --- Accessibility Bookings ---
export const getAccessibilityBookings = (callback: (bookings: AccessibilityBooking[]) => void) => {
  const path = 'accessibility_bookings';
  const q = query(collection(db, path), orderBy('arrivalDate', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const bookings = snapshot.docs.map(doc => ({
      id: doc.id as any,
      ...doc.data()
    })) as AccessibilityBooking[];
    callback(bookings);
  }, (err) => handleFirestoreError(err, OperationType.GET, path));
};

export const addAccessibilityBooking = async (booking: Omit<AccessibilityBooking, 'id'>) => {
  const path = 'accessibility_bookings';
  try {
    const docRef = await addDoc(collection(db, path), booking);
    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
};

export const deleteAccessibilityBooking = async (id: string) => {
  const path = `accessibility_bookings/${id}`;
  try {
    await deleteDoc(doc(db, 'accessibility_bookings', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
};

// --- Sauna Bookings ---
export const getSaunaBookings = (date: string, callback: (bookings: SaunaBooking[]) => void) => {
  const path = 'sauna_bookings';
  const q = query(collection(db, path), where('date', '==', date));
  return onSnapshot(q, (snapshot) => {
    const bookings = snapshot.docs.map(doc => doc.data() as SaunaBooking);
    callback(bookings);
  }, (err) => handleFirestoreError(err, OperationType.GET, path));
};

export const addSaunaBooking = async (booking: SaunaBooking) => {
  const docId = `${booking.date}_${booking.timeSlot}`;
  const path = `sauna_bookings/${docId}`;
  try {
    await setDoc(doc(db, 'sauna_bookings', docId), booking);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
};

export const deleteSaunaBooking = async (date: string, timeSlot: string) => {
  const docId = `${date}_${timeSlot}`;
  const path = `sauna_bookings/${docId}`;
  try {
    await deleteDoc(doc(db, 'sauna_bookings', docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
};

// --- Email Recipients ---
export const getEmailRecipients = async () => {
  const path = 'email_recipients';
  try {
    const q = query(collection(db, path), orderBy('order', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
    return [];
  }
};

let isSeeding = false;
export const seedEmailRecipients = async () => {
  if (isSeeding) return;
  isSeeding = true;
  
  const path = 'email_recipients';
  const recipients = [
    { department: 'Administrador', email: 'xiscoquin@gmail.com', order: 1 },
    { department: 'Dirección', email: 'dirgranfiesta@hmhotels.com', order: 2 },
    { department: 'Subdirección', email: 'subdirgranfiesta@hmhotels.com', order: 3 },
    { department: 'Recepción / Back office', email: 'rec1granfiesta@hmhotels.com', order: 4 },
    { department: 'Recepción', email: 'recgranfiesta@hmhotels.com', order: 5 },
    { department: 'Servicios Técnicos', email: 'ssttgranfiesta@hmhotels.com', order: 6 },
    { department: 'Pisos', email: 'pisosgranfiesta@hmhotels.com', order: 7 },
    { department: 'Cocina', email: 'cocinagranfiesta@hmhotels.com', order: 8 }
  ];

  try {
    const existingSnapshot = await getDocs(collection(db, path));
    const existingDocs = existingSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

    // Delete obsolete departments (like Comercial and Spa)
    const validDepartments = recipients.map(r => r.department);
    for (const docData of existingDocs) {
      if (!validDepartments.includes(docData.department)) {
        await deleteDoc(doc(db, path, docData.id));
      }
    }

    // Add or update valid departments
    for (const recipient of recipients) {
      const existing = existingDocs.find(d => d.department === recipient.department);
      if (!existing) {
        await addDoc(collection(db, path), recipient);
      } else if (existing.email !== recipient.email || existing.order !== recipient.order) {
        await updateDoc(doc(db, path, existing.id), { email: recipient.email, order: recipient.order });
      }
    }
    
    console.log("Email recipients synced successfully.");
  } catch (err) {
    console.error("Error seeding email recipients:", err);
  } finally {
    isSeeding = false;
  }
};

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
  SaunaBooking,
  ExtraFBEntry
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
    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
};

export const deleteNewsEvent = async (id: string) => {
  const path = `news_events/${id}`;
  try {
    const docRef = doc(db, 'news_events', id);
    await deleteDoc(docRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
};

export const updateNewsEvent = async (id: string, event: Partial<Omit<NewsEvent, 'id'>>) => {
  const path = `news_events/${id}`;
  try {
    await updateDoc(doc(db, 'news_events', id), event);
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
    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
};

export const deleteServiceBooking = async (tableName: string, id: string) => {
  const path = `${tableName}/${id}`;
  try {
    const docRef = doc(db, tableName, id);
    await deleteDoc(docRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
};

export const updateServiceBooking = async (tableName: string, id: string, booking: Partial<Omit<RestaurantBooking, 'id'>>) => {
  const path = `${tableName}/${id}`;
  try {
    await updateDoc(doc(db, tableName, id), booking);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
};

export const toggleServiceBookingCheckIn = async (tableName: string, id: string, currentStatus: boolean, checkInDate: string) => {
  const path = `${tableName}/${id}`;
  try {
    const isCheckingIn = !currentStatus;
    await updateDoc(doc(db, tableName, id), { 
      checkedIn: isCheckingIn,
      checkedInDate: isCheckingIn ? checkInDate : null
    });
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

export const getEventPdfs = (callback: (pdfs: any[]) => void) => {
  const path = 'event_pdfs';
  return onSnapshot(collection(db, path), (snapshot) => {
    const pdfs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(pdfs);
  }, (err) => handleFirestoreError(err, OperationType.GET, path));
};

// --- Extra F&B Entries ---
export const getExtraFBEntries = (month: string, callback: (entries: ExtraFBEntry[]) => void) => {
  const path = 'extra_fb_entries';
  const [year, monthNum] = month.split('-');
  const startDate = `${year}-${monthNum}-01`;
  const lastDay = new Date(parseInt(year), parseInt(monthNum), 0).getDate();
  const endDate = `${year}-${monthNum}-${lastDay.toString().padStart(2, '0')}`;

  const q = query(
    collection(db, path),
    where('date', '>=', startDate),
    where('date', '<=', endDate),
    orderBy('date', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const entries = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as ExtraFBEntry[];
    callback(entries);
  }, (err) => handleFirestoreError(err, OperationType.GET, path));
};

export const addExtraFBEntry = async (entry: Omit<ExtraFBEntry, 'id' | 'createdAt' | 'createdBy'>) => {
  const path = 'extra_fb_entries';
  try {
    await addDoc(collection(db, path), {
      ...entry,
      createdAt: new Date().toISOString(),
      createdBy: auth.currentUser?.email || 'unknown'
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
};

export const deleteExtraFBEntry = async (id: string) => {
  const path = `extra_fb_entries/${id}`;
  try {
    const docRef = doc(db, 'extra_fb_entries', id);
    await deleteDoc(docRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
};

// --- End of Service Functions ---

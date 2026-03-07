// FIX: Removed self-import of 'View' which was causing a declaration conflict.
export enum View {
  News,
  Parking,
  Bikes,
  Balinese,
  Restaurant,
  DayPass,
  Disability,
  Sauna,
  SkyDinner,
}

export interface NewsEvent {
  id: number; // Changed from string for PostgreSQL compatibility
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  time?: string;
  title: string;
  description: string;
  guestName?: string;
  roomNumber?: string;
  email?: string;
  phone?: string;
}

export interface ParkingBooking {
  spotId: number;
  guestName: string;
  roomNumber: string;
  date: string; // YYYY-MM-DD
}

export interface BikeBooking {
  bikeId: number;
  guestName: string;
  roomNumber: string;
  date: string; // YYYY-MM-DD
}

export interface BalineseBedBooking {
  bedId: number;
  guestName: string;
  roomNumber: string;
  createdAt: string; // ISO string from database
  createdBy: string;
}

export interface ExtraOrder {
  id: string;
  guestName: string;
  roomNumber: string;
  regime: string;
  compensationReason: string;
  startDate: string;
  endDate: string;
}

export interface RestaurantBooking {
  id: number;
  guestName: string;
  roomNumber: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  description: string;
}

export interface DayPassBooking {
  id: number;
  date: string; // YYYY-MM-DD
  clientName: string;
  serviceType: string;
  numberOfPeople: number;
  notes?: string;
  createdBy: string;
  createdFrom?: string; // e.g., 'direct', 'hoteltreats'
}

export interface AccessibilityBooking {
  id: number;
  guestName: string;
  roomNumber: string;
  arrivalDate: string; // YYYY-MM-DD
  departureDate: string; // YYYY-MM-DD
  disabilityInfo: string;
}

export interface SaunaBooking {
  date: string; // YYYY-MM-DD
  timeSlot: string; // HH:MM
  guestName: string;
  roomNumber: string;
}
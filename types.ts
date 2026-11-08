// FIX: Removed self-import of 'View' which was causing a declaration conflict.
export enum View {
  News,
  Events,
  Parking,
  Bikes,
  Balinese,
  Restaurant,
  DayPass,
  Disability,
  Sauna,
  SkyDinner,
  ClientIncidents,
}

export type UserRole = 'editor' | 'balinese_editor';

export interface NewsEvent {
  id: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  time?: string;
  title: string;
  description: string;
  url?: string;
  guestName?: string;
  roomNumber?: string;
  email?: string;
  phone?: string;
  type?: 'news' | 'event' | 'document';
  pdfId?: string;   // Linked monthly summary document
  pdfName?: string;
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
  createdAt?: string;
}

export interface BlockedBike {
  bikeId: number;
  reason: string;
  createdAt?: string;
}

export interface BalineseBedBooking {
  bedId: number;
  date: string; // YYYY-MM-DD
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

export interface ExtraFBEntry {
  id: string;
  date: string;
  department: string;
  numberOfPeople: number;
  mealType: 'desayuno' | 'almuerzo' | 'cena' | 'solo_bebidas';
  createdAt: string;
  createdBy: string;
  notes?: string;
}

export interface RestaurantBooking {
  id: string;
  guestName: string;
  roomNumber: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  description: string;
  origin?: 'news' | 'service' | 'pdf';
  guestsCount?: number;
  mealType?: 'desayuno' | 'almuerzo' | 'cena' | 'MP' | 'desayuno_cena' | 'desayuno_cena_compensacion' | 'solo_bebidas' | 'desayuno_compensacion' | 'cena_compensacion';
  checkedIn?: boolean;
  checkedInDate?: string;
  pdfId?: string;   // Linked monthly summary document (events only)
  pdfName?: string;
}

export interface DayPassBooking {
  id: string;
  date: string; // YYYY-MM-DD
  clientName: string;
  serviceType: string;
  numberOfPeople: number;
  notes?: string;
  createdBy: string;
  createdFrom?: string; // e.g., 'direct', 'hoteltreats'
}

export interface AccessibilityBooking {
  id: string;
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

export interface ClientIncident {
  id: string;
  clientName: string;
  roomNumber: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  notes: string;
  resolved: boolean;
  status?: 'pendiente' | 'proceso' | 'resuelta';
  createdAt: string; // ISO String
  createdBy: string;
}
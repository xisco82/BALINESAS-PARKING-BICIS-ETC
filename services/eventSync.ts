// Unifies the three sources that describe the hotel's events so that
// "Eventos Anuales", "Resumen de eventos mensuales" and "Novedades" show the
// same data without duplicated dates:
//   - service: annual events (collection `events_bookings`)
//   - news:    novedades (collection `news_events`)
//   - pdf:     monthly summary documents (collection `event_pdfs`, by `eventDate`)
//
// Matching rules:
//   - A summary document belongs to the annual event whose date range contains
//     its `eventDate`. If several events share that date, the one with the most
//     similar title wins.
//   - A novedad is merged into an event/document on the same start date only when
//     the titles match (so unrelated novedades on the same day are kept).

export type EventSource = 'service' | 'news' | 'pdf';

export interface SyncServiceEvent {
  id: string;
  guestName: string;
  description?: string;
  startDate: string;
  endDate: string;
}

export interface SyncNewsEvent {
  id: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  url?: string;
}

export interface SyncPdfEvent {
  id: string;
  fileName: string;
  eventDate?: string | null;
  month?: string;
}

export interface SyncedEvent {
  id: string;
  source: EventSource;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  url?: string;
  /** Summary document linked to this entry (if any). */
  pdfId?: string;
  pdfName?: string;
  /** Ids of the novedades that were merged into this entry. */
  mergedNewsIds: string[];
}

const toDay = (value: string | undefined | null) => (value || '').split('T')[0];

export const normalizeTitle = (value: string | undefined | null): string =>
  (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\.(pdf|docx?|html?)$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const titlesMatch = (a: string | undefined | null, b: string | undefined | null): boolean => {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // One title contains the other ("Boda" vs "Boda Garcia - 12 junio")
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  return short.length >= 4 && long.includes(short);
};

const containsDate = (e: SyncedEvent, date: string) => e.startDate <= date && e.endDate >= date;

export const mergeEventSources = (
  services: SyncServiceEvent[],
  news: SyncNewsEvent[],
  pdfs: SyncPdfEvent[]
): SyncedEvent[] => {
  const entries: SyncedEvent[] = services.map(s => {
    const startDate = toDay(s.startDate);
    return {
      id: s.id,
      source: 'service' as const,
      title: s.guestName,
      description: s.description || '',
      startDate,
      endDate: toDay(s.endDate) || startDate,
      mergedNewsIds: [],
    };
  });

  // 1) Attach summary documents to their annual event, or add them on their own.
  pdfs.forEach(p => {
    const date = toDay(p.eventDate);
    if (!date) return;

    const candidates = entries.filter(e => e.source === 'service' && !e.pdfId && containsDate(e, date));
    const target =
      candidates.find(e => titlesMatch(e.title, p.fileName)) ||
      candidates.find(e => e.startDate === date) ||
      candidates[0];

    if (target) {
      target.pdfId = p.id;
      target.pdfName = p.fileName;
      return;
    }

    // Same document title already listed for that date → don't repeat it.
    const sameDoc = entries.find(e => e.startDate === date && titlesMatch(e.title, p.fileName));
    if (sameDoc) {
      if (!sameDoc.pdfId) {
        sameDoc.pdfId = p.id;
        sameDoc.pdfName = p.fileName;
      }
      return;
    }

    entries.push({
      id: p.id,
      source: 'pdf',
      title: p.fileName,
      description: `Documento del resumen mensual${p.month ? ` (${p.month})` : ''}: ${p.fileName}`,
      startDate: date,
      endDate: date,
      pdfId: p.id,
      pdfName: p.fileName,
      mergedNewsIds: [],
    });
  });

  // 2) Merge novedades that describe an event/document already listed.
  news.forEach(n => {
    const startDate = toDay(n.startDate);
    const endDate = toDay(n.endDate) || startDate;
    const match = entries.find(e => e.startDate === startDate && titlesMatch(e.title, n.title));

    if (match) {
      match.mergedNewsIds.push(n.id);
      if (!match.description && n.description) match.description = n.description;
      if (!match.url && n.url) match.url = n.url;
      return;
    }

    entries.push({
      id: n.id,
      source: 'news',
      title: n.title,
      description: n.description || '',
      startDate,
      endDate,
      url: n.url,
      mergedNewsIds: [],
    });
  });

  return entries.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));
};

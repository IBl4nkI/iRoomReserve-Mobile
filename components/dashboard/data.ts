export type ReservationStatus = 'Active' | 'Pending' | 'Approved' | 'Rejected' | 'Completed';

export interface ReservationItem {
  id: string;
  room: string;
  building: string;
  campus: string;
  date: string;
  time: string;
  purpose: string;
  status: ReservationStatus;
}

export interface InboxItem {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  status: 'Approved' | 'Rejected' | 'Pending';
  unread: boolean;
}

export const ongoingReservation: ReservationItem = {
  id: 'res-ongoing',
  room: 'Room 402',
  building: 'Main Building',
  campus: 'Main Campus',
  date: 'April 26, 2026',
  time: '2:00 PM - 4:00 PM',
  purpose: 'Capstone group meeting',
  status: 'Active',
};

export const pendingRequests: ReservationItem[] = [
  {
    id: 'res-pending-1',
    room: 'Innovation Lab 2',
    building: 'Digital Hub',
    campus: 'Digital Campus',
    date: 'April 28, 2026',
    time: '9:00 AM - 11:00 AM',
    purpose: 'Prototype review',
    status: 'Pending',
  },
  {
    id: 'res-pending-2',
    room: 'Conference Room B',
    building: 'Main Building',
    campus: 'Main Campus',
    date: 'April 29, 2026',
    time: '1:00 PM - 2:30 PM',
    purpose: 'Faculty consultation',
    status: 'Pending',
  },
];

export const upcomingReservations: ReservationItem[] = [
  {
    id: 'res-upcoming-1',
    room: 'Room 315',
    building: 'Engineering Wing',
    campus: 'Main Campus',
    date: 'May 1, 2026',
    time: '10:00 AM - 12:00 PM',
    purpose: 'Board review prep',
    status: 'Approved',
  },
  {
    id: 'res-upcoming-2',
    room: 'Media Studio',
    building: 'Digital Hub',
    campus: 'Digital Campus',
    date: 'May 3, 2026',
    time: '3:00 PM - 5:00 PM',
    purpose: 'Presentation rehearsal',
    status: 'Approved',
  },
];

export const reservationHistory: ReservationItem[] = [
];

export const inboxItems: InboxItem[] = [
];

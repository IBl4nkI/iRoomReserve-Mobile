import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';

export interface AppMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  receiverId: string;
  receiverName: string;
  receiverRole: string;
  senderCampus?: string;
  receiverCampus?: string;
  subject: string;
  body: string;
  isRead: boolean;
  closedBySender?: boolean;
  createdAt?: Timestamp;
}

export interface MessageRecipient {
  uid: string;
  name: string;
  role: string;
  campus?: string;
}

const staffRoles = new Set(['building admin', 'admin', 'administrator', 'faculty', 'faculty professor', 'utility', 'utility staff']);
const normalizeRole = (role: string) => role.trim().toLowerCase().replaceAll('_', ' ');
function resolveRecipientCampus(data: Record<string, unknown>) {
  const explicitValues = [data.campus, data.campusName, data.assignedCampus]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().toLowerCase());
  if (explicitValues.some((value) => value === 'digi' || value.includes('digital'))) return 'digi';
  if (explicitValues.some((value) => value === 'main' || value.includes('main'))) return 'main';

  const assignedBuildings: unknown[] = [data.assignedBuilding, data.assignedBuildingId];
  if (Array.isArray(data.assignedBuildingIds)) assignedBuildings.push(...data.assignedBuildingIds);
  if (Array.isArray(data.assignedBuildings)) assignedBuildings.push(...data.assignedBuildings);
  const buildingValues = assignedBuildings.flatMap((entry) => {
    if (typeof entry === 'string') return [entry.toLowerCase()];
    if (entry && typeof entry === 'object') {
      const building = entry as Record<string, unknown>;
      return [building.id, building.name].filter((value): value is string => typeof value === 'string').map((value) => value.toLowerCase());
    }
    return [];
  });
  if (buildingValues.some((value) => value.includes('digital') || value.includes('sdca-digi'))) return 'digi';
  if (buildingValues.some((value) => /\bgd[\s-]?[123]\b/.test(value) || value.includes('main campus'))) return 'main';
  return undefined;
}
const mapMessages = (snapshot: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) =>
  snapshot.docs.map((document) => ({ id: document.id, ...document.data() }) as AppMessage);

export function onInboxMessages(uid: string, callback: (messages: AppMessage[]) => void): Unsubscribe {
  return onSnapshot(query(collection(db, 'messages'), where('receiverId', '==', uid), orderBy('createdAt', 'desc')), (snapshot) => callback(mapMessages(snapshot)));
}

export function onSentMessages(uid: string, callback: (messages: AppMessage[]) => void): Unsubscribe {
  return onSnapshot(query(collection(db, 'messages'), where('senderId', '==', uid), orderBy('createdAt', 'desc')), (snapshot) => callback(mapMessages(snapshot)));
}

export async function getMessageRecipients(excludeUid: string): Promise<MessageRecipient[]> {
  const snapshot = await getDocs(query(collection(db, 'users'), where('status', '==', 'approved')));
  return snapshot.docs.flatMap((user) => {
    if (user.id === excludeUid) return [];
    const data = user.data();
    const role = String(data.role ?? '');
    if (!staffRoles.has(normalizeRole(role))) return [];
    const name = [data.firstName, data.lastName].map((part) => String(part ?? '').trim()).filter(Boolean).join(' ') || String(data.email ?? 'Unknown user');
    return [{ uid: user.id, name, role, campus: resolveRecipientCampus(data) }];
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export async function sendAppMessage(input: Omit<AppMessage, 'id' | 'isRead' | 'createdAt'>) {
  if (input.body.trim().length > 500) {
    throw new Error('Messages cannot exceed 500 characters.');
  }
  const { senderCampus, receiverCampus, ...message } = input;
  await addDoc(collection(db, 'messages'), {
    ...message,
    ...(senderCampus !== undefined ? { senderCampus } : {}),
    ...(receiverCampus !== undefined ? { receiverCampus } : {}),
    subject: input.subject.trim(),
    body: input.body.trim(),
    isRead: false,
    createdAt: serverTimestamp(),
  });
}

export async function markAppMessageRead(id: string) {
  await updateDoc(doc(db, 'messages', id), { isRead: true });
}

export async function closeAppMessage(id: string) {
  await updateDoc(doc(db, 'messages', id), { closedBySender: true });
}

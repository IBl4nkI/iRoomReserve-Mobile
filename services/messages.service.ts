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
const mapMessages = (snapshot: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) =>
  snapshot.docs.map(({ id, data }) => ({ id, ...data() }) as AppMessage);

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
    return [{ uid: user.id, name, role, campus: typeof data.campus === 'string' ? data.campus : undefined }];
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export async function sendAppMessage(input: Omit<AppMessage, 'id' | 'isRead' | 'createdAt'>) {
  await addDoc(collection(db, 'messages'), { ...input, subject: input.subject.trim(), body: input.body.trim(), isRead: false, createdAt: serverTimestamp() });
}

export async function markAppMessageRead(id: string) {
  await updateDoc(doc(db, 'messages', id), { isRead: true });
}

export async function closeAppMessage(id: string) {
  await updateDoc(doc(db, 'messages', id), { closedBySender: true });
}

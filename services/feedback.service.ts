import { apiRequest } from '@/services/api';
import type { FeedbackCreateInput, FeedbackRecord } from '@/types/feedback';

interface FeedbackApiShape extends FeedbackRecord {
  id: string;
}

export async function createFeedback(input: FeedbackCreateInput): Promise<string> {
  const payload = await apiRequest<{ id: string }>('/api/feedback', {
    body: input,
    method: 'POST',
  });

  return payload.id;
}

export async function getFeedbackByUser(userId: string): Promise<FeedbackRecord[]> {
  const payload = await apiRequest<{ feedback: FeedbackApiShape[] }>('/api/feedback', {
    method: 'GET',
    params: { userId },
  });

  return payload.feedback;
}

export type FeedbackSentimentLabel = 'positive' | 'neutral' | 'negative';

export type FeedbackCategoryRatingKey =
  | 'cleanliness'
  | 'comfort'
  | 'air_conditioning'
  | 'equipment_projector'
  | 'internet_connectivity';

export type FeedbackCategoryRatings = Record<FeedbackCategoryRatingKey, number>;

export interface FeedbackRecord {
  id: string;
  roomId: string;
  roomName: string;
  buildingId: string;
  buildingName: string;
  reservationId: string;
  userId: string;
  userName: string;
  text: string;
  message: string;
  rating: number;
  categoryRatings?: Partial<FeedbackCategoryRatings>;
  category_ratings?: Partial<FeedbackCategoryRatings>;
  showSubmitterName?: boolean;
  compoundScore?: number;
  positiveScore?: number;
  neutralScore?: number;
  negativeScore?: number;
  sentimentLabel?: FeedbackSentimentLabel;
  adminResponse: string | null;
  respondedAt?:
    | {
        _nanoseconds?: number;
        _seconds?: number;
        nanoseconds?: number;
        seconds?: number;
      }
    | null;
  createdAt?:
    | {
        _nanoseconds?: number;
        _seconds?: number;
        nanoseconds?: number;
        seconds?: number;
      }
    | null;
}

export interface FeedbackCreateInput {
  roomId: string;
  roomName: string;
  buildingId: string;
  buildingName: string;
  reservationId: string;
  userId: string;
  userName: string;
  message: string;
  rating: number;
  categoryRatings: FeedbackCategoryRatings;
  showSubmitterName: boolean;
}

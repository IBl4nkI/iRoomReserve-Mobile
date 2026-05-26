import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import DashboardTopNav from '@/components/dashboard/DashboardTopNav';
import { dashboardStyles as styles } from '@/components/dashboard/styles';
import { colors, fonts } from '@/constants/theme';
import { auth } from '@/lib/firebase';
import { createFeedback, getFeedbackByUser } from '@/services/feedback.service';
import { getReservationsByUser } from '@/services/reservations.service';
import { formatTime12h } from '@/services/schedules.service';
import type { FeedbackRecord } from '@/types/feedback';
import type { ReservationRecord } from '@/types/reservation';

type FirestoreTimestampLike = {
  _nanoseconds?: number;
  _seconds?: number;
  seconds?: number;
  nanoseconds?: number;
} | null | undefined;

function getTimestampDate(timestamp: FirestoreTimestampLike) {
  const seconds =
    typeof timestamp?.seconds === 'number'
      ? timestamp.seconds
      : typeof timestamp?._seconds === 'number'
        ? timestamp._seconds
        : null;

  if (seconds === null) {
    return null;
  }

  return new Date(seconds * 1000);
}

function formatTimestamp(timestamp: FirestoreTimestampLike) {
  const date = getTimestampDate(timestamp);

  if (!date) {
    return 'Not available';
  }

  return date.toLocaleString('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function formatTimestampTimeOnly(timestamp: FirestoreTimestampLike) {
  const date = getTimestampDate(timestamp);

  if (!date) {
    return 'Not available';
  }

  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatReservationDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatReservationDates(
  dates?: string[],
  fallbackDate?: string,
  isRecurringRequest?: boolean
) {
  const dateList = dates?.length ? dates : fallbackDate ? [fallbackDate] : [];

  if (dateList.length === 0) {
    return 'Not available';
  }

  if (isRecurringRequest && dateList.length > 1) {
    return `${formatReservationDate(dateList[0])} - ${formatReservationDate(
      dateList[dateList.length - 1]
    )}`;
  }

  return dateList.map((date) => formatReservationDate(date)).join(' / ');
}

function sortReservations(left: ReservationRecord, right: ReservationRecord) {
  return (
    right.date.localeCompare(left.date) ||
    right.startTime.localeCompare(left.startTime) ||
    right.id.localeCompare(left.id)
  );
}

function getStarLabel(rating: number) {
  if (rating <= 1) return 'Poor';
  if (rating === 2) return 'Fair';
  if (rating === 3) return 'Good';
  if (rating === 4) return 'Very Good';
  return 'Excellent';
}

function renderStaticStars(rating: number) {
  return Array.from({ length: 5 }, (_, index) => (
    <Text
      key={`${rating}-${index}`}
      style={[
        localStyles.starDisplay,
        index < rating ? localStyles.starFilled : localStyles.starEmpty,
      ]}
    >
      ★
    </Text>
  ));
}

export default function FeedbackScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ reservationId?: string }>();
  const [reservations, setReservations] = React.useState<ReservationRecord[]>([]);
  const [feedbackList, setFeedbackList] = React.useState<FeedbackRecord[]>([]);
  const [showForm, setShowForm] = React.useState(false);
  const [selectedReservationId, setSelectedReservationId] = React.useState<string | null>(null);
  const [expandedSubmittedRoomId, setExpandedSubmittedRoomId] = React.useState<string | null>(
    null
  );
  const [rating, setRating] = React.useState(0);
  const [comment, setComment] = React.useState('');
  const feedbackDraftsRef = React.useRef<
    Record<string, { rating: number; comment: string }>
  >({});
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadFeedbackData = React.useCallback(async (showSpinner = true) => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setReservations([]);
      setFeedbackList([]);
      setLoading(false);
      setError(null);
      return;
    }

    if (showSpinner) {
      setLoading(true);
    }

    try {
      const [nextReservations, nextFeedback] = await Promise.all([
        getReservationsByUser(currentUser.uid),
        getFeedbackByUser(currentUser.uid),
      ]);

      setReservations(nextReservations.sort(sortReservations));
      setFeedbackList(nextFeedback);
      setError(null);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to load feedback data.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadFeedbackData();
  }, [loadFeedbackData]);

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await loadFeedbackData(false);
    } finally {
      setRefreshing(false);
    }
  }, [loadFeedbackData]);

  const completedReservations = React.useMemo(
    () => reservations.filter((reservation) => reservation.status === 'completed'),
    [reservations]
  );

  const feedbackByReservationId = React.useMemo(() => {
    const next = new Map<string, FeedbackRecord>();
    feedbackList.forEach((feedback) => {
      next.set(feedback.reservationId, feedback);
    });
    return next;
  }, [feedbackList]);

  const pendingFeedbackReservations = React.useMemo(
    () =>
      completedReservations.filter(
        (reservation) => !feedbackByReservationId.has(reservation.id)
      ),
    [completedReservations, feedbackByReservationId]
  );

  React.useEffect(() => {
    const preferredReservationId =
      typeof params.reservationId === 'string' ? params.reservationId : null;

    if (preferredReservationId) {
      const preferredPendingReservation = pendingFeedbackReservations.find(
        (reservation) => reservation.id === preferredReservationId
      );

      if (preferredPendingReservation) {
        setShowForm(true);
        setSelectedReservationId((current) =>
          current === preferredPendingReservation.id ? current : preferredPendingReservation.id
        );
        return;
      }
    }

    setSelectedReservationId((current) => {
      if (current && pendingFeedbackReservations.some((reservation) => reservation.id === current)) {
        return current;
      }

      return null;
    });
  }, [params.reservationId, pendingFeedbackReservations]);

  const saveDraftForReservation = React.useCallback(
    (reservationId: string | null, nextRating: number, nextComment: string) => {
      if (!reservationId) {
        return;
      }

      if (nextRating === 0 && nextComment.length === 0) {
        delete feedbackDraftsRef.current[reservationId];
        return;
      }

      feedbackDraftsRef.current[reservationId] = {
        rating: nextRating,
        comment: nextComment,
      };
    },
    []
  );

  React.useEffect(() => {
    if (!selectedReservationId) {
      setRating(0);
      setComment('');
      return;
    }

    const draft = feedbackDraftsRef.current[selectedReservationId];
    setRating(draft?.rating ?? 0);
    setComment(draft?.comment ?? '');
  }, [selectedReservationId]);

  const selectedReservation =
    pendingFeedbackReservations.find((reservation) => reservation.id === selectedReservationId) ??
    null;

  const otherPendingReservations = React.useMemo(
    () =>
      pendingFeedbackReservations.filter(
        (reservation) => !showForm || reservation.id !== selectedReservation?.id
      ),
    [pendingFeedbackReservations, selectedReservation, showForm]
  );

  const submittedFeedbackItems = React.useMemo(
    () =>
      feedbackList
        .map((feedback) => ({
          feedback,
          reservation:
            completedReservations.find(
              (reservation) => reservation.id === feedback.reservationId
            ) ?? null,
        }))
        .sort((left, right) => {
          const leftDate = left.reservation?.date ?? '';
          const rightDate = right.reservation?.date ?? '';
          return rightDate.localeCompare(leftDate);
        }),
    [completedReservations, feedbackList]
  );

  const submittedFeedbackGroups = React.useMemo(() => {
    const groups = new Map<
      string,
      {
        roomId: string;
        roomName: string;
        buildingName: string;
        items: typeof submittedFeedbackItems;
        latestDate: string;
      }
    >();

    submittedFeedbackItems.forEach((item) => {
      const roomId = item.feedback.roomId || item.reservation?.roomId || item.feedback.id;
      const existing = groups.get(roomId);
      const latestDate = item.reservation?.date ?? '';

      if (existing) {
        existing.items.push(item);
        if (latestDate > existing.latestDate) {
          existing.latestDate = latestDate;
        }
        return;
      }

      groups.set(roomId, {
        roomId,
        roomName: item.feedback.roomName,
        buildingName: item.feedback.buildingName,
        items: [item],
        latestDate,
      });
    });

    return Array.from(groups.values()).sort((left, right) => {
      return right.latestDate.localeCompare(left.latestDate) || right.roomName.localeCompare(left.roomName);
    });
  }, [submittedFeedbackItems]);

  const submitFeedbackForReservation = React.useCallback(
    async (reservation: ReservationRecord, options?: { showSuccessAlert?: boolean }) => {
      const currentUser = auth.currentUser;

      if (!currentUser || rating === 0 || !comment.trim()) {
        return false;
      }

      try {
        setSubmitting(true);

        await createFeedback({
          roomId: reservation.roomId,
          roomName: reservation.roomName,
          buildingId: reservation.buildingId,
          buildingName: reservation.buildingName,
          reservationId: reservation.id,
          userId: currentUser.uid,
          userName: currentUser.displayName?.trim() || 'User',
          message: comment.trim(),
          rating,
        });

        await loadFeedbackData(false);
        delete feedbackDraftsRef.current[reservation.id];

        if (options?.showSuccessAlert ?? true) {
          Alert.alert('Feedback Submitted', 'Thank you for sharing your experience.');
        }

        return true;
      } catch (caughtError) {
        Alert.alert(
          'Submit Failed',
          caughtError instanceof Error
            ? caughtError.message
            : "We couldn't submit your feedback right now."
        );
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [comment, loadFeedbackData, rating]
  );

  const handleRatingChange = React.useCallback(
    (nextRating: number) => {
      setRating(nextRating);
      saveDraftForReservation(selectedReservationId, nextRating, comment);
    },
    [comment, saveDraftForReservation, selectedReservationId]
  );

  const handleCommentChange = React.useCallback(
    (nextComment: string) => {
      setComment(nextComment);
      saveDraftForReservation(selectedReservationId, rating, nextComment);
    },
    [rating, saveDraftForReservation, selectedReservationId]
  );

  const handleSelectReservation = React.useCallback((reservationId: string) => {
    const switchReservation = () => {
      setShowForm(true);
      setSelectedReservationId(reservationId);
    };

    if (submitting || reservationId === selectedReservationId) {
      return;
    }

    saveDraftForReservation(selectedReservationId, rating, comment);

    if (
      showForm &&
      selectedReservation &&
      rating > 0 &&
      Boolean(comment.trim())
    ) {
      void (async () => {
        const didSubmit = await submitFeedbackForReservation(selectedReservation, {
          showSuccessAlert: false,
        });

        if (didSubmit) {
          switchReservation();
        }
      })();
      return;
    }

    switchReservation();
  }, [
    comment,
    rating,
    saveDraftForReservation,
    selectedReservation,
    selectedReservationId,
    showForm,
    submitFeedbackForReservation,
    submitting,
  ]);

  const handleToggleSubmittedRoom = React.useCallback((roomId: string) => {
    setExpandedSubmittedRoomId((current) => (current === roomId ? null : roomId));
  }, []);

  const handleSubmitFeedback = React.useCallback(async () => {
    const currentUser = auth.currentUser;

    if (!currentUser || !selectedReservation || rating === 0 || !comment.trim()) {
      return;
    }

    await submitFeedbackForReservation(selectedReservation);
  }, [comment, rating, selectedReservation, submitFeedbackForReservation]);

  return (
    <ScrollView
      stickyHeaderIndices={[0]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            void handleRefresh();
          }}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
      contentContainerStyle={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom, 0),
        },
      ]}
    >
      <DashboardTopNav />

      <View style={styles.screenContent}>
        <Text style={styles.screenTitle}>Feedback</Text>
        <Text style={styles.screenSubtitle}>
          Rate completed reservations and review your submitted feedback.
        </Text>

        {loading ? (
          <View style={styles.card}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.card}>
            <Text style={styles.emptyText}>{error}</Text>
          </View>
        ) : (
          <>
            {showForm ? (
            <View style={[styles.card, localStyles.feedbackFormCard]}>
              <Text style={localStyles.feedbackCardTitle}>Rate Your Experience</Text>
              {selectedReservation ? (
                <>
                  <Text style={localStyles.feedbackRoomName}>
                    {selectedReservation.roomName} | {selectedReservation.buildingName}
                  </Text>

                  <View style={localStyles.feedbackDetailsList}>
                    <Text style={localStyles.feedbackDetailListItem}>
                      Date:{' '}
                      {formatReservationDates(
                        selectedReservation.dates,
                        selectedReservation.date,
                        selectedReservation.isRecurringRequest
                      )}
                    </Text>
                    <Text style={localStyles.feedbackDetailListItem}>
                      Purpose:{' '}
                      {selectedReservation.purpose}
                    </Text>
                    <Text style={localStyles.feedbackDetailListItem}>
                      Time Used:{' '}
                      {formatTimestampTimeOnly(selectedReservation.checkedInAt)} -{' '}
                      {formatTimestampTimeOnly(selectedReservation.completedAt)}
                    </Text>
                  </View>

                  <Text style={localStyles.feedbackSectionLabel}>Rating</Text>
                  <View style={localStyles.starRow}>
                    {[1, 2, 3, 4, 5].map((star) => {
                      const isActive = star <= rating;

                        return (
                        <Pressable
                          key={star}
                          onPress={() => handleRatingChange(star)}
                          style={localStyles.starButton}
                        >
                          <Text
                            style={[
                              localStyles.starInput,
                              isActive ? localStyles.starFilled : localStyles.starEmpty,
                            ]}
                          >
                            ★
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {rating > 0 ? (
                    <Text style={localStyles.ratingHint}>{getStarLabel(rating)}</Text>
                  ) : null}

                  <Text style={localStyles.feedbackSectionLabel}>Comments</Text>
                  <TextInput
                    value={comment}
                    onChangeText={handleCommentChange}
                    multiline
                    placeholder="Share your experience with this room..."
                    placeholderTextColor={colors.mutedText}
                    style={localStyles.feedbackInput}
                    textAlignVertical="top"
                  />

                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      localStyles.feedbackSubmitButton,
                      submitting || rating === 0 || !comment.trim()
                        ? localStyles.feedbackSubmitButtonDisabled
                        : null,
                    ]}
                    onPress={() => {
                      void handleSubmitFeedback();
                    }}
                    disabled={submitting || rating === 0 || !comment.trim()}
                  >
                    {submitting ? (
                      <ActivityIndicator color={colors.white} />
                    ) : (
                      <Text style={styles.actionButtonText}>Submit Feedback</Text>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <View style={localStyles.feedbackEmptyState}>
                  <Text style={styles.emptyText}>
                    No completed reservations are waiting for feedback right now.
                  </Text>
                </View>
              )}
            </View>
            ) : null}

            <View style={styles.card}>
              <View style={localStyles.sectionHeaderRow}>
                <Text style={localStyles.feedbackCardTitle}>Completed Reservations</Text>
                <View style={localStyles.countBadge}>
                  <Text style={localStyles.countBadgeText}>
                    {otherPendingReservations.length}
                  </Text>
                </View>
              </View>

              {otherPendingReservations.length === 0 ? (
                <Text style={styles.emptyText}>
                  No other completed reservations are waiting for feedback.
                </Text>
              ) : (
                <View style={localStyles.feedbackList}>
                  {otherPendingReservations.map((reservation) => (
                    <Pressable
                      key={reservation.id}
                      style={localStyles.feedbackReservationCard}
                      onPress={() => handleSelectReservation(reservation.id)}
                    >
                      <View style={localStyles.feedbackReservationCardBody}>
                        <Text style={localStyles.feedbackReservationTitle}>
                          {reservation.roomName}
                        </Text>
                        <Text style={localStyles.feedbackReservationMeta}>
                          {reservation.buildingName}
                        </Text>
                        <Text style={localStyles.feedbackReservationMeta}>
                          {formatReservationDates(
                            reservation.dates,
                            reservation.date,
                            reservation.isRecurringRequest
                          )}
                        </Text>
                        <Text style={localStyles.feedbackReservationMeta}>
                          {formatTime12h(reservation.startTime)} -{' '}
                          {formatTime12h(reservation.endTime)}
                        </Text>
                      </View>
                      <View style={localStyles.rateNowButton}>
                        <Text style={localStyles.rateNowButtonText}>Rate Now</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.card}>
              <View style={localStyles.sectionHeaderRow}>
                <Text style={localStyles.feedbackCardTitle}>Submitted Feedback</Text>
                <View style={localStyles.countBadge}>
                  <Text style={localStyles.countBadgeText}>
                    {submittedFeedbackItems.length}
                  </Text>
                </View>
              </View>

              {submittedFeedbackGroups.length === 0 ? (
                <Text style={styles.emptyText}>No feedback submitted yet.</Text>
              ) : (
                <View style={localStyles.feedbackList}>
                  {submittedFeedbackGroups.map((group) => {
                    const isExpanded = expandedSubmittedRoomId === group.roomId;

                    return (
                      <View key={group.roomId} style={localStyles.submittedFeedbackGroup}>
                        <View style={localStyles.submittedFeedbackToggle}>
                          <Pressable
                            style={localStyles.submittedFeedbackInfoPressable}
                            onPress={() => handleToggleSubmittedRoom(group.roomId)}
                          >
                            <View style={localStyles.submittedFeedbackInfoRow}>
                              <Text style={localStyles.feedbackReservationTitle}>
                                {group.roomName} | {group.buildingName}
                              </Text>
                            </View>
                          </Pressable>
                          <Pressable
                            style={localStyles.submittedFeedbackExpandButton}
                            onPress={() => handleToggleSubmittedRoom(group.roomId)}
                          >
                            <Text style={localStyles.submittedFeedbackExpandButtonText}>
                              {isExpanded ? '^' : 'v'}
                            </Text>
                          </Pressable>
                        </View>

                        {isExpanded ? (
                          <View style={localStyles.submittedFeedbackGroupBody}>
                            {group.items.map(({ feedback, reservation }) => (
                              <View key={feedback.id} style={localStyles.submittedFeedbackCard}>
                                <View style={localStyles.sectionHeaderRow}>
                                  <View style={localStyles.staticStarRow}>
                                    {renderStaticStars(feedback.rating)}
                                  </View>
                                  <View style={localStyles.feedbackReservationCardBody} />
                                </View>

                                {reservation ? (
                                  <View style={localStyles.feedbackHistoryDetails}>
                                    <Text style={localStyles.feedbackReservationMeta}>
                                      {formatReservationDates(
                                        reservation.dates,
                                        reservation.date,
                                        reservation.isRecurringRequest
                                      )}
                                    </Text>
                                    <Text style={localStyles.feedbackReservationMeta}>
                                      {reservation.purpose}
                                    </Text>
                                    <Text style={localStyles.feedbackReservationMeta}>
                                      {formatTimestampTimeOnly(reservation.checkedInAt)} -{' '}
                                      {formatTimestampTimeOnly(reservation.completedAt)}
                                    </Text>
                                  </View>
                                ) : null}

                                <Text style={localStyles.feedbackMessage}>{feedback.message}</Text>

                                {feedback.adminResponse ? (
                                  <View style={localStyles.adminResponseBox}>
                                    <Text style={styles.mutedLabel}>Admin Response</Text>
                                    <Text style={localStyles.adminResponseText}>
                                      {feedback.adminResponse}
                                    </Text>
                                  </View>
                                ) : null}
                              </View>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </>
        )}
      </View>

      <TouchableOpacity
        style={[styles.actionButton, styles.backButtonContainer]}
        onPress={() => router.back()}
      >
        <Text style={styles.actionButtonText}>Back to Dashboard</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const localStyles = StyleSheet.create({
  feedbackFormCard: {
    marginBottom: 16,
  },
  feedbackCardTitle: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.text,
  },
  feedbackCardMeta: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.mutedText,
    marginTop: 4,
    marginBottom: 18,
  },
  feedbackRoomName: {
    fontSize: 17,
    lineHeight: 22,
    fontFamily: fonts.bold,
    color: colors.text,
    marginTop: 4,
    marginBottom: 8,
  },
  feedbackDetailsList: {
    marginBottom: 18,
    gap: 6,
  },
  feedbackDetailListItem: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.regular,
    color: colors.text,
  },
  feedbackSectionLabel: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.text,
    marginBottom: 6,
  },
  starRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  starButton: {
    paddingVertical: 2,
  },
  starInput: {
    fontSize: 34,
    lineHeight: 38,
  },
  starDisplay: {
    fontSize: 18,
    lineHeight: 20,
  },
  starFilled: {
    color: '#f59e0b',
  },
  starEmpty: {
    color: '#c9c1c1',
  },
  ratingHint: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.secondary,
    marginBottom: 18,
  },
  feedbackInput: {
    minHeight: 120,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: fonts.regular,
    color: colors.text,
    marginBottom: 18,
  },
  feedbackSubmitButton: {
    marginTop: 0,
    marginHorizontal: 0,
  },
  feedbackSubmitButtonDisabled: {
    opacity: 0.6,
  },
  feedbackEmptyState: {
    paddingTop: 4,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 14,
  },
  countBadge: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.subtleBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  countBadgeText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.secondary,
  },
  feedbackList: {
    gap: 12,
  },
  feedbackReservationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
  },
  feedbackReservationCardBody: {
    flex: 1,
    minWidth: 0,
  },
  feedbackReservationTitle: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.text,
  },
  feedbackReservationMeta: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.regular,
    color: colors.secondary,
    marginTop: 3,
  },
  rateNowButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateNowButtonText: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.white,
  },
  submittedFeedbackCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
  },
  submittedFeedbackGroup: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  submittedFeedbackToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  submittedFeedbackInfoPressable: {
    flex: 1,
    paddingRight: 52,
    justifyContent: 'center',
    minWidth: 0,
  },
  submittedFeedbackInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  submittedFeedbackExpandButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.subtleBackground,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submittedFeedbackExpandButtonText: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 12,
    lineHeight: 14,
  },
  submittedFeedbackGroupBody: {
    gap: 12,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  staticStarRow: {
    flexDirection: 'row',
    gap: 2,
    marginRight: 12,
    marginBottom: -8,
  },
  feedbackHistoryDetails: {
    marginTop: 4,
    marginBottom: 10,
  },
  feedbackMessage: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: fonts.regular,
    color: colors.text,
  },
  adminResponseBox: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.subtleBackground,
    padding: 12,
  },
  adminResponseText: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.regular,
    color: colors.text,
  },
});

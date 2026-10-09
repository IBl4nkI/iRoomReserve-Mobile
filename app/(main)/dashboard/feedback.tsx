import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
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
import type { FeedbackCategoryRatingKey, FeedbackCategoryRatings, FeedbackRecord } from '@/types/feedback';
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
  if (rating <= 1.9) return 'Poor';
  if (rating <= 3) return 'Fair';
  if (rating <= 4) return 'Good';
  return 'Excellent';
}

const FEEDBACK_CATEGORIES: { key: FeedbackCategoryRatingKey; label: string }[] = [
  { key: 'cleanliness', label: 'Cleanliness' },
  { key: 'comfort', label: 'Comfort' },
  { key: 'air_conditioning', label: 'Air Conditioning' },
  { key: 'equipment_projector', label: 'Equipment/Projector' },
  { key: 'internet_connectivity', label: 'Internet Connectivity' },
];

const EMPTY_CATEGORY_RATINGS: FeedbackCategoryRatings = {
  cleanliness: 0, comfort: 0, air_conditioning: 0,
  equipment_projector: 0, internet_connectivity: 0,
};

function getOverallRating(ratings: FeedbackCategoryRatings) {
  const ratedValues = Object.values(ratings).filter((value) => value > 0);
  return ratedValues.length > 0
    ? Number((ratedValues.reduce((sum, value) => sum + value, 0) / ratedValues.length).toFixed(1))
    : 0;
}

function hasCompleteCategoryRatings(ratings: FeedbackCategoryRatings) {
  return Object.values(ratings).every((value) => value >= 1 && value <= 5);
}

function formatOverallRating(rating: number) {
  return Number.isInteger(rating) ? String(rating) : rating.toFixed(1);
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
  const [categoryRatings, setCategoryRatings] = React.useState<FeedbackCategoryRatings>(EMPTY_CATEGORY_RATINGS);
  const [postAnonymously, setPostAnonymously] = React.useState(true);
  const [comment, setComment] = React.useState('');
  const [missingCategoryRatings, setMissingCategoryRatings] = React.useState<FeedbackCategoryRatingKey[]>([]);
  const [missingComment, setMissingComment] = React.useState(false);
  const validationHighlight = React.useRef(new Animated.Value(0)).current;
  const scrollViewRef = React.useRef<ScrollView>(null);
  const feedbackFormRef = React.useRef<View | null>(null);
  const categoryContainerRefs = React.useRef<Partial<Record<FeedbackCategoryRatingKey, View | null>>>({});
  const feedbackCommentRef = React.useRef<View | null>(null);
  const feedbackDraftsRef = React.useRef<
    Record<string, { categoryRatings: FeedbackCategoryRatings; comment: string; postAnonymously: boolean }>
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
    (reservationId: string | null, nextRating: FeedbackCategoryRatings, nextComment: string, nextAnonymous: boolean) => {
      if (!reservationId) {
        return;
      }

      if (Object.values(nextRating).every((value) => value === 0) && nextComment.length === 0 && nextAnonymous) {
        delete feedbackDraftsRef.current[reservationId];
        return;
      }

      feedbackDraftsRef.current[reservationId] = {
        categoryRatings: nextRating,
        comment: nextComment,
        postAnonymously: nextAnonymous,
      };
    },
    []
  );

  React.useEffect(() => {
    validationHighlight.stopAnimation();
    validationHighlight.setValue(0);
    setMissingCategoryRatings([]);
    setMissingComment(false);

    if (!selectedReservationId) {
      setCategoryRatings(EMPTY_CATEGORY_RATINGS);
      setComment('');
      setPostAnonymously(true);
      return;
    }

    const draft = feedbackDraftsRef.current[selectedReservationId];
    setCategoryRatings(draft?.categoryRatings ?? EMPTY_CATEGORY_RATINGS);
    setComment(draft?.comment ?? '');
    setPostAnonymously(draft?.postAnonymously ?? true);
  }, [selectedReservationId, validationHighlight]);

  React.useEffect(() => {
    if (!showForm || !selectedReservationId) return;

    const frame = requestAnimationFrame(() => {
      const form = feedbackFormRef.current;
      const scrollView = scrollViewRef.current;
      if (!form || !scrollView) return;

      const scrollContent = scrollView.getNativeScrollRef();
      if (!scrollContent) return;
      form.measureLayout(
        scrollContent,
        (_formX, formY) => scrollView.scrollTo({ y: Math.max(0, formY - 100), animated: true }),
        () => undefined
      );
    });

    return () => cancelAnimationFrame(frame);
  }, [selectedReservationId, showForm]);

  const selectedReservation =
    pendingFeedbackReservations.find((reservation) => reservation.id === selectedReservationId) ??
    null;
  const rating = getOverallRating(categoryRatings);

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

      if (!currentUser || !hasCompleteCategoryRatings(categoryRatings) || !comment.trim()) {
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
          showSubmitterName: !postAnonymously,
          message: comment.trim(),
          rating,
          categoryRatings: { ...categoryRatings },
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
    [categoryRatings, comment, loadFeedbackData, postAnonymously, rating]
  );

  const handleRatingChange = React.useCallback(
    (key: FeedbackCategoryRatingKey | number, nextRating?: number) => {
      if (typeof key === 'number' || nextRating === undefined) return;
      const nextRatings = { ...categoryRatings, [key]: nextRating };
      setCategoryRatings(nextRatings);
      setMissingCategoryRatings((current) => current.filter((missingKey) => missingKey !== key));
      saveDraftForReservation(selectedReservationId, nextRatings, comment, postAnonymously);
    },
    [categoryRatings, comment, postAnonymously, saveDraftForReservation, selectedReservationId]
  );

  const handleCommentChange = React.useCallback(
    (nextComment: string) => {
      setComment(nextComment);
      if (nextComment.trim()) setMissingComment(false);
      saveDraftForReservation(selectedReservationId, categoryRatings, nextComment, postAnonymously);
    },
    [categoryRatings, postAnonymously, saveDraftForReservation, selectedReservationId]
  );

  const handleSelectReservation = React.useCallback((reservationId: string) => {
    if (submitting || reservationId === selectedReservationId) {
      return;
    }

    saveDraftForReservation(selectedReservationId, categoryRatings, comment, postAnonymously);
    setShowForm(true);
    setSelectedReservationId(reservationId);
  }, [
    categoryRatings,
    comment,
    postAnonymously,
    saveDraftForReservation,
    selectedReservationId,
    submitting,
  ]);

  const handleToggleSubmittedRoom = React.useCallback((roomId: string) => {
    setExpandedSubmittedRoomId((current) => (current === roomId ? null : roomId));
  }, []);

  const handleSubmitFeedback = React.useCallback(async () => {
    const currentUser = auth.currentUser;

    if (!currentUser || !selectedReservation) {
      return;
    }

    const missingRatings = FEEDBACK_CATEGORIES
      .filter(({ key }) => !categoryRatings[key])
      .map(({ key }) => key);
    const commentIsMissing = !comment.trim();
    if (missingRatings.length || commentIsMissing) {
      validationHighlight.stopAnimation();
      validationHighlight.setValue(0);
      setMissingCategoryRatings(missingRatings);
      setMissingComment(commentIsMissing);
      Animated.sequence([
        Animated.timing(validationHighlight, {
          toValue: 1,
          duration: 250,
          useNativeDriver: false,
        }),
        Animated.delay(1100),
        Animated.timing(validationHighlight, {
          toValue: 0,
          duration: 850,
          useNativeDriver: false,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setMissingCategoryRatings([]);
          setMissingComment(false);
        }
      });
      const target = missingRatings.length
        ? categoryContainerRefs.current[missingRatings[0]]
        : feedbackCommentRef.current;
      if (target && scrollViewRef.current) {
        const scrollView = scrollViewRef.current;
        const scrollContent = scrollView.getNativeScrollRef();
        if (!scrollContent) return;
        target.measureLayout(
          scrollContent,
          (_targetX, targetY) => scrollView.scrollTo({ y: Math.max(0, targetY - 150), animated: true }),
          () => undefined
        );
      }
      return;
    }

    await submitFeedbackForReservation(selectedReservation);
  }, [categoryRatings, comment, selectedReservation, submitFeedbackForReservation]);

  return (
    <KeyboardAvoidingView
      style={localStyles.keyboardAvoidingContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
    <ScrollView
      ref={scrollViewRef}
      keyboardShouldPersistTaps="handled"
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
            <View ref={feedbackFormRef} style={[styles.card, localStyles.feedbackFormCard]}>
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

                  <Text style={localStyles.feedbackSectionLabel}>Overall Rating: {formatOverallRating(rating)}/5</Text>
                  <View style={localStyles.starRow}>
                    {[1, 2, 3, 4, 5].map((star) => {
                      const isActive = star <= rating;

                        return (
                        <Pressable
                          key={star}
                          onPress={() => handleRatingChange(star)}
                          disabled
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
                    <Text style={localStyles.ratingHint}>{getStarLabel(Math.round(rating))}</Text>
                  ) : null}

                  <View style={localStyles.categoryPanel}>
                    <Text style={localStyles.feedbackSectionLabel}>Category Ratings</Text>
                    {FEEDBACK_CATEGORIES.map(({ key, label }) => (
                      <View
                        key={key}
                        ref={(node) => { categoryContainerRefs.current[key] = node; }}
                        style={localStyles.categoryRow}
                      >
                        <View style={localStyles.categoryLabelRow}>
                          <Text style={localStyles.categoryLabel}>{label}</Text>
                        </View>
                        <View style={localStyles.categoryStarRow}>
                          {[1, 2, 3, 4, 5].map((star) => <Pressable key={star} onPress={() => handleRatingChange(key, star)} style={localStyles.starButton}><Text style={[localStyles.categoryStar, star <= categoryRatings[key] ? localStyles.starFilled : localStyles.starEmpty]}>★</Text></Pressable>)}
                        </View>
                        {!categoryRatings[key] ? <Text style={localStyles.requiredAsterisk}>*</Text> : null}
                        {missingCategoryRatings.includes(key) ? (
                          <Animated.View
                            pointerEvents="none"
                            style={[
                              localStyles.categoryHighlight,
                              {
                                borderColor: validationHighlight.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [colors.border, '#dc2626'],
                                }),
                                borderWidth: validationHighlight.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [1, 2],
                                }),
                              },
                            ]}
                          />
                        ) : null}
                      </View>
                    ))}
                  </View>

                  <Text style={localStyles.feedbackSectionLabel}>Required Feedback</Text>
                  <View ref={feedbackCommentRef} style={localStyles.commentContainer}>
                    <TextInput
                      value={comment}
                      onChangeText={handleCommentChange}
                      multiline
                      maxLength={500}
                      placeholder="Mention what worked, what failed, and which room areas need attention..."
                      placeholderTextColor={colors.mutedText}
                      style={localStyles.feedbackInput}
                      textAlignVertical="top"
                    />
                    {missingComment ? (
                      <Animated.View
                        pointerEvents="none"
                        style={[
                          localStyles.feedbackInputHighlight,
                          {
                            borderColor: validationHighlight.interpolate({
                              inputRange: [0, 1],
                              outputRange: [colors.border, '#dc2626'],
                            }),
                            borderWidth: validationHighlight.interpolate({
                              inputRange: [0, 1],
                              outputRange: [1, 2],
                            }),
                          },
                        ]}
                      />
                    ) : null}
                  </View>
                  <Text style={localStyles.characterCount}>{comment.length}/500 characters</Text>
                  <Pressable style={localStyles.anonymousToggle} onPress={() => { const next = !postAnonymously; setPostAnonymously(next); saveDraftForReservation(selectedReservationId, categoryRatings, comment, next); }} accessibilityRole="checkbox" accessibilityState={{ checked: postAnonymously }}>
                    <Text style={localStyles.checkbox}>{postAnonymously ? '☑' : '□'}</Text>
                    <View style={localStyles.anonymousCopy}><Text style={localStyles.categoryLabel}>Review anonymously</Text><Text style={localStyles.anonymousHint}>Your name will be hidden from administrators unless you clear this option.</Text></View>
                  </Pressable>

                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      localStyles.feedbackSubmitButton,
                      submitting
                        ? localStyles.feedbackSubmitButtonDisabled
                        : null,
                    ]}
                    onPress={() => {
                      void handleSubmitFeedback();
                    }}
                    disabled={submitting}
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
    </KeyboardAvoidingView>
  );
}

const localStyles = StyleSheet.create({
  keyboardAvoidingContainer: {
    flex: 1,
  },
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
  feedbackInputHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 18,
    borderRadius: 18,
  },
  commentContainer: {
    borderRadius: 20,
  },
  ratingSummary: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
    marginBottom: 14,
  },
  categoryPanel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
    marginBottom: 18,
    gap: 10,
  },
  categoryRow: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
  },
  categoryHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 12,
  },
  categoryLabelRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  categoryLabel: {
    flexShrink: 1,
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.text,
  },
  categoryValue: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.secondary,
  },
  categoryStar: {
    fontSize: 23,
    lineHeight: 28,
  },
  categoryStarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginRight: 5,
  },
  requiredAsterisk: {
    position: 'absolute',
    top: 6,
    right: 6,
    color: '#dc2626',
    fontSize: 16,
    lineHeight: 18,
    fontFamily: fonts.bold,
  },
  characterCount: {
    alignSelf: 'flex-end',
    marginTop: -12,
    marginBottom: 14,
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.secondary,
  },
  anonymousToggle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    marginBottom: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.subtleBackground,
  },
  checkbox: {
    fontSize: 20,
    color: colors.primary,
  },
  anonymousCopy: {
    flex: 1,
    gap: 3,
  },
  anonymousHint: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: fonts.regular,
    color: colors.secondary,
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

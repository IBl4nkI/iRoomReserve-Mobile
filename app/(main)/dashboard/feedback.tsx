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
import RoomSearchBar from '@/components/selection-room-search/RoomSearchBar';
import { colors, fonts } from '@/constants/theme';
import { auth } from '@/lib/firebase';
import { createFeedback, getFeedbackByUser } from '@/services/feedback.service';
import { getBuildings } from '@/services/buildings.service';
import { getReservationsByUser } from '@/services/reservations.service';
import { getRoomsByBuilding, getRoomsByIds } from '@/services/rooms.service';
import { formatTime12h } from '@/services/schedules.service';
import type { FeedbackCategoryRatingKey, FeedbackCategoryRatings, FeedbackRecord } from '@/types/feedback';
import type { ReservationRecord, Room, ReservationCampus } from '@/types/reservation';

function formatReservationDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
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

function getSubmittedOverallRating(feedback: FeedbackRecord) {
  const ratings = feedback.categoryRatings ?? feedback.category_ratings;
  if (!ratings) return feedback.rating;

  const calculatedRating = getOverallRating({ ...EMPTY_CATEGORY_RATINGS, ...ratings });
  return calculatedRating || feedback.rating;
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
  const [roomsById, setRoomsById] = React.useState<Record<string, Room>>({});
  const [campusByBuildingId, setCampusByBuildingId] = React.useState<Record<string, ReservationCampus>>({});
  const [roomSearch, setRoomSearch] = React.useState('');
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [updatingFilterSections, setUpdatingFilterSections] = React.useState<string[]>([]);
  const [selectedCampuses, setSelectedCampuses] = React.useState<ReservationCampus[]>(['main', 'digi']);
  const [selectedRoomTypes, setSelectedRoomTypes] = React.useState<string[]>([]);
  const [maxCapacityInput, setMaxCapacityInput] = React.useState('30');
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
      try {
        const buildings = await getBuildings();
        const roomsByBuilding = await Promise.all(buildings.map((building) => getRoomsByBuilding(building.id)));
        const allRooms = roomsByBuilding.flat();
        setRoomsById(Object.fromEntries(allRooms.map((room) => [room.id, room])));
        setCampusByBuildingId(Object.fromEntries(buildings.map((building) => [building.id, building.campus])));
      } catch {
        try {
          const roomIds = [...new Set([
          ...nextReservations.map((reservation) => reservation.roomId),
          ...nextFeedback.map((feedback) => feedback.roomId),
          ].filter(Boolean))];
          const rooms = await getRoomsByIds(roomIds);
          setRoomsById(Object.fromEntries(rooms.map((room) => [room.id, room])));
        } catch {
          setRoomsById({});
        }
      }
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

  const availableRoomTypes = React.useMemo(() => [...new Set([
    'Classroom', 'Glass Room', 'Conference Room', 'Specialized Room', 'Gymnasium', 'Open Area',
    ...Object.values(roomsById).map((room) => room.roomType.trim()),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b)), [roomsById]);
  const roomCampusById = React.useMemo(() => {
    const campusByRoomId = Object.fromEntries(Object.values(roomsById)
      .filter((room) => campusByBuildingId[room.buildingId])
      .map((room) => [room.id, campusByBuildingId[room.buildingId]]));
    reservations.forEach((reservation) => { campusByRoomId[reservation.roomId] = reservation.campus; });
    return campusByRoomId;
  }, [campusByBuildingId, reservations, roomsById]);
  const handleCampusToggle = React.useCallback((campus: ReservationCampus) => {
    setSelectedCampuses((current) => current.includes(campus)
      ? current.filter((value) => value !== campus)
      : [...current, campus]);
  }, []);
  const handleRoomTypeToggle = React.useCallback((roomType: string) => {
    setSelectedRoomTypes((current) => current.includes(roomType)
      ? current.filter((value) => value !== roomType)
      : [...current, roomType]);
  }, []);
  const hasActiveFilters = selectedCampuses.length !== 2
    || !selectedCampuses.includes('main')
    || !selectedCampuses.includes('digi')
    || selectedRoomTypes.length > 0
    || maxCapacityInput !== '30';
  const resetFilters = React.useCallback(() => {
    setSelectedCampuses(['main', 'digi']);
    setSelectedRoomTypes([]);
    setMaxCapacityInput('30');
  }, []);
  const feedbackFilterSignature = JSON.stringify({
    campus: JSON.stringify(selectedCampuses),
    roomType: JSON.stringify(selectedRoomTypes),
    capacity: maxCapacityInput,
  });
  const previousFeedbackFilterSignature = React.useRef(feedbackFilterSignature);
  React.useEffect(() => {
    if (!filtersOpen) {
      previousFeedbackFilterSignature.current = feedbackFilterSignature;
      setUpdatingFilterSections([]);
      return;
    }

    if (previousFeedbackFilterSignature.current === feedbackFilterSignature) return;
    const previousSnapshot = JSON.parse(previousFeedbackFilterSignature.current) as Record<string, string>;
    const nextSnapshot = JSON.parse(feedbackFilterSignature) as Record<string, string>;
    const changedSections = Object.keys(nextSnapshot).filter(
      (section) => previousSnapshot[section] !== nextSnapshot[section]
    );
    previousFeedbackFilterSignature.current = feedbackFilterSignature;
    if (changedSections.length === 0) return;
    setUpdatingFilterSections((current) => [...new Set([...current, ...changedSections])]);
    const timeout = setTimeout(() => setUpdatingFilterSections([]), 500);
    return () => clearTimeout(timeout);
  }, [feedbackFilterSignature, filtersOpen]);
  const matchesRoomFilters = React.useCallback((roomId: string, roomName: string, buildingName: string, campus?: ReservationCampus) => {
    const room = roomsById[roomId];
    const campusForRoom = campus ?? roomCampusById[roomId];
    const search = roomSearch.trim().toLocaleLowerCase();
    const campusName = campusForRoom === 'main' ? 'Main Campus' : campusForRoom === 'digi' ? 'Digital Campus' : '';
    const matchesSearch = !search || `${roomName} ${campusName} ${buildingName} ${room?.floor ?? ''} ${room?.roomType ?? ''}`.toLocaleLowerCase().includes(search);
    const matchesCampus = campusForRoom
      ? selectedCampuses.includes(campusForRoom)
      : selectedCampuses.length === 2;
    const matchesType = selectedRoomTypes.length === 0 || selectedRoomTypes.includes(room?.roomType ?? '');
    const maximumCapacity = Number(maxCapacityInput);
    const matchesCapacity = !maxCapacityInput.trim() || !Number.isFinite(maximumCapacity) || !room || room.capacity >= maximumCapacity;
    return matchesSearch && matchesCampus && matchesType && matchesCapacity;
  }, [maxCapacityInput, roomCampusById, roomSearch, roomsById, selectedCampuses, selectedRoomTypes]);
  const filteredPendingFeedbackReservations = React.useMemo(
    () => pendingFeedbackReservations.filter((reservation) => matchesRoomFilters(reservation.roomId, reservation.roomName, reservation.buildingName, reservation.campus)),
    [matchesRoomFilters, pendingFeedbackReservations]
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
      filteredPendingFeedbackReservations.filter(
        (reservation) => !showForm || reservation.id !== selectedReservation?.id
      ),
    [filteredPendingFeedbackReservations, selectedReservation, showForm]
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

  const filteredSubmittedFeedbackGroups = React.useMemo(() => submittedFeedbackGroups.map((group) => ({
    ...group,
    items: group.items.filter(({ feedback, reservation }) => matchesRoomFilters(
      feedback.roomId || reservation?.roomId || group.roomId,
      feedback.roomName,
      feedback.buildingName,
      reservation?.campus
    )),
  })).filter((group) => group.items.length > 0), [matchesRoomFilters, submittedFeedbackGroups]);

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
            <RoomSearchBar
              filtersOpen={filtersOpen}
              onToggleFilters={() => setFiltersOpen((current) => !current)}
              onQueryChange={setRoomSearch}
              query={roomSearch}
            />
            {filtersOpen ? (
              <View style={localStyles.filterPanel}>
                {updatingFilterSections.includes('campus') ? (
                  <View style={localStyles.filterUpdatingRow}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={localStyles.filterUpdatingText}>Updating filters...</Text>
                  </View>
                ) : null}
                <Text style={localStyles.filterSectionTitle}>Filter by Campus:</Text>
                <View style={localStyles.campusOptions}>
                  {([
                    { id: 'main', label: 'Main Campus' },
                    { id: 'digi', label: 'Digital Campus' },
                  ] as const).map(({ id, label }) => {
                    const selected = selectedCampuses.includes(id);
                    return (
                      <Pressable key={id} style={[localStyles.campusOption, selected && localStyles.campusOptionSelected]} onPress={() => handleCampusToggle(id)}>
                        <View style={[localStyles.roomTypeCheckbox, selected && localStyles.roomTypeCheckboxSelected]}>{selected ? <Text style={localStyles.roomTypeCheck}>✓</Text> : null}</View>
                        <Text style={localStyles.roomTypeOptionText}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {updatingFilterSections.includes('roomType') ? (
                  <View style={localStyles.filterUpdatingRow}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={localStyles.filterUpdatingText}>Updating filters...</Text>
                  </View>
                ) : null}
                <Text style={localStyles.filterSectionTitle}>Filter by Room Type:</Text>
                <View style={localStyles.roomTypeOptions}>
                  {availableRoomTypes.map((roomType) => {
                    const selected = selectedRoomTypes.includes(roomType);
                    return (
                      <Pressable key={roomType} style={[localStyles.roomTypeOption, selected && localStyles.roomTypeOptionSelected]} onPress={() => handleRoomTypeToggle(roomType)}>
                        <View style={[localStyles.roomTypeCheckbox, selected && localStyles.roomTypeCheckboxSelected]}>{selected ? <Text style={localStyles.roomTypeCheck}>✓</Text> : null}</View>
                        <Text style={localStyles.roomTypeOptionText}>{roomType}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {updatingFilterSections.includes('capacity') ? (
                  <View style={localStyles.filterUpdatingRow}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={localStyles.filterUpdatingText}>Updating filters...</Text>
                  </View>
                ) : null}
                <View style={localStyles.capacityRow}>
                  <Text style={localStyles.capacityLabel}>Filter by Max. Capacity:</Text>
                  <TextInput keyboardType="number-pad" onChangeText={(value) => setMaxCapacityInput(value.replace(/\D/g, ''))} placeholder="30" placeholderTextColor={colors.mutedText} style={localStyles.capacityInput} value={maxCapacityInput} />
                </View>
                <TouchableOpacity
                  disabled={!hasActiveFilters}
                  onPress={resetFilters}
                  style={[localStyles.resetButton, !hasActiveFilters && localStyles.resetButtonDisabled]}
                >
                  <Text style={[localStyles.resetIcon, !hasActiveFilters && localStyles.resetButtonTextDisabled]}>↻</Text>
                  <Text style={[localStyles.resetButtonText, !hasActiveFilters && localStyles.resetButtonTextDisabled]}>Reset Filters</Text>
                </TouchableOpacity>
              </View>
            ) : null}
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
                      {formatReservationDate(selectedReservation.date)}
                    </Text>
                    <Text style={localStyles.feedbackDetailListItem}>
                      Purpose:{' '}
                      {selectedReservation.purpose}
                    </Text>
                    <Text style={localStyles.feedbackDetailListItem}>
                      Time:{' '}
                      {formatTime12h(selectedReservation.startTime)} -{' '}
                      {formatTime12h(selectedReservation.endTime)}
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
                          Date: {formatReservationDate(reservation.date)}
                        </Text>
                        <Text style={localStyles.feedbackReservationMeta}>
                          Start time: {formatTime12h(reservation.startTime)} · End time: {formatTime12h(reservation.endTime)}
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
                    {filteredSubmittedFeedbackGroups.reduce((count, group) => count + group.items.length, 0)}
                  </Text>
                </View>
              </View>

              {filteredSubmittedFeedbackGroups.length === 0 ? (
                <Text style={styles.emptyText}>No submitted feedback matches these filters.</Text>
              ) : (
                <View style={localStyles.feedbackList}>
                  {filteredSubmittedFeedbackGroups.map((group) => {
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
                                <View style={localStyles.overallRatingRow}>
                                  <Text style={localStyles.submittedRatingLabel}>Overall</Text>
                                  <View style={localStyles.staticStarRow}>
                                    {renderStaticStars(Math.floor(getSubmittedOverallRating(feedback)))}
                                  </View>
                                  <Text style={localStyles.submittedRatingValue}>{formatOverallRating(getSubmittedOverallRating(feedback))}/5</Text>
                                </View>
                                <View style={localStyles.submittedCategoryRatings}>
                                  {FEEDBACK_CATEGORIES.map(({ key, label }) => {
                                    const categoryRating = feedback.categoryRatings?.[key]
                                      ?? feedback.category_ratings?.[key]
                                      ?? 0;
                                    return (
                                      <View key={key} style={localStyles.submittedCategoryRatingRow}>
                                        <Text style={localStyles.submittedCategoryRatingLabel}>{label}</Text>
                                        <View style={localStyles.categoryStaticStarRow}>
                                          {renderStaticStars(categoryRating)}
                                        </View>
                                      </View>
                                    );
                                  })}
                                </View>

                                {reservation ? (
                                  <View style={localStyles.feedbackHistoryDetails}>
                                    <Text style={localStyles.feedbackReservationMeta}>
                                      Date: {formatReservationDate(reservation.date)}
                                    </Text>
                                    <Text style={localStyles.feedbackReservationMeta}>
                                      {reservation.purpose}
                                    </Text>
                                    <Text style={localStyles.feedbackReservationMeta}>
                                      Start time: {formatTime12h(reservation.startTime)} · End time: {formatTime12h(reservation.endTime)}
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
  filterPanel: {
    marginTop: 12,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.subtleBackground,
    padding: 14,
  },
  filterUpdatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  filterUpdatingText: {
    color: colors.mutedText,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  filterSectionTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 16,
    marginBottom: 10,
  },
  campusOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 10,
    rowGap: 10,
    marginBottom: 16,
  },
  campusOption: {
    minWidth: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  campusOptionSelected: {
    borderColor: '#e7aaaa',
    backgroundColor: '#fbf2f2',
  },
  roomTypeOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 10,
    rowGap: 10,
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  roomTypeOption: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  roomTypeOptionSelected: {
    borderColor: '#e7aaaa',
    backgroundColor: '#fbf2f2',
  },
  roomTypeCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  roomTypeCheckboxSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  roomTypeCheck: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 12,
    lineHeight: 12,
  },
  roomTypeOptionText: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 11,
    flex: 1,
  },
  capacityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  capacityLabel: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 14,
    lineHeight: 18,
    flexShrink: 0,
  },
  capacityInput: {
    borderRadius: 8,
    flex: 1,
    height: 34,
    minHeight: 34,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 3,
    textAlign: 'left',
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 14,
  },
  resetButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 12,
  },
  resetButtonDisabled: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  resetButtonText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  resetIcon: {
    color: colors.white,
    fontSize: 19,
    lineHeight: 20,
    transform: [{ translateY: -2 }],
  },
  resetButtonTextDisabled: {
    color: colors.mutedText,
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
  overallRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  submittedRatingLabel: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  submittedRatingValue: {
    color: colors.mutedText,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  submittedCategoryRatings: {
    gap: 5,
    marginBottom: 10,
  },
  submittedCategoryRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  submittedCategoryRatingLabel: {
    flex: 1,
    color: colors.mutedText,
    fontFamily: fonts.regular,
    fontSize: 12,
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
  },
  categoryStaticStarRow: {
    flexDirection: 'row',
    gap: 2,
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

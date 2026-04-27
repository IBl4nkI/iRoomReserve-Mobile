import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import DashboardTopNav from "@/components/dashboard/DashboardTopNav";
import { dashboardStyles as styles } from "@/components/dashboard/styles";
import { colors } from "@/constants/theme";
import { getUserProfile } from "@/lib/auth";
import { auth } from "@/lib/firebase";
import { getRoomsByIds } from "@/services/rooms.service";
import { formatTime12h } from "@/services/schedules.service";
import { getReservationsByUser } from "@/services/reservations.service";
import type {
  ReservationApprovalStep,
  ReservationRecord,
  Room,
} from "@/types/reservation";

function EmptyStateCard({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

function BellIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9.5 20C9.95833 21.1667 10.7917 21.75 12 21.75C13.2083 21.75 14.0417 21.1667 14.5 20"
        stroke="#343434"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Path
        d="M5.5 17.5H18.5C17.6667 16.6667 17.25 15.5208 17.25 14.0625V10.875C17.25 7.81842 14.9926 5.25 12 5.25C9.00736 5.25 6.75 7.81842 6.75 10.875V14.0625C6.75 15.5208 6.33333 16.6667 5.5 17.5Z"
        stroke="#343434"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M10.125 4.625C10.125 3.58947 10.9645 2.75 12 2.75C13.0355 2.75 13.875 3.58947 13.875 4.625"
        stroke="#343434"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function StatusChip({
  status,
}: {
  status: "Active" | "Approved" | "Pending" | "Rejected";
}) {
  if (status === "Approved") {
    return (
      <View style={[styles.chip, styles.chipApproved]}>
        <Text style={[styles.chipText, styles.chipTextApproved]}>Approved</Text>
      </View>
    );
  }

  if (status === "Rejected") {
    return (
      <View style={[styles.chip, styles.chipRejected]}>
        <Text style={[styles.chipText, styles.chipTextRejected]}>Rejected</Text>
      </View>
    );
  }

  if (status === "Active") {
    return (
      <View style={[styles.chip, styles.chipActive]}>
        <Text style={[styles.chipText, styles.chipTextActive]}>Active</Text>
      </View>
    );
  }

  return (
    <View style={[styles.chip, styles.chipPending]}>
      <Text style={[styles.chipText, styles.chipTextPending]}>Pending</Text>
    </View>
  );
}

function sortReservations(left: ReservationRecord, right: ReservationRecord) {
  return (
    right.date.localeCompare(left.date) ||
    right.startTime.localeCompare(left.startTime) ||
    right.id.localeCompare(left.id)
  );
}

function formatReservationDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getLocalDateKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isCurrentOrFutureReservation(reservation: ReservationRecord) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${reservation.date}T00:00:00`).getTime() >= today.getTime();
}

function getCurrentApprovalStep(
  reservation: ReservationRecord
): ReservationApprovalStep | null {
  if (
    !Array.isArray(reservation.approvalFlow) ||
    typeof reservation.currentStep !== "number"
  ) {
    return null;
  }

  return reservation.approvalFlow[reservation.currentStep] ?? null;
}

function getPendingStageLabel(reservation: ReservationRecord) {
  const currentStep = getCurrentApprovalStep(reservation);

  if (currentStep?.role === "advisor") {
    return "Waiting for faculty approval";
  }

  if (currentStep?.role === "building_admin") {
    return reservation.campus === "main"
      ? "Faculty approved, waiting for building admin approval"
      : "Waiting for building admin approval";
  }

  return "Waiting for approval";
}

function getDisplayStatus(reservation: ReservationRecord) {
  if (reservation.status === "pending") {
    return "Pending" as const;
  }

  if (reservation.status === "approved") {
    return "Approved" as const;
  }

  if (reservation.status === "rejected" || reservation.status === "cancelled") {
    return "Rejected" as const;
  }

  return "Active" as const;
}

function ReservationCard({
  reservation,
  showPendingStage = false,
  compactTitle = false,
  locationLabel,
}: {
  reservation: ReservationRecord;
  showPendingStage?: boolean;
  compactTitle?: boolean;
  locationLabel?: string;
}) {
  return (
    <View style={styles.listItem}>
      <View style={styles.row}>
        <Text
          style={[
            compactTitle ? styles.reservationTitle : styles.sectionTitle,
            compactTitle ? { marginTop: 0 } : null,
          ]}
        >
          {reservation.roomName}
        </Text>
        <StatusChip status={getDisplayStatus(reservation)} />
      </View>
      <Text style={styles.reservationMeta}>{locationLabel ?? reservation.buildingName}</Text>
      <Text style={styles.reservationMeta}>{formatReservationDate(reservation.date)}</Text>
      <Text style={styles.reservationMeta}>
        {formatTime12h(reservation.startTime)} - {formatTime12h(reservation.endTime)}
      </Text>
      <Text style={styles.reservationPurpose}>{reservation.purpose}</Text>
      {showPendingStage ? (
        <Text style={[styles.reservationMeta, { color: colors.primary }]}>
          {getPendingStageLabel(reservation)}
        </Text>
      ) : null}
    </View>
  );
}

export default function DashboardHomeScreen() {
  const insets = useSafeAreaInsets();
  const [firstName, setFirstName] = React.useState("My");
  const [reservations, setReservations] = React.useState<ReservationRecord[]>([]);
  const [roomsById, setRoomsById] = React.useState<Record<string, Room>>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;

    const loadDashboard = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        if (active) {
          setLoading(false);
        }
        return;
      }

      try {
        const [profile, nextReservations] = await Promise.all([
          getUserProfile(currentUser.uid),
          getReservationsByUser(currentUser.uid),
        ]);

        if (!active) {
          return;
        }

        if (profile?.firstName?.trim()) {
          setFirstName(profile.firstName.trim());
        }

        const roomIds = [...new Set(nextReservations.map((reservation) => reservation.roomId))];
        const rooms = await getRoomsByIds(roomIds);

        if (!active) {
          return;
        }

        setReservations(nextReservations.sort(sortReservations));
        setRoomsById(
          Object.fromEntries(rooms.map((room) => [room.id, room] as const))
        );
        setError(null);
      } catch (caughtError) {
        if (!active) {
          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Failed to load dashboard data."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadDashboard();

    return () => {
      active = false;
    };
  }, []);

  const pendingReservations = reservations.filter(
    (reservation) =>
      reservation.status === "pending" && isCurrentOrFutureReservation(reservation)
  );
  const approvedReservations = reservations.filter(
    (reservation) =>
      reservation.status === "approved" && isCurrentOrFutureReservation(reservation)
  );
  const todayDateKey = getLocalDateKey();
  const ongoingReservation =
    approvedReservations.find((reservation) => reservation.date === todayDateKey) ??
    approvedReservations[0] ??
    null;
  const upcomingReservations = approvedReservations.filter(
    (reservation) => reservation.id !== ongoingReservation?.id
  );
  const hasUnreadInbox = pendingReservations.length > 0;
  const getRoomLocationLabel = (reservation: ReservationRecord) => {
    const room = roomsById[reservation.roomId];
    return room?.floor
      ? `${reservation.buildingName} - ${room.floor}`
      : reservation.buildingName;
  };

  return (
    <ScrollView
      stickyHeaderIndices={[0]}
      contentContainerStyle={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom, 0),
        },
      ]}
    >
      <DashboardTopNav />

      <View style={styles.screenContent}>
        <View style={styles.screenTitleRow}>
          <Text style={styles.screenTitleCentered}>{`${firstName}'s Dashboard`}</Text>
          <Pressable
            style={styles.inboxShortcutButton}
            onPress={() => router.push("/(main)/dashboard/inbox")}
          >
            <BellIcon />
            {hasUnreadInbox ? <View style={styles.inboxShortcutDot} /> : null}
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.card}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <EmptyStateCard title="Dashboard" message={error} />
        ) : (
          <>
            {ongoingReservation ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Ongoing Reservation</Text>
                <ReservationCard
                  reservation={ongoingReservation}
                  compactTitle
                  locationLabel={getRoomLocationLabel(ongoingReservation)}
                />
              </View>
            ) : (
              <EmptyStateCard
                title="Ongoing Reservation"
                message="There are no ongoing reservations."
              />
            )}

            {pendingReservations.length === 0 ? (
              <EmptyStateCard
                title="Pending Requests"
                message="There are no pending requests."
              />
            ) : (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Pending Requests</Text>
                {pendingReservations.map((reservation, index) => (
                  <View
                    key={reservation.id}
                    style={[
                      styles.listItem,
                      index === pendingReservations.length - 1
                        ? { marginBottom: 0 }
                        : null,
                    ]}
                  >
                    {(() => {
                      const room = roomsById[reservation.roomId];
                      const locationLabel = room?.floor
                        ? `${reservation.buildingName} - ${room.floor}`
                        : reservation.buildingName;

                      return (
                        <>
                    <View style={styles.row}>
                      <Text style={[styles.reservationTitle, { marginTop: 0 }]}>
                        {reservation.roomName}
                      </Text>
                      <StatusChip status="Pending" />
                    </View>
                    <Text style={styles.reservationMeta}>{locationLabel}</Text>
                    <Text style={styles.reservationMeta}>{formatReservationDate(reservation.date)}</Text>
                    <Text style={styles.reservationMeta}>
                      {formatTime12h(reservation.startTime)} - {formatTime12h(reservation.endTime)}
                    </Text>
                    <Text style={styles.reservationMeta}>
                      {reservation.programDepartmentOrganization || "Program / Department / Organization not provided"}
                    </Text>
                    <Text style={styles.reservationPurpose}>{reservation.purpose}</Text>
                    <Text style={[styles.reservationMeta, { color: colors.primary }]}>
                      {getPendingStageLabel(reservation)}
                    </Text>
                        </>
                      );
                    })()}
                  </View>
                ))}
              </View>
            )}

            {upcomingReservations.length === 0 ? (
              <EmptyStateCard
                title="Upcoming Reservations"
                message="There are no upcoming reservations."
              />
            ) : (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Upcoming Reservations</Text>
                {upcomingReservations.map((reservation, index) => (
                  <View
                    key={reservation.id}
                    style={index === upcomingReservations.length - 1 ? { marginBottom: 0 } : null}
                  >
                    <ReservationCard
                      reservation={reservation}
                      compactTitle
                      locationLabel={getRoomLocationLabel(reservation)}
                    />
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        <Pressable
          style={styles.actionButton}
          onPress={() => router.push("/(main)/dashboard/reserve-now")}
        >
          <Text style={styles.actionButtonText}>Reserve Now</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import SelectionScreenLayout from "@/components/SelectionScreenLayout";
import { colors, fonts } from "@/constants/theme";
import { formatFullDate } from "@/lib/reservation-search";
import { formatTime12h } from "@/services/schedules.service";

interface SelectedTimeslotParam {
  dateKey: string;
  endTime: string;
  startTime: string;
  state: "available" | "pending";
}

export default function ReservationFormScreen() {
  const router = useRouter();
  const { roomName, selection, selectedTimeslots, timeslot } = useLocalSearchParams<{
    roomName?: string;
    selection?: string;
    selectedTimeslots?: string;
    timeslot?: string;
  }>();
  const parsedTimeslots: SelectedTimeslotParam[] = React.useMemo(() => {
    if (!selectedTimeslots) {
      return [];
    }

    try {
      const parsedValue = JSON.parse(String(selectedTimeslots));
      return Array.isArray(parsedValue) ? parsedValue : [];
    } catch {
      return [];
    }
  }, [selectedTimeslots]);

  return (
    <SelectionScreenLayout
      title="Reservation Form"
      subtitle="Placeholder Screen"
      onBackPress={() => router.back()}
    >
      <View style={styles.content}>
        <Text style={styles.description}>
          This is a placeholder for the reservation form flow.
        </Text>
        <Text style={styles.detail}>Room: {roomName ?? "Selected Room"}</Text>
        <Text style={styles.detail}>Schedule: {selection ?? "Not provided"}</Text>
        <Text style={styles.detail}>Timeslot: {timeslot ?? "Not provided"}</Text>
        {parsedTimeslots.length > 0 ? (
          <View style={styles.selectedTimeslotsCard}>
            <Text style={styles.selectedTimeslotsTitle}>Selected Timeslots</Text>
            {parsedTimeslots.map((slot) => (
              <Text
                key={`${slot.dateKey}-${slot.startTime}-${slot.endTime}`}
                style={styles.selectedTimeslotItem}
              >
                {formatFullDate(new Date(`${slot.dateKey}T00:00:00`))}:{" "}
                {formatTime12h(slot.startTime)} - {formatTime12h(slot.endTime)}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      <TouchableOpacity
        style={styles.dashboardButton}
        onPress={() => router.push("/(main)/dashboard")}
      >
        <Text style={styles.dashboardButtonText}>Back to Dashboard</Text>
      </TouchableOpacity>
    </SelectionScreenLayout>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.subtleBackground,
  },
  description: {
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 12,
  },
  detail: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    marginBottom: 6,
  },
  selectedTimeslotsCard: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  selectedTimeslotsTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 13,
    marginBottom: 8,
  },
  selectedTimeslotItem: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
  },
  dashboardButton: {
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    alignItems: "center",
  },
  dashboardButtonText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
});

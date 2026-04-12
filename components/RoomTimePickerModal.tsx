import React from "react";
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { colors, fonts } from "@/constants/theme";

const TIME_MINUTE_OPTIONS = ["00", "30"] as const;
const TIME_PERIOD_OPTIONS = ["AM", "PM"] as const;
const TIME_WHEEL_ITEM_HEIGHT = 72;

interface RoomTimePickerModalProps {
  endTime: string;
  endTimeParts: { hour: string; minute: "00" | "30"; period: "AM" | "PM" };
  onClose: () => void;
  onTimeWheelScroll: (
    field: "start" | "end",
    wheel: "hour" | "minute" | "period",
    offsetY: number
  ) => void;
  openTimeField: "start" | "end" | null;
  selectedCampus: string | null;
  startTime: string;
  startTimeParts: { hour: string; minute: "00" | "30"; period: "AM" | "PM" };
  timeWheelHours: string[];
}

export default function RoomTimePickerModal({
  endTime,
  endTimeParts,
  onClose,
  onTimeWheelScroll,
  openTimeField,
  selectedCampus,
  startTime,
  startTimeParts,
  timeWheelHours,
}: RoomTimePickerModalProps) {
  return (
    <Modal
      visible={Boolean(openTimeField)}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {openTimeField === "start" ? "Choose Start Time" : "Choose End Time"}
            </Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeText}>X</Text>
            </TouchableOpacity>
          </View>

          {openTimeField ? (
            <View style={styles.wheelWrap}>
              <View style={styles.selectionBand} />
              <ScrollView
                key={`${openTimeField}-${selectedCampus ?? "all"}-${
                  openTimeField === "start" ? startTime : endTime
                }-hour`}
                style={styles.wheelColumn}
                contentContainerStyle={styles.wheelContent}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
                snapToInterval={TIME_WHEEL_ITEM_HEIGHT}
                decelerationRate="fast"
                scrollEventThrottle={16}
                onScrollEndDrag={(event) =>
                  onTimeWheelScroll(openTimeField, "hour", event.nativeEvent.contentOffset.y)
                }
                onMomentumScrollEnd={(event) =>
                  onTimeWheelScroll(openTimeField, "hour", event.nativeEvent.contentOffset.y)
                }
                contentOffset={{
                  x: 0,
                  y:
                    timeWheelHours.indexOf(
                      openTimeField === "start" ? startTimeParts.hour : endTimeParts.hour
                    ) * TIME_WHEEL_ITEM_HEIGHT,
                }}
              >
                {timeWheelHours.map((hour) => {
                  const selected =
                    hour ===
                    (openTimeField === "start" ? startTimeParts.hour : endTimeParts.hour);

                  return (
                    <View key={hour} style={styles.wheelItem}>
                      <Text style={[styles.wheelText, selected && styles.wheelTextSelected]}>
                        {hour}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>

              <Text style={styles.divider}>:</Text>

              <ScrollView
                key={`${openTimeField}-${openTimeField === "start" ? startTime : endTime}-minute`}
                style={styles.wheelColumn}
                contentContainerStyle={styles.wheelContent}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
                snapToInterval={TIME_WHEEL_ITEM_HEIGHT}
                decelerationRate="fast"
                scrollEventThrottle={16}
                onScrollEndDrag={(event) =>
                  onTimeWheelScroll(openTimeField, "minute", event.nativeEvent.contentOffset.y)
                }
                onMomentumScrollEnd={(event) =>
                  onTimeWheelScroll(openTimeField, "minute", event.nativeEvent.contentOffset.y)
                }
                contentOffset={{
                  x: 0,
                  y:
                    TIME_MINUTE_OPTIONS.indexOf(
                      openTimeField === "start" ? startTimeParts.minute : endTimeParts.minute
                    ) * TIME_WHEEL_ITEM_HEIGHT,
                }}
              >
                {TIME_MINUTE_OPTIONS.map((minute) => {
                  const selected =
                    minute ===
                    (openTimeField === "start" ? startTimeParts.minute : endTimeParts.minute);

                  return (
                    <View key={minute} style={styles.wheelItem}>
                      <Text style={[styles.wheelText, selected && styles.wheelTextSelected]}>
                        {minute}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>

              <ScrollView
                key={`${openTimeField}-${openTimeField === "start" ? startTime : endTime}-period`}
                style={styles.periodColumn}
                contentContainerStyle={styles.wheelContent}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
                snapToInterval={TIME_WHEEL_ITEM_HEIGHT}
                decelerationRate="fast"
                scrollEventThrottle={16}
                onScrollEndDrag={(event) =>
                  onTimeWheelScroll(openTimeField, "period", event.nativeEvent.contentOffset.y)
                }
                onMomentumScrollEnd={(event) =>
                  onTimeWheelScroll(openTimeField, "period", event.nativeEvent.contentOffset.y)
                }
                contentOffset={{
                  x: 0,
                  y:
                    TIME_PERIOD_OPTIONS.indexOf(
                      openTimeField === "start" ? startTimeParts.period : endTimeParts.period
                    ) * TIME_WHEEL_ITEM_HEIGHT,
                }}
              >
                {TIME_PERIOD_OPTIONS.map((period) => {
                  const selected =
                    period ===
                    (openTimeField === "start" ? startTimeParts.period : endTimeParts.period);

                  return (
                    <View key={period} style={styles.wheelItem}>
                      <Text
                        style={[
                          styles.wheelText,
                          styles.periodText,
                          selected && styles.wheelTextSelected,
                        ]}
                      >
                        {period.toLowerCase()}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(29, 27, 32, 0.32)",
    paddingHorizontal: 18,
    justifyContent: "center",
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 16,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.subtleBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  closeText: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  wheelWrap: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: TIME_WHEEL_ITEM_HEIGHT * 3,
  },
  selectionBand: {
    position: "absolute",
    left: 0,
    right: 0,
    top: TIME_WHEEL_ITEM_HEIGHT,
    height: TIME_WHEEL_ITEM_HEIGHT,
    borderRadius: 18,
    backgroundColor: colors.subtleBackground,
  },
  wheelColumn: {
    width: 88,
    maxHeight: TIME_WHEEL_ITEM_HEIGHT * 3,
  },
  periodColumn: {
    width: 92,
    maxHeight: TIME_WHEEL_ITEM_HEIGHT * 3,
  },
  wheelContent: {
    paddingVertical: TIME_WHEEL_ITEM_HEIGHT,
  },
  wheelItem: {
    height: TIME_WHEEL_ITEM_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  wheelText: {
    color: colors.mutedText,
    fontFamily: fonts.regular,
    fontSize: 52,
    lineHeight: 56,
  },
  wheelTextSelected: {
    color: colors.primary,
    fontFamily: fonts.bold,
  },
  periodText: {
    fontSize: 34,
    lineHeight: 46,
  },
  divider: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 52,
    lineHeight: 56,
    marginHorizontal: 4,
  },
});

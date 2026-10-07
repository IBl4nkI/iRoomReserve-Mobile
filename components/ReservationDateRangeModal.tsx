import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AvailabilityCalendar from '@/components/AvailabilityCalendar';
import { colors, fonts } from '@/constants/theme';
import {
  addMonths,
  getCalendarWeeks,
  getMonthLabel,
  toDateKey,
} from '@/components/selection-room-search/helpers';

interface ReservationDateRangeModalProps {
  initialEndDate: string | null;
  initialStartDate: string | null;
  onApply: (startDate: string, endDate: string) => void;
  onClose: () => void;
  visible: boolean;
}

function formatDate(dateKey: string | null) {
  if (!dateKey) {
    return null;
  }

  return new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function ReservationDateRangeModal({
  initialEndDate,
  initialStartDate,
  onApply,
  onClose,
  visible,
}: ReservationDateRangeModalProps) {
  const insets = useSafeAreaInsets();
  const [startDate, setStartDate] = React.useState<string | null>(initialStartDate);
  const [endDate, setEndDate] = React.useState<string | null>(initialEndDate);
  const scrollRef = React.useRef<ScrollView>(null);
  const monthOffsets = React.useRef<Record<number, number>>({});
  const firstCalendarYear = 2025;
  const currentYear = new Date().getFullYear();
  const currentMonthIndex = new Date().getMonth();
  const currentCalendarMonthIndex =
    (currentYear - firstCalendarYear) * 12 + currentMonthIndex;
  const monthsToDisplay =
    (currentYear - firstCalendarYear) * 12 +
    12 +
    (currentMonthIndex >= 6 ? currentMonthIndex - 5 : 0);
  const months = React.useMemo(
    () =>
      Array.from({ length: monthsToDisplay }, (_, index) =>
        addMonths(new Date(firstCalendarYear, 0, 1), index)
      ),
    [firstCalendarYear, monthsToDisplay]
  );

  React.useEffect(() => {
    if (!visible) {
      return;
    }

    setStartDate(initialStartDate);
    setEndDate(initialEndDate);
  }, [initialEndDate, initialStartDate, visible]);

  function scrollToCurrentMonth() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: monthOffsets.current[currentCalendarMonthIndex] ?? 0,
        animated: false,
      });
    });
  }

  function handleDatePress(dateKey: string) {
    if (!startDate || endDate) {
      setStartDate(dateKey);
      setEndDate(null);
      return;
    }

    if (dateKey < startDate) {
      setStartDate(dateKey);
      setEndDate(startDate);
      return;
    }

    setEndDate(dateKey);
  }

  const selectedRangeLabel = startDate
    ? endDate
      ? `${formatDate(startDate)} – ${formatDate(endDate)}`
      : `Start: ${formatDate(startDate)} · Choose an end date`
    : 'Choose a start date, then an end date';

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
      onShow={scrollToCurrentMonth}
    >
      <View style={modalStyles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close date range picker"
        />
        <View style={[modalStyles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={modalStyles.header}>
            <Text style={modalStyles.headerTitle}>Pick Date Range</Text>
            <TouchableOpacity
              disabled={!startDate || !endDate}
              onPress={() => {
                if (startDate && endDate) {
                  onApply(startDate, endDate);
                  onClose();
                }
              }}
              style={[
                modalStyles.doneButton,
                (!startDate || !endDate) && modalStyles.doneButtonDisabled,
              ]}
            >
              <Text style={modalStyles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
          <Text style={modalStyles.selectionHint}>{selectedRangeLabel}</Text>
          <View style={modalStyles.weekdayHeader}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <Text key={day} style={modalStyles.weekdayText}>
                {day}
              </Text>
            ))}
          </View>
          <ScrollView
            ref={scrollRef}
            style={modalStyles.calendarScroll}
            contentContainerStyle={modalStyles.calendarContent}
            showsVerticalScrollIndicator
          >
            {months.map((month, index) => {
              const monthKey = `${month.getFullYear()}-${month.getMonth()}`;
              const calendarWeeks = getCalendarWeeks(month);

              return (
                <View
                  key={monthKey}
                  onLayout={(event) => {
                    monthOffsets.current[index] = event.nativeEvent.layout.y;
                  }}
                >
                  <AvailabilityCalendar
                    calendarMonthLabel={getMonthLabel(month)}
                    calendarWeeks={calendarWeeks}
                    isCalendarDateDisabled={(date) =>
                      date.getDay() === 0 || date.getMonth() !== month.getMonth()
                    }
                    isCalendarDateSelected={(dateKey) =>
                      Boolean(
                        startDate &&
                          endDate &&
                          dateKey >= startDate &&
                          dateKey <= endDate
                      ) || dateKey === startDate
                    }
                    onCalendarDateSelect={handleDatePress}
                    onNextMonth={() => undefined}
                    onPrevMonth={() => undefined}
                    showMonthNavigation={false}
                    showWeekLabels={false}
                    selectedDateVariant="primary"
                  />
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(29, 27, 32, 0.48)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '90%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
  },
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 22,
  },
  headerTitle: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 17,
  },
  doneButton: {
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  doneButtonDisabled: {
    opacity: 0.42,
  },
  doneText: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 16,
  },
  selectionHint: {
    paddingHorizontal: 22,
    paddingBottom: 13,
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  weekdayHeader: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    backgroundColor: '#f1f7f1',
  },
  weekdayText: {
    width: '15%',
    textAlign: 'center',
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  calendarScroll: {
    flex: 1,
  },
  calendarContent: {
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 24,
  },
});

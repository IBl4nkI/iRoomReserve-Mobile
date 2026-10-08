import React from 'react';
import {
  Modal,
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AvailabilityCalendar from '@/components/AvailabilityCalendar';
import { colors, fonts } from '@/constants/theme';
import {
  addMonths,
  getCalendarWeeks,
  getMonthLabel,
} from '@/components/selection-room-search/helpers';

interface ReservationDateRangeModalProps {
  initialEndDate: string | null;
  initialStartDate: string | null;
  onApply: (startDate: string, endDate: string) => void;
  onClose: () => void;
  visible: boolean;
}

type CalendarMonthItem = {
  month: Date;
  weeks: ReturnType<typeof getCalendarWeeks>;
};

interface DateRangeCalendarMonthProps {
  item: CalendarMonthItem;
  isCurrentMonth: boolean;
  startDate: string | null;
  endDate: string | null;
  onDatePress: (dateKey: string) => void;
  onCurrentMonthLayout: () => void;
}

const DateRangeCalendarMonth = React.memo(function DateRangeCalendarMonth({
  item: { month, weeks },
  isCurrentMonth,
  startDate,
  endDate,
  onDatePress,
  onCurrentMonthLayout,
}: DateRangeCalendarMonthProps) {
  const isDateDisabled = React.useCallback(
    (date: Date) => date.getDay() === 0 || date.getMonth() !== month.getMonth(),
    [month],
  );
  const isDateSelected = React.useCallback(
    (dateKey: string) =>
      (Boolean(startDate && endDate && dateKey >= startDate && dateKey <= endDate)) ||
      dateKey === startDate,
    [endDate, startDate],
  );

  return (
    <View onLayout={isCurrentMonth ? onCurrentMonthLayout : undefined}>
      <AvailabilityCalendar
        calendarMonthLabel={getMonthLabel(month)}
        calendarWeeks={weeks}
        isCalendarDateDisabled={isDateDisabled}
        isCalendarDateSelected={isDateSelected}
        onCalendarDateSelect={onDatePress}
        onNextMonth={() => undefined}
        onPrevMonth={() => undefined}
        showMonthNavigation={false}
        showWeekLabels={false}
        hideOutsideMonthDays
        selectedDateVariant="primary"
      />
    </View>
  );
});

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
  const { width: screenWidth } = useWindowDimensions();
  const [startDate, setStartDate] = React.useState<string | null>(initialStartDate);
  const [endDate, setEndDate] = React.useState<string | null>(initialEndDate);
  const [calendarReady, setCalendarReady] = React.useState(false);
  const [selectingDate, setSelectingDate] = React.useState(false);
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
  const calendarMonths = React.useMemo(
    () =>
      months.map((month) => ({
        month,
        weeks: getCalendarWeeks(month).filter((week) =>
          week.some((entry) => entry.inMonth)
        ),
      })),
    [months]
  );
  const listRef = React.useRef<FlatList<(typeof calendarMonths)[number]>>(null);
  const monthLayouts = React.useMemo(() => {
    let offset = 12;
    const cellSize = (screenWidth - 50) * 0.15;

    return calendarMonths.map(({ weeks }) => {
      const length = 92 + weeks.length * (cellSize + 8);
      const layout = { length, offset };
      offset += length;
      return layout;
    });
  }, [calendarMonths, screenWidth]);

  React.useEffect(() => {
    if (!visible) {
      return;
    }

    setStartDate(initialStartDate);
    setEndDate(initialEndDate);
    setCalendarReady(false);
  }, [initialEndDate, initialStartDate, visible]);

  const scrollToCurrentMonth = React.useCallback(() => {
    setCalendarReady(false);
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({
        index: currentCalendarMonthIndex,
        animated: false,
      });
      requestAnimationFrame(() => setCalendarReady(true));
    });
  }, [currentCalendarMonthIndex]);

  const handleDatePress = React.useCallback((dateKey: string) => {
    setSelectingDate(true);
    requestAnimationFrame(() => {
      if (!startDate || endDate) {
        setStartDate(dateKey);
        setEndDate(null);
      } else if (dateKey < startDate) {
        setStartDate(dateKey);
        setEndDate(startDate);
      } else {
        setEndDate(dateKey);
      }

      requestAnimationFrame(() => setSelectingDate(false));
    });
  }, [endDate, startDate]);

  const handleCurrentMonthLayout = React.useCallback(() => setCalendarReady(true), []);
  const renderMonth = React.useCallback(
    ({ item, index }: { item: CalendarMonthItem; index: number }) => (
      <DateRangeCalendarMonth
        item={item}
        isCurrentMonth={index === currentCalendarMonthIndex}
        startDate={startDate}
        endDate={endDate}
        onDatePress={handleDatePress}
        onCurrentMonthLayout={handleCurrentMonthLayout}
      />
    ),
    [currentCalendarMonthIndex, endDate, handleCurrentMonthLayout, handleDatePress, startDate],
  );

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
          <FlatList
            ref={listRef}
            data={calendarMonths}
            keyExtractor={({ month }) => `${month.getFullYear()}-${month.getMonth()}`}
            initialScrollIndex={currentCalendarMonthIndex}
            getItemLayout={(_, index) => ({ ...monthLayouts[index], index })}
            initialNumToRender={1}
            maxToRenderPerBatch={1}
            updateCellsBatchingPeriod={75}
            windowSize={2}
            removeClippedSubviews
            style={modalStyles.calendarScroll}
            contentContainerStyle={modalStyles.calendarContent}
            showsVerticalScrollIndicator
            onScrollToIndexFailed={({ index }) => {
              requestAnimationFrame(() => listRef.current?.scrollToIndex({ index, animated: false }));
            }}
            renderItem={renderMonth}
          />
        </View>
        {!calendarReady || selectingDate ? (
          <View style={modalStyles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : null}
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
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
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

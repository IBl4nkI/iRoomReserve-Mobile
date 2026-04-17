import React from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { colors, fonts } from "@/constants/theme";

interface RoomSearchBarProps {
  filtersOpen: boolean;
  onQueryBlur?: () => void;
  onToggleFilters: () => void;
  onQueryFocus?: () => void;
  onQueryChange: (value: string) => void;
  query: string;
}

export default function RoomSearchBar({
  filtersOpen,
  onQueryBlur,
  onToggleFilters,
  onQueryFocus,
  onQueryChange,
  query,
}: RoomSearchBarProps) {
  return (
    <View style={styles.searchRow}>
      <View style={styles.searchInputWrap}>
        <View style={styles.searchIcon}>
          <View style={styles.searchIconCircle} />
          <View style={styles.searchIconHandle} />
        </View>
        <TextInput
          value={query}
          onChangeText={onQueryChange}
          onBlur={onQueryBlur}
          onFocus={onQueryFocus}
          placeholder="Search for a room"
          placeholderTextColor={colors.mutedText}
          style={styles.searchInput}
        />
      </View>
      <TouchableOpacity
        style={[styles.filterButton, filtersOpen && styles.filterButtonActive]}
        onPress={onToggleFilters}
      >
        <View style={styles.filterButtonContent}>
          <View style={styles.filterIcon}>
            <View
              style={[
                styles.filterIconLine,
                filtersOpen && styles.filterIconLineActive,
                styles.filterIconLineTop,
              ]}
            />
            <View
              style={[
                styles.filterIconLine,
                filtersOpen && styles.filterIconLineActive,
                styles.filterIconLineMiddle,
              ]}
            />
            <View
              style={[
                styles.filterIconLine,
                filtersOpen && styles.filterIconLineActive,
                styles.filterIconLineBottom,
              ]}
            />
          </View>
          <Text style={[styles.filterButtonText, filtersOpen && styles.filterButtonTextActive]}>
            Filters
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
  },
  searchIcon: {
    width: 18,
    height: 18,
    marginRight: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  searchIconCircle: {
    width: 10,
    height: 10,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.mutedText,
  },
  searchIconHandle: {
    position: "absolute",
    width: 7,
    height: 2,
    borderRadius: 999,
    backgroundColor: colors.mutedText,
    transform: [{ rotate: "45deg" }, { translateX: 5 }, { translateY: 5 }],
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 0,
    paddingVertical: 12,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 14,
  },
  filterButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  filterButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterIcon: {
    width: 14,
    height: 12,
    justifyContent: "space-between",
  },
  filterIconLine: {
    height: 2,
    borderRadius: 999,
    backgroundColor: colors.text,
  },
  filterIconLineActive: {
    backgroundColor: colors.white,
  },
  filterIconLineTop: {
    width: 14,
  },
  filterIconLineMiddle: {
    width: 10,
  },
  filterIconLineBottom: {
    width: 6,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterButtonText: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  filterButtonTextActive: {
    color: colors.white,
  },
});

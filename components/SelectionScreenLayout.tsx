import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSelectionFilters } from "@/components/SelectionFilterContext";
import SelectionRoomSearch from "@/components/selection-room-search";
import { colors, fonts } from "@/constants/theme";
import { formatExpandedFloorLabel } from "@/services/floors.service";

interface SelectionScreenLayoutProps {
  children: React.ReactNode;
  enableRoomSearch?: boolean;
  footer?: React.ReactNode;
  onBackPress?: () => void;
  roomSearchForceResultsVisible?: boolean;
  subtitle?: string;
  title: string;
}

export default function SelectionScreenLayout({
  children,
  enableRoomSearch = false,
  footer,
  onBackPress,
  roomSearchForceResultsVisible = false,
  subtitle,
  title,
}: SelectionScreenLayoutProps) {
  const insets = useSafeAreaInsets();
  const { getActiveFilterByLevel } = useSelectionFilters();
  const [searchInteractionActive, setSearchInteractionActive] = useState(false);
  const [searchHeaderVisible, setSearchHeaderVisible] = useState(false);
  const activeCampus = getActiveFilterByLevel("campus");
  const activeBuilding = getActiveFilterByLevel("building");
  const activeFloor = getActiveFilterByLevel("floor");
  const hasPersistedSelection = Boolean(activeCampus || activeBuilding || activeFloor);
  const useSearchContainer = searchInteractionActive || (enableRoomSearch && hasPersistedSelection);
  const searchResultsTitle =
    activeFloor
      ? `${activeBuilding?.label ?? (activeCampus?.id === "digi" ? "DC" : activeCampus?.label ?? "")} - ${formatExpandedFloorLabel(activeFloor.label)}`
      : "Available Rooms";
  const cardContent = (
    <View style={styles.card}>
      <>
        <Text style={styles.appName}>iRoomReserve</Text>
        <Text style={styles.title}>{searchHeaderVisible ? searchResultsTitle : title}</Text>
        {!searchHeaderVisible && subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </>

      <View style={styles.content}>{children}</View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.keyboardContainer}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.container,
          useSearchContainer ? styles.searchContainer : styles.centeredContainer,
          {
            paddingTop: Math.max(insets.top, useSearchContainer ? 64 : 16),
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        {onBackPress ? (
          <TouchableOpacity style={styles.backIconButton} onPress={onBackPress}>
            <Text style={styles.backIconText}>{"<"}</Text>
          </TouchableOpacity>
        ) : null}
        {enableRoomSearch ? (
          <SelectionRoomSearch
            forceResultsVisible={roomSearchForceResultsVisible}
            onHeaderVisibilityChange={setSearchHeaderVisible}
            onInteractionChange={setSearchInteractionActive}
            resultsFooter={footer}
            resultsTitle={searchResultsTitle}
          >
            {cardContent}
          </SelectionRoomSearch>
        ) : (
          cardContent
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    padding: 16,
    backgroundColor: colors.background,
  },
  centeredContainer: {
    justifyContent: "center",
  },
  searchContainer: {
    justifyContent: "flex-start",
  },
  backIconButton: {
    alignSelf: "flex-start",
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  backIconText: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 20,
    lineHeight: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  appName: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: colors.primary,
    textAlign: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    fontFamily: fonts.bold,
    color: colors.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.secondary,
    textAlign: "center",
    marginTop: 6,
  },
  content: {
    marginTop: 18,
  },
  footer: {
    marginTop: 8,
    marginBottom: 2,
    alignItems: "center",
  },
});

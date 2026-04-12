import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import SelectionRoomSearch from "@/components/SelectionRoomSearch";
import { colors, fonts } from "@/constants/theme";

interface SelectionScreenLayoutProps {
  children: React.ReactNode;
  enableRoomSearch?: boolean;
  footer?: React.ReactNode;
  onBackPress?: () => void;
  subtitle?: string;
  title: string;
}

export default function SelectionScreenLayout({
  children,
  enableRoomSearch = false,
  footer,
  onBackPress,
  subtitle,
  title,
}: SelectionScreenLayoutProps) {
  const cardContent = (
    <View style={styles.card}>
      <Text style={styles.appName}>iRoomReserve</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

      <View style={styles.content}>{children}</View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.container}
    >
      {onBackPress ? (
        <TouchableOpacity style={styles.backIconButton} onPress={onBackPress}>
          <Text style={styles.backIconText}>{"<"}</Text>
        </TouchableOpacity>
      ) : null}
      {enableRoomSearch ? <SelectionRoomSearch>{cardContent}</SelectionRoomSearch> : cardContent}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 16,
    backgroundColor: colors.background,
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
    marginTop: 12,
  },
});

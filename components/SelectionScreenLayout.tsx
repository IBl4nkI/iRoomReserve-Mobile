import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { colors, fonts } from "@/constants/theme";

interface SelectionScreenLayoutProps {
  children: React.ReactNode;
  onBackPress?: () => void;
  title: string;
  subtitle?: string;
}

export default function SelectionScreenLayout({
  children,
  onBackPress,
  title,
  subtitle,
}: SelectionScreenLayoutProps) {
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      {onBackPress ? (
        <TouchableOpacity style={styles.backIconButton} onPress={onBackPress}>
          <Text style={styles.backIconText}>{"<"}</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.header}>
        <Text style={styles.appName}>iRoomReserve</Text>
        <Text style={styles.schoolName}>St. Dominic College of Asia</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {children}
      </View>

      <Text style={styles.footer}>iRoomReserve v1.0 - SDCA Capstone Project</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
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
  header: {
    alignItems: "center",
    marginBottom: 16,
  },
  appName: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: colors.primary,
  },
  schoolName: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.secondary,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontSize: 24,
    fontFamily: fonts.bold,
    color: colors.text,
    textAlign: "center",
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.secondary,
    textAlign: "center",
    marginTop: -8,
    marginBottom: 20,
  },
  footer: {
    textAlign: "center",
    color: colors.secondary,
    fontSize: 11,
    paddingVertical: 16,
    fontFamily: fonts.regular,
  },
});

import React from "react";
import { Modal, StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "@/constants/theme";
import {
  subscribeToPresenceWarnings,
  type PresenceWarningState,
} from "@/services/presence-monitor.service";

export function PresenceMonitorProvider({
  children,
}: React.PropsWithChildren) {
  const [warning, setWarning] = React.useState<PresenceWarningState | null>(null);

  React.useEffect(() => {
    return subscribeToPresenceWarnings(setWarning);
  }, []);

  return (
    <>
      {children}
      <Modal
        animationType="fade"
        onRequestClose={() => undefined}
        presentationStyle="overFullScreen"
        transparent
        visible={warning !== null}
      >
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Text style={styles.eyebrow}>Reservation Signal Lost</Text>
            <Text style={styles.title}>Action needed to keep this room active</Text>
            <Text style={styles.message}>{warning?.message}</Text>
            <Text style={styles.helper}>
              This warning will stay on screen until Bluetooth is on and the room
              beacon is back in range.
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(17, 24, 39, 0.58)",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: "#fca5a5",
    borderRadius: 24,
    borderWidth: 1,
    maxWidth: 420,
    padding: 24,
    width: "100%",
  },
  eyebrow: {
    color: "#b91c1c",
    fontFamily: fonts.bold,
    fontSize: 12,
    letterSpacing: 0.8,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  helper: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  message: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 18,
    lineHeight: 26,
    marginBottom: 12,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 22,
    lineHeight: 30,
    marginBottom: 12,
  },
});

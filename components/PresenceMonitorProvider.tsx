import React from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { colors, fonts } from "@/constants/theme";
import {
  retryPresenceMonitoringCheck,
  subscribeToPresenceWarnings,
  type PresenceWarningState,
} from "@/services/presence-monitor.service";

export function PresenceMonitorProvider({
  children,
}: React.PropsWithChildren) {
  const [warning, setWarning] = React.useState<PresenceWarningState | null>(null);
  const [retrying, setRetrying] = React.useState(false);

  React.useEffect(() => {
    return subscribeToPresenceWarnings(setWarning);
  }, []);

  async function handleRetryConnection() {
    try {
      setRetrying(true);
      await retryPresenceMonitoringCheck();
    } catch (error) {
      console.warn("[presence-monitor] manual retry failed", error);
    } finally {
      setRetrying(false);
    }
  }

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
              This warning will stay on screen until Bluetooth is on,
              the room beacon is back in range,
              and Wi-Fi is connected to "St. Dominic College of Asia".
            </Text>
            <TouchableOpacity
              activeOpacity={0.9}
              disabled={retrying}
              onPress={handleRetryConnection}
              style={[styles.retryButton, retrying && styles.retryButtonDisabled]}
            >
              {retrying ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.retryButtonText}>Retry Connection</Text>
              )}
            </TouchableOpacity>
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
  retryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 14,
    marginTop: 18,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  retryButtonDisabled: {
    opacity: 0.75,
  },
  retryButtonText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 14,
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

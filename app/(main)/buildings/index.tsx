import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { colors, fonts } from "@/constants/theme";
import { getBuildingsByCampus } from "@/services/buildings.service";
import type { Building } from "@/types/reservation";

export default function BuildingsScreen() {
  const router = useRouter();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    getBuildingsByCampus("main")
      .then((result) => {
        if (active) {
          setBuildings(result);
          setError(null);
        }
      })
      .catch((caughtError) => {
        if (active) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Failed to load buildings."
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity style={styles.backIconButton} onPress={() => router.back()}>
        <Text style={styles.backIconText}>{"<"}</Text>
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.appName}>iRoomReserve</Text>
        <Text style={styles.title}>Select Building</Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.statusSpacing} />
        ) : error ? (
          <Text style={styles.statusText}>{error}</Text>
        ) : (
          buildings.map((building) => (
            <TouchableOpacity
              key={building.id}
              style={styles.optionButton}
              onPress={() => router.push(`/(main)/buildings/${building.id}`)}
            >
              <Text style={styles.optionLabel}>{building.name}</Text>
            </TouchableOpacity>
          ))
        )}

        <TouchableOpacity style={styles.linkButton} onPress={() => router.push("/(main)/dashboard")}>
          <Text style={styles.linkText}>Dashboard</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", padding: 16, backgroundColor: colors.background },
  backIconButton: { alignSelf: "flex-start", width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  backIconText: { color: colors.primary, fontFamily: fonts.bold, fontSize: 20, lineHeight: 20 },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: colors.border },
  appName: { fontSize: 20, fontFamily: fonts.bold, color: colors.primary, textAlign: "center", marginBottom: 4 },
  title: { fontSize: 16, fontFamily: fonts.regular, color: colors.text, textAlign: "center", marginBottom: 24 },
  statusSpacing: { marginVertical: 24 },
  statusText: { color: colors.secondary, fontFamily: fonts.regular, textAlign: "center", marginBottom: 20 },
  optionButton: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 20, alignItems: "center", marginBottom: 14 },
  optionLabel: { fontSize: 24, fontFamily: fonts.bold, color: colors.white },
  linkButton: { alignItems: "center", marginTop: 8 },
  linkText: { color: colors.primary, fontFamily: fonts.bold, fontSize: 13, textDecorationLine: "underline" },
});

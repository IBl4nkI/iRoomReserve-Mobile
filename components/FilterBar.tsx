import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import {
  type FilterLevel,
  type LevelOption,
  useSelectionFilters,
} from "@/components/SelectionFilterContext";
import { colors, fonts } from "@/constants/theme";
import { formatCompactFloorLabel } from "@/services/floors.service";

const LEVEL_DISPLAY_ORDER: FilterLevel[] = ["campus", "building", "floor"];
const NEXT_LEVEL_BY_LEVEL: Partial<Record<FilterLevel, FilterLevel>> = {
  campus: "building",
  building: "floor",
};

function getDisplayLabel(level: FilterLevel, label: string) {
  if (level === "floor") {
    return formatCompactFloorLabel(label);
  }

  return label;
}

interface FilterBarProps {
  defaultCampusId?: string | null;
  defaultSelections?: Partial<Record<FilterLevel, string>>;
  disableActivePress?: boolean;
  levelOptionsOverride?: Partial<Record<FilterLevel, LevelOption[]>>;
  navigateOnSelect?: boolean;
  onOptionPress?: (level: FilterLevel, id: string, selected: boolean) => void;
  selectedByLevelOverride?: Partial<Record<FilterLevel, string | null>>;
  showAllLevels?: boolean;
}

export default function FilterBar({
  defaultCampusId = null,
  defaultSelections,
  disableActivePress = false,
  levelOptionsOverride,
  navigateOnSelect = true,
  onOptionPress,
  selectedByLevelOverride,
  showAllLevels = false,
}: FilterBarProps) {
  const router = useRouter();
  const {
    filters,
    clearFiltersFrom,
    selectFilter,
    levelOptions,
    getActiveFilterByLevel,
  } = useSelectionFilters();
  const activeCampus = getActiveFilterByLevel("campus");
  const activeBuilding = getActiveFilterByLevel("building");
  const activeFloor = getActiveFilterByLevel("floor");
  const selectedByLevel: Partial<Record<FilterLevel, string | null>> = {
    campus: selectedByLevelOverride?.campus ?? activeCampus?.id ?? null,
    building: selectedByLevelOverride?.building ?? activeBuilding?.id ?? null,
    floor: selectedByLevelOverride?.floor ?? activeFloor?.id ?? null,
  };

  const grouped = LEVEL_DISPLAY_ORDER.reduce<
    {
      level: FilterLevel;
      items: { id: string; label: string; active: boolean }[];
    }[]
  >((result, level) => {
    const levelFilters = filters.filter((filter) => filter.level === level);
    const activeFilter = levelFilters.find((filter) => filter.active);
    const options = levelOptionsOverride?.[level] ?? levelOptions[level];
    const fallbackSelectionId =
      defaultSelections?.[level] ?? (level === "campus" ? defaultCampusId : null);
    const shouldShowCampusFallback = level === "campus" && !activeFilter && Boolean(defaultCampusId);
    const shouldShowLevel =
      showAllLevels
        ? options.length > 0 || Boolean(fallbackSelectionId)
        : Boolean(activeFilter) || shouldShowCampusFallback;

    if (!shouldShowLevel) {
      return result;
    }

    const filterMap = new Map(levelFilters.map((filter) => [filter.id, filter.active]));

    const items =
      options.length > 0
        ? options.map((option) => ({
            id: option.id,
            label: getDisplayLabel(level, option.label),
            active: filterMap.get(option.id) ?? false,
          }))
        : levelFilters.map((filter) => ({
            id: filter.id,
            label: getDisplayLabel(level, filter.label),
            active: filter.active,
          }));

    if (items.length > 0) {
      result.push({ level, items });
    }

    return result;
  }, []);

  if (grouped.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {grouped.map(({ level, items }) => (
        <View
          key={level}
          style={[
            styles.layerSection,
            styles.chipOnlySection,
            level === "campus" && styles.campusSection,
          ]}
        >
          <View
            style={[
              styles.optionGroup,
              level === "floor" && styles.floorOptionGroup,
            ]}
          >
            {items.map((item) => {
              const fallbackSelectionId =
                defaultSelections?.[level] ?? (level === "campus" ? defaultCampusId : null);
              const selected =
                item.id === selectedByLevel[level] ||
                (!selectedByLevel[level] && item.id === fallbackSelectionId);

              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (onOptionPress) {
                      onOptionPress(level, item.id, selected);
                      return;
                    }

                    if (selected) {
                      if (disableActivePress) {
                        return;
                      }

                      const nextLevel = NEXT_LEVEL_BY_LEVEL[level];

                      if (nextLevel) {
                        clearFiltersFrom(nextLevel);
                      }

                      if (!navigateOnSelect) {
                        return;
                      }

                      if (level === "campus") {
                        router.push(
                          item.id === "main" ? "/(main)/buildings" : "/(main)/floors/digital"
                        );
                        return;
                      }

                      if (level === "building") {
                        router.push({
                          pathname: "/(main)/buildings/[buildingId]",
                          params: { buildingId: item.id },
                        });
                      }

                      return;
                    }

                    selectFilter(level, item.id);

                    if (!navigateOnSelect) {
                      return;
                    }

                    if (level === "campus") {
                      router.push(
                        item.id === "main" ? "/(main)/buildings" : "/(main)/floors/digital"
                      );
                      return;
                    }

                    if (level === "building") {
                      router.push({
                        pathname: "/(main)/buildings/[buildingId]",
                        params: { buildingId: item.id },
                      });
                      return;
                    }

                    if (activeCampus?.id === "digi") {
                      router.push({
                        pathname: "/(main)/floors/digital/[floorId]",
                        params: { floorId: item.id },
                      });
                      return;
                    }

                    if (activeBuilding?.id) {
                      router.push({
                        pathname: "/(main)/floors/main/[floorId]",
                        params: {
                          floorId: item.id,
                          buildingId: activeBuilding.id,
                        },
                      });
                    }
                  }}
                  style={[
                    styles.radioChip,
                    level !== "floor" && styles.fullWidthRadioChip,
                    selected && styles.radioChipSelected,
                  ]}
                >
                  <View
                    style={[styles.radioOuter, selected && styles.radioOuterSelected]}
                  >
                    {selected ? <View style={styles.radioInner} /> : null}
                  </View>
                  <Text style={styles.radioText} numberOfLines={1}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 0,
    gap: 8,
  },
  layerSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  chipOnlySection: {
    gap: 0,
  },
  campusSection: {
    gap: 0,
  },
  optionGroup: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
  },
  floorOptionGroup: {
    flexWrap: "wrap",
    justifyContent: "center",
  },
  radioChip: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignSelf: "flex-start",
  },
  fullWidthRadioChip: {
    flex: 1,
    alignSelf: "auto",
  },
  radioChipSelected: {
    borderColor: "#e7aaaa",
    backgroundColor: "#fbf2f2",
  },
  radioOuter: {
    width: 16,
    height: 16,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: {
    borderColor: colors.primary,
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  radioText: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 12,
    flexShrink: 1,
  },
});

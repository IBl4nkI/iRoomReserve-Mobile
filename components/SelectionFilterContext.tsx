import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

export type FilterLevel = "campus" | "building" | "floor";

const LEVEL_ORDER: FilterLevel[] = ["campus", "building", "floor"];
const DEFAULT_LEVEL_OPTIONS: Record<FilterLevel, LevelOption[]> = {
  campus: [
    { id: "main", label: "Main Campus" },
    { id: "digi", label: "Digital Campus" },
  ],
  building: [],
  floor: [],
};

export interface SelectionFilter {
  level: FilterLevel;
  id: string;
  label: string;
  active: boolean;
}

export interface LevelOption {
  id: string;
  label: string;
}

interface SelectionFilterContextValue {
  filters: SelectionFilter[];
  pushFilter: (filter: Omit<SelectionFilter, "active">) => void;
  selectFilter: (level: FilterLevel, id: string) => void;
  toggleFilter: (id: string) => void;
  removeFilter: (id: string) => void;
  clearFiltersFrom: (level: FilterLevel) => void;
  clearAll: () => void;
  activeFilters: SelectionFilter[];
  getActiveFilterByLevel: (level: FilterLevel) => SelectionFilter | undefined;
  getFiltersByLevel: (level: FilterLevel) => SelectionFilter[];
  setLevelOptions: (level: FilterLevel, options: LevelOption[]) => void;
  levelOptions: Record<FilterLevel, LevelOption[]>;
}

const SelectionFilterContext = createContext<SelectionFilterContextValue | null>(null);

function getLevelIndex(level: FilterLevel) {
  return LEVEL_ORDER.indexOf(level);
}

export function SelectionFilterProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<SelectionFilter[]>([]);
  const [levelOptions, setLevelOptionsState] =
    useState<Record<FilterLevel, LevelOption[]>>(DEFAULT_LEVEL_OPTIONS);

  const setLevelOptions = useCallback(
    (level: FilterLevel, options: LevelOption[]) => {
      setLevelOptionsState((current) => {
        // Avoid unnecessary re-renders if the options haven't changed
        const existing = current[level];
        if (
          existing.length === options.length &&
          existing.every((o, i) => o.id === options[i].id && o.label === options[i].label)
        ) {
          return current;
        }
        return { ...current, [level]: options };
      });
    },
    []
  );

  const pushFilter = useCallback(
    (incoming: Omit<SelectionFilter, "active">) => {
      setFilters((current) => {
        const incomingLevelIndex = getLevelIndex(incoming.level);

        // Keep only upstream filters, then replace this level with the new selection.
        const kept = current.filter((f) => {
          const fLevelIndex = getLevelIndex(f.level);
          return fLevelIndex < incomingLevelIndex;
        });

        return [...kept, { ...incoming, active: true }];
      });
    },
    []
  );

  const selectFilter = useCallback(
    (level: FilterLevel, id: string) => {
      setFilters((current) => {
        const levelIndex = getLevelIndex(level);
        const option = levelOptions[level].find((entry) => entry.id === id);
        const existing = current.find((entry) => entry.level === level && entry.id === id);

        if (!option && !existing) {
          return current;
        }

        if (existing?.active) {
          return current;
        }

        const kept = current.filter((entry) => getLevelIndex(entry.level) < levelIndex);

        return [
          ...kept,
          {
            level,
            id,
            label: option?.label ?? existing?.label ?? id,
            active: true,
          },
        ];
      });
    },
    [levelOptions]
  );

  const toggleFilter = useCallback((id: string) => {
    setFilters((current) => {
      const target = current.find((f) => f.id === id);

      if (!target) {
        return current;
      }

      const newActive = !target.active;
      const targetLevelIndex = getLevelIndex(target.level);

      return current.map((f) => {
        if (f.id === id) {
          return { ...f, active: newActive };
        }

        // If deactivating, also deactivate downstream filters
        if (!newActive && getLevelIndex(f.level) > targetLevelIndex) {
          return { ...f, active: false };
        }

        return f;
      });
    });
  }, []);

  const removeFilter = useCallback((id: string) => {
    setFilters((current) => {
      const target = current.find((f) => f.id === id);

      if (!target) {
        return current;
      }

      const targetLevelIndex = getLevelIndex(target.level);

      // Remove target and all downstream filters
      return current.filter((f) => {
        if (f.id === id) {
          return false;
        }

        return getLevelIndex(f.level) <= targetLevelIndex;
      });
    });
  }, []);

  const clearFiltersFrom = useCallback((level: FilterLevel) => {
    const levelIndex = getLevelIndex(level);

    setFilters((current) =>
      current.filter((f) => getLevelIndex(f.level) < levelIndex)
    );

    // Also clear level options for this level and downstream
    setLevelOptionsState((current) => {
      const updated = { ...current };
      for (const l of LEVEL_ORDER) {
        if (getLevelIndex(l) >= levelIndex) {
          updated[l] = [];
        }
      }
      return updated;
    });
  }, []);

  const clearAll = useCallback(() => {
    setFilters([]);
    setLevelOptionsState(DEFAULT_LEVEL_OPTIONS);
  }, []);

  const activeFilters = useMemo(
    () => filters.filter((f) => f.active),
    [filters]
  );

  const getActiveFilterByLevel = useCallback(
    (level: FilterLevel) => activeFilters.find((f) => f.level === level),
    [activeFilters]
  );

  const getFiltersByLevel = useCallback(
    (level: FilterLevel) => filters.filter((f) => f.level === level),
    [filters]
  );

  const value = useMemo<SelectionFilterContextValue>(
    () => ({
      filters,
      pushFilter,
      selectFilter,
      toggleFilter,
      removeFilter,
      clearFiltersFrom,
      clearAll,
      activeFilters,
      getActiveFilterByLevel,
      getFiltersByLevel,
      setLevelOptions,
      levelOptions,
    }),
    [
      filters,
      pushFilter,
      selectFilter,
      toggleFilter,
      removeFilter,
      clearFiltersFrom,
      clearAll,
      activeFilters,
      getActiveFilterByLevel,
      getFiltersByLevel,
      setLevelOptions,
      levelOptions,
    ]
  );

  return (
    <SelectionFilterContext.Provider value={value}>
      {children}
    </SelectionFilterContext.Provider>
  );
}

export function useSelectionFilters() {
  const context = useContext(SelectionFilterContext);

  if (!context) {
    throw new Error(
      "useSelectionFilters must be used within a SelectionFilterProvider"
    );
  }

  return context;
}

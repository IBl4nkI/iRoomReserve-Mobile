import { Redirect } from "expo-router";

import { useSelectionFilters } from "@/components/SelectionFilterContext";

export default function ReserveNowScreen() {
  const { getActiveFilterByLevel } = useSelectionFilters();
  const activeCampus = getActiveFilterByLevel("campus");
  const activeBuilding = getActiveFilterByLevel("building");
  const activeFloor = getActiveFilterByLevel("floor");

  if (activeFloor?.id) {
    if (activeCampus?.id === "digi") {
      return (
        <Redirect
          href={{
            pathname: "/(main)/floors/digital/[floorId]",
            params: { floorId: activeFloor.id },
          }}
        />
      );
    }

    if (activeBuilding?.id) {
      return (
        <Redirect
          href={{
            pathname: "/(main)/floors/main/[floorId]",
            params: {
              floorId: activeFloor.id,
              buildingId: activeBuilding.id,
            },
          }}
        />
      );
    }
  }

  if (activeBuilding?.id) {
    return (
      <Redirect
        href={{
          pathname: "/(main)/buildings/[buildingId]",
          params: { buildingId: activeBuilding.id },
        }}
      />
    );
  }

  if (activeCampus?.id === "digi") {
    return <Redirect href="/(main)/floors/digital" />;
  }

  if (activeCampus?.id === "main") {
    return <Redirect href="/(main)/buildings" />;
  }

  return <Redirect href="/(main)/campus-select" />;
}

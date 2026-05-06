import { Slot } from 'expo-router';
import { SelectionFilterProvider } from '@/components/SelectionFilterContext';

export default function MainLayout() {
  return (
    <SelectionFilterProvider>
      <Slot />
    </SelectionFilterProvider>
  );
}
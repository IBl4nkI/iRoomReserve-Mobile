if (typeof globalThis.WeakRef === "undefined") {
  class WeakRefFallback<T extends object> {
    private readonly value: T;

    constructor(value: T) {
      this.value = value;
    }

    deref() {
      return this.value;
    }
  }

  Object.defineProperty(globalThis, "WeakRef", {
    configurable: true,
    value: WeakRefFallback,
    writable: true,
  });
}

import 'expo-router/entry';

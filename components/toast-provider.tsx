import { colors, fonts } from "@/constants/theme";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ToastVariant = "success" | "error";

type ToastState = {
  message: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  showToast: (message: string, variant?: ToastVariant) => void;
};

const TOAST_DURATION_MS = 2200;
const TOAST_ANIMATION_MS = 180;

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-24)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hideToast = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -24,
        duration: TOAST_ANIMATION_MS,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: TOAST_ANIMATION_MS,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setToast(null);
      }
    });
  }, [opacity, translateY]);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "success") => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setToast({ message, variant });
      translateY.setValue(-24);
      opacity.setValue(0);

      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: TOAST_ANIMATION_MS,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: TOAST_ANIMATION_MS,
          useNativeDriver: true,
        }),
      ]).start();

      timeoutRef.current = setTimeout(hideToast, TOAST_DURATION_MS);
    },
    [hideToast, opacity, translateY]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  const toastStyles =
    toast?.variant === "error"
      ? styles.errorToast
      : styles.successToast;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <View
          pointerEvents="none"
          style={[styles.overlay, { top: insets.top + 12 }]}
        >
          <Animated.View
            style={[
              styles.toast,
              toastStyles,
              {
                opacity,
                transform: [{ translateY }],
              },
            ]}
          >
            <Text style={styles.toastText}>{toast.message}</Text>
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }

  return context;
}

const styles = StyleSheet.create({
  overlay: {
    left: 16,
    position: "absolute",
    right: 16,
    zIndex: 999,
  },
  toast: {
    borderRadius: 14,
    borderWidth: 1,
    elevation: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  successToast: {
    backgroundColor: colors.successBackground,
    borderColor: colors.successBorder,
  },
  errorToast: {
    backgroundColor: colors.dangerBackground,
    borderColor: colors.dangerBorder,
  },
  toastText: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 13,
    textAlign: "center",
  },
});

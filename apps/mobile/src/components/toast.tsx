import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { c, font } from '@/lib/theme';

type Tone = 'success' | 'info' | 'error';
const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

/** In-app banner for payouts and errors (the demo relies on these instead of push). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ message: string; tone: Tone } | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (message: string, tone: Tone = 'info') => {
      setToast({ message, tone });
      if (timer.current) clearTimeout(timer.current);
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setToast(null));
      }, 3500);
    },
    [opacity],
  );

  const tone = toast?.tone === 'success' ? c.money : toast?.tone === 'error' ? c.danger : c.primary;
  const icon = toast?.tone === 'success' ? 'checkmark.circle.fill' : toast?.tone === 'error' ? 'exclamationmark.circle.fill' : 'info.circle.fill';
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <Animated.View pointerEvents="none" style={[styles.toast, { top: insets.top + 8, opacity, borderColor: `${tone}66` }]}>
          <SymbolView name={icon} tintColor={tone} size={20} />
          <Text style={styles.text}>{toast.message}</Text>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: c.surfaceRaised,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  text: { flex: 1, color: c.foreground, fontSize: 15, fontFamily: font.semibold },
});

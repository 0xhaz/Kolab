import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tap } from './ui';
import { c, font, radius } from '@/lib/theme';

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={styles.wrap}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (!on) tap();
              onChange(o.value);
            }}
            style={[styles.item, on && styles.on]}
          >
            <Text style={[styles.text, on && { color: c.foreground }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', backgroundColor: c.surface, borderRadius: radius.pill, padding: 4, borderWidth: 1, borderColor: c.border },
  item: { flex: 1, paddingVertical: 10, borderRadius: radius.pill, alignItems: 'center' },
  on: { backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.borderStrong },
  text: { color: c.muted, fontFamily: font.semibold, fontSize: 14 },
});

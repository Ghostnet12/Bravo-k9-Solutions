import React from 'react';
import { Pressable, StyleSheet, Text, View, type TextProps, type ViewStyle } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

export const colors = { bg: '#101010', card: '#1A1A19', gold: '#BA9A64', text: '#F5F1E9', muted: '#B4B1A9', line: '#33312C', soft: '#252119', danger: '#F3AAA2' };
export type IconName = React.ComponentProps<typeof Feather>['name'];
export function Icon({ name, size = 21, color = colors.gold }: { name: IconName; size?: number; color?: string }) {
  return <Feather name={name} size={size} color={color} accessible={false} />;
}
export function Copy({ style, ...props }: TextProps) { return <Text {...props} style={[styles.copy, style]} />; }
export function Heading({ children, small = false }: { children: React.ReactNode; small?: boolean }) {
  return <Text accessibilityRole="header" style={[styles.heading, small && { fontSize: 30 }]}>{children}</Text>;
}
export function Eyebrow({ children }: { children: React.ReactNode }) { return <Text style={styles.eyebrow}>{children}</Text>; }
export function Button({ label, onPress, icon = 'arrow-up-right', secondary = false, disabled = false }: {
  label: string; onPress: () => void; icon?: IconName; secondary?: boolean; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, secondary && styles.secondary, { opacity: disabled ? 0.45 : pressed ? 0.75 : 1 }]}>
    <Text style={[styles.buttonLabel, secondary && { color: colors.text }]}>{label}</Text><Icon name={icon} size={19} color={secondary ? colors.gold : colors.bg} />
  </Pressable>;
}
export function IconButton({ name, label, onPress, disabled }: { name: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{ disabled }} onPress={onPress}
    style={({ pressed }) => [styles.iconButton, { opacity: disabled ? 0.35 : pressed ? 0.65 : 1 }]}><Icon name={name} /></Pressable>;
}
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) { return <View style={[styles.card, style]}>{children}</View>; }
export function ActionRow({ icon, title, detail, onPress }: { icon: IconName; title: string; detail: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${detail}`} onPress={onPress} style={({ pressed }) => [styles.actionRow, { opacity: pressed ? 0.6 : 1 }]}>
    <View style={styles.actionIcon}><Icon name={icon} /></View><View style={{ flex: 1, gap: 5 }}><Copy style={styles.strong}>{title}</Copy><Copy style={styles.small}>{detail}</Copy></View><Icon name="chevron-right" size={18} color={colors.muted} />
  </Pressable>;
}
export const styles = StyleSheet.create({
  copy: { fontFamily: 'Montserrat', color: colors.text, fontSize: 14, lineHeight: 22 },
  small: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  strong: { fontFamily: 'MontserratSemi', fontSize: 14 },
  heading: { fontFamily: 'Bebas', color: colors.text, fontSize: 42, lineHeight: 46, letterSpacing: 0.6 },
  eyebrow: { fontFamily: 'MontserratSemi', color: colors.gold, fontSize: 10, letterSpacing: 2, lineHeight: 18 },
  button: { backgroundColor: colors.gold, minHeight: 52, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  buttonLabel: { fontFamily: 'MontserratSemi', color: colors.bg, fontSize: 13, flexShrink: 1 },
  secondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  iconButton: { minWidth: 46, minHeight: 46, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, padding: 20, borderRadius: 18, gap: 13 },
  actionRow: { flexDirection: 'row', gap: 14, alignItems: 'center', paddingVertical: 17, borderBottomWidth: 1, borderBottomColor: colors.line, minHeight: 76 },
  actionIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  input: { backgroundColor: '#111110', borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 14, color: colors.text, fontFamily: 'Montserrat', fontSize: 14, minHeight: 50 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  page: { padding: 22, paddingBottom: 32, gap: 24 },
  error: { color: colors.danger, fontFamily: 'Montserrat', fontSize: 13, lineHeight: 21 },
});

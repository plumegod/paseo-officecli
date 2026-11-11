import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";

export function ActionButton({ theme, label, hint, icon, onPress, disabled = false, primary = false, selected }: {
  theme: PluginSurfaceProps["theme"];
  label: string;
  hint?: string;
  icon?: string;
  onPress(): void;
  disabled?: boolean;
  primary?: boolean;
  selected?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const colors = theme.colors;
  const color = primary ? colors.accentForeground : colors.foreground;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} accessibilityState={{ disabled, selected }} aria-pressed={selected} disabled={disabled}
      onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={({ pressed }) => ({
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 32,
        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1,
        borderColor: selected ? colors.foregroundMuted : colors.border,
        backgroundColor: primary ? colors.accent : colors.surface2,
        opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        boxShadow: focused ? `0 0 0 2px ${colors.surface0}, 0 0 0 4px ${colors.accent}` : undefined,
      })}>
      {icon && <Icon name={icon} size={14} color={color} />}
      <Text style={{ color, fontSize: 12, fontWeight: primary || selected ? "600" : "400", flexShrink: 1 }}>{label}</Text>
    </Pressable>
  );
}

export function Disclosure({ theme, title, summary, open, onToggle, children }: {
  theme: PluginSurfaceProps["theme"];
  title: string;
  summary?: string;
  open: boolean;
  onToggle(): void;
  children: ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const colors = theme.colors;
  return (
    <View style={{ minWidth: 0 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded: open }} aria-expanded={open} onPress={onToggle}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, minHeight: 52, borderWidth: 1, borderColor: focused ? colors.accent : "transparent", borderRadius: 6 }}>
        <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "500", flex: 1, minWidth: 0 }}>{title}</Text>
        {!!summary && <Text style={{ color: colors.foregroundMuted, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>{summary}</Text>}
        <Icon name={open ? "ChevronDown" : "ChevronRight"} size={16} color={colors.foregroundMuted} />
      </Pressable>
      {open && <View style={{ padding: 16, gap: 12, minWidth: 0, backgroundColor: colors.surface0 }}>{children}</View>}
    </View>
  );
}

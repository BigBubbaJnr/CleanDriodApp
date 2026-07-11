/**
 * Live terminal-style scrolling log box.
 * Auto-scrolls to bottom when lines change.
 * Single source of truth — shared by JunkCleaner and StorageIntel.
 */
import React, { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface TerminalLogProps {
  lines: string[];
  maxHeight?: number;
}

export default function TerminalLog({ lines, maxHeight = 140 }: TerminalLogProps) {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(timer);
  }, [lines.length]);

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.box, { backgroundColor: colors.muted, borderColor: colors.border, maxHeight }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {lines.map((line, i) => (
        <Text key={i} style={[styles.line, { color: colors.mutedForeground }]}>
          {line}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1 },
  content: { padding: 10, gap: 3 },
  line: { fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 0.3 },
});

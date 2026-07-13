/**
 * ConfirmDeleteSheet — modal confirmation before any deletion in CleanDroid.
 *
 * Shows:
 *   • number of files to be deleted
 *   • storage that will be recovered
 *   • category being cleaned
 *   • irreversibility warning
 *   • Safe Mode badge when active
 *
 * Must be shown before EVERY delete operation. Never allow single-press deletion.
 */
import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useBevel } from '@/hooks/useBevel';
import { formatBytes } from '@/utils/format';

interface Props {
  visible: boolean;
  /** e.g. "Duplicate Photos", "Junk Files", "Large Videos" */
  category: string;
  fileCount: number;
  totalBytes: number;
  /** Show a spinner on the Delete button while working */
  loading?: boolean;
  /** When true: badge shows [SAFE MODE] and Delete button says SIMULATE */
  safeMode?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ConfirmDeleteSheet({
  visible,
  category,
  fileCount,
  totalBytes,
  loading = false,
  safeMode = false,
  onCancel,
  onConfirm,
}: Props) {
  const colors = useColors();
  const bevel = useBevel();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <Pressable
        style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.82)' }]}
        onPress={loading ? undefined : onCancel}
        accessibilityLabel="Dismiss confirmation"
      >
        {/* Stop touch propagation so tapping the card doesn't dismiss */}
        <Pressable onPress={() => {}} style={styles.cardWrapper}>
          <View style={[styles.card, bevel, { backgroundColor: colors.card }]}>

            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.destructive + '40' }]}>
              <Feather name="alert-triangle" size={14} color={colors.destructive} />
              <Text style={[styles.headerText, { color: colors.destructive }]}>
                {'CONFIRM DELETION'}
              </Text>
              {safeMode && (
                <View style={[styles.safeBadge, { backgroundColor: colors.warning + '20', borderColor: colors.warning + '60' }]}>
                  <Text style={[styles.safeBadgeText, { color: colors.warning }]}>SAFE MODE</Text>
                </View>
              )}
            </View>

            {/* What will be deleted */}
            <View style={styles.body}>
              <Text style={[styles.question, { color: colors.foreground }]}>
                {safeMode
                  ? `Simulate deleting ${fileCount} ${fileCount === 1 ? 'file' : 'files'}?`
                  : `Delete ${fileCount} ${fileCount === 1 ? 'file' : 'files'}?`}
              </Text>

              <View style={[styles.statsRow, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                <View style={styles.statItem}>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>CATEGORY</Text>
                  <Text style={[styles.statValue, { color: colors.foreground }]}>{category}</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                <View style={styles.statItem}>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>RECOVERED</Text>
                  <Text style={[styles.statValue, { color: colors.success }]}>
                    {totalBytes > 0 ? formatBytes(totalBytes) : '—'}
                  </Text>
                </View>
              </View>

              {safeMode ? (
                <Text style={[styles.warningText, { color: colors.warning }]}>
                  {'[SAFE MODE] No files will actually be deleted. The app will simulate the operation and generate a report.'}
                </Text>
              ) : (
                <Text style={[styles.warningText, { color: colors.mutedForeground }]}>
                  {'This action cannot be undone. Deleted files cannot be recovered from CleanDroid.'}
                </Text>
              )}
            </View>

            {/* Buttons */}
            <View style={[styles.buttons, { borderTopColor: colors.border }]}>
              <Pressable
                onPress={loading ? undefined : onCancel}
                style={[styles.cancelBtn, bevel, { backgroundColor: colors.muted, opacity: loading ? 0.4 : 1 }]}
                accessibilityLabel="Cancel deletion"
                accessibilityRole="button"
              >
                <Text style={[styles.cancelText, { color: colors.foreground }]}>CANCEL</Text>
              </Pressable>

              <Pressable
                onPress={loading ? undefined : onConfirm}
                style={[
                  styles.confirmBtn,
                  {
                    backgroundColor: safeMode ? colors.warning : colors.destructive,
                    borderTopColor: colors.bevelLight,
                    borderLeftColor: colors.bevelLight,
                    borderBottomColor: colors.bevelDark,
                    borderRightColor: colors.bevelDark,
                    opacity: loading ? 0.7 : 1,
                  },
                ]}
                accessibilityLabel={safeMode ? 'Simulate deletion' : 'Confirm deletion'}
                accessibilityRole="button"
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <>
                    <Feather name={safeMode ? 'play' : 'trash-2'} size={13} color="#000" />
                    <Text style={styles.confirmText}>
                      {safeMode ? 'SIMULATE' : 'DELETE'}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>

          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  cardWrapper: { width: '100%', maxWidth: 380 },
  card: {
    borderTopWidth: 2, borderLeftWidth: 2,
    borderBottomWidth: 2, borderRightWidth: 2,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerText: {
    flex: 1,
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 2,
  },
  safeBadge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  safeBadgeText: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1.5,
  },
  body: { padding: 20, gap: 16 },
  question: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.3,
    lineHeight: 24,
  },
  statsRow: {
    flexDirection: 'row',
    borderWidth: 1,
    overflow: 'hidden',
  },
  statItem: { flex: 1, padding: 12, gap: 4 },
  statDivider: { width: 1 },
  statLabel: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 2 },
  statValue: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  warningText: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    lineHeight: 17,
    letterSpacing: 0.2,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 2, borderLeftWidth: 2,
    borderBottomWidth: 2, borderRightWidth: 2,
  },
  cancelText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 2,
  },
  confirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderTopWidth: 2, borderLeftWidth: 2,
    borderBottomWidth: 2, borderRightWidth: 2,
  },
  confirmText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 2,
    color: '#000',
  },
});

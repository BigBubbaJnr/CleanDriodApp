/**
 * In-app Privacy Policy screen.
 * All data handling is on-device only — this screen explains exactly what
 * the app accesses and why, in plain language.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useBevel } from '@/hooks/useBevel';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Section {
  title: string;
  body: string;
}

const SECTIONS: Section[] = [
  {
    title: 'WHO WE ARE',
    body: 'CleanDroid is a free, open-source Android storage utility. There is no company, server, or account system behind it — it is a standalone app that runs entirely on your device.',
  },
  {
    title: 'WHAT WE ACCESS',
    body: 'CleanDroid requests access to your device\'s media library (photos, videos, and audio files) to find duplicates, large files, and screenshots. It also reads your device\'s storage statistics (total space, free space, cache size) to show the storage overview on the home screen.\n\nAll access is on-demand — the app only reads your files when you tap a scan button.',
  },
  {
    title: 'WHAT WE DO NOT DO',
    body: '• We do not upload any files, filenames, sizes, or metadata to any server.\n• We do not use advertising networks or analytics SDKs.\n• We do not track your behaviour across sessions.\n• We do not collect any personally identifiable information.\n• We do not require an account or login.',
  },
  {
    title: 'DELETION',
    body: 'When you delete files through CleanDroid, the operation is performed locally using Android\'s standard MediaLibrary API. Deleted files go through Android\'s standard deletion process (they may be recoverable from the system recycle bin for a period of time, depending on your Android version).\n\nCleanDroid never deletes anything without your explicit confirmation.',
  },
  {
    title: 'NOTIFICATIONS',
    body: 'If you enable the schedule feature, CleanDroid requests notification permission to send you a local reminder at your chosen interval (daily, weekly, or monthly). These notifications are generated on-device — no network request is made. You can disable them at any time from the Schedule tab or your device\'s notification settings.',
  },
  {
    title: 'LOCAL STORAGE',
    body: 'CleanDroid stores the following data locally on your device using Android\'s AsyncStorage:\n• Your cleaning history (dates and bytes freed, no filenames)\n• Your schedule preference\n• The scan journal\n• Fingerprint cache for duplicate detection (file hashes only — no content)\n\nThis data never leaves your device and is deleted when you uninstall the app.',
  },
  {
    title: 'PERMISSIONS',
    body: 'READ_MEDIA_IMAGES, READ_MEDIA_VIDEO — required to scan your photo and video library for duplicates and large files.\n\nREAD_EXTERNAL_STORAGE (Android 12 and below) — equivalent legacy permission for media access.\n\nPOST_NOTIFICATIONS (Android 13+) — required only if you enable the schedule feature.\n\nNo other permissions are requested.',
  },
  {
    title: 'OPEN SOURCE',
    body: 'CleanDroid\'s source code is publicly available. You can audit exactly what the app does at any time. If you find a privacy concern, please report it via the feedback channel in Settings.',
  },
  {
    title: 'CHANGES TO THIS POLICY',
    body: 'If this policy changes in a meaningful way, the change will be noted in the app\'s release notes. The current policy always reflects what the installed version of the app actually does.',
  },
  {
    title: 'CONTACT',
    body: 'Questions about this policy? Use the "Send Feedback" option in Settings. We read every message.',
  },
];

export default function PrivacyPolicyScreen() {
  const colors = useColors();
  const bevel = useBevel();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, {
        paddingTop: insets.top + 12,
        backgroundColor: colors.background,
        borderBottomColor: colors.primary + '40',
      }]}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backBtn, bevel, { backgroundColor: colors.card }]}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Feather name="arrow-left" size={16} color={colors.foreground} />
        </Pressable>
        <View>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>{'> LEGAL'}</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>PRIVACY POLICY</Text>
        </View>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Effective date */}
        <View style={[styles.dateBox, { borderColor: colors.primary + '40', backgroundColor: colors.primary + '07' }]}>
          <Text style={[styles.dateLabel, { color: colors.mutedForeground }]}>EFFECTIVE DATE</Text>
          <Text style={[styles.dateValue, { color: colors.primary }]}>{'> '} JULY 2025</Text>
        </View>

        {/* One-liner pledge */}
        <View style={[styles.pledgeBox, bevel, { backgroundColor: colors.card }]}>
          <Feather name="shield" size={14} color={colors.success} />
          <Text style={[styles.pledgeText, { color: colors.foreground }]}>
            {'Your data never leaves your device. No exceptions.'}
          </Text>
        </View>

        {/* Policy sections */}
        {SECTIONS.map((s, i) => (
          <View key={s.title} style={[
            styles.section, bevel,
            { backgroundColor: colors.card },
          ]}>
            <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sectionNum, { color: colors.primary }]}>
                {String(i + 1).padStart(2, '0')}
              </Text>
              <Text style={[styles.sectionTitle, { color: colors.primary }]}>{s.title}</Text>
            </View>
            <Text style={[styles.sectionBody, { color: colors.mutedForeground }]}>{s.body}</Text>
          </View>
        ))}

        <Text style={[styles.footer, { color: colors.mutedForeground + '80' }]}>
          {'CleanDroid — Open Source · No Ads · No Tracking'}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerSub: { fontSize: 9, fontFamily: 'Inter_400Regular', letterSpacing: 2 },
  headerTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  content: { padding: 16, gap: 10 },
  dateBox: { borderWidth: 1, padding: 12, gap: 3, marginBottom: 2 },
  dateLabel: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 2 },
  dateValue: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  pledgeBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14,
    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
  },
  pledgeText: { flex: 1, fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  section: {
    borderTopWidth: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderRightWidth: 2,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1,
  },
  sectionNum: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1, width: 24 },
  sectionTitle: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  sectionBody: {
    padding: 14, fontSize: 11, fontFamily: 'Inter_400Regular',
    lineHeight: 18, letterSpacing: 0.2,
  },
  footer: {
    textAlign: 'center', fontSize: 10, fontFamily: 'Inter_400Regular',
    letterSpacing: 1, marginTop: 8,
  },
});

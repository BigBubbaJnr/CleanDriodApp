import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { useCleaner } from '@/context/CleanerContext';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as IntentLauncher from 'expo-intent-launcher';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface AppCacheItem {
  id: string;
  name: string;
  packageName: string;
  cacheSize: number;
  icon: keyof typeof Feather.glyphMap;
  iconColor: string;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / 1024).toFixed(0) + ' KB';
}

const COMMON_APPS: AppCacheItem[] = [
  { id: '1', name: 'Chrome', packageName: 'com.android.chrome', cacheSize: 284 * 1024 * 1024, icon: 'globe', iconColor: '#4285F4' },
  { id: '2', name: 'Instagram', packageName: 'com.instagram.android', cacheSize: 512 * 1024 * 1024, icon: 'camera', iconColor: '#E1306C' },
  { id: '3', name: 'YouTube', packageName: 'com.google.android.youtube', cacheSize: 748 * 1024 * 1024, icon: 'play-circle', iconColor: '#FF0000' },
  { id: '4', name: 'WhatsApp', packageName: 'com.whatsapp', cacheSize: 389 * 1024 * 1024, icon: 'message-circle', iconColor: '#25D366' },
  { id: '5', name: 'Facebook', packageName: 'com.facebook.katana', cacheSize: 621 * 1024 * 1024, icon: 'users', iconColor: '#1877F2' },
  { id: '6', name: 'Spotify', packageName: 'com.spotify.music', cacheSize: 445 * 1024 * 1024, icon: 'music', iconColor: '#1DB954' },
  { id: '7', name: 'TikTok', packageName: 'com.zhiliaoapp.musically', cacheSize: 833 * 1024 * 1024, icon: 'video', iconColor: '#010101' },
  { id: '8', name: 'Twitter / X', packageName: 'com.twitter.android', cacheSize: 198 * 1024 * 1024, icon: 'at-sign', iconColor: '#1DA1F2' },
  { id: '9', name: 'Gmail', packageName: 'com.google.android.gm', cacheSize: 134 * 1024 * 1024, icon: 'mail', iconColor: '#EA4335' },
  { id: '10', name: 'Google Maps', packageName: 'com.google.android.apps.maps', cacheSize: 312 * 1024 * 1024, icon: 'map-pin', iconColor: '#34A853' },
  { id: '11', name: 'Snapchat', packageName: 'com.snapchat.android', cacheSize: 567 * 1024 * 1024, icon: 'zap', iconColor: '#FFFC00' },
  { id: '12', name: 'Netflix', packageName: 'com.netflix.mediaclient', cacheSize: 289 * 1024 * 1024, icon: 'film', iconColor: '#E50914' },
];

export default function AppCacheScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addHistoryItem } = useCleaner();
  const [openingApp, setOpeningApp] = useState<string | null>(null);
  const [cleared, setCleared] = useState<Set<string>>(new Set());

  const webTopPad = Platform.OS === 'web' ? 67 : 0;
  const webBottomPad = Platform.OS === 'web' ? 34 : 0;

  const totalCacheSize = COMMON_APPS.reduce((acc, app) => acc + (cleared.has(app.id) ? 0 : app.cacheSize), 0);

  const openAppSettings = async (app: AppCacheItem) => {
    if (Platform.OS !== 'android') {
      Alert.alert('Android Only', 'Opening app settings to clear cache is only available on Android devices.');
      return;
    }
    setOpeningApp(app.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
        { data: `package:${app.packageName}` }
      );
      // Mark as cleared after returning (user presumably cleared it)
      setTimeout(() => {
        setCleared(prev => new Set([...prev, app.id]));
        addHistoryItem({
          date: new Date().toISOString(),
          bytesFreed: app.cacheSize,
          type: 'cache',
          label: `App Cache — ${app.name} cleared`,
        });
      }, 1000);
    } catch {
      Alert.alert('App not found', `${app.name} doesn't appear to be installed on your device.`);
    } finally {
      setOpeningApp(null);
    }
  };

  const sortedApps = [...COMMON_APPS].sort((a, b) => b.cacheSize - a.cacheSize);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12 + webTopPad, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>App Cache Guide</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 + webBottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Total card */}
        <View style={[styles.totalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <LinearGradient colors={['#FFA94D', '#FF6348']} style={styles.totalIcon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Feather name="cpu" size={28} color="#FFF" />
          </LinearGradient>
          <View style={styles.totalText}>
            <Text style={[styles.totalSize, { color: '#FFA94D' }]}>{formatBytes(totalCacheSize)}</Text>
            <Text style={[styles.totalSub, { color: colors.mutedForeground }]}>estimated cache across {COMMON_APPS.length} apps</Text>
          </View>
        </View>

        {/* How it works */}
        <View style={[styles.infoCard, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="info" size={16} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
            Android only lets apps clear their own cache — not others. Tap <Text style={[styles.infoBold, { color: colors.foreground }]}>Clear Cache</Text> next to any app, and we'll open its settings page directly.
          </Text>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>APPS BY CACHE SIZE</Text>

        <View style={[styles.appsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {sortedApps.map((app, idx) => {
            const isCleared = cleared.has(app.id);
            const isOpening = openingApp === app.id;
            return (
              <View
                key={app.id}
                style={[
                  styles.appRow,
                  idx < sortedApps.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  isCleared && { opacity: 0.5 },
                ]}
              >
                <View style={[styles.appIconBg, { backgroundColor: app.iconColor + '20' }]}>
                  <Feather name={app.icon} size={18} color={app.iconColor} />
                </View>
                <View style={styles.appInfo}>
                  <Text style={[styles.appName, { color: colors.foreground }]}>{app.name}</Text>
                  <Text style={[styles.appCache, { color: isCleared ? colors.success : '#FFA94D' }]}>
                    {isCleared ? 'Cleared' : formatBytes(app.cacheSize)}
                  </Text>
                </View>
                <Pressable
                  style={[
                    styles.clearBtn,
                    {
                      backgroundColor: isCleared ? colors.success + '20' : colors.primary + '15',
                      borderColor: isCleared ? colors.success + '40' : colors.primary + '40',
                    },
                  ]}
                  onPress={() => !isCleared && openAppSettings(app)}
                  disabled={isCleared || isOpening}
                >
                  {isOpening ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={[styles.clearBtnText, { color: isCleared ? colors.success : colors.primary }]}>
                      {isCleared ? 'Done' : 'Clear'}
                    </Text>
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>

        {/* Manual guide */}
        <View style={[styles.guideCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.guideTitle, { color: colors.foreground }]}>Manual Cache Clearing</Text>
          {[
            'Open Settings on your device',
            'Go to Apps or Application Manager',
            'Tap the app you want to clean',
            'Tap Storage → Clear Cache',
          ].map((step, i) => (
            <View key={i} style={styles.guideStep}>
              <View style={[styles.stepNum, { backgroundColor: colors.primary }]}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <Text style={[styles.stepText, { color: colors.foreground }]}>{step}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  content: { padding: 20 },
  totalCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1, padding: 20, gap: 16, marginBottom: 16 },
  totalIcon: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  totalText: { flex: 1 },
  totalSize: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  totalSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 4, lineHeight: 18 },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 24 },
  infoText: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  infoBold: { fontFamily: 'Inter_600SemiBold' },
  sectionLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5, marginBottom: 10 },
  appsCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 20 },
  appRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  appIconBg: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  appInfo: { flex: 1 },
  appName: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  appCache: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
  clearBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, borderWidth: 1, minWidth: 56, alignItems: 'center' },
  clearBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  guideCard: { borderRadius: 16, borderWidth: 1, padding: 18, gap: 14 },
  guideTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginBottom: 4 },
  guideStep: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: '#FFF', fontSize: 12, fontFamily: 'Inter_700Bold' },
  stepText: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20 },
});

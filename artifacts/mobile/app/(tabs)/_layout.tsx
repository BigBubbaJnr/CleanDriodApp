import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="clean">
        <Icon sf={{ default: 'sparkles', selected: 'sparkles' }} />
        <Label>Clean</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="schedule">
        <Icon sf={{ default: 'clock', selected: 'clock.fill' }} />
        <Label>Schedule</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} />
        <Label>Settings</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function RetroTabBar({
  state,
  descriptors,
  navigation,
}: {
  state: any;
  descriptors: any;
  navigation: any;
}) {
  const colors = useColors();
  const tabs = [
    { name: 'index', label: 'HOME', icon: 'home' as const },
    { name: 'clean', label: 'CLEAN', icon: 'zap' as const },
    { name: 'schedule', label: 'SCHED', icon: 'clock' as const },
    { name: 'settings', label: 'SYS', icon: 'settings' as const },
  ];

  return (
    <View style={[styles.tabBar, {
      backgroundColor: colors.background,
      borderTopColor: colors.primary + '60',
    }]}>
      {/* Scanline accent on top edge */}
      <View style={[styles.tabAccentLine, { backgroundColor: colors.primary }]} />
      <View style={styles.tabRow}>
        {tabs.map((tab, idx) => {
          const focused = state.index === idx;
          return (
            <View key={tab.name} style={styles.tabItem}>
              {/* Active indicator — retro top bracket */}
              {focused && (
                <View style={[styles.activeIndicator, { backgroundColor: colors.primary }]} />
              )}
              <Feather
                name={tab.icon}
                size={18}
                color={focused ? colors.primary : colors.mutedForeground}
                onPress={() => {
                  const event = navigation.emit({ type: 'tabPress', target: state.routes[idx].key, canPreventDefault: true });
                  if (!event.defaultPrevented) navigation.navigate(state.routes[idx].name);
                }}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const isWeb = Platform.OS === 'web';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopWidth: 1,
          borderTopColor: colors.primary + '40',
          elevation: 0,
          height: isWeb ? 84 : 60,
        },
        tabBarLabelStyle: {
          fontSize: 9,
          fontFamily: 'Inter_700Bold',
          letterSpacing: 1.5,
          marginBottom: isWeb ? 0 : 4,
        },
      }}
      tabBar={props => <RetroTabBar {...props} />}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'HOME',
          tabBarIcon: ({ color }) =>
            Platform.OS === 'ios'
              ? <SymbolView name="house" tintColor={color} size={22} />
              : <Feather name="home" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="clean"
        options={{
          title: 'CLEAN',
          tabBarIcon: ({ color }) =>
            Platform.OS === 'ios'
              ? <SymbolView name="sparkles" tintColor={color} size={22} />
              : <Feather name="zap" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'SCHED',
          tabBarIcon: ({ color }) =>
            Platform.OS === 'ios'
              ? <SymbolView name="clock" tintColor={color} size={22} />
              : <Feather name="clock" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'SYS',
          tabBarIcon: ({ color }) =>
            Platform.OS === 'ios'
              ? <SymbolView name="gearshape" tintColor={color} size={22} />
              : <Feather name="settings" size={20} color={color} />,
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) return <NativeTabLayout />;
  return <ClassicTabLayout />;
}

const styles = StyleSheet.create({
  tabBar: {
    borderTopWidth: 1,
    paddingBottom: 0,
  },
  tabAccentLine: {
    height: 1,
    width: '100%',
    opacity: 0.6,
  },
  tabRow: {
    flexDirection: 'row',
    height: 56,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    paddingTop: 4,
  },
  activeIndicator: {
    position: 'absolute',
    top: 0,
    left: '20%',
    right: '20%',
    height: 2,
  },
});

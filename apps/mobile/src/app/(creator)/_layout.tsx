import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { c } from '@/lib/theme';

/** Native iOS tab bar: Liquid Glass on iOS 26, minimises while scrolling. */
export default function CreatorTabs() {
  return (
    <NativeTabs minimizeBehavior="onScrollDown" tintColor={c.primary}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="campaigns">
        <NativeTabs.Trigger.Label>Discover</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'sparkle.magnifyingglass', selected: 'sparkle.magnifyingglass' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="earnings">
        <NativeTabs.Trigger.Label>Earnings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

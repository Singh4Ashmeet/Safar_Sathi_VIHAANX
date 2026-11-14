export type FeatureFlag = 'relay' | 'ride' | 'fakecall' | 'demo';

const rawFlags = (process.env.EXPO_PUBLIC_FEATURES ?? 'relay,ride,fakecall,demo')
  .split(',')
  .map((s: string) => s.trim().toLowerCase())
  .filter(Boolean);

const enabledSet = new Set<string>(rawFlags);

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return enabledSet.has(flag);
}

export const FEATURES = {
  relay: isFeatureEnabled('relay'),
  ride: isFeatureEnabled('ride'),
  fakecall: isFeatureEnabled('fakecall'),
  demo: isFeatureEnabled('demo'),
} as const;

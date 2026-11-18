import React, { useEffect, useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/expo';
import { dayKey } from '../../core/date';
import { habitStreak, weightSummary } from '../../core/logic';
import { goalLabels, parseGoal } from '../../core/nutritionTargets';
import { localize } from '../../core/i18n';
import { repo } from '../../data/db';
import { nutritionTarget } from '../../data/nutrition';
import { syncAutoTargets } from '../../data/nutritionPlan';
import { clearAccountReminders } from '../../services/reminders';
import { admobTestingEnabled } from '../../services/adMob';
import { useApp } from '../../state/app';
import { useSubscription } from '../../state/subscriptions';
import { subscriptionPackages } from '../../services/subscriptionLogic';
import { buildPlans, planSubtitle } from '../../services/paywallLogic';
import { BottomSheet } from '../../ui/BottomSheet';
import { CubyMark } from '../../ui/CubyMark';
import { Page, message } from '../../ui/components';
import { Text } from '../../ui/LocalizedText';
import { MotionPressable } from '../../ui/MotionPressable';
import { AppearanceSheet, EditProfileSheet, GoalsSheet, LanguageSheet, NotificationsSheet, NutritionTargetsSheet, languageNames, notificationsOn } from '../../ui/ProfileSheets';
import { fonts, brand } from '../../ui/theme';
import { ScreenTop, cardShadow, usePalette, useEntering, type VoltIcon } from '../../ui/voltKit';
import Animated from 'react-native-reanimated';

type Sheet = 'edit' | 'goals' | 'nutrition' | 'notifications' | 'language' | 'appearance';
type Summary = { weight: number | null; workouts: number; habits: number; streak: number; kcal: number | null; notifications: boolean };
const sheetTitles: Record<Sheet, string> = { edit: 'Edit profile', goals: 'Goals', nutrition: 'Nutrition · Target', notifications: 'Notifications', language: 'Language', appearance: 'Appearance' };
const num = (value: number) => Math.round(value).toLocaleString('en-US');

function StatCard({ label, value }: { label: string; value: string }) {
  const p = usePalette();
  return <View style={{ flex: 1, minWidth: 0, minHeight: 84, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6, borderRadius: 20, backgroundColor: p.c8, borderWidth: 1, borderColor: p.c8Line, ...cardShadow(p) }}>
    <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 9.5, letterSpacing: 0.7, textTransform: 'uppercase' }}>{label}</Text>
    <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 22 }}>{value}</Text>
  </View>;
}

function SettingsRow({ icon, title, value, onPress, danger, last, index }: { icon: VoltIcon; title: string; value?: string; onPress: () => void; danger?: boolean; last?: boolean; index: number }) {
  const p = usePalette();
  const entering = useEntering(index);
  const tint = danger ? p.danger : p.accent;
  return <Animated.View entering={entering}>
    <MotionPressable pressScale={0.98} accessibilityRole="button" accessibilityLabel={value ? `${title}, ${value}` : title} onPress={onPress}
      style={{ minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: p.border }}>
      <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: danger ? (p.light ? '#FDECEA' : 'rgba(255,138,138,0.12)') : p.light ? p.paleBlue : p.soft1 }}><Ionicons name={icon} size={18} color={tint}/></View>
      <Text numberOfLines={1} style={{ flex: 1, color: danger ? p.danger : p.text, fontFamily: fonts.semibold, fontSize: 14.5 }}>{title}</Text>
      {!!value && <Text numberOfLines={1} style={{ maxWidth: '42%', color: p.muted, fontFamily: fonts.medium, fontSize: 12 }}>{value}</Text>}
      {!danger && <Ionicons name="chevron-forward" size={16} color={p.muted}/>}
    </MotionPressable>
  </Animated.View>;
}

export default function ProfileScreen() {
  const p = usePalette();
  const { signOut } = useAuth();
  const subscription = useSubscription();
  const { profile, revision, changed, appearance, language } = useApp();
  const [summary, setSummary] = useState<Summary>({ weight: null, workouts: 0, habits: 0, streak: 0, kcal: null, notifications: false });
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    // Auto targets follow the latest weigh-in/goal; custom targets are left alone.
    void syncAutoTargets().catch(() => false)
      .then(() => Promise.all([repo.weights(), repo.trainingWorkouts(), repo.habits(), repo.completions(), nutritionTarget(dayKey()), repo.preferences()]))
      .then(([weights, workouts, habits, completions, target, preferences]) => {
        if (!active) return;
        const live = habits.filter(habit => !habit.archived);
        setSummary({
          weight: weightSummary(weights).latest?.kg ?? null,
          workouts: workouts.length,
          habits: live.length,
          streak: Math.max(0, ...live.filter(habit => habit.frequency !== 'quota').map(habit => habitStreak(habit, completions, dayKey()).current)),
          kcal: target?.kcal ?? null,
          notifications: notificationsOn(new Map(preferences.map(item => [item.key, item.value]))),
        });
      })
      .catch(message);
    return () => { active = false; };
  }, [revision]);

  const goal = parseGoal(profile?.fitness_goal);
  const goalLine = [goalLabels[goal], (goal === 'lose' || goal === 'gain' || goal === 'habits') && profile?.target_weight ? `target ${profile.target_weight.toFixed(1)} kg` : null].filter(Boolean).join(' · ');
  const firstName = profile?.name?.trim().split(/\s+/)[0] ?? '';
  const initial = profile?.name?.trim().slice(0, 1).toLocaleUpperCase() || 'C';
  // Banner copy comes from the live offering: a trial is mentioned only when the store returns one.
  const proPlans = buildPlans(subscriptionPackages(subscription.offering), Platform.OS === 'ios' ? 'ios' : 'android');
  const proAnnual = proPlans.find(plan => plan.kind === 'annual'), proMonthly = proPlans.find(plan => plan.kind === 'monthly');
  const proTrial = proAnnual?.trial ?? null;
  const proTeaser = proTrial && proAnnual ? planSubtitle(proAnnual)
    : proAnnual ? `${proAnnual.billed}/year${proMonthly ? ` · ${proMonthly.billed}/month` : ''}`
    : proMonthly ? `${proMonthly.billed}/month` : 'Ad-free, every feature';

  function confirmSignOut() {
    Alert.alert(localize('Sign out?', language), localize('Your data stays saved on this device for this account. Sign in again to pick up where you left off.', language), [
      { text: localize('Cancel', language), style: 'cancel' },
      { text: localize('Sign out', language), style: 'destructive', onPress: () => { void doSignOut(); } },
    ]);
  }
  async function doSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      // Cancel this account's scheduled notifications before the session ends so
      // they never fire for the next person who signs in on this device.
      await clearAccountReminders();
      await signOut(); // The root navigator then routes back to the auth flow.
    } catch (error) { setSigningOut(false); message(error); }
  }

  const rows: { icon: VoltIcon; title: string; value?: string; onPress: () => void; danger?: boolean }[] = [
    { icon: 'pencil-outline', title: 'Edit profile', value: firstName, onPress: () => setSheet('edit') },
    { icon: 'radio-button-on-outline', title: 'Goals & tracking', value: goalLabels[goal], onPress: () => setSheet('goals') },
    { icon: 'restaurant-outline', title: 'Nutrition targets', value: summary.kcal ? `${num(summary.kcal)} kcal` : 'Not set', onPress: () => setSheet('nutrition') },
    { icon: 'notifications-outline', title: 'Notifications', value: summary.notifications ? 'On' : 'Off', onPress: () => setSheet('notifications') },
    { icon: 'globe-outline', title: 'Language', value: languageNames[language], onPress: () => setSheet('language') },
    { icon: 'color-palette-outline', title: 'Appearance', value: appearance === 'abyss' ? 'Abyss' : appearance === 'deep' ? 'Deep' : 'Shore', onPress: () => setSheet('appearance') },
    ...(admobTestingEnabled ? [{ icon: 'bug-outline' as const, title: 'AdMob Testing', value: 'Internal', onPress: () => router.push('/admob-testing') }] : []),
    { icon: 'log-out-outline', title: signingOut ? 'Signing out…' : 'Sign out', onPress: confirmSignOut },
    { icon: 'trash-outline', title: 'Delete account', onPress: () => router.push('/delete-account'), danger: true },
  ];

  return <Page title="">
    <ScreenTop label="Profile"/>
    <View style={{ alignItems: 'center', gap: 8, paddingTop: 4, paddingBottom: 6 }}>
      <MotionPressable pressScale={0.95} accessibilityRole="button" accessibilityLabel="Edit profile" onPress={() => setSheet('edit')} style={{ width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: p.light ? p.soft1 : p.card2 }}>
        <Text style={{ color: p.accent, fontFamily: fonts.displayHeavy, fontSize: 36 }}>{initial}</Text>
        <View style={{ position: 'absolute', right: 2, bottom: 6, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: p.g1, borderWidth: 2, borderColor: p.bg }}><Ionicons name="pencil" size={12} color={p.plInk}/></View>
      </MotionPressable>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: p.text, fontFamily: fonts.displayHeavy, fontSize: 32, lineHeight: 38, letterSpacing: -0.8, textAlign: 'center' }}>{profile?.name ?? ''}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: p.heroCard }}>
        <Ionicons name="flame-outline" size={12} color={p.lime}/>
        <Text style={{ color: p.lime, fontFamily: fonts.bold, fontSize: 11 }}>{`${summary.streak} day streak`}</Text>
      </View>
      <Text style={{ color: p.muted, fontFamily: fonts.medium, fontSize: 13, textAlign: 'center' }}>{goalLine}</Text>
      {!!profile?.experience && <Text style={{ color: p.text, fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.9, textTransform: 'uppercase' }}>{`${profile.experience} lifter`}</Text>}
    </View>

    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
      <StatCard label="Weight" value={summary.weight !== null ? summary.weight.toFixed(1) : '—'}/>
      <StatCard label="Height" value={profile ? String(Math.round(profile.height_cm)) : '—'}/>
      <StatCard label="Workouts" value={String(summary.workouts)}/>
      <StatCard label="Habits" value={String(summary.habits)}/>
    </View>

    {subscription.ready && <MotionPressable pressScale={0.98} accessibilityRole="button" accessibilityLabel={subscription.isPremium ? 'Cubyfit Pro is active' : 'Try Cubyfit Pro'} onPress={() => router.push('/paywall')}
      style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 22, backgroundColor: p.heroCard }}>
      <View style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: p.paleBlue }}><CubyMark size={30} tile={false}/></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: '#FFFFFF', fontFamily: fonts.displayHeavy, fontSize: 15 }}>{subscription.isPremium ? 'Cubyfit Pro' : 'Try Cubyfit Pro'}</Text>
        <Text numberOfLines={1} style={{ color: brand.lilac, fontSize: 11.5 }}>{subscription.isPremium ? 'Active · manage your subscription' : proTeaser}</Text>
      </View>
      <View style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: p.lime }}><Text style={{ color: brand.ink, fontFamily: fonts.bold, fontSize: 12 }}>{subscription.isPremium ? 'Manage' : proTrial ? 'Start free' : 'See plans'}</Text></View>
    </MotionPressable>}

    <View style={{ marginTop: 10 }}>
      {rows.map((row, index) => <SettingsRow key={row.title} index={index} icon={row.icon} title={row.title} value={row.value} danger={row.danger} last={index === rows.length - 1} onPress={row.onPress}/>)}
    </View>
    <Text style={{ color: p.muted, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.9, textAlign: 'center', marginTop: 14 }}>DATA IS SAVED ON THIS DEVICE FIRST</Text>

    <BottomSheet visible={sheet !== null} title={sheet ? sheetTitles[sheet] : ''} onClose={() => setSheet(null)}>{close => <>
      {sheet === 'edit' && <EditProfileSheet close={close} onSaved={changed}/>}
      {sheet === 'goals' && <GoalsSheet close={close} onSaved={changed}/>}
      {sheet === 'nutrition' && <NutritionTargetsSheet close={close} onSaved={changed}/>}
      {sheet === 'notifications' && <NotificationsSheet onChanged={changed}/>}
      {sheet === 'language' && <LanguageSheet close={close}/>}
      {sheet === 'appearance' && <AppearanceSheet/>}
    </>}</BottomSheet>
  </Page>;
}

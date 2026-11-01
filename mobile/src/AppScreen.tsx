import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, Image, ImageBackground, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { LinearGradient } from 'expo-linear-gradient';
import { router, usePathname } from 'expo-router';
import { publicRead } from './api';
import { destinations, money, parseServices, PHONE, publicLiveSessions, type PortalTarget, type Service } from './domain';
import { Journal } from './Journal';
import { openExternal, Portal } from './Portal';
import { ActionRow, Button, Card, colors, Copy, Eyebrow, Heading, Icon, IconButton, styles, type IconName } from './ui';

type Tab = 'Home' | 'Training' | 'Journal' | 'My Bravo';
const tabs: { name: Tab; icon: IconName }[] = [{ name: 'Home', icon: 'home' }, { name: 'Training', icon: 'compass' }, { name: 'Journal', icon: 'book-open' }, { name: 'My Bravo', icon: 'user' }];
type Open = (target: PortalTarget) => void;

export default function App() {
  const [fontsLoaded, fontError] = useFonts({ Bebas: require('../assets/fonts/bebas-neue.ttf'), Montserrat: require('../assets/fonts/montserrat-400.ttf'), MontserratSemi: require('../assets/fonts/montserrat-600.ttf') });
  return <SafeAreaProvider><StatusBar style="light" />{!fontsLoaded && !fontError
    ? <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}><ActivityIndicator color={colors.gold} accessibilityLabel="Opening Bravo" /></View>
    : <BravoApp />}</SafeAreaProvider>;
}

function BravoApp() {
  const pathname = usePathname();
  const tab: Tab = pathname === '/training' ? 'Training' : pathname === '/journal' ? 'Journal' : pathname === '/member' ? 'My Bravo' : 'Home';
  const setTab = useCallback((next: Tab) => router.replace(({ Home: '/', Training: '/training', Journal: '/journal', 'My Bravo': '/member' } as const)[next]), []);
  const [portal, setPortal] = useState<PortalTarget | null>(null);
  const [services, setServices] = useState<Service[] | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [priceError, setPriceError] = useState(false);
  const requestSequence = useRef(0);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++requestSequence.current;
    try { const next = parseServices(await publicRead('/api/config', signal)); if (!signal?.aborted && requestId === requestSequence.current) { setServices(next); setPriceError(false); } }
    catch { if (!signal?.aborted && requestId === requestSequence.current) { setPriceError(true); setServices(null); } }
    finally { if (!signal?.aborted && requestId === requestSequence.current) setRefreshing(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => refresh(controller.signal));
    const listener = AppState.addEventListener('change', state => { if (state === 'active') { setRefreshing(true); void refresh(controller.signal); } });
    return () => { controller.abort(); listener.remove(); };
  }, [refresh]);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => { if (tab !== 'Home') { setTab('Home'); return true; } return false; });
    return () => listener.remove();
  }, [tab, setTab]);
  const open: Open = setPortal;
  const training = services?.find(s => s.id === 'training');
  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void refresh(); }} tintColor={colors.gold} colors={[colors.gold]} />;
  return <SafeAreaView style={local.safe} edges={['top', 'left', 'right', 'bottom']}>
    <View style={local.shell}>
      <View style={local.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Bravo home" onPress={() => setTab('Home')} style={styles.row}>
          <Image source={require('../assets/shield.png')} style={{ width: 43, height: 43 }} accessibilityIgnoresInvertColors />
          <View><Text style={local.brand}>BRAVO K9</Text><Text style={local.brandSub}>TRUST. TRAIN. DEPLOY.</Text></View>
        </Pressable>
        <IconButton name="phone" label="Call Bravo at 605-824-2767" onPress={() => void openExternal(PHONE)} />
      </View>
      <View style={{ flex: 1 }}>
        {tab === 'Home' ? <ScrollView refreshControl={refreshControl} contentContainerStyle={{ paddingBottom: 26 }}>
          <ImageBackground source={require('../assets/hero.webp')} style={local.hero} imageStyle={{ opacity: 0.85 }}>
            <LinearGradient colors={['rgba(16,16,16,0.03)', 'rgba(16,16,16,0.25)', '#101010']} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} />
            <View style={local.heroTop}><View style={local.location}><View style={local.dot} /><Text style={local.locationText}>ABERDEEN, SOUTH DAKOTA</Text></View></View>
            <View style={local.heroCopy}><Eyebrow>REAL DOGS. REAL-WORLD RESULTS.</Eyebrow><Text accessibilityRole="header" style={local.heroTitle}>BUILT ON TRUST.{'\n'}READY FOR LIFE.</Text><Copy style={{ color: '#DDD5C8', fontSize: 12 }}>No treats. No toys. Just you and your dog.</Copy></View>
          </ImageBackground>
          <View style={{ paddingHorizontal: 22, gap: 22 }}>
            <Button label="Book your first session" onPress={() => open(destinations.booking)} />
            <View style={[styles.row, { justifyContent: 'center', gap: 8 }]}><Icon name="map-pin" size={14} /><Copy style={styles.small}>We come to you. Train where life happens.</Copy></View>
            <View style={local.quickActions}>
              <QuickAction icon="calendar" label="My schedule" onPress={() => open(destinations.schedule)} />
              <QuickAction icon="message-circle" label="Message team" onPress={() => open(destinations.messages)} />
              <QuickAction icon="edit-3" label="Log practice" onPress={() => setTab('Journal')} />
            </View>
            <LiveCard open={open} active={!portal} />
            <View style={{ gap: 8 }}><Eyebrow>YOUR NEXT CHAPTER</Eyebrow><Heading small>A better everyday.</Heading><Copy style={{ color: colors.muted }}>Calmer walks. Clearer communication. More confidence on both ends of the leash.</Copy></View>
            <Card><View style={[styles.row, { justifyContent: 'space-between' }]}><Icon name="shield" /><Eyebrow>PRIVATE MOBILE TRAINING</Eyebrow></View><Heading small>{training?.name || 'Professional training'}</Heading>
              {training ? <View style={[styles.row, { alignItems: 'baseline' }]}><Text style={local.price}>{money(training.cents)}</Text><Copy style={styles.small}>/ {training.interval}</Copy></View> : <Copy style={styles.small}>{priceError ? 'Open booking for current pricing and availability.' : refreshing ? 'Checking current availability…' : 'Check current availability with Bravo.'}</Copy>}
              <Copy style={styles.small}>Monthly base training. Additional dogs have a separate rate. Specialist programs require an assessment and a separate quote.</Copy>
              <Button secondary label="Explore training" icon="arrow-right" onPress={() => setTab('Training')} />
            </Card>
            <Text style={local.signature}>TRUST. TRAIN. DEPLOY.</Text>
          </View>
        </ScrollView> : tab === 'Training' ? <ScrollView refreshControl={refreshControl} contentContainerStyle={styles.page}>
          <View style={{ gap: 8 }}><Eyebrow>FIND YOUR DIRECTION</Eyebrow><Heading>Good dogs.{'\n'}Great possibilities.</Heading><Copy style={{ color: colors.muted }}>Start with your dog. Build a plan together.</Copy></View>
          <Image source={require('../assets/training.webp')} style={local.trainingPhoto} accessibilityLabel="Bravo real-world obedience training" />
          <View style={{ gap: 15 }}><Heading small>Everyday foundations</Heading><Copy>From puppy foundations to advanced obedience, bring focus and reliability into your everyday life.</Copy>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{['Obedience', 'Recall', 'Leash manners', 'Confidence'].map(label => <View key={label} style={local.tag}><Copy style={{ fontSize: 11 }}>{label}</Copy></View>)}</View>
            <Button label="Build my training plan" onPress={() => open(destinations.booking)} />
          </View>
          <View style={{ gap: 12 }}><Eyebrow>CURRENT SERVICES</Eyebrow>{services ? services.filter(s => s.id !== 'online').map(service => <Card key={service.id}><Heading small>{service.name}</Heading><Copy style={{ color: colors.gold, fontFamily: 'MontserratSemi' }}>{money(service.cents)}{service.interval === 'once' ? ' · initial intake' : ` / ${service.interval}`}</Copy><Copy style={styles.small}>{service.description}</Copy>{service.id === 'training' ? <Copy style={styles.small}>This is the base monthly service. Specialist programs are quoted separately after assessment.</Copy> : null}<Button secondary label={`Request ${service.name.toLowerCase()}`} onPress={() => open({ title: service.name, path: `/portal?program=${encodeURIComponent(service.id)}` })} /></Card>) : <Card><Copy>{priceError ? 'Current prices couldn’t be loaded.' : 'Checking current services…'}</Copy><Button secondary label="Check availability" onPress={() => open(destinations.booking)} /></Card>}</View>
          <View style={{ gap: 8 }}><Eyebrow>BEYOND THE BASICS</Eyebrow><Heading small>Purpose-built partnerships.</Heading><Copy style={{ color: colors.muted }}>Specialist training starts with an assessment. Suitability, scope, and pricing are confirmed individually.</Copy></View>
          <FeatureCard image={require('../assets/tracking.webp')} label="Hunting & tracking" detail="Instinct, with direction." onPress={() => open({ title: 'Hunting dog training', path: '/hunting-dog-training' })} />
          <FeatureCard image={require('../assets/protection.webp')} label="Working & service dogs" detail="A job. A purpose. A partnership." onPress={() => open({ title: 'Specialist training', path: '/dog-training' })} />
          <ActionRow icon="users" title="Bravo workshops" detail="See the next event and available places" onPress={() => open(destinations.workshops)} />
        </ScrollView> : tab === 'Journal' ? <Journal /> : <Member open={open} />}
      </View>
      <View accessibilityRole="tablist" style={local.tabs}>{tabs.map(item => <Pressable key={item.name} accessibilityRole="tab" accessibilityState={{ selected: tab === item.name }} accessibilityLabel={item.name} onPress={() => setTab(item.name)} style={local.tab}>
        <View style={[local.tabIcon, tab === item.name && { backgroundColor: colors.soft }]}><Icon name={item.icon} color={tab === item.name ? colors.gold : colors.muted} size={20} /></View>
        <Text style={[local.tabLabel, tab === item.name && { color: colors.gold }]}>{item.name}</Text>
      </Pressable>)}</View>
    </View>
    {portal ? <Portal key={portal.path} target={portal} onClose={() => setPortal(null)} /> : null}
  </SafeAreaView>;
}

function QuickAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={local.quick}><Icon name={icon} size={22} /><Copy style={{ fontSize: 10, fontFamily: 'MontserratSemi', textAlign: 'center', lineHeight: 16 }}>{label}</Copy></Pressable>;
}
function FeatureCard({ image, label, detail, onPress }: { image: number; label: string; detail: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={local.feature}>
    <ImageBackground source={image} style={{ width: '100%', height: 200, justifyContent: 'flex-end' }}><LinearGradient colors={['transparent', 'rgba(0,0,0,0.92)']} style={StyleSheet.absoluteFill} /><View style={{ padding: 18, gap: 2 }}><Heading small>{label}</Heading><Copy style={styles.small}>{detail}</Copy></View></ImageBackground>
  </Pressable>;
}
function LiveCard({ open, active }: { open: Open; active: boolean }) {
  const [state, setState] = useState<'checking' | 'live' | 'offline' | 'unknown'>('checking');
  const [trainer, setTrainer] = useState('');
  useEffect(() => {
    if (!active) return;
    let alive = true;
    let inFlight = false;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const refresh = async () => {
      if (AppState.currentState === 'background' || inFlight) return;
      inFlight = true;
      try {
        const data = await publicRead('/api/live', controller.signal);
        const sessions = publicLiveSessions(data);
        if (alive) {
          clearTimeout(expiry);
          setState(sessions.length ? 'live' : 'offline'); setTrainer(sessions[0]?.trainerName || '');
          if (sessions.length) {
            const snapshot = data as { serverTime: string };
            const remaining = Math.max(0, Date.parse(sessions[0].liveUntil) - Date.parse(snapshot.serverTime));
            expiry = setTimeout(() => { if (alive) setState('unknown'); }, Math.min(remaining, 30000));
          }
        }
      } catch { if (alive) setState('unknown'); }
      finally { inFlight = false; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 20000);
    const listener = AppState.addEventListener('change', value => { if (value === 'active') void refresh(); else setState('unknown'); });
    return () => { alive = false; controller.abort(); clearInterval(timer); clearTimeout(expiry); listener.remove(); };
  }, [active]);
  return <Pressable accessibilityRole="button" accessibilityLabel="Open live training" onPress={() => open(destinations.live)} style={local.liveCard}>
    <View style={styles.actionIcon}><Icon name="radio" /></View><View style={{ flex: 1, gap: 3 }}><Eyebrow>{state === 'live' ? 'LIVE NOW' : 'BRAVO IN ACTION'}</Eyebrow><Copy style={styles.strong}>{state === 'live' ? `${trainer} is training live` : 'Real training. Front-row seat.'}</Copy><Copy style={styles.small}>{state === 'offline' ? 'No public session live right now' : state === 'unknown' ? 'Open to check live availability' : state === 'checking' ? 'Checking live availability…' : 'Tap to watch the session'}</Copy></View><Icon name="arrow-up-right" size={18} />
  </Pressable>;
}
function Member({ open }: { open: Open }) {
  return <ScrollView contentContainerStyle={styles.page}>
    <View style={{ gap: 8 }}><Eyebrow>YOUR TEAM. YOUR DOG. YOUR BRAVO.</Eyebrow><Heading>All together.{'\n'}Always moving.</Heading><Copy style={{ color: colors.muted }}>Use your existing Bravo account to pick up right where you left off.</Copy></View>
    <Card><View style={styles.row}><Image source={require('../assets/shield.png')} style={{ width: 58, height: 58 }} /><View style={{ flex: 1 }}><Heading small>Welcome to Bravo.</Heading><Copy style={styles.small}>One account. The same team.</Copy></View></View><Button label="Open my account" icon="user" onPress={() => open(destinations.account)} /></Card>
    <View>
      <ActionRow icon="calendar" title="My schedule" detail="See visits and manage training dates" onPress={() => open(destinations.schedule)} />
      <ActionRow icon="message-circle" title="Bravo Room" detail="Connect with your team" onPress={() => open(destinations.messages)} />
      <ActionRow icon="plus-circle" title="Book training" detail="Choose your program and request a session" onPress={() => open(destinations.booking)} />
      <ActionRow icon="video" title="Live training" detail="Watch public sessions or sign in for private access" onPress={() => open(destinations.live)} />
      <ActionRow icon="users" title="Workshops" detail="Find the next Bravo workshop" onPress={() => open(destinations.workshops)} />
      <ActionRow icon="phone" title="Talk to Bravo" detail="(605) 824-2767" onPress={() => void openExternal(PHONE)} />
      <ActionRow icon="settings" title="Trainer workspace" detail="Sign in with your authorized staff account" onPress={() => open({ title: 'Trainer workspace', path: '/admin' })} />
    </View>
    <Card><Eyebrow>YOUR INFORMATION</Eyebrow><Copy style={styles.small}>Account information stays with Bravo’s website. The app doesn’t copy your password. Practice notes stay on this device; you can share or delete them in Journal.</Copy><Copy style={styles.small}>Need account or data help? Contact your Bravo team.</Copy><Button secondary label="Contact Bravo" onPress={() => open({ title: 'Contact Bravo', path: '/contact' })} /></Card>
    <Text style={local.signature}>BRAVO K9 SOLUTIONS · 0.1.0</Text>
  </ScrollView>;
}

const local = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  shell: { flex: 1, width: '100%', maxWidth: 620, alignSelf: 'center' },
  header: { minHeight: 76, paddingVertical: 9, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#25231F' },
  brand: { fontFamily: 'Bebas', fontSize: 29, letterSpacing: 2, color: colors.text, lineHeight: 32 },
  brandSub: { fontFamily: 'MontserratSemi', fontSize: 7, letterSpacing: 1.75, color: colors.gold },
  hero: { width: '100%', height: 375, justifyContent: 'space-between' },
  heroTop: { padding: 22 },
  location: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.62)', borderRadius: 20, paddingVertical: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: '#534631' },
  dot: { height: 5, width: 5, borderRadius: 3, backgroundColor: colors.gold },
  locationText: { color: '#E9DDC7', fontFamily: 'MontserratSemi', fontSize: 8, letterSpacing: 1.1 },
  heroCopy: { padding: 22, paddingBottom: 18, gap: 8 },
  heroTitle: { fontFamily: 'Bebas', fontSize: 49, lineHeight: 49, color: colors.text, letterSpacing: 0.5 },
  quickActions: { flexDirection: 'row', borderWidth: 1, borderColor: colors.line, borderRadius: 16, backgroundColor: colors.card },
  quick: { flex: 1, minHeight: 92, alignItems: 'center', justifyContent: 'center', padding: 10, gap: 10 },
  liveCard: { padding: 17, backgroundColor: '#1F1D18', borderRadius: 16, borderWidth: 1, borderColor: '#51432E', flexDirection: 'row', gap: 12, alignItems: 'center' },
  price: { fontFamily: 'Bebas', fontSize: 45, color: colors.gold },
  signature: { color: '#AFA38B', textAlign: 'center', fontFamily: 'MontserratSemi', fontSize: 9, letterSpacing: 2, paddingVertical: 12 },
  trainingPhoto: { height: 210, width: '100%', borderRadius: 16 },
  tag: { borderWidth: 1, borderColor: colors.line, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12 },
  feature: { overflow: 'hidden', borderRadius: 16, borderWidth: 1, borderColor: colors.line },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: '#151514', paddingVertical: 8, paddingHorizontal: 5 },
  tab: { flex: 1, alignItems: 'center', gap: 4, minHeight: 56, justifyContent: 'center' },
  tabIcon: { width: 45, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  tabLabel: { color: colors.muted, fontFamily: 'MontserratSemi', fontSize: 10 },
});

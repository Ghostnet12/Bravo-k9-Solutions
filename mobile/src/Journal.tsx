import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { decodeJournal, encodeJournal, exportJournal, focusOptions, JOURNAL_KEY, journalSummary, validateEntry, type JournalEntry } from './domain';
import { Button, Card, colors, Copy, Eyebrow, Heading, Icon, IconButton, styles } from './ui';
import { Confirm, type Confirmation } from './Confirm';

export function Journal() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<JournalEntry | 'new' | null>(null);
  const [dogFilter, setDogFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const writeLock = useRef(false);
  const mounted = useRef(true);
  const load = useCallback(async () => {
    try { const saved = decodeJournal(await AsyncStorage.getItem(JOURNAL_KEY)); if (mounted.current) { setEntries(saved); setReady(true); } }
    catch { if (mounted.current) setError('Your journal couldn’t be opened. Retry to keep your saved entries safe.'); }
  }, []);
  useEffect(() => { mounted.current = true; void Promise.resolve().then(load); return () => { mounted.current = false; }; }, [load]);
  async function persist(next: JournalEntry[]) {
    if (writeLock.current) throw new Error('Please wait for your last change to finish.');
    writeLock.current = true; setBusy(true);
    try { await AsyncStorage.setItem(JOURNAL_KEY, encodeJournal(next)); if (mounted.current) setEntries(next); }
    finally { writeLock.current = false; if (mounted.current) setBusy(false); }
  }
  async function save(entry: JournalEntry) {
    const clean = validateEntry(entry);
    await persist([clean, ...entries.filter(e => e.id !== clean.id)].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
    setEditing(null);
  }
  function remove(entry: JournalEntry) {
    setConfirmation({ title: 'Delete this entry?', detail: `${entry.dog} · ${entry.focus}. This cannot be undone.`, action: 'Delete entry',
      confirm: () => { void persist(entries.filter(e => e.id !== entry.id)).catch(() => setError('Could not delete this entry. Please try again.')); } });
  }
  const visible = entries.filter(e => e.dog.toLowerCase().includes(dogFilter.trim().toLowerCase()));
  const stats = journalSummary(visible);
  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <View style={{ gap: 7 }}><Eyebrow>THE WORK BETWEEN SESSIONS</Eyebrow><Heading>Small wins.{'\n'}Stronger bond.</Heading><Copy style={{ color: colors.muted }}>Your dog’s progress, one practice at a time.</Copy></View>
    <Card><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Eyebrow>LAST 7 DAYS</Eyebrow><Icon name="trending-up" size={19} /></View><View style={styles.row}>
      <View style={{ flex: 1 }}><Heading>{String(stats.sessions).padStart(2, '0')}</Heading><Copy style={styles.small}>practice sessions</Copy></View>
      <View style={{ width: 1, height: 48, backgroundColor: colors.line }} />
      <View style={{ flex: 1, paddingLeft: 12 }}><Heading>{String(stats.minutes).padStart(2, '0')}</Heading><Copy style={styles.small}>minutes together</Copy></View>
    </View></Card>
    <Button label="Log a practice session" icon="plus" disabled={!ready || busy} onPress={() => setEditing('new')} />
    <Copy style={styles.small}>Saved on this device. Journal entries are personal notes and don’t update your booked sessions or sync to your account.</Copy>
    {!ready && !error ? <ActivityIndicator color={colors.gold} accessibilityLabel="Opening journal" /> : null}
    {error ? <Card><Copy accessibilityRole="alert" style={styles.error}>{error}</Copy><Button secondary label="Retry journal" icon="refresh-cw" onPress={() => { setError(''); setReady(false); void load(); }} /></Card> : null}
    {ready && entries.length > 0 ? <>
      <TextInput accessibilityLabel="Filter journal by dog name" placeholder="Find your dog’s entries" placeholderTextColor={colors.muted} style={styles.input} value={dogFilter} onChangeText={setDogFilter} maxLength={60} />
      <View style={{ gap: 14 }}>{visible.map(entry => <Card key={entry.id}>
        <View style={styles.row}><View style={{ flex: 1, gap: 3 }}><Eyebrow>{new Date(entry.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}</Eyebrow><Heading small>{entry.dog}</Heading></View><Copy style={{ color: colors.gold }}>{entry.minutes} min</Copy></View>
        <Copy style={styles.strong}>{entry.focus}</Copy>{entry.note ? <Copy style={{ color: colors.muted }}>{entry.note}</Copy> : null}
        <View style={[styles.row, { justifyContent: 'flex-end' }]}><IconButton name="edit-2" label={`Edit ${entry.dog} entry`} disabled={busy} onPress={() => setEditing(entry)} /><IconButton name="trash-2" label={`Delete ${entry.dog} entry`} disabled={busy} onPress={() => remove(entry)} /></View>
      </Card>)}</View>
      {!visible.length ? <Copy>No entries match that dog’s name.</Copy> : null}
      <Button secondary label="Share journal" icon="share" onPress={() => { void Share.share({ title: 'Bravo training journal', message: exportJournal(visible) }).catch(() => setError('Sharing isn’t available right now. Your entries are still saved.')); }} disabled={!visible.length} />
    </> : ready ? <View style={{ alignItems: 'center', paddingVertical: 18, gap: 14 }}><Icon name="edit-3" size={30} /><Heading small>Every rep counts.</Heading><Copy style={[styles.small, { textAlign: 'center', maxWidth: 280 }]}>Log what you practiced, what clicked, and what you want to work on with your trainer.</Copy></View> : null}
    {editing ? <JournalEditor entry={editing === 'new' ? undefined : editing} lastDog={entries[0]?.dog || ''} onSave={save} onClose={() => setEditing(null)} /> : null}
    {confirmation ? <Confirm request={confirmation} onCancel={() => setConfirmation(null)} /> : null}
  </ScrollView>;
}

function JournalEditor({ entry, lastDog, onSave, onClose }: { entry?: JournalEntry; lastDog: string; onSave: (entry: JournalEntry) => Promise<void>; onClose: () => void }) {
  const [dog, setDog] = useState(entry?.dog || lastDog);
  const [focus, setFocus] = useState(entry?.focus || focusOptions[0]);
  const [minutes, setMinutes] = useState(String(entry?.minutes || 10));
  const [note, setNote] = useState(entry?.note || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const savingRef = useRef(false);
  async function submit() {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true); setError('');
    try { await onSave({ id: entry?.id || randomUUID(), dog, focus, minutes: Number(minutes), note, createdAt: entry?.createdAt || new Date().toISOString() }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Your notes are still here.'); }
    finally { savingRef.current = false; setSaving(false); }
  }
  function dismiss() {
    if (saving) return;
    const changed = dog !== (entry?.dog || lastDog) || focus !== (entry?.focus || focusOptions[0]) || minutes !== String(entry?.minutes || 10) || note !== (entry?.note || '');
    if (!changed) { onClose(); return; }
    setConfirmation({ title: 'Discard unsaved practice?', detail: 'Your changes haven’t been saved.', action: 'Discard changes', confirm: onClose });
  }
  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={dismiss}>
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.row, { paddingHorizontal: 20, justifyContent: 'space-between' }]}><Heading small>{entry ? 'Edit practice' : 'Log practice'}</Heading><IconButton name="x" label="Close practice form" disabled={saving} onPress={dismiss} /></View>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 8 }}><Copy style={styles.strong}>Dog’s name</Copy><TextInput accessibilityLabel="Dog’s name" autoCapitalize="words" value={dog} onChangeText={setDog} maxLength={60} placeholder="Who put in the work?" placeholderTextColor={colors.muted} style={styles.input} /></View>
          <View style={{ gap: 10 }}><Copy style={styles.strong}>What did you practice?</Copy><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{focusOptions.map(option => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: focus === option }} onPress={() => setFocus(option)} style={{ borderWidth: 1, borderColor: focus === option ? colors.gold : colors.line, backgroundColor: focus === option ? colors.soft : colors.card, borderRadius: 10, padding: 13, minHeight: 46 }}><Copy style={{ fontSize: 12, color: focus === option ? colors.gold : colors.text }}>{option}</Copy></Pressable>)}</View></View>
          <View style={{ gap: 8 }}><Copy style={styles.strong}>Practice time · minutes</Copy><TextInput accessibilityLabel="Practice time in minutes" keyboardType="number-pad" value={minutes} onChangeText={setMinutes} maxLength={3} style={styles.input} /></View>
          <View style={{ gap: 8 }}><Copy style={styles.strong}>Notes</Copy><TextInput accessibilityLabel="Practice notes" placeholder="What went well? What’s next?" placeholderTextColor={colors.muted} value={note} onChangeText={setNote} maxLength={2000} multiline style={[styles.input, { minHeight: 130, textAlignVertical: 'top' }]} /></View>
          {error ? <Copy accessibilityRole="alert" style={styles.error}>{error}</Copy> : null}
          <Button label={saving ? 'Saving…' : 'Save practice'} icon="check" disabled={saving} onPress={() => void submit()} />
        </ScrollView>
      </KeyboardAvoidingView>
      {confirmation ? <Confirm request={confirmation} onCancel={() => setConfirmation(null)} /> : null}
    </SafeAreaView>
  </Modal>;
}

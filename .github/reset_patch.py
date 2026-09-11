from pathlib import Path

root = Path('mern')
def change(name, old, new, count=1):
    p = root / name
    text = p.read_text()
    assert text.count(old) == count, f'{name}: expected {count} matches for {old[:100]!r}, found {text.count(old)}'
    p.write_text(text.replace(old, new))
def section(name, first, last, replacement):
    p = root / name
    text = p.read_text()
    assert text.count(first) == 1 and text.count(last) == 1, name
    a, b = text.index(first), text.index(last)
    assert b > a
    p.write_text(text[:a] + replacement + text[b:])

change('client/src/main.jsx', "import './accessibility-layout.css';", "import './accessibility-layout.css';\nimport './reset-layout.css';")
change('client/src/api.js', "credentials: 'same-origin', ...options, signal:", "credentials: 'same-origin', ...options, cache: 'no-store', signal:")
change('client/src/BookingPage.jsx', "import ServiceIcon from './ServiceIcon';", "import ServiceIcon from './ServiceIcon';\nimport { toggleVisitSelection } from '../../shared/selection-state.js';")
change('client/src/BookingPage.jsx', "const [availabilityShown, setAvailabilityShown] = useState(false);", "const [availabilityShown, setAvailabilityShown] = useState(false);\n  const [availabilityVersion, setAvailabilityVersion] = useState(0);")
change('client/src/BookingPage.jsx', '[from, to, config]);', '[from, to, config, availabilityVersion]);')
section('client/src/BookingPage.jsx', '  function addVisit(day) {', '  function showAvailability() {', '''  function addVisit(day) {
    setVisits(current => toggleVisitSelection(current, day, kind));
    setUncovered([]); setError(''); setNotice('');
  }
  function resetSchedule() {
    setVisits([]); setUncovered([]); setError(''); setSaved(null);
    setBookingDraft(null); setRequestKey(crypto.randomUUID());
    setAvailabilityShown(true); setAvailabilityVersion(value => value + 1);
    setNotice('All selected dates and times were cleared. Available days stay highlighted. Saved bookings were not changed.');
  }
''')
change('client/src/BookingPage.jsx', 'onClick={makeMySchedule}>Make my schedule</button></div>', 'onClick={makeMySchedule}>Make my schedule</button><button className="button button-ghost" type="button" disabled={busy} onClick={resetSchedule}>Reset schedule</button></div>')
change('client/src/BookingPage.jsx', 'Find highlights openings without selecting them. Make my schedule randomly selects the number of matching visits requested above.', 'Find highlights openings without selecting them. Tap a date to select it; tap it again to remove it. Make my schedule chooses random visits. Reset clears all selections while keeping available days highlighted.')
change('client/src/BookingPage.jsx', "${selected ? 'selected' : slots.length ?", "${selected ? 'selected; tap again to unselect' : slots.length ?")

change('server/models.js', "export const Message = model('BravoMessage'", "export const ChatReset = model('BravoChatReset', new Schema({ _id: String, clearedAt: { type: Date, required: true } }, { timestamps: true }));\nexport const Message = model('BravoMessage'")
change('server/models.js', 'export const ALL_MODELS = [User,', 'export const ALL_MODELS = [ChatReset, User,')
change('server/app.js', "import { clientError } from './errors.js';", "import { clientError } from './errors.js';\nimport { chatFilter, visibleInbox, resetChat } from './chat-state.js';")
change('server/app.js', "app.get('/api/community', requireUser, async (_req, res) => {", "app.post('/api/chat/reset', requireUser, rateLimit('chat-reset', 30, 60000), resetChat);\napp.get('/api/community', requireUser, async (req, res) => {")
change('server/app.js', 'Message.find({ deleted: false })', "Message.find({ deleted: false, ...await chatFilter(req.user, 'room') })")
change('server/app.js', 'DirectMessage.find({ memberId, deleted: false })', 'DirectMessage.find({ memberId, deleted: false, ...await chatFilter(req.user, `direct:${memberId}`) })')
change('server/app.js', 'GroupMessage.find({ groupId: group._id, deleted: false })', 'GroupMessage.find({ groupId: group._id, deleted: false, ...await chatFilter(req.user, `group:${group._id}`) })')
change('server/app.js', 'DirectMessage.aggregate([{ $sort: { createdAt: -1 } }', "DirectMessage.aggregate([{ $match: { deleted: false, ...await chatFilter(req.user, 'inbox') } }, { $sort: { createdAt: -1 } }")
change('server/app.js', 'inbox: inbox.map(thread =>', 'inbox: (await visibleInbox(req.user, inbox)).map(thread =>')

change('client/src/CommunityPage.jsx', "import MessageCard from './MessageCard';", "import MessageCard from './MessageCard';\nimport { useChatHistory } from './chat-history';")
section('client/src/CommunityPage.jsx', '  const [messages, setMessages]', '  async function send(e) {', '''  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [kind, setKind] = useState('message'), [recipientId, setRecipient] = useState(initialRecipient);
  const history = useChatHistory(path);
  const { messages, loading, load, clearing } = history;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function resetHistory(mode = 'clear') {
    const prompt = mode === 'delete' ? 'Permanently DELETE all messages in this conversation for EVERYONE? This cannot be undone. Bookings, accounts and payments are not affected.' : 'Clear the old messages and unsent draft from YOUR history? This stays cleared after signing in again. Other people keep their copies, and new messages will still arrive.';
    if (!window.confirm(prompt)) return;
    setError(''); setNotice('');
    if (await history.clear(mode)) {
      setBody(''); setKind('message'); setRecipient(initialRecipient);
      setNotice(mode === 'delete' ? 'Conversation history permanently deleted.' : 'History and draft cleared for your account. New messages will still arrive.');
    }
  }
''')
p = root / 'client/src/CommunityPage.jsx'
text = p.read_text()
a, b = text.split('export default function CommunityPage()', 1)
old = '<button className="quiet-button" disabled={busy} onClick={() => load().catch(err => setError(err.message))}>Refresh messages</button>'
assert a.count(old) == 1
a = a.replace(old, '<div className="reset-actions"><button type="button" className="quiet-button" disabled={busy} onClick={() => resetHistory()}>Refresh & clear history</button>{user.role === \'owner\' && <button type="button" className="quiet-button danger-link" disabled={busy} onClick={() => resetHistory(\'delete\')}>Delete conversation history</button>}</div>')
a = a.replace('<Notice error>{error}</Notice>', '<Notice error>{error || history.error}</Notice><Notice>{notice}</Notice>')
a = a.replace('disabled={busy}', 'disabled={busy || clearing}').replace('disabled={busy || !body.trim()}', 'disabled={busy || clearing || !body.trim()}')
a = a.replace('if (!body.trim()) return;', 'if (clearing || !body.trim()) return;')
a = a.replace('No messages yet. Say hello or ask a question.', 'No messages in your current history. New messages will appear here.')
p.write_text(a + 'export default function CommunityPage()' + b)

change('client/src/AdminPage.jsx', 'user, config, refreshConfig, authReady } = useBravo()', 'user, config, refreshConfig, authReady, setBookingDraft } = useBravo()')
change('client/src/AdminPage.jsx', "const [tab, setTab] = useState('schedule')", "const [resetVersion, setResetVersion] = useState(0);\n  const [tab, setTab] = useState('schedule')")
change('client/src/AdminPage.jsx', '  function toggle(field, value)', '''  async function resetDesk() {
    if (!window.confirm('Clear unsaved desk selections, filters and forms, then reload fresh server data? Saved bookings, client accounts, messages and payments will not be deleted. Use the labelled chat controls to clear history.')) return;
    setBusy(true); setError(''); setNotice('');
    setQuery(''); setStatusFilter('active'); setVisitDate(''); setTrainer('all'); setBookingDraft(null);
    try { await Promise.all([load(), refreshConfig()]); setResetVersion(value => value + 1); setNotice('Desk selections, filters and unsaved forms reset. Saved records were reloaded without using the browser cache.'); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  function toggle(field, value)''')
change('client/src/AdminPage.jsx', '<Notice error>{error}</Notice><Notice>{notice}</Notice>', '<Notice error>{error}</Notice><Notice>{notice}</Notice>{allowed && <div className="reset-actions desk-reset"><button className="button button-small button-ghost" type="button" disabled={busy} onClick={resetDesk}>Refresh & reset desk</button><small>Clear unsaved forms and selections; keep saved records.</small></div>}')
change('client/src/AdminPage.jsx', 'onClick={() => action(async () => {})}>Refresh</button>', 'onClick={resetDesk}>Refresh & reset</button>')
change('client/src/AdminPage.jsx', '<StaffBooking team={data.team}', '<StaffBooking key={`booking-${resetVersion}`} team={data.team}')
change('client/src/AdminPage.jsx', '<StaffInbox inbox={data.inbox}', '<StaffInbox key={`inbox-${resetVersion}`} inbox={data.inbox}')
change('client/src/AdminPage.jsx', '<LessonEditor/>', '<LessonEditor key={`lessons-${resetVersion}`}/>')
change('client/src/AdminPage.jsx', '<OwnerPanel user={user}/>', '<OwnerPanel key={`people-${resetVersion}`} user={user}/>')
change('client/src/AdminPage.jsx', '<details className="panel"><summary>Weekly availability', '<details className="panel" key={`availability-${resetVersion}`}><summary>Weekly availability')
change('client/src/AdminPage.jsx', '<button className="button" disabled={busy}>Save availability</button>', '<div className="reset-actions"><button className="button" disabled={busy}>Save availability</button><button type="button" className="quiet-button" disabled={busy} onClick={() => { setSchedule(current => ({ ...current, weekdays: [], hours: [] })); setNotice(\'Availability selections cleared locally. Choose the new days and times before saving. Existing appointments were not changed.\'); }}>Reset availability selections</button></div>')
change('client/src/AdminPage.jsx', 'key={service.id} onSubmit=', 'key={`${service.id}-${resetVersion}`} onSubmit=')
change('client/src/AdminPage.jsx', '<p className="helper">Showing {visible.length}', '<button type="button" className="quiet-button" onClick={() => { setQuery(\'\'); setStatusFilter(\'active\'); setVisitDate(\'\'); setTrainer(\'all\'); }}>Reset filters</button><p className="helper">Showing {visible.length}')

change('client/src/StaffBooking.jsx', '  async function search(e) {', '''  function resetForm() {
    setQuery(''); setClients([]); setClient(null); setDate(''); setSlots([]); setTime('');
    setService('training'); setRequestKey(crypto.randomUUID()); setError('');
    setNotice('Client selection and unsaved visit fields cleared. Saved visits were not changed.');
  }
  async function search(e) {''')
change('client/src/StaffBooking.jsx', "setClient(null); setDate(''); setSlots([]); setTime(''); await onSaved();", "setClient(null); setQuery(''); setClients([]); setService('training'); setDate(''); setSlots([]); setTime(''); await onSaved();")
change('client/src/StaffBooking.jsx', '<Notice error>{error}</Notice><Notice>{notice}</Notice>', '<Notice error>{error}</Notice><Notice>{notice}</Notice><button type="button" className="quiet-button" disabled={busy} onClick={resetForm}>Reset client visit form</button>')

change('client/src/OwnerPanel.jsx', 'const requestId = useRef(0);', 'const requestId = useRef(0);\n  const [resetVersion, setResetVersion] = useState(0);')
change('client/src/OwnerPanel.jsx', 'const load = async (silent = false) =>', 'const load = async (silent = false, searchQuery = query) =>')
change('client/src/OwnerPanel.jsx', 'encodeURIComponent(query)', 'encodeURIComponent(searchQuery)')
change('client/src/OwnerPanel.jsx', '<form className="owner-search panel"', '<button type="button" className="quiet-button" disabled={loading || creating} onClick={async () => { setQuery(\'\'); setCreated(null); setUsers([]); setError(\'\'); setResetVersion(value => value + 1); await load(false, \'\'); }}>Refresh & reset people search</button><form className="owner-search panel"')
change('client/src/OwnerPanel.jsx', '<details className="panel add-client-panel">', '<details className="panel add-client-panel" key={`add-client-${resetVersion}`}>')
change('client/src/OwnerPanel.jsx', '<PersonCard key={person._id}', '<PersonCard key={`${person._id}-${resetVersion}`}')
change('client/src/OwnerPanel.jsx', '<div className="record-actions"><button className="button button-small"', '<div className="record-actions"><button type="button" className="quiet-button" disabled={busy} onClick={() => { setDraft(person); setError(\'\'); setNotice(\'Unsaved profile changes discarded. Saved profile and permissions are unchanged.\'); }}>Reset profile edits</button><button className="button button-small"')

change('client/src/LessonEditor.jsx', '  function field(name, value)', '''  function resetEditor() {
    if (dirty && !window.confirm('Discard unsaved lesson edits? Saved lessons and uploaded media will not be deleted.')) return;
    setDraft(null); setNew(false); setDirty(false); setProgress(''); setError(''); setNotice('Editor selection and unsaved inputs cleared.');
  }
  function field(name, value)''')
change('client/src/LessonEditor.jsx', '<p>Create the lesson first,', '<button type="button" className="quiet-button" disabled={busy} onClick={resetEditor}>Reset editor</button><p>Create the lesson first,')
change('client/src/LessonEditor.jsx', 'if (lesson) choose(lesson);', 'if (lesson) choose(lesson); else resetEditor();')
print('Applied checked, narrow reset fixes to the existing Bravo source.')

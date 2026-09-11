from pathlib import Path

root = Path(__file__).resolve().parents[1]
def edit(path, old, new):
    file = root / path
    text = file.read_text()
    if text.count(old) != 1:
        raise RuntimeError(f'{path}: expected one exact patch target, found {text.count(old)}: {old[:100]}')
    file.write_text(text.replace(old, new, 1))

a = 'client/src/BookingPage.jsx'
edit(a, "import ServiceIcon from './ServiceIcon';", "import ServiceIcon from './ServiceIcon';\nimport { toggleVisit } from './schedule-selection.js';")
edit(a, "const [availabilityShown, setAvailabilityShown] = useState(false);", "const [availabilityShown, setAvailabilityShown] = useState(false);\n  const [availabilityVersion, setAvailabilityVersion] = useState(0);")
edit(a, '}, [from, to, config]);', '}, [from, to, config, availabilityVersion]);')
edit(a, "    if (visits.some(v => v.date === day.date && v.service === kind)) return;\n    const time = day.slots.find(t => !visits.some(v => v.date === day.date && v.time === t));\n    if (!time) return;\n    setVisits(v => [...v, { date: day.date, time, service: kind }].sort((a,b) => a.date.localeCompare(b.date))); setUncovered([]);", "    setVisits(current => toggleVisit(current, day, kind));\n    setUncovered([]); setError(''); setNotice('');")
edit(a, '  function showAvailability() {', "  function resetSchedule() {\n    setVisits([]); setUncovered([]); setError(''); setSaved(null);\n    setBookingDraft(null); setRequestKey(crypto.randomUUID());\n    setAvailabilityShown(true); setAvailabilityVersion(value => value + 1);\n    setNotice('All selected visits cleared. Available days stay highlighted. Tap a day to select it; tap again to unselect. Saved bookings are unchanged until you explicitly save an update.');\n  }\n  function showAvailability() {")
edit(a, 'onClick={makeMySchedule}>Make my schedule</button></div>', 'onClick={makeMySchedule}>Make my schedule</button><button className="button button-ghost" type="button" disabled={busy} onClick={resetSchedule}>Reset selections</button></div>')
edit(a, 'Find highlights openings without selecting them. Make my schedule randomly selects the number of matching visits requested above.', 'Find highlights openings without selecting them. Tap a date to select it, and tap again to unselect. Make my schedule chooses random visits; Reset selections clears all chosen visits while keeping available days highlighted.')
edit(a, '<button className="quiet-button" onClick={() => { setVisits', '<button type="button" className="quiet-button" onClick={() => { setVisits')
edit('client/src/main.jsx', "import './accessibility-layout.css';", "import './accessibility-layout.css';\nimport './reset-layout.css';")
edit('client/src/api.js', "{ credentials: 'same-origin', ...options, signal:", "{ credentials: 'same-origin', ...options, cache: 'no-store', signal:")

a = 'client/src/AdminPage.jsx'
edit(a, "import { useCallback, useEffect, useState } from 'react';", "import { useCallback, useEffect, useRef, useState } from 'react';")
edit(a, 'const { user, config, refreshConfig, authReady } = useBravo();', 'const { user, config, refreshConfig, authReady, setBookingDraft } = useBravo();\n  const loadRequest = useRef(0);\n  const [resetVersion, setResetVersion] = useState(0);')
edit(a, "const load = useCallback(async () => { const result = await api('/admin');", "const load = useCallback(async () => { const request = ++loadRequest.current; const result = await api('/admin');")
edit(a, 'setData({ ...result, reviews, services }); setSchedule(result.settings); }, []);', 'if (request !== loadRequest.current) return; setData({ ...result, reviews, services }); setSchedule(result.settings); }, []);')
edit(a, "  function toggle(field, value) {", "  async function resetDesk() {\n    if (busy) return;\n    loadRequest.current++; setBusy(true); setError(''); setNotice('');\n    setQuery(''); setStatusFilter('active'); setVisitDate(''); setTrainer('all');\n    setBookingDraft(null); setResetVersion(value => value + 1);\n    if (data?.settings) setSchedule({ ...data.settings, weekdays: [...data.settings.weekdays], hours: [...data.settings.hours] });\n    try { await Promise.all([load(), refreshConfig()]); setNotice('Filters, selections and unsaved forms reset. Saved bookings, accounts and payments are unchanged.'); }\n    catch (e) { setError(e.message); } finally { setBusy(false); }\n  }\n  function toggle(field, value) {")
edit(a, '<Page className="staff-page"', '<Page key={resetVersion} className="staff-page"')
edit(a, '<nav className="community-tabs desk-tabs"', '<div className="desk-reset-actions"><p className="helper">Reset clears selections and unsaved forms, not saved business records.</p><button type="button" className="button button-ghost" disabled={busy} onClick={resetDesk}>Reset desk</button></div><nav className="community-tabs desk-tabs"')
edit(a, 'onClick={() => action(async () => {})}>Refresh</button>', 'onClick={resetDesk}>Refresh & reset view</button>')
edit(a, '<OwnerPanel user={user}/>', '<OwnerPanel user={user} onReset={resetDesk}/>')
edit('client/src/OwnerPanel.jsx', 'function OwnerPanel({ user })', 'function OwnerPanel({ user, onReset })')
edit('client/src/OwnerPanel.jsx', '<h2>People & permissions.</h2></div></div>', '<h2>People & permissions.</h2></div><button type="button" className="quiet-button" disabled={creating} onClick={onReset}>Reset people view</button></div>')

a = 'client/src/CommunityPage.jsx'
edit(a, 'const alive = useRef(true);', 'const alive = useRef(true), generation = useRef(0), clearing = useRef(false);\n  const [notice, setNotice] = useState(\'\');')
edit(a, "    const result = await api(path);\n    if (alive.current) { setMessages(result.messages); setLoading(false); setError(''); }", "    if (clearing.current) return;\n    const request = ++generation.current;\n    try {\n      const result = await api(path);\n      if (alive.current && request === generation.current && !clearing.current) { setMessages(result.messages); setLoading(false); setError(''); }\n    } catch (err) { if (alive.current && request === generation.current && !clearing.current) { setError(err.message); setLoading(false); } }")
edit(a, 'return () => { alive.current = false; clearInterval(timer); };', 'return () => { alive.current = false; generation.current++; clearInterval(timer); };')
edit(a, '  async function hide(id) {', "  async function clearConversation() {\n    if (clearing.current || !window.confirm('Clear earlier messages and your draft from YOUR view? This stays cleared after reload. Other people keep their copies, and new messages will still appear.')) return;\n    clearing.current = true; generation.current++; setBusy(true); setError(''); setNotice('');\n    try {\n      const channel = path === '/community' ? 'community' : direct ? 'direct' : 'group';\n      await api('/chat/clear', { method: 'POST', body: { channel, ...(channel === 'group' ? { groupId: path.split('/')[2] } : {}), confirm: true } });\n      if (!alive.current) return;\n      setMessages([]); setBody(''); setKind('message'); setRecipient(''); setLoading(false);\n      setNotice('Earlier messages and your draft are cleared from your view. New messages will still arrive.');\n    } catch (err) { if (alive.current) setError(err.message); }\n    finally { clearing.current = false; if (alive.current) { setBusy(false); await load(); } }\n  }\n  async function hide(id) {")
edit(a, '<Notice error>{error}</Notice>\n    <div className="thread-tools">', '<Notice error>{error}</Notice><Notice>{notice}</Notice>\n    <div className="thread-tools">')
edit(a, 'onClick={() => load().catch(err => setError(err.message))}>Refresh messages</button>', 'type="button" onClick={clearConversation}>Refresh & clear my chat</button>')
edit(a, 'Latest {direct || path !== \'/community\' ? \'200\' : \'100\'} messages · Updates every 10 seconds', 'Updates every 10 seconds · Clear removes earlier messages from your view only')
edit(a, 'No messages yet. Say hello or ask a question.', 'No uncleared messages. Say hello or ask a question.')
# A group refresh must not immediately choose an old group again.
edit(a, 'const refreshGroups = useCallback(async () => {', 'const refreshGroups = useCallback(async (reset = false) => {')
edit(a, 'setGroupId(id => data.groups.some(group => group._id === id) ? id : data.groups[0]?._id || \'\');', 'setGroupId(id => reset ? \'\' : data.groups.some(group => group._id === id) ? id : data.groups[0]?._id || \'\');')
edit(a, 'onClick={() => refreshGroups().catch(e => setError(e.message))}>Refresh groups</button>', 'onClick={() => { setDrafts({}); setGroupId(\'\'); setNotice(\'Group selection and message drafts cleared.\'); refreshGroups(true).catch(e => setError(e.message)); }}>Refresh & reset groups</button>')

a = 'server/app.js'
edit(a, "import { clientError } from './errors.js';", "import { clientError } from './errors.js';\nimport { installChatClear, chatVisibility, visibleInbox } from './chat-clear.js';")
edit(a, "app.use('/api', rateLimit('api', 240, 60000));", "app.use('/api', rateLimit('api', 240, 60000));\ninstallChatClear(app);")
edit(a, "app.get('/api/community', requireUser, async (_req, res) => {\n  const messages = await Message.find({ deleted: false })", "app.get('/api/community', requireUser, async (req, res) => {\n  const messages = await Message.find({ deleted: false, ...await chatVisibility(req.user, 'community') })")
edit(a, 'DirectMessage.find({ memberId, deleted: false })', "DirectMessage.find({ memberId, deleted: false, ...await chatVisibility(req.user, `direct:${memberId}`) })")
edit(a, 'GroupMessage.find({ groupId: group._id, deleted: false })', "GroupMessage.find({ groupId: group._id, deleted: false, ...await chatVisibility(req.user, `group:${group._id}`) })")
edit(a, 'const [settings, bookings, blocks, inbox] = await Promise.all', 'const [settings, bookings, blocks, inboxAll] = await Promise.all')
edit(a, 'DirectMessage.aggregate([{ $sort:', "DirectMessage.aggregate([{ $match: { deleted: false, ...await chatVisibility(req.user, 'inbox') } }, { $sort:")
edit(a, '  const names = await User.find({ _id: { $in: inbox.map', '  const inbox = await visibleInbox(req.user, inboxAll);\n  const names = await User.find({ _id: { $in: inbox.map')
print('Applied exact reset, calendar, Safari layout and account-scoped chat changes.')

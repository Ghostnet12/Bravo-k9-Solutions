from pathlib import Path
root = Path(__file__).resolve().parents[1]
def edit(path, old, new):
    file = root / path
    text = file.read_text()
    if text.count(old) != 1:
        raise RuntimeError(f'{path}: expected exactly one target: {old[:100]}')
    file.write_text(text.replace(old, new, 1))

# Keep the existing HTTP contract test isolated after adding the new model.
edit('tests/workspace-api.test.js', "import app from '../server/app.js';", "import app from '../server/app.js';\nimport { ChatClear } from '../server/chat-clear.js';")
edit('tests/workspace-api.test.js', "  t.mock.method(Subscription, 'find', () => query([]));", "  t.mock.method(Subscription, 'find', () => query([]));\n  t.mock.method(ChatClear, 'findOne', () => query(null));\n  t.mock.method(ChatClear, 'find', () => query([]));")
edit('client/src/reset-layout.css', '.form-grid input, .form-grid select, .form-grid textarea,', '.form-grid input:not([type="checkbox"]):not([type="radio"]), .form-grid select, .form-grid textarea,')

# An empty inbox still checks for new messages, without restoring old selections.
a = 'client/src/StaffInbox.jsx'
edit(a, '  async function clearInbox(all = true) {', "  useEffect(() => {\n    let active = true, pending = false;\n    const timer = setInterval(async () => {\n      if (!active || document.hidden || paused.current || pending) return;\n      pending = true;\n      try { await refreshInbox(); } catch (err) { if (active && alive.current && !paused.current) setError(err.message); }\n      finally { pending = false; }\n    }, 10000);\n    return () => { active = false; clearInterval(timer); };\n  }, [refreshInbox]);\n  async function clearInbox(all = true) {")

a = 'client/src/AccountPage.jsx'
edit(a, 'const { user, config, refreshUser, authReady } = useBravo()', 'const { user, config, refreshUser, authReady, setBookingDraft } = useBravo()')
edit(a, "  const [review, setReview] = useState({ rating: 5, body: '' });", "  const [review, setReview] = useState({ rating: 5, body: '' });\n  const [resetVersion, setResetVersion] = useState(0);")
edit(a, 'if (feedback.review) setReview({ rating: feedback.review.rating, body: feedback.review.body });', "setReview(feedback.review ? { rating: feedback.review.rating, body: feedback.review.body } : { rating: 5, body: '' });")
edit(a, '  function openBilling() {', "  function resetAccount() {\n    if (busy) return;\n    setBookingDraft(null); setResetVersion(value => value + 1);\n    setReview({ rating: 5, body: '' });\n    setProfile({ name: user.name, dogName: user.dogName || '', phone: user.phone || '', address: user.address || '', title: user.title || '', bio: user.bio || '', showPhone: !!user.showPhone });\n    action(async () => { await Promise.all([load(), refreshUser()]); setNotice('Unsaved account forms and schedule selections cleared. Saved profile details, bookings, reviews and payments are unchanged.'); });\n  }\n  function openBilling() {")
edit(a, 'return <Page title={user ?', 'return <Page key={resetVersion} title={user ?')
edit(a, 'onClick={() => action(load)}>Refresh</button>', 'onClick={resetAccount}>Refresh & reset account</button>')

# A group reset also remounts the uncontrolled member/new-group forms.
a = 'client/src/CommunityPage.jsx'
edit(a, '  const activeGroup = groups.find(group => group._id === groupId);', '  const [groupResetVersion, setGroupResetVersion] = useState(0);\n  const activeGroup = groups.find(group => group._id === groupId);')
edit(a, '<Page className="community-page"', '<Page key={groupResetVersion} className="community-page"')
edit(a, "onClick={() => { setDrafts({}); setGroupId('');", "onClick={() => { setGroupResetVersion(value => value + 1); setDrafts({}); setGroupId('');")
print('Added model mocks, account/group reset, checkbox-safe layout and empty-inbox polling.')

from pathlib import Path
p = Path('mern/tests/workspace-api.test.js')
s = p.read_text()
old = 'import { ALL_MODELS, User,'
assert s.count(old) == 1
s = s.replace(old, 'import { ALL_MODELS, ChatReset, User,')
old = "  t.mock.method(Subscription, 'find', () => query([]));"
assert s.count(old) == 1
s = s.replace(old, old + "\n  // No saved per-viewer cutoff in this isolated authorization fixture.\n  t.mock.method(ChatReset, 'find', () => query([]));")
p.write_text(s)

p = Path('mern/client/src/AccountPage.jsx')
s = p.read_text()
def replace(old, new):
    global s
    assert s.count(old) == 1, old
    s = s.replace(old, new)
replace('useCallback, useEffect, useState', 'useCallback, useEffect, useRef, useState')
replace('refreshUser, authReady } = useBravo()', 'refreshUser, authReady, setBookingDraft } = useBravo()')
replace("  const [mode, setMode]", "  const loadSequence = useRef(0);\n  const [resetVersion, setResetVersion] = useState(0);\n  const [mode, setMode]")
replace('    if (!user) return;', '    if (!user) return;\n    const ticket = ++loadSequence.current;')
replace('    setBookings(records.bookings.map', '    if (ticket !== loadSequence.current) return;\n    setBookings(records.bookings.map')
replace('if (feedback.review) setReview({ rating: feedback.review.rating, body: feedback.review.body });', "setReview(feedback.review ? { rating: feedback.review.rating, body: feedback.review.body } : { rating: 5, body: '' });")
replace('  function openBilling()', '''  async function resetAccount() {
    if (!window.confirm('Discard unsaved profile, review and password inputs, clear your unsaved booking plan, and reload fresh account data? Saved bookings, memberships, reviews and profile information will not be deleted.')) return;
    await action(async () => {
      loadSequence.current++;
      setBookingDraft(null); setResetVersion(value => value + 1);
      setReview({ rating: 5, body: '' });
      setProfile({ name: user.name, dogName: user.dogName || '', phone: user.phone || '', address: user.address || '', title: user.title || '', bio: user.bio || '', showPhone: !!user.showPhone });
      await Promise.all([refreshUser(), load()]);
      setNotice('Account inputs and unsaved booking selections reset. Saved records reloaded without browser cache.');
    });
  }
  function openBilling()''')
replace('onClick={() => action(load)}>Refresh</button>', 'onClick={resetAccount}>Refresh & reset inputs</button>')
replace('<details className="panel"><summary>Change password', '<details className="panel" key={`password-${resetVersion}`}><summary>Change password')
p.write_text(s)

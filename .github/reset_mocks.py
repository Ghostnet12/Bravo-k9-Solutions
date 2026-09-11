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

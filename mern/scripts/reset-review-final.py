from pathlib import Path
root = Path(__file__).resolve().parents[1]
a = root / 'client/src/StaffInbox.jsx'
s = a.read_text()
old = '<label>Reply<textarea'
assert s.count(old) == 1
s = s.replace(old, '<label htmlFor="staff-reply">Reply<textarea id="staff-reply" aria-label="Reply"')
a.write_text(s)
a = root / 'tests/reset.browser.py'
s = a.read_text()
assert s.count("page.get_by_label('Reply',exact=True)") == 2
s = s.replace("page.get_by_label('Reply',exact=True)", "page.locator('#staff-inbox textarea')")
a.write_text(s)
print('Stabilized explicit accessible names for the inbox reply and its browser locator.')

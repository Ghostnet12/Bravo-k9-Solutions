from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
def edit(path, old, new, count=1):
    file = ROOT / path; text = file.read_text()
    if text.count(old) != count: raise RuntimeError(f'{path}: expected {count} exact targets for {old[:90]!r}, found {text.count(old)}')
    file.write_text(text.replace(old, new))

# Polling must not swallow a failed clear, or pretend that it succeeded.
a = 'client/src/CommunityPage.jsx'
edit(a, "  const [notice, setNotice] = useState('');", "  const [notice, setNotice] = useState(''), [clearError, setClearError] = useState('');")
edit(a, "clearing.current = true; generation.current++; setBusy(true); setError(''); setNotice('');", "clearing.current = true; generation.current++; setBusy(true); setError(''); setClearError(''); setNotice('');")
edit(a, "    } catch (err) { if (alive.current) setError(err.message); }\n    finally { clearing.current = false;", "    } catch (err) { if (alive.current) setClearError(err.message); }\n    finally { clearing.current = false;")
edit(a, '    <Notice error>{error}</Notice><Notice>{notice}</Notice>', '    <Notice error>{clearError || error}</Notice><Notice>{notice}</Notice>')
a = 'client/src/StaffInbox.jsx'
edit(a, '  const epoch = useRef(0)', "  const [clearError, setClearError] = useState('');\n  const epoch = useRef(0)")
edit(a, "paused.current = true; epoch.current++; setBusy(true); setError(''); setNotice('');", "paused.current = true; epoch.current++; setBusy(true); setError(''); setClearError(''); setNotice('');")
edit(a, "    } catch (err) { if (alive.current) setError(err.message); }\n    finally { paused.current = false;", "    } catch (err) { if (alive.current) setClearError(err.message); }\n    finally { paused.current = false;")
edit(a, '<Notice error>{error}</Notice><Notice>{notice}</Notice>', '<Notice error>{clearError || error}</Notice><Notice>{notice}</Notice>')
# Explicit accessible naming avoids combining option text with the select label.
edit(a, '<label>Conversation<select disabled=', '<label htmlFor="staff-conversation">Conversation<select id="staff-conversation" aria-label="Conversation" disabled=')

a = 'tests/reset.browser.py'
edit(a, 'import asyncio, json, os, threading', 'import asyncio, json, os, threading, traceback')
edit(a, "'writes':[]}", "'writes':[], 'fail_clear':False}")
edit(a, "if path == '/chat/clear': state['cleared'].add(body['channel'])", "if path == '/chat/clear':\n          if state['fail_clear']:\n            await r.fulfill(status=503, content_type='application/json', body=json.dumps({'error':'Test clear failed. Please try again.'})); return\n          state['cleared'].add(body['channel'])")
edit(a, "headers={'Cache-Control':'private, no-store'}", "headers={'Cache-Control':'private, no-store', 'Access-Control-Allow-Origin':ORIGIN, 'Access-Control-Allow-Credentials':'true'}")
# Wait for routed fetches before unloading the fixture document. Do not change
# the production application's origin/security configuration to suit a test.
edit(a, "    try:\n      await page.goto", "    async def go(path):\n      await page.wait_for_load_state('networkidle')\n      await page.goto(ORIGIN+path)\n      await page.wait_for_load_state('networkidle')\n    try:\n      await page.goto")
for path, count in [('/portal',1),('/admin',2),('/community',1)]:
    edit(a, f"await page.goto(ORIGIN+'{path}')", f"await go('{path}')", count)
edit(a, "      await page.reload();", "      await page.wait_for_load_state('networkidle'); await page.reload(); await page.wait_for_load_state('networkidle');")
edit(a, "page.get_by_label('Conversation',exact=True)", "page.locator('#staff-inbox select')", 2)
# Clear error and local draft must remain visible when the server rejects a clear.
edit(a, "      await page.get_by_role('button',name='Refresh & clear my chat',exact=True).click();", "      state['fail_clear'] = True\n      await page.get_by_role('button',name='Refresh & clear my chat',exact=True).click()\n      await expect(page.get_by_text('Test clear failed. Please try again.',exact=True)).to_be_visible()\n      await page.wait_for_timeout(750)\n      await expect(page.get_by_text('Test clear failed. Please try again.',exact=True)).to_be_visible()\n      await expect(page.get_by_label('Your message')).to_have_value('unsent message')\n      await expect(page.get_by_text('Old test message',exact=True)).to_be_visible()\n      state['fail_clear'] = False\n      report.append({'test':'failed room clear preserves draft, messages and error','pass':True})\n      await page.get_by_role('button',name='Refresh & clear my chat',exact=True).click();")
edit(a, "      await page.get_by_role('button',name='Refresh & clear my inbox',exact=True).click();", "      state['fail_clear'] = True\n      await page.get_by_role('button',name='Refresh & clear my inbox',exact=True).click()\n      await expect(page.get_by_text('Test clear failed. Please try again.',exact=True)).to_be_visible()\n      await expect(page.get_by_label('Reply',exact=True)).to_have_value('old reply')\n      await expect(page.locator('.direct-history .conversation-message')).to_have_count(1)\n      await expect(page.get_by_text('Test clear failed. Please try again.',exact=True)).to_be_visible()\n      state['fail_clear'] = False\n      report.append({'test':'failed inbox clear preserves draft, messages and error','pass':True})\n      await page.get_by_role('button',name='Refresh & clear my inbox',exact=True).click();")
edit(a, '    except Exception:\n      await page.screenshot', "    except Exception:\n      (OUT/f'{name}-failure.txt').write_text(traceback.format_exc())\n      await page.screenshot")
# Restore the durable CI to read-only; this one-time mutating workflow is removed
# from the final tested tree before it is promoted to production.
(ROOT.parent / '.github/workflows/reset-browser-check.yml').write_text('''name: Reset mobile browser checks
on:
  push:
    branches: [fix/scheduler-reset-20260911, bravo-mern]
    paths: ['mern/**', '.github/workflows/reset-browser-check.yml']
permissions:
  contents: read
jobs:
  browser:
    runs-on: ubuntu-latest
    timeout-minutes: 12
    defaults:
      run:
        working-directory: mern
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: npm
          cache-dependency-path: mern/package-lock.json
      - run: npm ci
      - run: npm run build
      - run: python3 -m pip install playwright==1.57.0
      - run: python3 -m playwright install --with-deps webkit chromium > /tmp/playwright-install.log 2>&1 || { tail -80 /tmp/playwright-install.log; exit 1; }
      - name: WebKit mobile and desktop regressions
        run: BRAVO_BROWSER=webkit python3 tests/reset.browser.py
      - name: Chromium mobile and desktop regressions
        run: BRAVO_BROWSER=chromium python3 tests/reset.browser.py
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: reset-browser-results
          path: mern/browser-test-output
          retention-days: 3
''')
print('Applied accessible select naming, durable clear errors and isolated browser test corrections.')

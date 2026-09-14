import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { DateTime } from 'luxon';
import { SERVICES } from '../shared/catalog.js';
import { creditedEnd, lastCoveredDay } from '../shared/day-credits.js';
const dist = fileURLToPath(new URL('../client/dist/', import.meta.url)), html = await readFile(`${dist}/bravo-shell.html`, 'utf8');
const app = express(); app.use(express.static(dist)); app.get('/{*path}', (_req, res) => res.type('html').send(html));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); const origin = `http://127.0.0.1:${server.address().port}`;
const staffId = 'aaaaaaaaaaaaaaaaaaaaaaaa', clientId = 'bbbbbbbbbbbbbbbbbbbbbbbb', bookingId = 'cccccccccccccccccccccccc';
await mkdir('test-results', { recursive: true });
try {
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch();
    try {
      for (const [roleName, width] of [['staff', 320], ['admin', 390], ['owner', 1440]]) {
        const context = await browser.newContext({ viewport: { width, height: 844 } }), page = await context.newPage();
        const now=DateTime.fromISO(roleName==='owner'?'2026-09-25T08:00':'2026-09-11T08:00',{zone:'America/Chicago'});
        const end=now.startOf('day').plus({days:6}),start=now.startOf('day').minus({days:24});
        const missed=now.plus({days:roleName==='staff'?-1:1}).toISODate(),otherDate=now.plus({days:3}).toISODate();
        const creditDate=lastCoveredDay(creditedEnd(end.toISO(),1)),month=now.toFormat('yyyy-MM');
        const dateName=date=>new RegExp(`^${DateTime.fromISO(date).toFormat('ccc, LLL d')},`);
        await page.clock.setFixedTime(now.toJSDate());
        let role = roleName === 'staff' ? 'staff' : 'owner', savedBody, changesBody, credits = [];
        const creditRequests=[];
        let term = { stripeId: 'grant:browser', serviceIds: ['training'], source: 'grant', status: 'active', autoPayDisabled: true, dogCount: 1, bookingId, validFrom: start.toUTC().toISO(), validUntil: end.toUTC().toISO() };
        let booking = { _id: bookingId, dogName: 'Gunner', visits: [{ date: missed, time: '10:00', service: 'training' },{date:missed,time:'11:00',service:'training'},{date:otherDate,time:'10:00',service:'training'}], cancelledVisits: [], staffId, staffIds: [staffId], termStartsAt: term.validFrom, termEndsAt: term.validUntil, updatedAt: now.toUTC().toISO() };
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.route('**/api/**', async route => {
          const url = new URL(route.request().url()), path = url.pathname; let json = {};
          const person = { _id: staffId, id: staffId, role, name: 'Trainer', isPrimaryOwner: roleName === 'owner' };
          if (path === '/api/auth/me') json = { user: role === 'member' ? { id: clientId, role, name: 'Current client' } : person, services: ['training'], membership: { active: true } };
          else if (path === '/api/config') json = { connected: true, services: SERVICES, schedule: { enabled: true, weekdays: [1, 2, 3, 4, 5, 6, 7], hours: ['10:00', '11:00'] } };
          else if (path === '/api/site-images') json = { images: {} };
          else if (path === '/api/notifications') json = { items: [] };
          else if (path === '/api/team') json = { team: [person] };
          else if (path === '/api/admin') json = { role, settings: { enabled: true, weekdays: [1, 2, 3, 4, 5], hours: ['10:00'] }, team: [person], bookings: [], blocks: [], inbox: [] };
          else if (path === '/api/admin/services') json = { services: SERVICES };
          else if (path === '/api/admin/reviews') json = { reviews: [] };
          else if (path === `/api/admin/trainers/${staffId}/clients`) json = { clients: [] };
          else if (path === '/api/admin/clients') json = { clients: [{ _id: clientId, name: 'Current client', dogName: 'Gunner' }] };
          else if (path === '/api/client-schedule/credits') {
            savedBody = route.request().postDataJSON();
            creditRequests.push(savedBody);
            if(roleName==='staff'&&creditRequests.length===1)return route.fulfill({status:503,json:{error:'Could not save. Try again.'}});
            const afterEnd = creditedEnd(term.validUntil, savedBody.days).toISOString();
            credits = [{ _id: 'credit-fixture', days: savedBody.days, termId: term.stripeId, reason: savedBody.reason||'Other', note: savedBody.note, missedDate: savedBody.missedDates?.[0], missedDates:savedBody.missedDates, beforeEnd: term.validUntil, afterEnd, createdAt: now.toISO() }];
            term = { ...term, validUntil: afterEnd, creditedDays: savedBody.days };
            booking = { ...booking, termEndsAt: afterEnd, visits: booking.visits.filter(v=>v.date!==savedBody.missedDates?.[0]), cancelledVisits: booking.visits.filter(v=>v.date===savedBody.missedDates?.[0]), updatedAt: now.plus({ seconds: 1 }).toUTC().toISO() };
            json = { ok: true, credit:{afterEnd}, message: '1 day credited. The membership end date and client schedule are updated. No charge was made.' };
          } else if (path === '/api/client-schedule/changes') {
            changesBody = route.request().postDataJSON(); booking.visits.push(...changesBody.additions.map(visit => ({ ...visit, service: 'training' }))); json = { ok: true, message: 'Schedule saved.' };
          } else if (path === '/api/client-schedule') json = { client: { id: clientId, name: 'Current client' }, terms: [term], dayCredits: credits, trainingBookings: [booking], visits: [...booking.visits.map(v => ({ ...v, status: 'confirmed' })), ...booking.cancelledVisits.map(v => ({ ...v, status: 'cancelled' }))].filter(v=>v.date.startsWith(url.searchParams.get('month'))).map(v => ({ ...v, bookingId, dogName: 'Gunner', paymentStatus: 'covered', trainer: 'Trainer', staffId })) };
          else if (path === '/api/availability') {
            const first = DateTime.fromISO(url.searchParams.get('from'));
            json = { days: Array.from({ length: first.daysInMonth }, (_, i) => ({ date: first.plus({ days: i }).toISODate(), slots: ['10:00', '11:00'], businessHours: ['10:00', '11:00'], workingHours: ['10:00', '11:00'], reservedTimes: [] })) };
          }
          await route.fulfill({ json });
        });
        try {
          await page.goto(`${origin}/admin?tab=schedule`);
          const desk = page.locator('.staff-day-credits'); await desk.locator(':scope > summary').click();
          await desk.getByLabel('Client name or email').fill('Current'); await desk.getByRole('button', { name: 'Find client for credit' }).click();
          await desk.getByLabel('Client to credit').selectOption(clientId);
          await desk.getByRole('link',{name:'Open Current client’s calendar',exact:true}).click();
          const editor=page.getByRole('region',{name:'Add or Cancel Date',exact:true});
          await editor.waitFor();await page.getByText('Checking available times…').waitFor({state:'hidden'});
          const checkbox=editor.getByRole('checkbox',{name:'Give credit for this day',exact:true});
          assert.equal(await checkbox.isDisabled(),true);
          assert.equal(await editor.getByLabel('Membership to credit').count(),0);
          assert.equal(await editor.getByLabel('Days to credit').count(),0);
          assert.equal(await editor.getByLabel('Reason',{exact:true}).count(),0);
          const grid=editor.locator('.edit-calendar');
          await grid.getByRole('button',{name:dateName(missed)}).click();
          assert.equal(await grid.getByRole('button',{name:dateName(missed)}).getAttribute('aria-pressed'),'true');
          assert.equal(await checkbox.isEnabled(),true);
          if(roleName==='admin'){
            await grid.getByRole('button',{name:dateName(otherDate)}).click();
            assert.equal(await editor.getByRole('checkbox',{name:'Give credit for selected days',exact:true}).isEnabled(),true);
            await grid.getByRole('button',{name:dateName(otherDate)}).click();
            await editor.getByRole('button',{name:'11:00 AM',exact:true}).click();
            assert.equal(await checkbox.isDisabled(),true);
            await editor.getByRole('button',{name:'Reset changes',exact:true}).click();
            await grid.getByRole('button',{name:dateName(missed)}).click();
          }
          await checkbox.check();
          assert.equal(await editor.locator('.bulk-times').count(),0);
          assert.equal(await editor.locator('.single-date-editor').count(),0);
          assert.match(await editor.locator('.credit-preview').innerText(),new RegExp(DateTime.fromISO(creditDate).toFormat('ccc, LLL d')));
          const note=editor.getByLabel('Note to the client',{exact:true});
          assert.equal(await note.getAttribute('required'),null);
          if(roleName==='admin')await note.fill('Rain day');
          await editor.locator('.calendar-credit-action').filter({has:checkbox}).scrollIntoViewIfNeeded();
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
          await page.screenshot({path:`test-results/simple-credit-form-${engineName}-${roleName}.png`});
          await editor.getByRole('button',{name:'Save',exact:true}).click();
          if(roleName==='staff'){
            await editor.getByText('Could not save. Try again.',{exact:true}).waitFor();
            assert.equal(await checkbox.isChecked(),true);
            await editor.getByRole('button',{name:'Save',exact:true}).click();
            assert.equal(creditRequests[0].requestKey,creditRequests[1].requestKey);
          }
          await page.getByText('7 days remaining',{exact:true}).waitFor();
          assert.equal(savedBody.days,1);assert.equal(savedBody.note,roleName==='admin'?'Rain day':'');
          assert.deepEqual(savedBody.missedDates,[missed]);assert.equal(savedBody.includeWeekends,false);assert.equal(savedBody.termId,term.stripeId);
          assert.match(savedBody.requestKey,/^[a-f\d-]{36}$/);assert.equal(changesBody,undefined);
          assert.equal(booking.cancelledVisits.length,2);assert.equal(booking.visits.length,1);
          assert.equal(booking.visits[0].date,otherDate);
          assert.match(page.url(),new RegExp(`month=${creditDate.slice(0,7)}`));
          assert.equal(new URL(page.url()).searchParams.has('edit'),false);
          const savedGrid=page.getByLabel('Saved monthly schedule');
          const creditedDay=savedGrid.getByRole('button',{name:dateName(creditDate)});
          assert.equal(await creditedDay.getAttribute('aria-pressed'),'true');
          assert.match(await creditedDay.innerText(),/credit/i);
          await creditedDay.scrollIntoViewIfNeeded();
          await page.screenshot({path:`test-results/simple-credit-saved-${engineName}-${roleName}.png`});
          // The original date is cancelled, and selecting it again cannot give another credit.
          await page.getByLabel('Schedule month',{exact:true}).fill(month);
          await page.getByRole('button',{name:'Add or Cancel Date',exact:true}).waitFor();
          await savedGrid.getByRole('button',{name:dateName(missed)}).click();
          assert.equal(await page.locator('.schedule-visit:visible').getByText('CANCELLED',{exact:true}).count(),2);
          await page.getByRole('button',{name:'Add or Cancel Date',exact:true}).click();
          await page.getByText('Checking available times…').waitFor({state:'hidden'});
          await grid.getByRole('button',{name:dateName(missed)}).click();
          await editor.getByText('A selected day has already been credited.',{exact:true}).waitFor();
          assert.equal(await checkbox.isDisabled(),true);
          // Clients see the same Credit day and can book it, but cannot issue credits.
          await page.waitForLoadState('networkidle');
          role='member';await page.goto(`${origin}/schedule?month=${creditDate.slice(0,7)}`);
          await page.getByText('7 days remaining',{exact:true}).waitFor();
          assert.match(await savedGrid.getByRole('button',{name:dateName(creditDate)}).innerText(),/credit/i);
          await page.getByRole('button',{name:'Add or Cancel Date',exact:true}).click();
          await page.getByText('Checking available times…').waitFor({state:'hidden'});
          assert.equal(await checkbox.count(),0);
          await grid.getByRole('button',{name:dateName(creditDate)}).click();
          await editor.getByRole('button',{name:'10:00 AM',exact:true}).click();
          await editor.getByRole('button',{name:'Save changes',exact:true}).click();
          await page.getByText('Schedule saved.',{exact:true}).waitFor();
          assert.equal(changesBody.additions[0].date,creditDate);assert.equal(changesBody.note,'');
          assert.deepEqual(errors,[]);
          console.log(`${engineName} ${roleName}: select date, optional note, atomic cancel/credit, retry, duplicate guard and replacement booking passed`);
        } catch(error) {
          await page.screenshot({path:`test-results/simple-credit-failure-${engineName}-${roleName}.png`,fullPage:true}).catch(()=>{});
          await writeFile(`test-results/simple-credit-failure-${engineName}-${roleName}.txt`,JSON.stringify({url:page.url(),errors,body:await page.locator('body').innerText()},null,2));
          throw error;
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally { server.close(); }

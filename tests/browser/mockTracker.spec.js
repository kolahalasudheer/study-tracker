import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';

async function backend(page, seeded = false) {
  const store = { mock_tests: [], mock_test_errors: [], mock_test_subjects: [], exam_profiles: [] };
  let sequence = 1;
  const stamp = () => ({ id: `record-${sequence++}`, user_id: 'alice', created_at: new Date().toISOString() });
  if (seeded) {
    store.mock_tests = [
      { ...stamp(), name: 'Full mock 5', test_date: '2026-11-02', category: 'full', marks_obtained: 72, total_marks: 100, negative_marks: 3.5, correct_count: 44, wrong_count: 9, unattempted_count: 12, time_minutes: 120, time_allowed_minutes: 120, subjects: ['OS', 'COA'], notes: 'Review cache mapping before the next mock.' },
      { ...stamp(), name: 'OS sectional', test_date: '2026-10-26', category: 'subject', marks_obtained: 35, total_marks: 50, negative_marks: 2, correct_count: 22, wrong_count: 6, time_minutes: 55, time_allowed_minutes: 60, subjects: ['OS'] },
      { ...stamp(), name: 'Full mock 4', test_date: '2026-10-19', category: 'full', marks_obtained: 64, total_marks: 100, negative_marks: 5, correct_count: 40, wrong_count: 12, time_minutes: 130, time_allowed_minutes: 120, subjects: ['OS', 'COA'] },
    ];
    store.mock_test_errors = [
      { ...stamp(), test_id: store.mock_tests[0].id, topic: 'Cache mapping', subject: 'COA', error_type: 'Concept gap', marks_lost: 3, incorrect_approach: 'Mixed up set and line indexing.', correct_approach: 'Calculate the index bits first.', reason: '', revision_status: 'pending' },
      { ...stamp(), test_id: store.mock_tests[1].id, topic: 'Deadlocks', subject: 'OS', error_type: 'Misread question', marks_lost: 2, incorrect_approach: '', correct_approach: '', reason: '', revision_status: 'revised', revised_at: '2026-11-03T08:00:00Z' },
      { ...stamp(), test_id: store.mock_tests[2].id, topic: 'Cache mapping', subject: 'COA', error_type: 'Time pressure', marks_lost: 4, incorrect_approach: '', correct_approach: '', reason: '', revision_status: 'pending' },
    ];
    store.mock_test_subjects = [{ ...stamp(), test_id: store.mock_tests[0].id, subject_name: 'OS', marks_obtained: 20, total_marks: 25 }, { ...stamp(), test_id: store.mock_tests[0].id, subject_name: 'COA', marks_obtained: 10, total_marks: 20 }];
  }
  await page.route('https://mock-tracker.example.test/**', async route => {
    const req = route.request(), url = new URL(req.url()), name = url.pathname.split('/').at(-1);
    let result;
    if (name === 'save_mock_with_subjects') {
      const { p_id, p_mock, p_subjects } = req.postDataJSON();
      const id = p_id || stamp().id;
      const existing = store.mock_tests.find(t => t.id === id);
      const row = { ...(existing || stamp()), ...p_mock, id };
      store.mock_tests = store.mock_tests.filter(t => t.id !== id).concat(row);
      store.mock_test_subjects = store.mock_test_subjects.filter(s => s.test_id !== id).concat(p_subjects.map(s => ({ ...stamp(), ...s, test_id: id })));
      result = id;
    } else if (store[name]) {
      const id = url.searchParams.get('id')?.replace('eq.', '');
      const owner = url.searchParams.get('user_id')?.replace('eq.', '');
      if (req.method() === 'GET') result = store[name].filter(r => !owner || r.user_id === owner);
      if (req.method() === 'POST') { const row = { ...stamp(), ...req.postDataJSON() }; store[name].push(row); result = { id: row.id }; }
      if (req.method() === 'PATCH') { const row = store[name].find(r => r.id === id); Object.assign(row, req.postDataJSON()); result = { id }; }
      if (req.method() === 'DELETE') {
        store[name] = store[name].filter(r => r.id !== id); result = { id };
        if (name === 'mock_tests') for (const child of ['mock_test_subjects', 'mock_test_errors']) store[child] = store[child].filter(r => r.test_id !== id);
      }
    } else result = {};
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result), headers: { 'access-control-allow-origin': '*' } });
  });
  return store;
}

test('minimal mock, edit, linked mistake, filters, export, revision, reload and deletion', async ({ page }) => {
  await backend(page);
  await page.goto('/tests/fixtures/mock-tracker.html');
  await expect(page.getByText('Your next mock starts here')).toBeVisible();
  await page.getByRole('button', { name: '+ Add mock', exact: true }).click();
  await page.getByLabel('Test name *', { exact: true }).fill('My first mock');
  await page.getByLabel('Marks obtained *', { exact: true }).fill('40');
  await page.getByRole('button', { name: 'Save mock', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My first mock' })).toBeVisible();
  await expect(page.locator('.mocktests-metrics').getByText('—', { exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Marks obtained *', { exact: true }).fill('60');
  await page.getByLabel('Correct questions', { exact: true }).fill('12');
  await page.getByLabel('Wrong questions', { exact: true }).fill('3');
  await page.getByLabel('Time taken (minutes)', { exact: true }).fill('70');
  await page.getByLabel('Time allowed (minutes)', { exact: true }).fill('60');
  await page.getByLabel('Negative marks', { exact: true }).fill('1.5');
  await page.getByText('Subject score breakdown', { exact: true }).click();
  await page.getByRole('button', { name: '+ Add subject score' }).click();
  await page.getByLabel('Subject 1', { exact: true }).fill('OS');
  await page.locator('#subject-score-0').fill('10'); await page.locator('#subject-max-0').fill('20');
  await page.getByRole('button', { name: 'Save mock', exact: true }).click();
  await expect(page.locator('.mocktests-metrics').getByText('80%', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '+ Add error', exact: true }).click();
  await page.getByLabel('Topic / concept *', { exact: true }).fill('Deadlocks');
  await page.getByLabel('Subject', { exact: true }).fill('OS');
  await page.getByLabel('Marks lost', { exact: true }).fill('2.5');
  await page.getByLabel('What went wrong?', { exact: true }).fill('Misread the resource allocation.');
  await page.getByRole('button', { name: 'Save error', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Deadlocks' })).toBeVisible();
  await page.getByText('Details & actions', { exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Marks lost', { exact: true }).fill('3.5');
  await page.getByRole('button', { name: 'Save error', exact: true }).click();
  await page.getByRole('button', { name: 'Mark revised', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Undo revision' })).toBeVisible();
  await page.getByLabel('Revision', { exact: true }).selectOption('pending');
  await expect(page.getByText('No matching errors')).toBeVisible();
  await page.getByLabel('Revision', { exact: true }).selectOption('revised');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export filtered CSV' }).click();
  const download = await downloadPromise;
  expect(await readFile(await download.path(), 'utf8')).toContain('Deadlocks');
  await page.reload();
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
  await expect(page.locator('.mocktests-panel')).toHaveCount(6);
  await expect(page.getByRole('heading', { name: 'Costliest topics', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Marks lost by cause per mock', exact: true })).toHaveCount(0);
  await expect(page.locator('.mocktests-column-chart').getByText('116.67%', { exact: true }).first()).toBeVisible();
  await page.getByRole('tab', { name: 'Error Log', exact: true }).click();
  await page.getByRole('button', { name: 'Undo revision' }).click();
  await expect(page.getByRole('button', { name: 'Mark revised' })).toBeVisible();
  await page.getByLabel('Search topic, subject, mock or explanation').fill('not-present');
  await expect(page.getByText('No matching errors')).toBeVisible();
  await page.getByLabel('Search topic, subject, mock or explanation').fill('Deadlocks');
  await page.getByText('Details & actions', { exact: true }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.getByText('Make every mistake useful')).toBeVisible();
  await page.getByRole('tab', { name: 'Mocks', exact: true }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My first mock' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.getByText('Your next mock starts here')).toBeVisible();
});

test('three tabs fit mobile, landscape, tablet and desktop; capture mobile references', async ({ page }) => {
  const runtimeErrors = [];
  page.on('pageerror', e => runtimeErrors.push(e.message));
  await backend(page, true);
  await page.goto('/tests/fixtures/mock-tracker.html');
  await expect(page.getByRole('heading', { name: 'Full mock 5' })).toBeVisible();
  await expect(page.locator('.mocktests-page')).toHaveCSS('color-scheme', 'light');
  await expect(page.locator('.mocktests-tabs [aria-selected="true"]')).toHaveCSS('background-color', 'rgb(124, 92, 252)');
  await expect(page.locator('body')).toHaveCSS('background-image', /linear-gradient/);
  await mkdir('docs/mock-tracker', { recursive: true });
  for (const [name, slug] of [['Mocks', 'mocks'], ['Error Log', 'error-log'], ['Analysis', 'analysis']]) {
    await page.getByRole('tab', { name, exact: true }).click();
    await expect(page.getByRole('tab')).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `docs/mock-tracker/${slug}-mobile.png`, fullPage: true });
    if (name === 'Analysis') {
      await expect(page.getByRole('img', { name: /Score percentage by mock category/ })).toBeVisible();
      await expect(page.locator('.mocktests-column-chart')).toHaveCount(1);
    }
  }
  for (const viewport of [{ width: 320, height: 640 }, { width: 812, height: 375 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    for (const tab of ['Mocks', 'Error Log', 'Analysis']) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
  await page.getByRole('tab', { name: 'Mocks', exact: true }).click();
  await page.getByRole('button', { name: '+ Add mock', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(runtimeErrors).toEqual([]);
});

test('validation, category filter, account changes and sign out', async ({ page }) => {
  await backend(page, true);
  await page.goto('/tests/fixtures/mock-tracker.html');
  await page.getByLabel('Filter category', { exact: true }).selectOption('subject');
  await expect(page.getByRole('heading', { name: 'OS sectional' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Full mock 5' })).toHaveCount(0);
  await page.getByRole('button', { name: '+ Add mock', exact: true }).click();
  await page.getByRole('button', { name: 'Save mock', exact: true }).click();
  await expect(page.getByText('Please check these fields')).toBeVisible();
  await expect(page.locator('#mock-name')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('alert')).toBeFocused();
  await page.getByRole('button', { name: 'Switch fixture account' }).click();
  await expect(page.getByText('Your next mock starts here')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Full mock 5' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out fixture' }).click();
  await expect(page.getByText('Please sign in to use Mock Tracker.')).toBeVisible();
});

test('one title, highest raw marks, and independent category lines for score and negative marks', async ({ page }) => {
  const store = await backend(page, true);
  store.mock_tests.push(
    { id: 'mixed-test', user_id: 'alice', created_at: '2026-11-03T12:00:00Z', name: 'Mixed practice', category: 'mixed', test_date: '2026-11-03', marks_obtained: 80, total_marks: 120, negative_marks: 1, subjects: [] },
    { id: 'pyq-test', user_id: 'alice', created_at: '2026-11-04T12:00:00Z', name: 'PYQ practice', category: 'pyq', test_date: '2026-11-04', marks_obtained: 45, total_marks: 50, negative_marks: null, subjects: [] },
  );
  await page.goto('/tests/fixtures/mock-tracker.html');
  await expect(page.getByRole('heading', { name: 'Mock Tracker', exact: true })).toHaveCount(1);
  await expect(page.locator('.mocktests-page').getByRole('heading', { name: 'Mock Tracker', exact: true })).toHaveCount(0);
  const highest = page.locator('.mocktests-stat').filter({ hasText: 'Highest marks of all mocks' });
  await expect(highest).toContainText('80 / 120');
  await expect(highest).toContainText('Mixed practice');
  await expect(page.getByText('Marks lost to errors', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
  const score = page.locator('.mocktests-panel').filter({ has: page.getByRole('heading', { name: 'Score trend', exact: true }) });
  const negative = page.locator('.mocktests-panel').filter({ has: page.getByRole('heading', { name: 'Negative marks', exact: true }) });
  await expect(score.getByRole('checkbox')).toHaveCount(4);
  await expect(negative.getByRole('checkbox')).toHaveCount(4);
  await expect(score.locator('g[data-category]')).toHaveCount(4);
  await expect(negative.locator('g[data-category]')).toHaveCount(3); // Missing PYQ negative marks stays missing.
  await score.getByRole('checkbox', { name: /Full mock/ }).uncheck();
  await expect(score.locator('g[data-category="full"]')).toHaveCount(0);
  await expect(negative.locator('g[data-category="full"]')).toHaveCount(1);
  await negative.getByRole('checkbox', { name: /Subject-wise/ }).uncheck();
  await expect(negative.locator('g[data-category="subject"]')).toHaveCount(0);
  await expect(score.locator('g[data-category="subject"]')).toHaveCount(1);
  for (const checkbox of await score.getByRole('checkbox').all()) await checkbox.uncheck();
  await expect(score.getByText('Select at least one mock category to display its trend.')).toBeVisible();
  await score.getByRole('checkbox', { name: /PYQ/ }).check();
  await expect(score.locator('g[data-category]')).toHaveCount(1);
  await expect(score.locator('g[data-category="pyq"] circle')).toHaveCount(1);
  for (const checkbox of await negative.getByRole('checkbox').all()) await checkbox.uncheck();
  await negative.getByRole('checkbox', { name: /PYQ/ }).check();
  await expect(negative.getByText('Add the relevant metrics to a mock to see this chart.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

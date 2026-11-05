# Mock Tracker

Integrated into the existing authenticated Study Tracker shell as the fifth bottom-navigation item. The feature has exactly three internal tabs: Mocks, Error Log and Analysis. It reuses the existing React/Vite application, Supabase client and Google authentication.

The layout follows the PDF references: a horizontally scrollable mock table, compact mistake rows, and vertically stacked analysis cards with line, horizontal-bar and vertical stacked-column charts. Styling follows the other Study Tracker pages: the shared light glass cards, purple accents, rounded controls, font and background.

The Mocks summary shows highest obtained marks (with its maximum and test name) in place of marks lost. Score trend and negative-mark trends each have independent category checkboxes and separate coloured lines for Full mock, Subject-wise, Mixed-subject and PYQ. Costliest topics and per-mock cause breakdowns are omitted from Analysis. Only the app shell displays the Mock Tracker title.

Known reference gap: page 11's screenshot includes manually adding/removing topic tags and tapping tags to cycle weak/shaky/strong status. This implementation derives static topic tags from mistake logs; those manual tag controls are not implemented yet.

## Database setup

**Confirm the Supabase project and whether it is production before executing SQL. Use a separate development/test project first.** No remote migration, production deployment or merge is performed by this implementation.

1. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in an ignored `.env.local`. Use the public anon/publishable key, never a service-role key.
2. In the confirmed test project's SQL Editor, run `supabase/mock_tests.sql` if these draft tables have not already been created.
3. Run `supabase/mock_tracker_upgrade.sql`. It is transactional and repeatable. The old `mock_tests_revision_patch.sql` is unnecessary after this upgrade.
4. Restart Vite after changing environment variables. Sign in with the existing application login and open Mocks.
5. Test with two real Google accounts in separate browser profiles against that test project before release. See the checks below.

The upgrade retains draft test records, question counts, durations, subjects and explanations. It maps old error causes to the six specified causes: Conceptual mistake → Concept gap; Calculation error → Silly mistake; Formula error → Forgot formula/fact; Time management → Time pressure; Guessing → Wrong guess. Silly mistake stays unchanged. Mastered becomes Revised. Historical unknown revision dates and marks lost are left unknown. Existing zero counts/durations remain zero because their original intent cannot be recovered.

Tables:

| Table | Purpose |
| --- | --- |
| `exam_profiles` | Existing optional profile grouping; existing profiles can be selected. No profile is required to save a mock. |
| `mock_tests` | Score, date, category, optional metrics, subject tags and notes. |
| `mock_test_subjects` | Explicit subject score breakdowns; no scores inferred from tags. |
| `mock_test_errors` | Optional linked mock/profile, subject, topic, controlled cause, optional marks lost, approaches and revision state. |

Every table has `user_id` and RLS. Child tables use composite foreign keys to enforce same-user ownership. `save_mock_with_subjects` is a SECURITY INVOKER function: it derives ownership from `auth.uid()`, respects RLS, and saves the parent and subject rows in one transaction. A failed subject save rolls back the mock. Deleting a mock cascades to its subjects and errors after explicit UI confirmation. Timestamp triggers track changes and revision/undo. Users can save unlinked notebook errors.

## Calculations and behaviour

- Score: obtained / maximum × 100. Negative final scores are allowed for negative marking; the score cannot exceed the maximum.
- Average test percentage: arithmetic mean of individual score percentages. Last-three average uses the newest available one, two or three mocks and labels the actual count.
- Accuracy: correct / (correct + wrong) × 100. Unattempted is excluded. Both counts must be recorded and attempted must be positive.
- Time used: taken / allowed × 100, including overtime above 100%. Both must exist, and allowed must be positive.
- Costliest topics: explicitly logged marks lost grouped by normalized subject + topic. Causes and stacked per-mock breakdowns use the same six controlled causes and colours. Unlinked errors contribute to overall loss/topic/cause totals, but not per-mock charts.
- Subject performance: sum of recorded subject marks / sum of recorded subject maximums per normalized subject, weakest first. Subject tags do not contribute.
- Missing optional numbers are `null`, never inferred zero. Explicit zero is preserved. Numeric question counts must be non-negative integers; marks and durations accept decimals.
- Date-only input uses the app's IST helpers without UTC date shifting. Test ordering uses date, creation timestamp and ID as deterministic tie breakers.
- Histories render 15 items at a time. Reads page through Supabase responses in batches of 500 so summaries and exports include the full active dataset.
- Error search covers subject, topic, linked mock and explanations; cause, status and linked-mock filters combine. Filtered/all CSV exports use the selected profile, quote multiline values and neutralize spreadsheet formula prefixes.
- Each chart includes an empty state. Line/stacked charts offer expandable text values; bar charts display values directly.

## Verification

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run test:browser
npm.cmd run build
```

The database test runs actual PostgreSQL in memory through PGlite. It bootstraps a minimal Supabase-compatible `auth.uid()` test harness and two authenticated user IDs, then checks migration reapplication, legacy conversion, optional metrics, atomic rollback, RLS reads/writes, forged ownership, cross-user children, revision timestamps and cascades. This validates SQL behaviour locally; it does not certify the configuration or Google authentication of any remote Supabase project.

Browser tests use the installed Microsoft Edge in headless mode (`PLAYWRIGHT_CHANNEL=chromium` can select an installed Playwright Chromium instead). The Vite server receives a fake test URL/key; requests are intercepted by a synthetic backend. This fixture is not a production application entry point and no sample data enters the real tracker. Browser coverage includes create/edit/delete, cancellation, linked errors, CSV download, revision/undo, search/filter, reload, form validation, account reset/sign-out and 320/375/768/812/1440px widths. It captures these fixture screenshots:

- `mocks-mobile.png`
- `error-log-mobile.png`
- `analysis-mobile.png`

## Live preview acceptance before release

1. Apply the reviewed migration to the confirmed test project and configure a preview environment.
2. Account A: create minimal and detailed mocks, add subject scores, create linked/unlinked errors, revise/undo, filter/export, edit and reload.
3. Account B: verify A's records are inaccessible through both the UI and direct authenticated Supabase reads/updates/deletes. Verify cross-owner child inserts fail.
4. Check calculations against saved records, delete confirmation/cascades, sign-out, and all three tabs on phone/tablet.
5. Owner reviews the preview and explicitly approves before merge to main or production deployment.

Verified locally: 10 calculation/PostgreSQL tests and 4 browser acceptance tests pass; production build succeeds. Mobile screenshots above were visually inspected. Live Supabase/Google-account and hosted preview acceptance require a confirmed test project and remain separate release checks.

Existing toolchain observations: the production build reports the application's existing bundle-size warning (about 521 kB minified). `npm audit` reports 4 advisories in the existing development dependency chains (`concurrently`/`shell-quote`, `source-map-js`, and Vite). Dependency upgrades are outside this feature change.

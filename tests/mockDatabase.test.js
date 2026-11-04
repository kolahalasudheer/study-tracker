import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('migration, atomic saves and two-user RLS isolation in real PostgreSQL', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon;
      CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;`);
    await db.exec(await readFile(new URL('../supabase/mock_tests.sql', import.meta.url), 'utf8'));
    const alice = '00000000-0000-4000-8000-000000000001', bob = '00000000-0000-4000-8000-000000000002';
    await db.query('INSERT INTO auth.users VALUES ($1), ($2)', [alice, bob]);
    // Legacy records must survive controlled-cause/status migration.
    const profile = (await db.query('INSERT INTO exam_profiles(user_id,name) VALUES ($1,$2) RETURNING id', [alice, 'GATE'])).rows[0].id;
    const old = (await db.query("INSERT INTO mock_tests(user_id,exam_profile_id,name,category,total_marks,marks_obtained) VALUES ($1,$2,'Old','full',100,60) RETURNING id", [alice, profile])).rows[0].id;
    await db.query("INSERT INTO mock_test_errors(user_id,test_id,topic,error_type,revision_status,incorrect_approach) VALUES ($1,$2,'Cache','Formula error','mastered','preserve me')", [alice, old]);
    const migration = await readFile(new URL('../supabase/mock_tracker_upgrade.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    const legacy = (await db.query('SELECT * FROM mock_test_errors')).rows[0];
    assert.equal(legacy.error_type, 'Forgot formula/fact'); assert.equal(legacy.revision_status, 'revised');
    assert.equal(legacy.incorrect_approach, 'preserve me'); assert.equal(legacy.revised_at, null);
    await db.exec('SET ROLE authenticated');
    const login = id => db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id]);
    await login(alice);
    const payload = { name: 'Minimal', test_date: '2026-11-05', category: 'full', marks_obtained: -1.5, total_marks: 100, subjects: ['OS'] };
    const save = (id, mock, subjects = []) => db.query('SELECT save_mock_with_subjects($1,$2::jsonb,$3::jsonb) AS id', [id, JSON.stringify(mock), JSON.stringify(subjects)]);
    const id = (await save(null, payload, [{ subject_name: 'OS', marks_obtained: 5, total_marks: 10 }])).rows[0].id;
    const minimal = (await db.query('SELECT * FROM mock_tests WHERE id=$1', [id])).rows[0];
    assert.equal(minimal.correct_count, null); assert.equal(minimal.time_minutes, null); assert.equal(minimal.negative_marks, null);
    assert.equal(minimal.exam_profile_id, null); assert.equal(Number(minimal.marks_obtained), -1.5);
    await assert.rejects(save(id, { ...payload, name: 'Must roll back' }, [{ subject_name: 'OS', marks_obtained: 11, total_marks: 10 }]));
    assert.equal((await db.query('SELECT name FROM mock_tests WHERE id=$1', [id])).rows[0].name, 'Minimal');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM mock_test_subjects WHERE test_id=$1', [id])).rows[0].n, 1);
    await db.query("INSERT INTO mock_test_errors(user_id,test_id,topic,error_type,marks_lost) VALUES ($1,$2,'Deadlock','Concept gap',2.5)", [alice, id]);
    await db.query("INSERT INTO mock_test_errors(user_id,topic,error_type) VALUES ($1,'Unlinked','Misread question')", [alice]);
    await db.query("UPDATE mock_test_errors SET revision_status='revised' WHERE topic='Deadlock'");
    assert.ok((await db.query("SELECT revised_at FROM mock_test_errors WHERE topic='Deadlock'")).rows[0].revised_at);
    await db.query("UPDATE mock_test_errors SET revision_status='pending' WHERE topic='Deadlock'");
    assert.equal((await db.query("SELECT revised_at FROM mock_test_errors WHERE topic='Deadlock'")).rows[0].revised_at, null);
    await login(bob);
    for (const table of ['exam_profiles', 'mock_tests', 'mock_test_errors', 'mock_test_subjects']) {
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n, 0, `${table} hides Alice's rows`);
      assert.equal((await db.query(`DELETE FROM ${table} RETURNING id`)).rows.length, 0);
    }
    assert.equal((await db.query("UPDATE mock_tests SET name='stolen' WHERE id=$1 RETURNING id", [id])).rows.length, 0);
    await assert.rejects(save(id, payload));
    await assert.rejects(save(null, { ...payload, exam_profile_id: profile }));
    await assert.rejects(db.query("INSERT INTO mock_test_errors(user_id,test_id,topic,error_type) VALUES ($1,$2,'Cross user','Concept gap')", [bob, id]));
    await assert.rejects(db.query("INSERT INTO mock_test_subjects(user_id,test_id,subject_name,marks_obtained,total_marks) VALUES ($1,$2,'OS',1,2)", [bob, id]));
    await assert.rejects(db.query("INSERT INTO mock_test_errors(user_id,topic,error_type) VALUES ($1,'Forged owner','Concept gap')", [alice]));
    const bobId = (await save(null, { ...payload, name: 'Bob mock' })).rows[0].id;
    await login(alice);
    assert.equal((await db.query('SELECT * FROM mock_tests WHERE id=$1', [bobId])).rows.length, 0);
    await save(id, { ...payload, name: 'Updated' }, []);
    assert.equal((await db.query('SELECT * FROM mock_test_subjects WHERE test_id=$1', [id])).rows.length, 0);
    await db.query('DELETE FROM mock_tests WHERE id=$1', [id]);
    assert.equal((await db.query('SELECT * FROM mock_test_errors WHERE test_id=$1', [id])).rows.length, 0);
    await db.exec("RESET ROLE; SET ROLE anon; SELECT set_config('request.jwt.claim.sub', '', false)");
    await assert.rejects(save(null, payload));
  } finally { await db.close(); }
});

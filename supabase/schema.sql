-- Run this in Supabase Dashboard → SQL Editor (safe to re-run)

create table if not exists user_app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  today_minutes integer not null default 0,
  week_minutes integer not null default 0,
  streak integer not null default 0,
  total_minutes integer not null default 0,
  buddy_code text unique,
  today_sessions jsonb not null default '[]'::jsonb,
  week_daily jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists buddy_codes (
  code text primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade
);

create table if not exists buddy_links (
  user_id uuid not null references auth.users(id) on delete cascade,
  buddy_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, buddy_id)
);

alter table public_stats add column if not exists today_sessions jsonb not null default '[]'::jsonb;
alter table public_stats add column if not exists week_daily jsonb not null default '[]'::jsonb;

-- Permanent per-day study history (you + buddies can read any date)
create table if not exists study_day_logs (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  total_minutes integer not null default 0,
  by_subject jsonb not null default '{}'::jsonb,
  sessions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create index if not exists study_day_logs_user_day_idx on study_day_logs (user_id, day desc);

alter table user_app_state enable row level security;
alter table public_stats enable row level security;
alter table buddy_codes enable row level security;
alter table buddy_links enable row level security;
alter table study_day_logs enable row level security;

drop policy if exists "Users manage own app state" on user_app_state;
create policy "Users manage own app state"
  on user_app_state for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Authenticated users read stats" on public_stats;
create policy "Authenticated users read stats"
  on public_stats for select
  using (auth.role() = 'authenticated');

drop policy if exists "Users manage own stats" on public_stats;
create policy "Users manage own stats"
  on public_stats for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own stats" on public_stats;
create policy "Users update own stats"
  on public_stats for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Authenticated users read buddy codes" on buddy_codes;
create policy "Authenticated users read buddy codes"
  on buddy_codes for select
  using (auth.role() = 'authenticated');

drop policy if exists "Users create own buddy code" on buddy_codes;
create policy "Users create own buddy code"
  on buddy_codes for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users manage own buddy links" on buddy_links;
create policy "Users manage own buddy links"
  on buddy_links for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users read buddy links involving them" on buddy_links;
create policy "Users read buddy links involving them"
  on buddy_links for select
  using (auth.uid() = user_id or auth.uid() = buddy_id);

drop policy if exists "Authenticated users read day logs" on study_day_logs;
create policy "Authenticated users read day logs"
  on study_day_logs for select
  using (auth.role() = 'authenticated');

drop policy if exists "Users insert own day logs" on study_day_logs;
create policy "Users insert own day logs"
  on study_day_logs for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own day logs" on study_day_logs;
create policy "Users update own day logs"
  on study_day_logs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own day logs" on study_day_logs;
create policy "Users delete own day logs"
  on study_day_logs for delete
  using (auth.uid() = user_id);

-- Study Chat Messages (1-on-1 private DMs and Group Lounge)
create table if not exists study_chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id text not null default 'general',
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid references auth.users(id) on delete cascade,
  sender_name text not null default 'Student',
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists study_chat_room_idx on study_chat_messages (room_id, created_at asc);

alter table study_chat_messages enable row level security;

drop policy if exists "Authenticated users read chat messages" on study_chat_messages;
create policy "Authenticated users read chat messages"
  on study_chat_messages for select
  using (
    room_id = 'general'
    or auth.uid() = sender_id
    or auth.uid() = recipient_id
  );

drop policy if exists "Authenticated users send chat messages" on study_chat_messages;
create policy "Authenticated users send chat messages"
  on study_chat_messages for insert
  with check (
    auth.uid() = sender_id
  );

-- Enable Realtime: Database → Publications or run:
-- alter publication supabase_realtime add table public_stats;
-- alter publication supabase_realtime add table user_app_state;
-- alter publication supabase_realtime add table study_day_logs;
-- alter publication supabase_realtime add table study_chat_messages;


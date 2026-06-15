-- Run this in the Supabase SQL editor (Project > SQL Editor > New query).

create extension if not exists pgcrypto;

create table if not exists fighters (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('player', 'opponent')),
  name text not null,
  avatar text,
  bio jsonb,
  moves jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists fighters_kind_created_idx on fighters (kind, created_at desc);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  player1_fighter jsonb not null,
  player2_fighter jsonb,
  player1_hp int not null default 100,
  player2_hp int not null default 100,
  player1_pick jsonb,
  player2_pick jsonb,
  turn int not null default 0,
  log jsonb not null default '[]'::jsonb,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'done')),
  winner text check (winner in ('player1', 'player2', 'draw')),
  created_at timestamptz not null default now()
);

-- Enables live updates: both players subscribe to this row via Supabase Realtime.
alter publication supabase_realtime add table matches;

-- Realtime authorizes postgres_changes against RLS using the subscriber's role (anon).
-- Without a SELECT policy, the anon key can't receive updates even though the
-- server (using the service-role key, which bypasses RLS) can read/write freely.
alter table matches enable row level security;

create policy "Allow read access to matches"
  on matches for select
  using (true);

-- ============================================================================
-- MOUNJARO TRACKER DATABASE SCHEMA
-- Run this in Supabase SQL Editor (Database → SQL Editor → New Query)
-- ============================================================================

-- Enable UUID extension (should already be enabled)
create extension if not exists "uuid-ossp";

-- ============================================================================
-- PENS TABLE
-- ============================================================================

create table public.pens (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  size decimal(4,2) not null check (size > 0),
  purchase_date timestamptz default now(),
  expiration_date date not null,
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index for faster lookups by user
create index pens_user_id_idx on public.pens(user_id);

-- Enable Row Level Security
alter table public.pens enable row level security;

-- Users can only see their own pens
create policy "Users can view own pens" on public.pens
  for select using (auth.uid() = user_id);

-- Users can insert their own pens
create policy "Users can insert own pens" on public.pens
  for insert with check (auth.uid() = user_id);

-- Users can update their own pens
create policy "Users can update own pens" on public.pens
  for update using (auth.uid() = user_id);

-- Users can delete their own pens
create policy "Users can delete own pens" on public.pens
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- DOSES TABLE
-- ============================================================================

create table public.doses (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  pen_id uuid references public.pens(id) on delete cascade not null,
  date timestamptz not null,
  mg decimal(4,2) not null check (mg > 0),
  is_completed boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for faster lookups
create index doses_user_id_idx on public.doses(user_id);
create index doses_pen_id_idx on public.doses(pen_id);
create index doses_date_idx on public.doses(date);

-- Enable Row Level Security
alter table public.doses enable row level security;

-- Users can only see their own doses
create policy "Users can view own doses" on public.doses
  for select using (auth.uid() = user_id);

-- Users can insert their own doses
create policy "Users can insert own doses" on public.doses
  for insert with check (auth.uid() = user_id);

-- Users can update their own doses
create policy "Users can update own doses" on public.doses
  for update using (auth.uid() = user_id);

-- Users can delete their own doses
create policy "Users can delete own doses" on public.doses
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- UPDATED_AT TRIGGER
-- Automatically updates the updated_at timestamp when a row is modified
-- ============================================================================

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger pens_updated_at
  before update on public.pens
  for each row execute function public.handle_updated_at();

create trigger doses_updated_at
  before update on public.doses
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- DONE!
-- Your database is now ready for the Mounjaro Tracker app
-- ============================================================================

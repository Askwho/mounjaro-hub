-- ============================================================================
-- PEN METRICS TRACKING MIGRATION
-- Add this to your Supabase SQL Editor to enable historical metrics tracking
-- ============================================================================

-- ============================================================================
-- PEN_METRICS_SNAPSHOTS TABLE
-- Stores daily snapshots of pen metrics for trend analysis
-- ============================================================================

create table public.pen_metrics_snapshots (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  pen_id uuid references public.pens(id) on delete cascade not null,
  snapshot_date date not null,

  -- Pen details at snapshot time
  pen_size decimal(4,2) not null,
  total_capacity decimal(6,2) not null,

  -- Usage metrics
  mg_used decimal(6,2) not null,
  mg_remaining decimal(6,2) not null,
  usage_efficiency decimal(5,2) not null, -- percentage

  -- Expiry tracking
  days_until_expiry integer not null,
  is_expired boolean not null,
  is_expiring_soon boolean not null,

  -- Critical metric: days between last use and expiry
  last_use_date date,
  days_between_last_use_and_expiry integer,

  -- Waste tracking
  wasted_mg decimal(6,2) default 0,
  waste_percentage decimal(5,2) default 0,

  -- Risk assessment
  risk_level text check (risk_level in ('none', 'low', 'medium', 'high')),
  estimated_days_to_empty integer,

  -- Dose counts
  total_doses integer default 0,
  completed_doses integer default 0,

  created_at timestamptz default now()
);

-- Indexes for faster lookups
create index pen_metrics_snapshots_user_id_idx on public.pen_metrics_snapshots(user_id);
create index pen_metrics_snapshots_pen_id_idx on public.pen_metrics_snapshots(pen_id);
create index pen_metrics_snapshots_date_idx on public.pen_metrics_snapshots(snapshot_date);
create unique index pen_metrics_snapshots_pen_date_idx on public.pen_metrics_snapshots(pen_id, snapshot_date);

-- Enable Row Level Security
alter table public.pen_metrics_snapshots enable row level security;

-- RLS Policies
create policy "Users can view own metrics snapshots" on public.pen_metrics_snapshots
  for select using (auth.uid() = user_id);

create policy "Users can insert own metrics snapshots" on public.pen_metrics_snapshots
  for insert with check (auth.uid() = user_id);

create policy "Users can delete own metrics snapshots" on public.pen_metrics_snapshots
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- SYSTEM_METRICS_SNAPSHOTS TABLE
-- Stores daily system-wide metrics aggregations
-- ============================================================================

create table public.system_metrics_snapshots (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  snapshot_date date not null,

  -- System-wide counts
  total_pens integer not null,
  active_pens integer not null,
  expired_pens integer not null,
  empty_pens integer not null,

  -- Capacity metrics
  total_capacity decimal(8,2) not null,
  total_used decimal(8,2) not null,
  total_remaining decimal(8,2) not null,
  total_wasted decimal(8,2) not null,

  -- Averages
  average_efficiency decimal(5,2) not null,
  average_waste_per_pen decimal(6,2) not null,

  -- Critical metrics
  avg_days_between_last_use_and_expiry decimal(6,2),
  pens_expired_with_medication integer not null,
  total_medication_wasted decimal(8,2) not null,
  pens_at_risk_count integer not null,

  created_at timestamptz default now()
);

-- Indexes
create index system_metrics_snapshots_user_id_idx on public.system_metrics_snapshots(user_id);
create index system_metrics_snapshots_date_idx on public.system_metrics_snapshots(snapshot_date);
create unique index system_metrics_snapshots_user_date_idx on public.system_metrics_snapshots(user_id, snapshot_date);

-- Enable Row Level Security
alter table public.system_metrics_snapshots enable row level security;

-- RLS Policies
create policy "Users can view own system metrics" on public.system_metrics_snapshots
  for select using (auth.uid() = user_id);

create policy "Users can insert own system metrics" on public.system_metrics_snapshots
  for insert with check (auth.uid() = user_id);

create policy "Users can delete own system metrics" on public.system_metrics_snapshots
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- AUTOMATIC DAILY SNAPSHOT FUNCTION (Optional)
-- Creates a snapshot of all metrics daily via Supabase Edge Functions or cron
-- ============================================================================

-- Note: This is a placeholder for future automation
-- You can trigger this manually or set up a scheduled job

comment on table public.pen_metrics_snapshots is 'Stores daily snapshots of individual pen metrics for historical tracking';
comment on table public.system_metrics_snapshots is 'Stores daily snapshots of system-wide metrics aggregations';

-- ============================================================================
-- DONE!
-- Historical metrics tracking is now enabled
-- ============================================================================

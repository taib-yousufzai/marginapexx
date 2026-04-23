-- Extend profiles table with any missing columns (idempotent)
-- Note: profiles table already exists from 20260421_profiles.sql
-- These are safe no-ops if columns already exist

alter table if exists public.profiles
  add column if not exists full_name text;

alter table if exists public.profiles
  add column if not exists phone text;

alter table if exists public.profiles
  add column if not exists segments text[];

alter table if exists public.profiles
  add column if not exists active bool default true;

alter table if exists public.profiles
  add column if not exists read_only bool default false;

alter table if exists public.profiles
  add column if not exists demo_user bool default false;

alter table if exists public.profiles
  add column if not exists intraday_sq_off bool default false;

alter table if exists public.profiles
  add column if not exists auto_sqoff numeric default 90;

alter table if exists public.profiles
  add column if not exists sqoff_method text default 'Credit';

alter table if exists public.profiles
  add column if not exists scheduled_delete_at timestamptz;

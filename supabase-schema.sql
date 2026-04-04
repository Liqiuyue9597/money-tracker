-- ============================================
-- MoneyTracker - Supabase Database Schema
-- Run this SQL in Supabase SQL Editor
-- ============================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================
-- Categories table
-- ============================================
create table if not exists categories (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  icon text not null default '📌',
  type text not null check (type in ('expense', 'income')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table categories enable row level security;
create policy "Users can manage own categories" on categories
  for all using (auth.uid() = user_id);

-- ============================================
-- Transactions table
-- ============================================
create table if not exists transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null check (type in ('expense', 'income')),
  amount decimal(12,2) not null,
  currency text not null default 'CNY' check (currency in ('CNY', 'USD', 'HKD')),
  category_id uuid references categories(id) on delete set null,
  note text default '',
  date date not null default current_date,
  created_at timestamptz not null default now()
);

alter table transactions enable row level security;
create policy "Users can manage own transactions" on transactions
  for all using (auth.uid() = user_id);

-- Index for efficient date-range queries
create index if not exists idx_transactions_date on transactions(user_id, date desc);

-- ============================================
-- Stock Holdings table
-- ============================================
create table if not exists stock_holdings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  symbol text not null,
  name text not null default '',
  buy_price decimal(12,4) not null,
  quantity decimal(12,4) not null,
  buy_date date not null default current_date,
  currency text not null default 'USD' check (currency in ('CNY', 'USD', 'HKD')),
  notes text default '',
  asset_type text not null default 'us' check (asset_type in ('fund', 'hk', 'us')),
  created_at timestamptz not null default now()
);

alter table stock_holdings enable row level security;
create policy "Users can manage own stock_holdings" on stock_holdings
  for all using (auth.uid() = user_id);

-- Add index for asset_type
create index if not exists idx_stock_holdings_asset_type
on stock_holdings(asset_type);

-- ============================================
-- Stock Transactions table
-- ============================================
create table if not exists stock_transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  symbol text not null,
  type text not null check (type in ('buy', 'sell')),
  price decimal(12,4) not null,
  quantity decimal(12,4) not null,
  currency text not null default 'USD' check (currency in ('CNY', 'USD', 'HKD')),
  date date not null default current_date,
  fees decimal(12,2) not null default 0,
  created_at timestamptz not null default now()
);

alter table stock_transactions enable row level security;
create policy "Users can manage own stock_transactions" on stock_transactions
  for all using (auth.uid() = user_id);

-- ============================================
-- Function: Initialize default categories for new user
-- ============================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  -- Default expense categories
  insert into categories (user_id, name, icon, type, sort_order) values
    (new.id, '餐饮', '🍜', 'expense', 1),
    (new.id, '交通', '🚗', 'expense', 2),
    (new.id, '购物', '🛍️', 'expense', 3),
    (new.id, '日用', '🏠', 'expense', 4),
    (new.id, '娱乐', '🎮', 'expense', 5),
    (new.id, '医疗', '💊', 'expense', 6),
    (new.id, '教育', '📚', 'expense', 7),
    (new.id, '通讯', '📱', 'expense', 8),
    (new.id, '服饰', '👔', 'expense', 9),
    (new.id, '旅行', '✈️', 'expense', 10),
    (new.id, '社交', '🎉', 'expense', 11),
    (new.id, '其他', '📌', 'expense', 12);

  -- Default income categories
  insert into categories (user_id, name, icon, type, sort_order) values
    (new.id, '工资', '💰', 'income', 1),
    (new.id, '奖金', '🎁', 'income', 2),
    (new.id, '投资', '📈', 'income', 3),
    (new.id, '兼职', '💼', 'income', 4),
    (new.id, '红包', '🧧', 'income', 5),
    (new.id, '其他', '📌', 'income', 6);

  return new;
end;
$$ language plpgsql security definer;

-- Trigger: auto-create categories when a new user signs up
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

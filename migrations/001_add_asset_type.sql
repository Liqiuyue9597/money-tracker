-- Add asset_type column to stock_holdings table
alter table stock_holdings
add column if not exists asset_type text not null default 'us'
check (asset_type in ('fund', 'hk', 'us'));

-- Backfill existing holdings: determine type from symbol
update stock_holdings
set asset_type =
  case
    when symbol ~ '^\d{6}$' then 'fund'  -- 6-digit fund codes
    when symbol ~ '\.HK$' then 'hk'     -- HK stocks
    else 'us'                           -- Default to US stocks
  end
where asset_type = 'us';

-- Add index for better query performance
create index if not exists idx_stock_holdings_asset_type
on stock_holdings(asset_type);

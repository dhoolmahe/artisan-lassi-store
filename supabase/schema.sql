create extension if not exists "pgcrypto";

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  flavor text not null check (flavor in ('mango', 'orange')),
  quantity integer not null check (quantity > 0),
  delivery_mode text not null check (delivery_mode in ('home_delivery', 'pickup')),
  customer_name text,
  address text,
  postcode text,
  city text,
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  stripe_session_id text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_created_at_idx on public.orders (created_at desc);

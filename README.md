# Artisan Lassi Store (Vercel + Stripe + Supabase)

This project is a simple web app to sell Artisan Lassi online.

It includes:

- flavor dropdown (`Mango Lassi`, `Orange Lassi`)
- quantity selector
- delivery mode:
  - `Home Delivery` (requires name, address, post code, city)
  - `Come & Pickup`
- Stripe Checkout payment gateway
- Supabase (free tier) order storage

## 1) Create Free Stripe Account

1. Go to [https://dashboard.stripe.com/register](https://dashboard.stripe.com/register)
2. Create your free Stripe account.
3. In Developers > API keys, copy your test secret key (`sk_test_...`).

## 2) Create Free Supabase Database

1. Go to [https://supabase.com](https://supabase.com) and create a free project.
2. Open SQL Editor and run [supabase/schema.sql](/Users/mahe/Documents/Mahe/GithubCodebase/MaheArtisanLassi/supabase/schema.sql).
3. Copy:
   - Project URL
   - Service Role key

## 3) Configure Environment Variables (Vercel)

Set the following env vars in your Vercel project:

- `STRIPE_SECRET_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

You can use [.env.example](/Users/mahe/Documents/Mahe/GithubCodebase/MaheArtisanLassi/.env.example) as reference.

## 4) Local Dev

```bash
npm install
npm run dev
```

Then open: `http://localhost:3000`

## 5) Deploy To Vercel

Deploy from this folder using Vercel (CLI or connected GitHub import).  
This codebase is ready for Vercel static + serverless deployment.

## App Structure

- [index.html](/Users/mahe/Documents/Mahe/GithubCodebase/MaheArtisanLassi/index.html) - storefront and order form
- [api/create-checkout.js](/Users/mahe/Documents/Mahe/GithubCodebase/MaheArtisanLassi/api/create-checkout.js) - creates Stripe checkout and saves pending order
- [api/confirm-order.js](/Users/mahe/Documents/Mahe/GithubCodebase/MaheArtisanLassi/api/confirm-order.js) - marks order as paid after successful payment
- [success.html](/Users/mahe/Documents/Mahe/GithubCodebase/MaheArtisanLassi/success.html) - post-payment page
- [cancel.html](/Users/mahe/Documents/Mahe/GithubCodebase/MaheArtisanLassi/cancel.html) - payment cancel page


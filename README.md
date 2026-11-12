# Retail Calculator

A modern, full-featured retail and financial calculator web application built with Next.js 15 (App Router), React 19, Tailwind CSS, Supabase Authentication, and Gemini AI.

## Features
- **Discount & Price Calculator**: Calculate retail discounts, tax rates, margins, and final prices.
- **EMI & Loan Planner**: Detailed amortization schedules, monthly interest calculations, and payment summaries.
- **Wishlist Savings Goal Tracker**: Target completion dates and progress tracking.
- **Unit & Weight Price Converter**: Bulk pricing, cost-per-gram/kg, and volume conversion.
- **Currency Converter**: Multi-currency conversion with customizable exchange rates.
- **History & PDF Export**: Export clean PDF calculation summaries and reports.
- **Supabase Authentication**: Secure login, registration, password reset, guest mode, and 1-click demo access.
- **AI Retail Assistant**: Live AI assistance powered by Gemini with search grounding.

## Deploy to Vercel

1. **Push your code to GitHub / GitLab / Bitbucket**.
2. **Import Project into Vercel**:
   - Go to [vercel.com](https://vercel.com/new).
   - Select your repository.
   - Framework Preset: **Next.js** (auto-detected).
   - Root Directory: `./`.
   - Build Command: `npm run build` (default).
   - Output Directory: `.next` (default).
3. **Configure Environment Variables** in Vercel Project Settings:
   - `GEMINI_API_KEY`: Your Google AI Studio / Gemini API key.
   - `NEXT_PUBLIC_SUPABASE_URL`: (Optional) Your Supabase project URL.
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: (Optional) Your Supabase anon/publishable key.
4. **Deploy**: Click **Deploy**. Your application will build and deploy without errors.

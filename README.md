# Mounjaro Tracker

A personal medication tracking app for Tirzepatide (Mounjaro/Zepbound) that helps you manage pen inventory, schedule doses, and visualize your medication levels over time.

## Features

- 📦 **Pen Inventory Management** - Track multiple pens, expiration dates, and remaining capacity
- 📅 **Dose Scheduling** - Plan future doses and mark them as completed
- 💉 **Syringe Extraction Detection** - Automatically identifies when doses require syringe extraction from the "golden" reserve
- 📈 **PK Decay Chart** - Visualize estimated medication concentration in your body over time
- 📊 **Dose History** - Review your complete dosing history with gaps between doses
- 🔐 **Google Sign-In** - Secure authentication with data synced across devices

## Tech Stack

- **Frontend**: React 18 + Vite
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Backend**: Supabase (PostgreSQL + Auth)
- **Hosting**: Vercel (recommended)

---

## Setup Guide

### 1. Supabase Setup

#### Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Click **"New Project"**
3. Fill in:
   - **Name**: `mounjaro-tracker`
   - **Database Password**: (save this somewhere secure)
   - **Region**: Choose closest to your users (e.g., London for UK)
4. Click **"Create new project"** and wait ~2 minutes

#### Get Your API Credentials

1. Once ready, go to **Settings → API**
2. Copy the **Project URL** (e.g., `https://xxxxx.supabase.co`)
3. Copy the **anon/public** key (starts with `eyJ...`)

#### Run the Database Schema

1. Go to **SQL Editor** (in left sidebar)
2. Click **"New Query"**
3. Paste the contents of `supabase-schema.sql`
4. Click **"Run"**

#### Enable Google Authentication

1. Go to **Authentication → Providers**
2. Find **Google** and click to expand
3. Toggle **"Enable Sign in with Google"** ON
4. You'll need to set up Google OAuth credentials:

##### Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. Go to **APIs & Services → Credentials**
4. Click **"Create Credentials" → "OAuth client ID"**
5. Configure consent screen if prompted:
   - User Type: External
   - App name: Mounjaro Tracker
   - Support email: your email
   - Save and continue through the steps
6. Back at Credentials, create OAuth client:
   - Application type: **Web application**
   - Name: Mounjaro Tracker
   - Authorized JavaScript origins: 
     - `https://your-project-id.supabase.co`
   - Authorized redirect URIs:
     - `https://your-project-id.supabase.co/auth/v1/callback`
7. Copy the **Client ID** and **Client Secret**

##### Back in Supabase

1. Paste the **Client ID** and **Client Secret** from Google
2. Click **Save**

### 2. Local Development

```bash
# Clone/download the project
cd mounjaro-app

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env with your Supabase credentials
# VITE_SUPABASE_URL=https://your-project-id.supabase.co
# VITE_SUPABASE_ANON_KEY=your-anon-key

# Start dev server
npm run dev
```

Open http://localhost:5173 in your browser.

### 3. Deploy to Vercel

#### Option A: Via GitHub (Recommended)

1. Push your code to a GitHub repository
2. Go to [vercel.com](https://vercel.com) and sign up/login
3. Click **"Add New Project"**
4. Import your GitHub repository
5. Configure environment variables:
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
6. Click **"Deploy"**

#### Option B: Via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY

# Redeploy with env vars
vercel --prod
```

### 4. Update Google OAuth Redirect URLs

After deploying, update your Google OAuth settings:

1. Go to [Google Cloud Console](https://console.cloud.google.com) → Credentials
2. Edit your OAuth client
3. Add to **Authorized JavaScript origins**:
   - `https://your-app.vercel.app`
4. Add to **Authorized redirect URIs**:
   - `https://your-project-id.supabase.co/auth/v1/callback` (should already be there)
5. Save

Also update Supabase:
1. Go to **Authentication → URL Configuration**
2. Add your Vercel URL to **Site URL** and **Redirect URLs**

---

## Pen Capacity Model

The app models Mounjaro KwikPen capacity as follows:

- **Total medication**: 5 × pen size (e.g., 10mg pen = 50mg total)
- **Click-extractable**: 4 × pen size (240 clicks at 60 clicks/dose)
- **Syringe-extractable**: 1 × pen size (the "golden" reserve)

When scheduling doses, the app:
1. Tracks which doses require syringe extraction
2. Shows click count for regular doses
3. Prevents over-booking pen capacity
4. Color-codes syringe doses in amber

---

## Privacy & Data

- All data is stored in your Supabase database
- Row Level Security ensures users can only access their own data
- No data is shared between users
- You can delete your data by deleting your account in Supabase

---

## Development

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
```

---

## License

MIT - Free for personal use.

**Disclaimer**: This app is for personal tracking only. Always consult your healthcare provider for medical advice.

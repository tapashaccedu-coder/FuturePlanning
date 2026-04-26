# FamilyWealthPlanner

A personal retirement planning app — runs on your desktop or live on the internet for free.

---

## ▶ Step 1 — Unzip the downloaded file

When you download the app from Claude, you get a `.zip` file, for example:
`FamilyWealthPlanner_strip_wrap.zip`

**How to unzip on Windows:**
1. Find the `.zip` file (usually in your **Downloads** folder)
2. **Right-click** the file
3. Click **"Extract All..."**
4. Choose where to save it — for example your **Desktop** or **Documents** folder
5. Click **Extract**

This creates a folder called `FamilyWealthPlanner` with all the files inside.

> ⚠️ **Do NOT run the `.bat` files from inside the zip** — you must extract first!

---

## 📁 What's inside the folder

After unzipping you will see:

```
FamilyWealthPlanner/
│
├── START.bat        ← Double-click to run the app on YOUR computer
├── DEPLOY.bat       ← Double-click to put the app on the internet (free)
├── README.md        ← This file
│
├── package.json     ← App configuration (do not edit)
├── index.html       ← App entry point (do not edit)
├── vite.config.js   ← Build settings (do not edit)
│
└── src/             ← All the app's source code
    ├── pages/       ← Each tab of the app
    ├── charts/      ← All the charts
    ├── engine/      ← Financial calculation engine
    └── store/       ← Data storage
```

**The two files you will use:**

| File | What it does |
|------|-------------|
| `START.bat` | Runs the app on your computer (works offline) |
| `DEPLOY.bat` | Uploads the app to the internet so you can use it anywhere |

---

## 🖥 Option A — Run on your own computer

**Requirements:** Node.js must be installed (free, one time only)

1. If you don't have Node.js: go to **https://nodejs.org**, download LTS version, install it
2. Open the `FamilyWealthPlanner` folder
3. **Double-click `START.bat`**
4. Wait ~30 seconds the first time (it installs dependencies)
5. Your browser opens at **http://localhost:5173**
6. Keep the black window open while using the app
7. Close the black window to stop the app

**Every time after that:** Just double-click `START.bat` — opens in seconds.

---

## 🌐 Option B — Run on the internet (free, use from anywhere)

This puts your app at a web address like `https://familywealthplanner.vercel.app`
so you can use it from any computer, phone, or tablet.

**Requirements:** Node.js + Git + a free GitHub account + a free Vercel account

### One-time setup:

**1. Install Node.js** (if not already installed)
→ https://nodejs.org — download LTS, install with all defaults

**2. Install Git** (if not already installed)
→ https://git-scm.com/download/win — download, install with all defaults

**3. Create a free GitHub account**
→ https://github.com — click "Sign up"

**4. Create a free Vercel account**
→ https://vercel.com — click "Sign up with GitHub"

### Deploy:

5. Open the `FamilyWealthPlanner` folder
6. **Double-click `DEPLOY.bat`**
7. Follow the on-screen instructions — it walks you through every step
8. At the end you get a live URL — **bookmark it!**

Total time: about 5–10 minutes the first time.

---

## 💾 Your data — important!

Your financial plan is saved in your **browser's storage**, not in the app files.

| Situation | What this means |
|-----------|----------------|
| Same computer, same browser | ✅ Data is there every time |
| Different computer or browser | ⚠️ Data won't be there |
| You clear browser history/cache | ⚠️ Data will be lost |

### To back up or move your plan:
1. Open the app → go to the **Scenarios** tab
2. Click **"Export JSON"** → saves a `.json` file to your computer
3. On any other computer: open the app → **"Import JSON"** → select the file

**Do this regularly as a backup!**

---

## 🔄 When you get a new version from Claude

Claude may give you an updated `.zip` file with improvements.

**If you run it locally (START.bat):**
1. Unzip the new file
2. Copy the new `src/` folder into your existing `FamilyWealthPlanner` folder (replace when asked)
3. Double-click `START.bat` — it detects the changes automatically

**If you deployed to the internet (DEPLOY.bat):**
1. Unzip the new file into your existing `FamilyWealthPlanner` folder (replace when asked)
2. Double-click `DEPLOY.bat` again
3. It will detect you already have Git/GitHub/Vercel set up and just push the update
4. Your live URL stays the same — the update goes live in ~30 seconds

---

## 🆘 Troubleshooting

**"Windows protected your PC" warning**
→ Click **"More info"** then **"Run anyway"**
This is normal for `.bat` files — they're safe.

**Black window closes immediately**
→ Right-click the `.bat` file → **"Run as administrator"**

**Browser doesn't open automatically**
→ Manually go to **http://localhost:5173** in your browser

**"npm install failed"**
→ Check your internet connection and try again

**Vercel deployment fails**
→ Go to **vercel.com** → sign in → "Add New Project" → import from GitHub manually

---

## 📞 Getting help

If something doesn't work, go back to your Claude conversation and describe:
1. Which `.bat` file you ran
2. What the error message says (take a screenshot)
3. Which step it failed on

# 📚 Folio — Library Management System

A free library management website you can host on **GitHub Pages**. It uses **Firebase** (free Spark plan) for:

- ✅ Email + password **login / sign up**
- ✅ **Forgot password** (reset link sent by email)
- ✅ **Continue with Google**
- ✅ **Logout**, "keep me signed in"
- ✅ Cloud database: books, members, issue/return, due dates, overdue fines (₹5/day by default)
- ✅ Dashboard: stats, overdue list, activity, genre chart, most borrowed
- ✅ Works on phone and desktop

Each account gets its **own private library**. No one else can read your data (see `firestore.rules`).

---

## What you need

- A **Gmail account** (use the same Gmail for GitHub and Firebase)
- A Windows PC with **Command Prompt**

In the commands below, replace:
- `yourname@gmail.com` → your Gmail
- `YOUR-GITHUB-USERNAME` → your GitHub username

---

## STEP 1 — Create a GitHub account with your Gmail

1. Go to https://github.com/signup
2. Sign up using **yourname@gmail.com** and choose a username (e.g. `rahul-lib`).
3. Verify the email GitHub sends to your Gmail.

---

## STEP 2 — Set up Firebase (login + database), with the same Gmail

1. Open https://console.firebase.google.com and sign in with **yourname@gmail.com**.
2. Click **Create a project** → name it `folio-library` → you can turn Google Analytics off → **Create**.
3. **Add a web app:** on the project home, click the **`</>` (Web)** icon → nickname `folio` → **Register app**
   (do NOT tick "Firebase Hosting"). Firebase shows a `firebaseConfig = { ... }` block.
4. Open `js/firebase-config.js` in Notepad and replace the placeholder values with yours:
   ```js
   export const firebaseConfig = {
     apiKey: "AIza....",
     authDomain: "folio-library-xxxx.firebaseapp.com",
     projectId: "folio-library-xxxx",
     storageBucket: "folio-library-xxxx.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abc123"
   };
   ```
   Save the file. (This key is meant to be public; your data is protected by the security rules.)
5. **Turn on sign-in methods:** left menu **Build → Authentication → Get started → Sign-in method**
   - **Email/Password** → Enable → Save
   - **Google** → Enable → choose your Gmail as the *support email* → Save
6. **Create the database:** left menu **Build → Firestore Database → Create database**
   - Location: **asia-south1 (Mumbai)** or the one nearest you → **Start in production mode** → Create
   - Open the **Rules** tab, delete everything, paste the contents of `firestore.rules`, and click **Publish**.
7. **Allow your GitHub site to use Google login:**
   **Authentication → Settings → Authorized domains → Add domain** →
   `YOUR-GITHUB-USERNAME.github.io` (just that, no `https://` and no path) → Add.
   (`localhost` is already allowed for local testing.)

---

## STEP 3 — Install Git and GitHub CLI (one time)

Open **Command Prompt** and run:

```cmd
winget install --id Git.Git -e
winget install --id GitHub.cli -e
```

**Close Command Prompt and open a new one** so the commands are recognised. Check:

```cmd
git --version
gh --version
```

> If `winget` is missing: install Git from https://git-scm.com/download/win and GitHub CLI from https://cli.github.com, then reopen Command Prompt.

---

## STEP 4 — Upload and publish the website (copy-paste these)

Unzip `folio-library.zip` into your **Downloads** folder, then in Command Prompt:

```cmd
git config --global user.name "Your Name"
git config --global user.email "yourname@gmail.com"

cd %USERPROFILE%\Downloads\folio-library

git init -b main
git add .
git commit -m "Folio library management system"

gh auth login
```

For `gh auth login` choose: **GitHub.com → HTTPS → Yes (authenticate Git) → Login with a web browser**.
Copy the one-time code, press Enter, and sign in to GitHub (the account made with your Gmail) in the browser.

Then create the repository, push the code, and switch on GitHub Pages:

```cmd
gh repo create folio-library --public --source=. --remote=origin --push

gh api --method POST "repos/{owner}/{repo}/pages" -f "source[branch]=main" -f "source[path]=/"
```

Wait 1–2 minutes, then open:

```
https://YOUR-GITHUB-USERNAME.github.io/folio-library/
```

You can check build status with:

```cmd
gh api "repos/{owner}/{repo}/pages" --jq ".status"
```
(`built` means it's live.)

> **Alternative without the `gh api` line:** on github.com open your repo → **Settings → Pages** →
> Source: **Deploy from a branch** → Branch **main** / **(root)** → Save.

---

## STEP 5 — First use

1. Open your site → **Create account** (or **Continue with Google**).
2. On the empty dashboard, click **Load sample library** to see everything working, or add your own books.
3. Try **Forgot password?**. The reset email comes from `noreply@<your-project>.firebaseapp.com`, so check Spam the first time.
   (You can change the email text in Firebase → Authentication → Templates.)

---

## Updating the site later

After you edit any file:

```cmd
cd %USERPROFILE%\Downloads\folio-library
git add .
git commit -m "Update"
git push
```

GitHub Pages refreshes in about a minute (press Ctrl+F5 to bypass the browser cache).

---

## Test on your PC before publishing (optional)

Google sign-in does not work when you just double-click the HTML file. Run a small local server instead.
With Python installed:

```cmd
cd %USERPROFILE%\Downloads\folio-library
python -m http.server 5500
```

Open http://localhost:5500. Press Ctrl+C to stop.

---

## Customise

In `js/firebase-config.js`:

| Setting | Default | Meaning |
|---|---|---|
| `LIBRARY_NAME` | `Folio Library` | Name shown in the sidebar |
| `LOAN_DAYS` | `14` | Default loan period |
| `FINE_PER_DAY` | `5` | Late fine per day |
| `CURRENCY` | `₹` | Currency symbol |

Colours and fonts are at the top of `css/style.css` (`:root` variables).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Yellow "Firebase isn't connected" box | You haven't pasted your config into `js/firebase-config.js` (Step 2.4), or haven't pushed it yet |
| "This website's domain isn't authorised" | Add `YOUR-GITHUB-USERNAME.github.io` in Authentication → Settings → Authorized domains |
| "This sign-in method is not enabled" | Enable Email/Password and Google in Authentication → Sign-in method |
| "Database access denied" | Publish the rules from `firestore.rules` in Firestore → Rules |
| Google popup blocked | Allow popups for the site. The app also falls back to a redirect automatically |
| 404 on GitHub Pages | Wait 2 minutes; check that Settings → Pages shows branch `main` / root; the repo must be **public** |
| `gh` / `git` not recognised | Close and reopen Command Prompt after installing |

---

## File structure

```
folio-library/
├── index.html            ← Login / Sign up / Forgot password / Google
├── app.html              ← Library dashboard (protected)
├── css/style.css         ← Design
├── js/firebase-config.js ← YOUR Firebase keys + settings
├── js/firebase.js        ← Firebase setup
├── js/auth.js            ← Authentication logic
├── js/app.js             ← Books, members, circulation, dashboard
├── firestore.rules       ← Database security rules (paste into Firebase)
└── .nojekyll             ← Tells GitHub Pages to serve files as-is
```

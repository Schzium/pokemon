# Pokédex Builder, GitHub + Android Friendly

This version is prepared for both laptop and Android browser testing.

## What changed
- Responsive layout for desktop and Android.
- Mobile cards use 1 column.
- Detail panel becomes full-screen on Android.
- Buttons and dropdowns are touch-friendly.
- Image frame and icon sizing are adjusted for small screens.
- Added `manifest.json` and `sw.js` for future PWA support.
- Ready to upload to GitHub Pages.

## How to test on laptop
Open `index.html`.

## How to publish with GitHub Pages
1. Create a new GitHub repository.
2. Upload all files from this folder.
3. Go to repository Settings.
4. Open Pages.
5. Source: Deploy from branch.
6. Branch: main, folder: `/root`.
7. Save.
8. Open the GitHub Pages link on Android.

## Important
Gen 1 works from the built-in database.
Gen 2 to Gen 9 use PokeAPI the first time, so internet is needed.
After loaded, generations are cached in localStorage.

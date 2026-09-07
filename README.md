# Dig Point Photo Logger

A mobile-first field tool for recording dig points with photos, GPS coordinates, timestamps, notes, locations, and map pins.

## Current live app

The current application is:

- `index.html` — page structure and controls
- `styles.css` — responsive/mobile styling
- `app.js` — GPS, photos, IndexedDB storage, search, edit/share/backup logic
- `sw.js` — caches the app shell for better reliability after the first online visit

The older numbered `index1.html` through `index9.html` files are historical snapshots. They are not loaded by the current app.

## Data storage

Saved points and photos remain in the existing IndexedDB database named `digPointLogger`, object store `points`, so the redesigned app remains compatible with records created by the earlier version.

Locations and interface preferences are stored in browser `localStorage`.

Because the data is stored in the browser on the device, use **Settings → Export Full Backup** regularly. A full backup includes points, photos, locations, and app settings. CSV export contains point information but intentionally does not include photos.

## Main features

- Take a new photo or upload an existing photo
- High-accuracy browser geolocation with an accuracy indicator
- Draggable draft pin before saving
- Confirmation before moving an already-saved map pin
- Name a point before saving
- Add and edit location names
- Edit point name, location, notes, timestamp, latitude, and longitude
- Add multiple photos to saved points
- Delete individual photos
- Full-screen photo viewer with a clear Back button
- Open a point in Google Maps
- Copy GPS coordinates
- Share a point through the device share sheet when available
- Search saved points by name, location, notes, or coordinates
- Filter by location
- Sort newest/oldest/name/location
- Undo a recently deleted point
- Full JSON backup/restore including photos
- CSV import/export with duplicate detection
- Browser storage usage display and persistent-storage request
- Dark, light, or device theme
- Configurable saved-point action buttons
- Online/offline status indicator
- App-shell caching for better reliability after the first online load

## Important notes

Map tiles still require network access unless the browser already has the needed tiles cached. GPS and locally stored records do not require map tiles to be available.

The application uses Leaflet 1.9.4 for mapping and stores photos at their original quality. Original-quality storage protects photo detail but can consume substantial browser storage, so backups and storage monitoring are important.

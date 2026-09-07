(() => {
  "use strict";

  const DB_NAME = "digPointLogger";
  const STORE = "points";
  const SETTINGS_KEY = "digPointLoggerSettingsV2";
  const LOCATIONS_KEY = "digLocations";
  const DRAFT_KEY = "digPointDraftV2";

  const $ = id => document.getElementById(id);

  const els = {
    pointName: $("pointName"),
    pointLocation: $("pointLocation"),
    notes: $("notes"),
    photoInput: $("photoInput"),
    uploadPhotoInput: $("uploadPhotoInput"),
    extraPhotosInput: $("extraPhotosInput"),
    preview: $("preview"),
    draftPhotoWrap: $("draftPhotoWrap"),
    photoMeta: $("photoMeta"),
    removeDraftPhotoBtn: $("removeDraftPhotoBtn"),
    gpsBtn: $("gpsBtn"),
    gpsSummary: $("gpsSummary"),
    gpsCoords: $("gpsCoords"),
    gpsAccuracy: $("gpsAccuracy"),
    status: $("status"),
    saveBtn: $("saveBtn"),
    resetDraftBtn: $("resetDraftBtn"),
    quickAddLocationBtn: $("quickAddLocationBtn"),
    mapCard: $("mapCard"),
    fitPinsBtn: $("fitPinsBtn"),
    locationFilter: $("locationFilter"),
    sortSelect: $("sortSelect"),
    searchInput: $("searchInput"),
    savedSummary: $("savedSummary"),
    log: $("log"),
    settingsBtn: $("settingsBtn"),
    settingsDialog: $("settingsDialog"),
    closeSettingsBtn: $("closeSettingsBtn"),
    closeSettingsBottomBtn: $("closeSettingsBottomBtn"),
    themeSelect: $("themeSelect"),
    defaultLayerSelect: $("defaultLayerSelect"),
    showEditPoint: $("showEditPoint"),
    showAddPhotos: $("showAddPhotos"),
    showSavePhoto: $("showSavePhoto"),
    showCopyGps: $("showCopyGps"),
    showSharePoint: $("showSharePoint"),
    showDeletePoint: $("showDeletePoint"),
    locationsEditor: $("locationsEditor"),
    saveLocationsBtn: $("saveLocationsBtn"),
    storageSummary: $("storageSummary"),
    persistStorageBtn: $("persistStorageBtn"),
    exportBackupBtn: $("exportBackupBtn"),
    backupImportInput: $("backupImportInput"),
    backupImportMode: $("backupImportMode"),
    exportCsvBtn: $("exportCsvBtn"),
    csvImportInput: $("csvImportInput"),
    clearBtn: $("clearBtn"),
    onlineBadge: $("onlineBadge"),
    undoBar: $("undoBar"),
    undoText: $("undoText"),
    undoDeleteBtn: $("undoDeleteBtn"),
    dismissUndoBtn: $("dismissUndoBtn"),
    photoModal: $("photoModal"),
    modalPhoto: $("modalPhoto"),
    modalPhotoLabel: $("modalPhotoLabel"),
    modalDownloadBtn: $("modalDownloadBtn"),
    closePhotoModal: $("closePhotoModal"),
    editPointDialog: $("editPointDialog"),
    editPointForm: $("editPointForm"),
    closeEditDialogBtn: $("closeEditDialogBtn"),
    cancelEditPoint: $("cancelEditPoint"),
    editPointTitle: $("editPointTitle"),
    editPointLocation: $("editPointLocation"),
    editPointNotes: $("editPointNotes"),
    editPointTimestamp: $("editPointTimestamp"),
    editPointLat: $("editPointLat"),
    editPointLon: $("editPointLon")
  };

  let db = null;
  let selectedPhoto = null;
  let previewUrl = "";
  let currentPosition = null;
  let pendingMarker = null;
  let markers = [];
  let renderUrls = new Set();
  let addingPhotosToPointId = null;
  let editingPointId = null;
  let lastDeletedPoint = null;
  let undoTimer = null;
  let cachedPoints = [];

  const defaultSettings = {
    theme: "system",
    defaultLayer: "street",
    showEditPoint: true,
    showAddPhotos: true,
    showSavePhoto: true,
    showCopyGps: true,
    showSharePoint: true,
    showDeletePoint: true,
    sort: "newest"
  };

  let settings = loadSettings();

  const map = L.map("map", { zoomControl: true }).setView([37.0, -120.0], 7);
  const layers = {
    street: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 20,
      attribution: "&copy; OpenStreetMap contributors"
    }),
    satellite: L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 20, attribution: "Imagery &copy; Esri, Vantor, Earthstar Geographics, GIS User Community" }
    ),
    aerial: L.tileLayer(
      "https://clarity.maptiles.arcgis.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxNativeZoom: 22, maxZoom: 22, attribution: "World Imagery (Clarity) &copy; Esri and imagery contributors" }
    )
  };

  const layerNames = {
    "Street Map": layers.street,
    "Satellite": layers.satellite,
    "High Detail Aerial": layers.aerial
  };

  (layers[settings.defaultLayer] || layers.street).addTo(map);
  L.control.layers(layerNames, null, {
    collapsed: window.matchMedia("(max-width: 620px)").matches,
    position: "topright"
  }).addTo(map);

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        return { ...defaultSettings, ...(saved && typeof saved === "object" ? saved : {}) };
      }

      // Migrate button preferences from the original single-file version.
      const migrated = { ...defaultSettings };
      const oldKeys = {
        showEditPoint: "digShowEditTitle",
        showAddPhotos: "digShowAddPhotos",
        showSavePhoto: "digShowSavePhoto",
        showDeletePoint: "digShowDeletePoint"
      };
      for (const [key, oldKey] of Object.entries(oldKeys)) {
        const oldValue = localStorage.getItem(oldKey);
        if (oldValue === "true" || oldValue === "false") migrated[key] = oldValue === "true";
      }
      return migrated;
    } catch {
      return { ...defaultSettings };
    }
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function applyTheme() {
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const effective = settings.theme === "system" ? (systemDark ? "dark" : "light") : settings.theme;
    document.documentElement.dataset.theme = effective;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", effective === "dark" ? "#101214" : "#f4f6f8");
  }

  function applyButtonVisibility() {
    document.body.classList.toggle("hide-edit-point", !settings.showEditPoint);
    document.body.classList.toggle("hide-add-photos", !settings.showAddPhotos);
    document.body.classList.toggle("hide-save-photo", !settings.showSavePhoto);
    document.body.classList.toggle("hide-copy-gps", !settings.showCopyGps);
    document.body.classList.toggle("hide-share-point", !settings.showSharePoint);
    document.body.classList.toggle("hide-delete-point", !settings.showDeletePoint);
  }

  function syncSettingsControls() {
    els.themeSelect.value = settings.theme;
    els.defaultLayerSelect.value = settings.defaultLayer;
    els.showEditPoint.checked = !!settings.showEditPoint;
    els.showAddPhotos.checked = !!settings.showAddPhotos;
    els.showSavePhoto.checked = !!settings.showSavePhoto;
    els.showCopyGps.checked = !!settings.showCopyGps;
    els.showSharePoint.checked = !!settings.showSharePoint;
    els.showDeletePoint.checked = !!settings.showDeletePoint;
    els.sortSelect.value = settings.sort || "newest";
  }

  function setStatus(message, kind = "") {
    els.status.textContent = message;
    els.status.classList.remove("good", "warn", "bad");
    if (kind) els.status.classList.add(kind);
  }

  function updateOnlineStatus() {
    const online = navigator.onLine;
    els.onlineBadge.textContent = online ? "● Online" : "● Offline";
    els.onlineBadge.classList.toggle("online", online);
    els.onlineBadge.classList.toggle("offline", !online);
  }

  function getLocations() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LOCATIONS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.map(v => String(v).trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function saveLocations(list) {
    const clean = [...new Set(list.map(v => String(v).trim()).filter(Boolean))];
    localStorage.setItem(LOCATIONS_KEY, JSON.stringify(clean));
    return clean;
  }

  function fillLocationSelect(select, firstOptions, selectedValue) {
    select.innerHTML = "";
    for (const item of firstOptions) {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      select.appendChild(option);
    }
    for (const location of getLocations()) {
      const option = document.createElement("option");
      option.value = location;
      option.textContent = location;
      select.appendChild(option);
    }
    if ([...select.options].some(o => o.value === selectedValue)) select.value = selectedValue;
  }

  function refreshLocationControls() {
    const newValue = els.pointLocation.value;
    const filterValue = els.locationFilter.value;
    const editValue = els.editPointLocation.value;

    fillLocationSelect(els.pointLocation, [{ value: "", label: "Unassigned" }], newValue);
    fillLocationSelect(els.locationFilter, [
      { value: "__all__", label: "All Locations" },
      { value: "", label: "Unassigned" }
    ], filterValue);
    fillLocationSelect(els.editPointLocation, [{ value: "", label: "Unassigned" }], editValue);
    els.locationsEditor.value = getLocations().join("\n");
  }

  function saveDraftFields() {
    const draft = {
      name: els.pointName.value,
      location: els.pointLocation.value,
      notes: els.notes.value
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }

  function restoreDraftFields() {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
      if (draft && typeof draft === "object") {
        if (typeof draft.name === "string" && draft.name.trim()) els.pointName.value = draft.name;
        if (typeof draft.notes === "string") els.notes.value = draft.notes;
        refreshLocationControls();
        if (typeof draft.location === "string" && [...els.pointLocation.options].some(o => o.value === draft.location)) {
          els.pointLocation.value = draft.location;
        }
      }
    } catch {}
  }

  function clearDraftFields({ keepLocation = true } = {}) {
    clearDraftPhoto();
    clearCurrentPosition();
    els.pointName.value = "Dig Point";
    els.notes.value = "";
    if (!keepLocation) els.pointLocation.value = "";
    saveDraftFields();
    setStatus("Draft cleared. Ready for a new point.");
  }

  function clearDraftPhoto() {
    selectedPhoto = null;
    els.photoInput.value = "";
    els.uploadPhotoInput.value = "";
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = "";
    }
    els.preview.removeAttribute("src");
    els.draftPhotoWrap.classList.add("hidden");
    els.photoMeta.textContent = "";
    updateSaveState();
  }

  function clearCurrentPosition() {
    currentPosition = null;
    if (pendingMarker) {
      map.removeLayer(pendingMarker);
      pendingMarker = null;
    }
    els.gpsSummary.classList.add("hidden");
    els.gpsCoords.textContent = "No GPS";
    els.gpsAccuracy.textContent = "";
    updateSaveState();
  }

  function updateSaveState() {
    els.saveBtn.disabled = !(selectedPhoto && currentPosition && els.pointName.value.trim());
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "Unknown";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i++;
    }
    return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function formatAccuracy(accuracy) {
    const n = Number(accuracy);
    return Number.isFinite(n) && n > 0 ? `±${Math.round(n)} m` : "accuracy unknown";
  }

  function gpsQuality(accuracy) {
    const n = Number(accuracy);
    if (!Number.isFinite(n) || n <= 0) return { label: "Accuracy unknown", kind: "warn" };
    if (n <= 8) return { label: `Excellent (${formatAccuracy(n)})`, kind: "good" };
    if (n <= 20) return { label: `Good (${formatAccuracy(n)})`, kind: "good" };
    if (n <= 50) return { label: `Fair (${formatAccuracy(n)})`, kind: "warn" };
    return { label: `Low accuracy (${formatAccuracy(n)}) — consider refreshing GPS`, kind: "bad" };
  }

  function updateGpsUi() {
    if (!currentPosition) {
      els.gpsSummary.classList.add("hidden");
      return;
    }
    const q = gpsQuality(currentPosition.accuracy);
    els.gpsSummary.classList.remove("hidden");
    els.gpsCoords.textContent = `${currentPosition.latitude.toFixed(6)}, ${currentPosition.longitude.toFixed(6)}`;
    els.gpsAccuracy.textContent = q.label;
    els.gpsAccuracy.className = `small ${q.kind}`;
  }

  function ensureDraftMarker() {
    if (!currentPosition) return;
    if (pendingMarker) map.removeLayer(pendingMarker);
    pendingMarker = L.marker([currentPosition.latitude, currentPosition.longitude], {
      draggable: true,
      title: "Current Dig Point"
    }).addTo(map);

    pendingMarker.bindPopup("<strong>Current Dig Point</strong><br>Drag this blue pin to correct the location before saving.").openPopup();

    pendingMarker.on("dragend", () => {
      const moved = pendingMarker.getLatLng();
      currentPosition.latitude = moved.lat;
      currentPosition.longitude = moved.lng;
      currentPosition.adjusted = true;
      updateGpsUi();
      setStatus(`Draft pin adjusted to ${moved.lat.toFixed(6)}, ${moved.lng.toFixed(6)}.`, "good");
    });
  }

  function requestGPS({ center = true } = {}) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("This browser does not support GPS/geolocation."));
        return;
      }
      setStatus("Getting a high-accuracy GPS location…");

      navigator.geolocation.getCurrentPosition(
        pos => {
          currentPosition = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            adjusted: false
          };
          ensureDraftMarker();
          updateGpsUi();
          updateSaveState();
          if (center) map.setView([currentPosition.latitude, currentPosition.longitude], 19);

          const q = gpsQuality(currentPosition.accuracy);
          setStatus(`GPS ready: ${currentPosition.latitude.toFixed(6)}, ${currentPosition.longitude.toFixed(6)} — ${q.label}. Drag the blue pin if the exact spot needs correction.`, q.kind);
          resolve(currentPosition);
        },
        err => {
          currentPosition = null;
          updateGpsUi();
          updateSaveState();
          const message =
            err.code === 1 ? "Location permission was denied. Allow location access for this site and try again." :
            err.code === 2 ? "Your device could not determine a GPS location. Try moving outdoors or away from obstructions." :
            "GPS timed out. Try again, preferably outdoors.";
          reject(new Error(message));
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    });
  }

  async function prepareNewPointFromPhoto(file) {
    if (!file) return;
    clearDraftPhoto();
    selectedPhoto = file;
    previewUrl = URL.createObjectURL(file);
    els.preview.src = previewUrl;
    els.draftPhotoWrap.classList.remove("hidden");
    els.photoMeta.textContent = `${file.name || "Photo"} • ${formatBytes(file.size)}`;
    updateSaveState();

    if (!currentPosition) {
      try {
        await requestGPS();
      } catch (error) {
        setStatus(`${error.message} The photo is still selected; tap Get / Refresh GPS when ready.`, "bad");
      }
    } else {
      setStatus("Photo selected. GPS is already ready; adjust the draft pin if needed, then save.", "good");
    }
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = event => {
        const database = event.target.result;
        if (!database.objectStoreNames.contains(STORE)) {
          database.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        }
      };
      request.onsuccess = event => {
        db = event.target.result;
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    });
  }

  function runStore(mode, callback) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result;
      try {
        result = callback(store, tx);
      } catch (error) {
        reject(error);
        return;
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error("Browser storage operation failed."));
      tx.onabort = () => reject(tx.error || new Error("Browser storage operation was cancelled."));
    });
  }

  function getAllPoints() {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  function getPoint(id) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function addPoint(record) {
    return runStore("readwrite", store => store.add(record));
  }

  async function putPoint(record) {
    return runStore("readwrite", store => store.put(record));
  }

  async function deletePoint(id) {
    const point = await getPoint(id);
    if (!point) return null;
    await runStore("readwrite", store => store.delete(id));
    return point;
  }

  async function clearAllPoints() {
    await runStore("readwrite", store => store.clear());
  }

  function normalizePhotos(point) {
    let photos = Array.isArray(point.photos) ? point.photos.filter(p => p && p.blob && p.blob.size > 0) : [];
    if (!photos.length && point.photo && point.photo.size > 0) {
      photos = [{
        name: point.photoName || "photo.jpg",
        type: point.photoType || point.photo.type || "image/jpeg",
        blob: point.photo
      }];
    }
    return photos;
  }

  async function addPhotosToPoint(id, files) {
    const point = await getPoint(id);
    if (!point) throw new Error("Point not found.");
    const photos = normalizePhotos(point);
    for (const file of files) {
      photos.push({
        name: file.name || "photo.jpg",
        type: file.type || "image/jpeg",
        blob: file
      });
    }
    point.photos = photos;
    if (photos.length) {
      point.photo = photos[0].blob;
      point.photoName = photos[0].name;
      point.photoType = photos[0].type;
    }
    await putPoint(point);
  }

  async function deletePhotoFromPoint(id, photoIndex) {
    const point = await getPoint(id);
    if (!point) throw new Error("Point not found.");
    const photos = normalizePhotos(point);
    if (photoIndex < 0 || photoIndex >= photos.length) throw new Error("Photo not found.");
    photos.splice(photoIndex, 1);
    point.photos = photos;
    if (photos.length) {
      point.photo = photos[0].blob;
      point.photoName = photos[0].name;
      point.photoType = photos[0].type;
    } else {
      point.photo = new Blob([], { type: "application/octet-stream" });
      point.photoName = "";
      point.photoType = "";
    }
    await putPoint(point);
  }

  function toDateTimeLocal(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function fromDateTimeLocal(value) {
    if (!value) return new Date().toISOString();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }

  function formatDateTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Unknown date/time" : date.toLocaleString();
  }

  function safeName(value, fallback = "Dig Point") {
    const text = String(value || "").trim();
    return text || fallback;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function extensionFromType(type, fallbackName = "") {
    const fromName = String(fallbackName).match(/\.([a-zA-Z0-9]{2,5})$/)?.[1];
    if (fromName) return fromName.toLowerCase();
    const t = String(type || "").toLowerCase();
    if (t.includes("png")) return "png";
    if (t.includes("webp")) return "webp";
    if (t.includes("gif")) return "gif";
    if (t.includes("heic") || t.includes("heif")) return "heic";
    return "jpg";
  }

  function fileSafe(value) {
    return safeName(value).replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").slice(0, 80);
  }

  function revokeRenderUrls() {
    for (const url of renderUrls) URL.revokeObjectURL(url);
    renderUrls.clear();
  }

  function makeObjectUrl(blob) {
    const url = URL.createObjectURL(blob);
    renderUrls.add(url);
    return url;
  }

  function noPhotoDataUri() {
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180"><rect width="100%" height="100%" fill="#222"/><text x="50%" y="50%" fill="#aaa" font-size="18" font-family="sans-serif" text-anchor="middle" dominant-baseline="middle">No Photo</text></svg>'
    );
  }

  function pointSignature(point) {
    const lat = Number(point.latitude);
    const lon = Number(point.longitude);
    return [
      safeName(point.name).toLowerCase(),
      String(point.timestamp || ""),
      Number.isFinite(lat) ? lat.toFixed(6) : "",
      Number.isFinite(lon) ? lon.toFixed(6) : ""
    ].join("|");
  }

  function getVisiblePoints(points) {
    const location = els.locationFilter.value;
    const q = els.searchInput.value.trim().toLowerCase();
    let visible = points.filter(point => {
      if (location !== "__all__" && String(point.location || "") !== location) return false;
      if (!q) return true;
      return [point.name, point.location, point.notes, point.latitude, point.longitude]
        .some(v => String(v ?? "").toLowerCase().includes(q));
    });

    const sort = els.sortSelect.value;
    visible.sort((a, b) => {
      if (sort === "oldest") return new Date(a.timestamp) - new Date(b.timestamp);
      if (sort === "name") return safeName(a.name).localeCompare(safeName(b.name));
      if (sort === "location") return String(a.location || "").localeCompare(String(b.location || "")) || safeName(a.name).localeCompare(safeName(b.name));
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
    return visible;
  }

  function clearMapMarkers() {
    for (const marker of markers) map.removeLayer(marker);
    markers = [];
  }

  function addSavedMarker(point, row) {
    const lat = Number(point.latitude);
    const lon = Number(point.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    const marker = L.marker([lat, lon], { draggable: true, title: safeName(point.name) }).addTo(map);
    const popup = [
      `<strong>${escapeHtml(safeName(point.name))}</strong>`,
      point.location ? escapeHtml(point.location) : "Unassigned",
      escapeHtml(formatDateTime(point.timestamp)),
      `${lat.toFixed(6)}, ${lon.toFixed(6)}`,
      "<em>Drag to correct this saved location.</em>"
    ].join("<br>");
    marker.bindPopup(popup);

    marker.on("click", () => {
      row.classList.add("highlight");
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => row.classList.remove("highlight"), 1800);
    });

    marker.on("dragend", async () => {
      const original = { lat, lng: lon };
      const moved = marker.getLatLng();
      const ok = confirm(
        `Move "${safeName(point.name)}" to:\n${moved.lat.toFixed(6)}, ${moved.lng.toFixed(6)}?\n\nCancel keeps the old coordinates.`
      );
      if (!ok) {
        marker.setLatLng(original);
        return;
      }
      point.latitude = moved.lat;
      point.longitude = moved.lng;
      point.locationAdjusted = true;
      await putPoint(point);
      setStatus(`Saved location updated for ${safeName(point.name)}.`, "good");
      await render({ fitMap: false });
      map.setView([moved.lat, moved.lng], 19);
    });

    markers.push(marker);
    return marker;
  }

  function showPhoto(blob, label, downloadName) {
    if (!blob || !blob.size) return;
    const url = makeObjectUrl(blob);
    els.modalPhoto.src = url;
    els.modalPhotoLabel.textContent = label || "Photo";
    els.modalDownloadBtn.href = url;
    els.modalDownloadBtn.download = downloadName || "dig-point-photo.jpg";
    els.photoModal.classList.add("open");
    els.photoModal.setAttribute("aria-hidden", "false");
  }

  function closePhotoViewer() {
    els.photoModal.classList.remove("open");
    els.photoModal.setAttribute("aria-hidden", "true");
    els.modalPhoto.removeAttribute("src");
    els.modalDownloadBtn.removeAttribute("href");
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }

  function shareTextForPoint(point) {
    const lat = Number(point.latitude);
    const lon = Number(point.longitude);
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
    return [
      safeName(point.name),
      point.location ? `Location: ${point.location}` : "",
      `GPS: ${lat.toFixed(6)}, ${lon.toFixed(6)}`,
      `Time: ${formatDateTime(point.timestamp)}`,
      point.notes ? `Notes: ${point.notes}` : "",
      mapUrl
    ].filter(Boolean).join("\n");
  }

  async function sharePoint(point) {
    const text = shareTextForPoint(point);
    try {
      if (navigator.share) {
        await navigator.share({ title: safeName(point.name), text });
        return;
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
    try {
      await copyText(text);
      setStatus("Point details copied because the Share menu is not available in this browser.", "good");
    } catch {
      alert(text);
    }
  }

  function buildPointRow(point) {
    const row = document.createElement("article");
    row.className = "point";
    row.id = `point-${point.id}`;

    const photos = normalizePhotos(point);
    const img = document.createElement("img");
    img.className = "thumb";
    img.alt = `${safeName(point.name)} photo`;
    if (photos.length) {
      const primaryUrl = makeObjectUrl(photos[0].blob);
      img.src = primaryUrl;
      img.addEventListener("click", () => {
        const ext = extensionFromType(photos[0].type, photos[0].name);
        showPhoto(photos[0].blob, `${safeName(point.name)} — photo 1`, `${fileSafe(point.name)}-1.${ext}`);
      });
    } else {
      img.src = noPhotoDataUri();
      img.style.cursor = "default";
    }

    const body = document.createElement("div");
    const title = document.createElement("div");
    title.className = "point-title";
    title.textContent = safeName(point.name);

    const meta = document.createElement("div");
    meta.className = "point-meta";
    meta.innerHTML =
      `${point.location ? `Location: ${escapeHtml(point.location)}` : "Location: Unassigned"}<br>` +
      `${escapeHtml(formatDateTime(point.timestamp))}<br>` +
      `GPS: ${Number(point.latitude).toFixed(6)}, ${Number(point.longitude).toFixed(6)}<br>` +
      `Accuracy: ${escapeHtml(formatAccuracy(point.accuracy))} • ${photos.length} photo${photos.length === 1 ? "" : "s"}`;

    body.append(title, meta);

    if (point.notes) {
      const notes = document.createElement("div");
      notes.className = "point-notes";
      notes.textContent = point.notes;
      body.appendChild(notes);
    }

    if (photos.length > 1) {
      const strip = document.createElement("div");
      strip.className = "photo-strip";
      photos.forEach((photo, index) => {
        const wrap = document.createElement("div");
        wrap.className = "photo-strip-item";

        const galleryImg = document.createElement("img");
        galleryImg.src = makeObjectUrl(photo.blob);
        galleryImg.alt = `${safeName(point.name)} photo ${index + 1}`;
        galleryImg.addEventListener("click", () => {
          const ext = extensionFromType(photo.type, photo.name);
          showPhoto(photo.blob, `${safeName(point.name)} — photo ${index + 1}`, `${fileSafe(point.name)}-${index + 1}.${ext}`);
        });

        const remove = document.createElement("button");
        remove.className = "photo-delete-btn";
        remove.type = "button";
        remove.textContent = "×";
        remove.title = "Delete this photo";
        remove.addEventListener("click", async event => {
          event.stopPropagation();
          if (!confirm(`Delete photo ${index + 1} from "${safeName(point.name)}"?`)) return;
          try {
            await deletePhotoFromPoint(point.id, index);
            setStatus("Photo deleted.", "good");
            await render({ fitMap: false });
          } catch (error) {
            setStatus(error.message || "Could not delete the photo.", "bad");
          }
        });

        wrap.append(galleryImg, remove);
        strip.appendChild(wrap);
      });
      body.appendChild(strip);
    }

    const actions = document.createElement("div");
    actions.className = "point-actions";

    const showPin = actionButton("Show Pin", "secondary", () => {
      map.setView([Number(point.latitude), Number(point.longitude)], 19);
      marker?.openPopup();
      $("mapCard").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const mapLink = document.createElement("a");
    mapLink.className = "secondary";
    mapLink.href = `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`;
    mapLink.target = "_blank";
    mapLink.rel = "noopener";
    mapLink.textContent = "Open Maps";

    const copyGps = actionButton("Copy GPS", "secondary point-copy-action", async () => {
      try {
        await copyText(`${Number(point.latitude).toFixed(6)}, ${Number(point.longitude).toFixed(6)}`);
        setStatus("Coordinates copied.", "good");
      } catch {
        setStatus("Could not copy coordinates.", "bad");
      }
    });

    const share = actionButton("Share", "secondary point-share-action", () => sharePoint(point));

    const edit = actionButton("Edit", "secondary point-edit-action", () => openEditDialog(point));

    const addPhotos = actionButton("Add Photos", "secondary point-add-photo-action", () => {
      addingPhotosToPointId = point.id;
      els.extraPhotosInput.click();
    });

    actions.append(showPin, mapLink, copyGps, share, edit, addPhotos);

    if (photos.length) {
      const savePhoto = document.createElement("a");
      savePhoto.className = "secondary point-photo-action";
      savePhoto.href = makeObjectUrl(photos[0].blob);
      const ext = extensionFromType(photos[0].type, photos[0].name);
      savePhoto.download = `${fileSafe(point.name)}-primary.${ext}`;
      savePhoto.textContent = "Save Photo";
      actions.appendChild(savePhoto);
    }

    const del = actionButton("Delete", "danger point-delete-action", async () => {
      if (!confirm(`Delete "${safeName(point.name)}" and all of its photos?`)) return;
      const deleted = await deletePoint(point.id);
      if (deleted) {
        showUndo(deleted);
        setStatus(`${safeName(point.name)} deleted. You can undo for a short time.`, "warn");
        await render();
      }
    });
    actions.appendChild(del);
    body.appendChild(actions);

    row.append(img, body);
    const marker = addSavedMarker(point, row);
    return row;
  }

  function actionButton(text, className, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.addEventListener("click", handler);
    return button;
  }

  function fitVisibleMarkers(points = null) {
    const list = points || getVisiblePoints(cachedPoints);
    const coords = list
      .map(p => [Number(p.latitude), Number(p.longitude)])
      .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));

    if (currentPosition) coords.push([currentPosition.latitude, currentPosition.longitude]);
    if (!coords.length) return;
    if (coords.length === 1) {
      map.setView(coords[0], 18);
    } else {
      map.fitBounds(coords, { padding: [28, 28], maxZoom: 18 });
    }
  }

  async function render({ fitMap = true } = {}) {
    revokeRenderUrls();
    clearMapMarkers();

    try {
      cachedPoints = await getAllPoints();
    } catch (error) {
      els.log.innerHTML = '<div class="empty">Could not read saved points.</div>';
      setStatus("Could not read browser storage.", "bad");
      return;
    }

    refreshLocationControls();
    const visible = getVisiblePoints(cachedPoints);
    const photoCount = cachedPoints.reduce((sum, p) => sum + normalizePhotos(p).length, 0);
    els.savedSummary.textContent = `${visible.length} shown • ${cachedPoints.length} total • ${photoCount} photo${photoCount === 1 ? "" : "s"}`;

    els.log.innerHTML = "";
    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = cachedPoints.length ? "No saved points match this filter." : "No points saved yet.";
      els.log.appendChild(empty);
    } else {
      for (const point of visible) {
        if (!Number.isFinite(Number(point.latitude)) || !Number.isFinite(Number(point.longitude))) continue;
        els.log.appendChild(buildPointRow(point));
      }
    }

    if (currentPosition) ensureDraftMarker();
    if (fitMap) fitVisibleMarkers(visible);
    updateStorageSummary();
  }

  function showUndo(point) {
    lastDeletedPoint = point;
    clearTimeout(undoTimer);
    els.undoText.textContent = `${safeName(point.name)} deleted.`;
    els.undoBar.classList.remove("hidden");
    undoTimer = setTimeout(dismissUndo, 12000);
  }

  function dismissUndo() {
    lastDeletedPoint = null;
    clearTimeout(undoTimer);
    els.undoBar.classList.add("hidden");
  }

  async function undoDelete() {
    if (!lastDeletedPoint) return;
    const point = lastDeletedPoint;
    lastDeletedPoint = null;
    clearTimeout(undoTimer);
    els.undoBar.classList.add("hidden");
    const clone = { ...point };
    delete clone.id;
    await addPoint(clone);
    setStatus(`${safeName(point.name)} restored.`, "good");
    await render();
  }

  function openEditDialog(point) {
    editingPointId = point.id;
    els.editPointTitle.value = safeName(point.name);
    refreshLocationControls();
    const currentLocation = String(point.location || "");
    if (currentLocation && ![...els.editPointLocation.options].some(o => o.value === currentLocation)) {
      const option = document.createElement("option");
      option.value = currentLocation;
      option.textContent = currentLocation;
      els.editPointLocation.appendChild(option);
    }
    els.editPointLocation.value = currentLocation;
    els.editPointNotes.value = String(point.notes || "");
    els.editPointTimestamp.value = toDateTimeLocal(point.timestamp);
    els.editPointLat.value = Number(point.latitude).toFixed(6);
    els.editPointLon.value = Number(point.longitude).toFixed(6);
    els.editPointDialog.showModal();
  }

  async function saveEdit() {
    if (editingPointId === null) return;
    const point = await getPoint(editingPointId);
    if (!point) throw new Error("Point no longer exists.");

    const lat = Number(els.editPointLat.value);
    const lon = Number(els.editPointLon.value);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error("Latitude must be between -90 and 90.");
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new Error("Longitude must be between -180 and 180.");

    point.name = safeName(els.editPointTitle.value);
    point.location = els.editPointLocation.value || "";
    point.notes = els.editPointNotes.value.trim();
    point.timestamp = fromDateTimeLocal(els.editPointTimestamp.value);
    point.latitude = lat;
    point.longitude = lon;
    point.locationAdjusted = true;
    await putPoint(point);
    editingPointId = null;
    els.editPointDialog.close();
    setStatus(`${point.name} updated.`, "good");
    await render({ fitMap: false });
  }

  function openSettings() {
    syncSettingsControls();
    els.locationsEditor.value = getLocations().join("\n");
    updateStorageSummary();
    els.settingsDialog.showModal();
  }

  function closeSettings() {
    if (els.settingsDialog.open) els.settingsDialog.close();
  }

  function switchBaseLayer(key) {
    for (const layer of Object.values(layers)) {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    }
    (layers[key] || layers.street).addTo(map);
  }

  async function updateStorageSummary() {
    let text = "Local browser storage is active.";
    try {
      if (navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        text = `Storage used: ${formatBytes(estimate.usage || 0)} of approximately ${formatBytes(estimate.quota || 0)} available.`;
      }
      if (navigator.storage?.persisted) {
        const persisted = await navigator.storage.persisted();
        text += persisted ? " Protected storage is enabled." : " Protected storage is not enabled.";
      }
    } catch {}
    els.storageSummary.textContent = text;
  }

  async function requestPersistentStorage() {
    if (!navigator.storage?.persist) {
      els.storageSummary.textContent = "This browser does not expose persistent-storage controls.";
      return;
    }
    try {
      const granted = await navigator.storage.persist();
      await updateStorageSummary();
      setStatus(granted ? "Protected browser storage enabled." : "The browser did not grant protected storage. Full backups are still recommended.", granted ? "good" : "warn");
    } catch {
      setStatus("Could not request protected browser storage.", "bad");
    }
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("Could not read photo."));
      reader.readAsDataURL(blob);
    });
  }

  function dataUrlToBlob(dataUrl) {
    const [header, data] = String(dataUrl).split(",");
    const mime = header.match(/data:([^;]+)/)?.[1] || "application/octet-stream";
    const binary = atob(data || "");
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  async function exportFullBackup() {
    const points = await getAllPoints();
    if (!points.length && !getLocations().length) {
      if (!confirm("There are no saved points. Export settings and locations anyway?")) return;
    }
    els.exportBackupBtn.disabled = true;
    els.exportBackupBtn.textContent = "Preparing…";
    setStatus("Preparing full backup. Large photo libraries can take a little longer…");

    try {
      const backupPoints = [];
      for (const point of points) {
        const photos = normalizePhotos(point);
        const backupPhotos = [];
        for (const photo of photos) {
          backupPhotos.push({
            name: photo.name || "photo.jpg",
            type: photo.type || photo.blob.type || "image/jpeg",
            dataUrl: await blobToDataUrl(photo.blob)
          });
        }
        backupPoints.push({
          ...point,
          photo: undefined,
          photos: backupPhotos
        });
      }

      const backup = {
        app: "Dig Point Photo Logger",
        version: 2,
        exportedAt: new Date().toISOString(),
        settings,
        locations: getLocations(),
        points: backupPoints
      };

      downloadBlob(
        new Blob([JSON.stringify(backup)], { type: "application/json" }),
        `dig-point-full-backup-${new Date().toISOString().slice(0, 10)}.json`
      );
      setStatus(`Full backup exported: ${points.length} points with photos and settings.`, "good");
    } catch (error) {
      console.error(error);
      setStatus("Could not create the full backup. Try exporting CSV if storage is very large.", "bad");
    } finally {
      els.exportBackupBtn.disabled = false;
      els.exportBackupBtn.textContent = "Export Full Backup";
    }
  }

  async function importFullBackup(file) {
    const parsed = JSON.parse(await file.text());
    if (!parsed || !Array.isArray(parsed.points)) throw new Error("This is not a valid Dig Point full backup.");

    // Decode and validate the backup before changing the current database.
    const prepared = [];
    let skipped = 0;
    for (const raw of parsed.points) {
      const point = {
        name: safeName(raw.name),
        location: String(raw.location || ""),
        notes: String(raw.notes || ""),
        timestamp: raw.timestamp || new Date().toISOString(),
        latitude: Number(raw.latitude),
        longitude: Number(raw.longitude),
        accuracy: Number(raw.accuracy) || 0,
        locationAdjusted: !!raw.locationAdjusted,
        importedWithoutPhoto: false
      };
      if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
        skipped++;
        continue;
      }

      const photos = [];
      for (const photo of Array.isArray(raw.photos) ? raw.photos : []) {
        if (!photo?.dataUrl) continue;
        const blob = dataUrlToBlob(photo.dataUrl);
        photos.push({
          name: photo.name || "photo.jpg",
          type: photo.type || blob.type || "image/jpeg",
          blob
        });
      }
      point.photos = photos;
      if (photos.length) {
        point.photo = photos[0].blob;
        point.photoName = photos[0].name;
        point.photoType = photos[0].type;
      } else {
        point.photo = new Blob([], { type: "application/octet-stream" });
        point.photoName = "";
        point.photoType = "";
        point.importedWithoutPhoto = true;
      }
      prepared.push(point);
    }

    const replace = els.backupImportMode.value === "replace";
    if (replace) {
      const ok = confirm(`Replace all current points with the ${prepared.length} valid points in this backup?`);
      if (!ok) return;
    }

    const existing = replace ? [] : await getAllPoints();
    const signatures = new Set(existing.map(pointSignature));
    const toInsert = [];
    for (const point of prepared) {
      const sig = pointSignature(point);
      if (!replace && signatures.has(sig)) {
        skipped++;
        continue;
      }
      signatures.add(sig);
      toInsert.push(point);
    }

    if (replace) await clearAllPoints();

    let imported = 0;
    for (const point of toInsert) {
      await addPoint(point);
      imported++;
    }

    if (replace && parsed.settings && typeof parsed.settings === "object") {
      settings = { ...defaultSettings, ...parsed.settings };
      saveSettings();
      applyTheme();
      applyButtonVisibility();
      syncSettingsControls();
      switchBaseLayer(settings.defaultLayer);
    }
    if (replace && Array.isArray(parsed.locations)) {
      saveLocations(parsed.locations);
    } else if (Array.isArray(parsed.locations)) {
      saveLocations([...getLocations(), ...parsed.locations]);
    }

    refreshLocationControls();
    setStatus(`Full backup imported: ${imported} points added${skipped ? `, ${skipped} skipped` : ""}.`, "good");
    await render();
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function csvEscape(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
  }

  async function exportCsv() {
    const points = await getAllPoints();
    if (!points.length) {
      alert("There are no points to export.");
      return;
    }
    const rows = [[
      "ID", "Name", "Location", "Timestamp", "Latitude", "Longitude",
      "AccuracyMeters", "PhotoCount", "Notes"
    ]];

    points
      .slice()
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .forEach(point => rows.push([
        point.id,
        safeName(point.name),
        point.location || "",
        point.timestamp,
        point.latitude,
        point.longitude,
        point.accuracy || "",
        normalizePhotos(point).length,
        point.notes || ""
      ]));

    const csv = rows.map(row => row.map(csvEscape).join(",")).join("\n");
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `dig-points-${new Date().toISOString().slice(0, 10)}.csv`);
    setStatus(`${points.length} points exported to CSV. Photos are not included in CSV.`, "good");
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let value = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"' && text[i + 1] === '"') {
          value += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          value += ch;
        }
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ",") { row.push(value); value = ""; }
        else if (ch === "\n") { row.push(value.replace(/\r$/, "")); rows.push(row); row = []; value = ""; }
        else value += ch;
      }
    }
    if (value.length || row.length) {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
    }
    return rows;
  }

  async function importCsv(file) {
    const rows = parseCsv(await file.text());
    if (rows.length < 2) throw new Error("No data rows were found in this CSV.");

    const header = rows[0].map(v => v.trim());
    const indexOf = name => header.indexOf(name);
    const required = ["Name", "Timestamp", "Latitude", "Longitude"];
    const missing = required.filter(name => indexOf(name) === -1);
    if (missing.length) throw new Error(`CSV is missing: ${missing.join(", ")}`);

    const existing = await getAllPoints();
    const signatures = new Set(existing.map(pointSignature));
    let imported = 0;
    let skipped = 0;

    for (const row of rows.slice(1)) {
      if (!row.length || row.every(v => !String(v).trim())) continue;
      const lat = Number(row[indexOf("Latitude")]);
      const lon = Number(row[indexOf("Longitude")]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) { skipped++; continue; }

      const point = {
        name: safeName(row[indexOf("Name")]),
        location: indexOf("Location") >= 0 ? String(row[indexOf("Location")] || "").trim() : "",
        notes: indexOf("Notes") >= 0 ? String(row[indexOf("Notes")] || "") : "",
        timestamp: row[indexOf("Timestamp")] || new Date().toISOString(),
        latitude: lat,
        longitude: lon,
        accuracy: indexOf("AccuracyMeters") >= 0 ? Number(row[indexOf("AccuracyMeters")]) || 0 : 0,
        photoName: "",
        photoType: "",
        photo: new Blob([], { type: "application/octet-stream" }),
        photos: [],
        importedWithoutPhoto: true
      };

      const sig = pointSignature(point);
      if (signatures.has(sig)) { skipped++; continue; }
      await addPoint(point);
      signatures.add(sig);
      imported++;
    }

    setStatus(`CSV import complete: ${imported} added${skipped ? `, ${skipped} duplicates/invalid rows skipped` : ""}.`, "good");
    await render();
  }

  function showSettingsChangedStatus() {
    saveSettings();
    applyTheme();
    applyButtonVisibility();
  }

  async function dangerousClearAll() {
    const count = (await getAllPoints()).length;
    if (!count) {
      alert("There are no saved points to delete.");
      return;
    }
    const typed = prompt(`This permanently deletes ${count} saved point${count === 1 ? "" : "s"} and all stored photos from this browser.\n\nType DELETE to continue:`);
    if (typed !== "DELETE") {
      setStatus("Delete All cancelled.", "warn");
      return;
    }
    await clearAllPoints();
    dismissUndo();
    setStatus("All saved points and photos were deleted.", "warn");
    await render();
  }

  els.photoInput.addEventListener("change", () => prepareNewPointFromPhoto(els.photoInput.files?.[0]));
  els.uploadPhotoInput.addEventListener("change", () => prepareNewPointFromPhoto(els.uploadPhotoInput.files?.[0]));
  els.removeDraftPhotoBtn.addEventListener("click", () => {
    clearDraftPhoto();
    setStatus("Draft photo removed. Select another photo to save this point.", "warn");
  });

  els.gpsBtn.addEventListener("click", async () => {
    try { await requestGPS(); }
    catch (error) { setStatus(error.message, "bad"); }
  });

  els.saveBtn.addEventListener("click", async () => {
    if (!selectedPhoto || !currentPosition) {
      setStatus("A photo and GPS location are required.", "bad");
      return;
    }

    const name = safeName(els.pointName.value);
    els.saveBtn.disabled = true;
    setStatus("Saving point…");

    const record = {
      name,
      location: els.pointLocation.value,
      notes: els.notes.value.trim(),
      timestamp: new Date().toISOString(),
      latitude: currentPosition.latitude,
      longitude: currentPosition.longitude,
      accuracy: currentPosition.accuracy,
      locationAdjusted: !!currentPosition.adjusted,
      photoName: selectedPhoto.name || "photo.jpg",
      photoType: selectedPhoto.type || "image/jpeg",
      photo: selectedPhoto,
      photos: [{
        name: selectedPhoto.name || "photo.jpg",
        type: selectedPhoto.type || "image/jpeg",
        blob: selectedPhoto
      }]
    };

    try {
      await addPoint(record);
      const keepLocation = true;
      clearDraftFields({ keepLocation });
      setStatus(`${name} saved successfully.`, "good");
      await render();
      $("savedCard").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      console.error(error);
      setStatus("Could not save the point. Browser storage may be full; export a backup and free some storage.", "bad");
      updateSaveState();
    }
  });

  els.resetDraftBtn.addEventListener("click", () => {
    if ((selectedPhoto || currentPosition || els.notes.value.trim() || els.pointName.value.trim() !== "Dig Point") &&
        !confirm("Clear the current unsaved point?")) return;
    clearDraftFields();
  });

  els.quickAddLocationBtn.addEventListener("click", () => {
    const value = prompt("New location name:");
    if (!value?.trim()) return;
    const clean = saveLocations([...getLocations(), value.trim()]);
    refreshLocationControls();
    els.pointLocation.value = clean.find(x => x.toLowerCase() === value.trim().toLowerCase()) || value.trim();
    saveDraftFields();
    setStatus(`Location added: ${value.trim()}`, "good");
  });

  ["input", "change"].forEach(eventName => {
    els.pointName.addEventListener(eventName, () => { saveDraftFields(); updateSaveState(); });
    els.notes.addEventListener(eventName, saveDraftFields);
    els.pointLocation.addEventListener(eventName, saveDraftFields);
  });

  els.locationFilter.addEventListener("change", () => render());
  els.searchInput.addEventListener("input", () => render());
  els.sortSelect.addEventListener("change", () => {
    settings.sort = els.sortSelect.value;
    saveSettings();
    render({ fitMap: false });
  });

  els.fitPinsBtn.addEventListener("click", () => fitVisibleMarkers());

  document.querySelectorAll("[data-jump]").forEach(button => {
    button.addEventListener("click", () => {
      const target = $(button.dataset.jump);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  els.settingsBtn.addEventListener("click", openSettings);
  els.closeSettingsBtn.addEventListener("click", closeSettings);
  els.closeSettingsBottomBtn.addEventListener("click", closeSettings);

  els.themeSelect.addEventListener("change", () => {
    settings.theme = els.themeSelect.value;
    showSettingsChangedStatus();
  });

  els.defaultLayerSelect.addEventListener("change", () => {
    settings.defaultLayer = els.defaultLayerSelect.value;
    saveSettings();
    switchBaseLayer(settings.defaultLayer);
  });

  [
    ["showEditPoint", els.showEditPoint],
    ["showAddPhotos", els.showAddPhotos],
    ["showSavePhoto", els.showSavePhoto],
    ["showCopyGps", els.showCopyGps],
    ["showSharePoint", els.showSharePoint],
    ["showDeletePoint", els.showDeletePoint]
  ].forEach(([key, control]) => {
    control.addEventListener("change", () => {
      settings[key] = control.checked;
      showSettingsChangedStatus();
    });
  });

  els.saveLocationsBtn.addEventListener("click", async () => {
    const locations = saveLocations(els.locationsEditor.value.split(/\r?\n/));
    els.locationsEditor.value = locations.join("\n");
    refreshLocationControls();
    setStatus(`${locations.length} location${locations.length === 1 ? "" : "s"} saved.`, "good");
    await render({ fitMap: false });
  });

  els.persistStorageBtn.addEventListener("click", requestPersistentStorage);
  els.exportBackupBtn.addEventListener("click", exportFullBackup);
  els.exportCsvBtn.addEventListener("click", exportCsv);
  els.clearBtn.addEventListener("click", dangerousClearAll);

  els.backupImportInput.addEventListener("change", async () => {
    const file = els.backupImportInput.files?.[0];
    if (!file) return;
    try {
      setStatus("Importing full backup…");
      await importFullBackup(file);
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Could not import the full backup.", "bad");
    } finally {
      els.backupImportInput.value = "";
    }
  });

  els.csvImportInput.addEventListener("change", async () => {
    const file = els.csvImportInput.files?.[0];
    if (!file) return;
    try {
      setStatus("Importing CSV…");
      await importCsv(file);
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Could not import the CSV.", "bad");
    } finally {
      els.csvImportInput.value = "";
    }
  });

  els.extraPhotosInput.addEventListener("change", async () => {
    const files = [...(els.extraPhotosInput.files || [])];
    if (addingPhotosToPointId === null || !files.length) {
      els.extraPhotosInput.value = "";
      return;
    }
    try {
      await addPhotosToPoint(addingPhotosToPointId, files);
      setStatus(`${files.length} photo${files.length === 1 ? "" : "s"} added.`, "good");
      await render({ fitMap: false });
    } catch (error) {
      setStatus(error.message || "Could not add the selected photos.", "bad");
    } finally {
      addingPhotosToPointId = null;
      els.extraPhotosInput.value = "";
    }
  });

  els.editPointForm.addEventListener("submit", async event => {
    event.preventDefault();
    try {
      await saveEdit();
    } catch (error) {
      setStatus(error.message || "Could not save point changes.", "bad");
    }
  });

  [els.cancelEditPoint, els.closeEditDialogBtn].forEach(button => {
    button.addEventListener("click", () => {
      editingPointId = null;
      els.editPointDialog.close();
    });
  });

  els.undoDeleteBtn.addEventListener("click", undoDelete);
  els.dismissUndoBtn.addEventListener("click", dismissUndo);

  els.closePhotoModal.addEventListener("click", closePhotoViewer);
  els.photoModal.addEventListener("click", event => {
    if (event.target === els.photoModal) closePhotoViewer();
  });

  window.addEventListener("online", updateOnlineStatus);
  window.addEventListener("offline", updateOnlineStatus);
  window.addEventListener("beforeunload", event => {
    if (selectedPhoto || currentPosition) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (settings.theme === "system") applyTheme();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && els.photoModal.classList.contains("open")) {
      closePhotoViewer();
    }
  });

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost") return;
    navigator.serviceWorker.register("./sw.js").catch(error => {
      console.warn("Offline app shell could not be enabled:", error);
    });
  }

  async function init() {
    applyTheme();
    applyButtonVisibility();
    syncSettingsControls();
    updateOnlineStatus();
    registerServiceWorker();
    refreshLocationControls();
    restoreDraftFields();

    try {
      await openDb();
      await render();
      updateSaveState();
      setStatus("Ready. Existing points and photos are loaded from this browser.", "good");
    } catch (error) {
      console.error(error);
      setStatus("Could not open browser storage. Saving points is unavailable.", "bad");
      els.saveBtn.disabled = true;
    }
  }

  init();
})();

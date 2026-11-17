const STORAGE_KEY = "majiwatch-cape-town-v2";
const ROUTING_BASE_URL = "https://routing.openstreetmap.de/routed-foot/route/v1/foot";
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const LEAFLET_CSS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

const demoPoints = [
  {
    id: "osm-12816539595",
    name: "Ncumo Road",
    area: "Cape Town · communal outdoor tap",
    kind: "Communal outdoor tap",
    status: "unknown",
    minutesAgo: null,
    latitude: -34.0588632,
    longitude: 18.6767399,
    mapUrl: "https://www.openstreetmap.org/node/12816539595",
    note: ""
  },
  {
    id: "osm-12816539642",
    name: "Taliban",
    area: "Cape Town · communal outdoor tap",
    kind: "Communal outdoor tap",
    status: "unknown",
    minutesAgo: null,
    latitude: -34.0568395,
    longitude: 18.6728834,
    mapUrl: "https://www.openstreetmap.org/node/12816539642",
    note: ""
  },
  {
    id: "osm-12816539644",
    name: "Peace Park",
    area: "Cape Town · communal outdoor tap",
    kind: "Communal outdoor tap",
    status: "unknown",
    minutesAgo: null,
    latitude: -34.059012,
    longitude: 18.6782309,
    mapUrl: "https://www.openstreetmap.org/node/12816539644",
    note: ""
  },
  {
    id: "osm-6877782709",
    name: "Jack Marais drinking fountain",
    area: "Cape Town · drinking fountain",
    kind: "Drinking fountain",
    status: "unknown",
    minutesAgo: null,
    latitude: -33.9859075,
    longitude: 18.4288169,
    mapUrl: "https://www.openstreetmap.org/node/6877782709",
    note: ""
  }
];

const statusLabels = {
  working: "Working",
  low: "Low supply",
  unavailable: "Unavailable",
  unknown: "Not verified"
};

const elements = {
  list: document.querySelector("#point-list"),
  count: document.querySelector("#point-count"),
  allCount: document.querySelector("#all-count"),
  empty: document.querySelector("#empty-state"),
  search: document.querySelector("#search-input"),
  results: document.querySelector("#results-label"),
  dialog: document.querySelector("#report-dialog"),
  form: document.querySelector("#report-form"),
  dialogPoint: document.querySelector("#dialog-point"),
  locationButton: document.querySelector("#location-button"),
  locationNote: document.querySelector("#location-note"),
  routeSection: document.querySelector("#route-section"),
  routePointName: document.querySelector("#route-point-name"),
  routeAction: document.querySelector("#route-action"),
  routeStatus: document.querySelector("#route-status"),
  routeSummary: document.querySelector("#route-summary"),
  routeMap: document.querySelector("#route-map"),
  routeMapPlaceholder: document.querySelector("#route-map-placeholder"),
  toast: document.querySelector("#toast")
};

let points = loadPoints();
let activeFilter = "all";
let selectedPointId = null;
let selectedRoutePointId = null;
let userCoordinates = null;
let toastTimeout;
let leafletPromise;
let mapInstance;
let lastRouteRequestAt = 0;
let routeRequestId = 0;
let routeAbortController = null;

function loadPoints() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return demoPoints.map(point => ({ ...point }));
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) throw new Error("Saved water point data is invalid.");
    const seedById = new Map(demoPoints.map(point => [point.id, point]));
    return parsed.map(point => {
      const seed = seedById.get(point.id);
      if (!seed || !statusLabels[point.status]) throw new Error("Saved water point data is invalid.");
      return { ...seed, ...point };
    });
  } catch (error) {
    console.error("Could not load saved MajiWatch reports:", error);
    return demoPoints.map(point => ({ ...point }));
  }
}

function savePoints(nextPoints) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextPoints));
  } catch (error) {
    showToast("Could not save your update on this device.");
    console.error("Could not save MajiWatch reports:", error);
    return false;
  }
  return true;
}

function relativeTime(point) {
  const minutes = point.reportedAt
    ? Math.floor((Date.now() - point.reportedAt) / 60000)
    : point.minutesAgo;
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr${hours === 1 ? "" : "s"} ago`;
}

function distanceFromUser(point) {
  if (!userCoordinates) return null;
  const toRadians = value => value * Math.PI / 180;
  const latitudeDifference = toRadians(point.latitude - userCoordinates.latitude);
  const longitudeDifference = toRadians(point.longitude - userCoordinates.longitude);
  const a = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(toRadians(userCoordinates.latitude)) * Math.cos(toRadians(point.latitude))
    * Math.sin(longitudeDifference / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function visiblePoints() {
  const query = elements.search.value.trim().toLocaleLowerCase();
  return points
    .map(point => ({ ...point, currentDistance: distanceFromUser(point) }))
    .filter(point => activeFilter === "all" || point.status === activeFilter)
    .filter(point => !query || `${point.name} ${point.area} ${point.kind}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => userCoordinates ? a.currentDistance - b.currentDistance : 0);
}

function createPointCard(point) {
  const card = document.createElement("article");
  card.className = "point-card";

  const mainRow = document.createElement("div");
  mainRow.className = "card-main";
  const identity = document.createElement("div");
  const titleRow = document.createElement("div");
  titleRow.className = "point-title-row";
  const icon = document.createElement("span");
  icon.className = "point-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "⌁";
  const name = document.createElement("h3");
  name.className = "point-name";
  name.textContent = point.name;
  titleRow.append(icon, name);
  const kind = document.createElement("p");
  kind.className = "point-kind";
  kind.textContent = point.kind;
  identity.append(titleRow, kind);

  const status = document.createElement("span");
  status.className = `status-pill status-${point.status}`;
  status.innerHTML = `<span class="filter-dot ${point.status}-dot"></span>${statusLabels[point.status]}`;
  mainRow.append(identity, status);

  const meta = document.createElement("div");
  meta.className = "point-meta";
  const location = document.createElement("span");
  location.textContent = point.area;
  const separator = document.createElement("span");
  separator.className = "meta-separator";
  separator.textContent = "·";
  const distance = document.createElement("span");
  distance.textContent = userCoordinates ? `${point.currentDistance.toFixed(1)} km` : "Distance unavailable";
  meta.append(location, separator, distance);

  const bottom = document.createElement("div");
  bottom.className = "card-bottom";
  const age = document.createElement("span");
  age.className = "report-age";
  age.textContent = point.status === "unknown"
    ? "No verified status report"
    : `Reported ${relativeTime(point)}`;
  const mapLink = document.createElement("a");
  mapLink.className = "map-link";
  mapLink.href = point.mapUrl;
  mapLink.target = "_blank";
  mapLink.rel = "noopener noreferrer";
  mapLink.textContent = "Open map ↗";
  mapLink.setAttribute("aria-label", `View ${point.name} on OpenStreetMap`);
  const routeButton = document.createElement("button");
  routeButton.className = "route-card-button";
  routeButton.type = "button";
  routeButton.dataset.route = point.id;
  routeButton.textContent = "Walking route";
  const reportButton = document.createElement("button");
  reportButton.className = "report-button";
  reportButton.type = "button";
  reportButton.dataset.report = point.id;
  reportButton.textContent = "Share update";
  bottom.append(age, mapLink, routeButton, reportButton);
  card.append(mainRow, meta);
  if (point.note) {
    const note = document.createElement("p");
    note.className = "report-note";
    note.textContent = `“${point.note}”`;
    card.append(note);
  }
  card.append(bottom);
  return card;
}

function render() {
  const shown = visiblePoints();
  elements.list.replaceChildren(...shown.map(createPointCard));
  elements.empty.hidden = shown.length > 0;
  elements.list.hidden = shown.length === 0;
  elements.count.textContent = `(${points.length})`;
  elements.allCount.textContent = points.length;
  elements.results.textContent = userCoordinates
    ? `Sorted by distance from you · ${shown.length} shown`
    : `Showing ${shown.length} mapped Cape Town water point${shown.length === 1 ? "" : "s"}`;
}

function showToast(message) {
  window.clearTimeout(toastTimeout);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  toastTimeout = window.setTimeout(() => elements.toast.classList.remove("visible"), 3200);
}

function openRoute(pointId) {
  const point = points.find(item => item.id === pointId);
  if (!point) return;
  routeRequestId += 1;
  if (routeAbortController) routeAbortController.abort();
  routeAbortController = null;
  selectedRoutePointId = pointId;
  elements.routePointName.textContent = point.name;
  elements.routeSection.hidden = false;
  elements.routeStatus.textContent = "Your location has not been requested.";
  elements.routeSummary.textContent = "";
  elements.routeMap.hidden = true;
  elements.routeMapPlaceholder.hidden = false;
  elements.routeAction.disabled = false;
  elements.routeAction.textContent = "Use my location & find a walking route";
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }
  elements.routeSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeRoute() {
  routeRequestId += 1;
  if (routeAbortController) routeAbortController.abort();
  routeAbortController = null;
  elements.routeSection.hidden = true;
  selectedRoutePointId = null;
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }
  elements.routeMap.replaceChildren();
  elements.routeMap.hidden = true;
  elements.routeMapPlaceholder.hidden = false;
}

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = LEAFLET_CSS_URL;

    const script = document.createElement("script");
    script.src = LEAFLET_JS_URL;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error("The map library could not be loaded. Check your connection and try again."));
    document.head.append(stylesheet, script);
  }).catch(error => {
    leafletPromise = null;
    throw error;
  });

  return leafletPromise;
}

function getWalkingRoute(origin, destination, signal) {
  const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const url = `${ROUTING_BASE_URL}/${coordinates}?overview=full&geometries=geojson&steps=false`;
  const wait = Math.max(0, 1000 - (Date.now() - lastRouteRequestAt));

  return new Promise(resolve => window.setTimeout(resolve, wait))
    .then(() => {
      lastRouteRequestAt = Date.now();
      return fetch(url, { method: "GET", mode: "cors", credentials: "omit", signal })
        .then(async response => {
          let data;
          try {
            data = await response.json();
          } catch {
            throw new Error("The walking route service returned an unreadable response.");
          }
          if (!response.ok || data.code !== "Ok") {
            throw new Error(data.message || "No walking route was found for this location.");
          }
          const route = data.routes && data.routes[0];
          if (!route || !route.geometry || !Array.isArray(route.geometry.coordinates) || route.geometry.coordinates.length < 2) {
            throw new Error("No walking route was found for this water point.");
          }
          return route;
        })
    })
    .catch(error => {
      if (error.name === "AbortError") {
        throw new Error("The walking route request timed out. Please try again.");
      }
      throw error;
    });
}

function formatRouteDistance(metres) {
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km`;
}

function formatRouteDuration(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `about ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `about ${hours} hr ${remainingMinutes} min` : `about ${hours} hr`;
}

function showRouteOnMap(origin, destination, route) {
  elements.routeMap.replaceChildren();
  elements.routeMap.hidden = false;
  elements.routeMapPlaceholder.hidden = true;

  mapInstance = window.L.map(elements.routeMap, { scrollWheelZoom: false })
    .setView([destination.latitude, destination.longitude], 15);
  window.L.tileLayer(TILE_URL, {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · <a href="https://www.openstreetmap.org/fixthemap">Fix the map</a>'
  }).addTo(mapInstance);
  const routeLayer = window.L.geoJSON(route.geometry, {
    style: { color: "#237b60", weight: 6, opacity: 0.9 }
  }).addTo(mapInstance);
  const originMarker = window.L.circleMarker([origin.latitude, origin.longitude], {
    radius: 8,
    color: "#fff",
    weight: 3,
    fillColor: "#3865d8",
    fillOpacity: 1
  }).bindPopup("Your location (not saved)").addTo(mapInstance);
  const destinationMarker = window.L.circleMarker([destination.latitude, destination.longitude], {
    radius: 8,
    color: "#fff",
    weight: 3,
    fillColor: "#c76150",
    fillOpacity: 1
  }).bindPopup(destination.name).addTo(mapInstance);

  const bounds = window.L.featureGroup([routeLayer, originMarker, destinationMarker]).getBounds();
  mapInstance.fitBounds(bounds.pad(0.15));
  window.requestAnimationFrame(() => mapInstance && mapInstance.invalidateSize());
  elements.routeSummary.textContent = `Walking route: ${formatRouteDistance(route.distance)} · ${formatRouteDuration(route.duration)}. Estimated only; confirm the final access point locally.`;
}

function routeLocationError(error) {
  if (error.code === 1) return "Location permission was denied. Allow location access in your browser to request a route.";
  if (error.code === 3) return "Finding your location timed out. Please try again.";
  return "Your location is unavailable. Check your device settings and try again.";
}

function requestWalkingRoute() {
  const destination = points.find(point => point.id === selectedRoutePointId);
  if (!destination) return;
  if (!navigator.geolocation) {
    elements.routeStatus.textContent = "Location is not available in this browser.";
    return;
  }

  const requestId = ++routeRequestId;
  elements.routeAction.disabled = true;
  elements.routeAction.textContent = "Finding your location…";
  elements.routeStatus.textContent = "Waiting for your location permission.";
  elements.routeSummary.textContent = "";
  elements.routeMap.hidden = true;
  elements.routeMapPlaceholder.hidden = false;
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }

  navigator.geolocation.getCurrentPosition(async position => {
    if (requestId !== routeRequestId) return;
    const origin = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude
    };
    const controller = new AbortController();
    routeAbortController = controller;
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      elements.routeStatus.textContent = "Requesting an estimated walking route…";
      const route = await getWalkingRoute(origin, destination, controller.signal);
      if (requestId !== routeRequestId) return;
      elements.routeStatus.textContent = "Loading the map…";
      await loadLeaflet();
      if (requestId !== routeRequestId) return;
      showRouteOnMap(origin, destination, route);
      elements.routeStatus.textContent = `Route to ${destination.name}. Your location was used for this request only.`;
      elements.routeAction.textContent = "Request route again";
    } catch (error) {
      if (requestId !== routeRequestId) return;
      elements.routeStatus.textContent = error instanceof Error
        ? error.message
        : "The walking route could not be loaded. Please try again.";
      console.error("Could not load MajiWatch walking route:", error);
      elements.routeAction.textContent = "Try walking route again";
    } finally {
      window.clearTimeout(timeout);
      if (routeAbortController === controller) routeAbortController = null;
      if (requestId === routeRequestId) elements.routeAction.disabled = false;
    }
  }, error => {
    if (requestId !== routeRequestId) return;
    elements.routeStatus.textContent = routeLocationError(error);
    elements.routeAction.disabled = false;
    elements.routeAction.textContent = "Try walking route again";
  }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
}

function openReport(pointId) {
  const point = points.find(item => item.id === pointId);
  if (!point) return;
  selectedPointId = pointId;
  elements.dialogPoint.textContent = `${point.name} · ${point.area}`;
  elements.form.reset();
  elements.dialog.showModal();
  elements.dialog.querySelector('input[name="status"]').focus();
}

document.querySelector(".filter-row").addEventListener("click", event => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  activeFilter = button.dataset.filter;
  document.querySelectorAll(".filter-button").forEach(filterButton => {
    const isActive = filterButton === button;
    filterButton.classList.toggle("active", isActive);
    filterButton.setAttribute("aria-pressed", String(isActive));
  });
  render();
});

elements.list.addEventListener("click", event => {
  const routeButton = event.target.closest("[data-route]");
  if (routeButton) {
    openRoute(routeButton.dataset.route);
    return;
  }
  const button = event.target.closest("[data-report]");
  if (button) openReport(button.dataset.report);
});
elements.routeAction.addEventListener("click", requestWalkingRoute);
document.querySelector("#close-route").addEventListener("click", closeRoute);
elements.search.addEventListener("input", render);
document.querySelector("#clear-search").addEventListener("click", () => {
  elements.search.value = "";
  activeFilter = "all";
  document.querySelectorAll(".filter-button").forEach(button => {
    const isActive = button.dataset.filter === "all";
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  render();
  elements.search.focus();
});

elements.form.addEventListener("submit", event => {
  event.preventDefault();
  const data = new FormData(elements.form);
  const status = data.get("status");
  const point = points.find(item => item.id === selectedPointId);
  if (!point || !statusLabels[status]) return;
  const updatedPoints = points.map(item => item.id === selectedPointId
    ? { ...item, status, minutesAgo: 0, reportedAt: Date.now(), note: String(data.get("note") || "").trim() }
    : item);
  if (!savePoints(updatedPoints)) return;
  points = updatedPoints;
  elements.dialog.close();
  render();
  showToast(`Thanks for looking out for your community.`);
});

document.querySelector("#close-dialog").addEventListener("click", () => elements.dialog.close());
document.querySelector("#cancel-report").addEventListener("click", () => elements.dialog.close());
elements.dialog.addEventListener("click", event => {
  if (event.target === elements.dialog) elements.dialog.close();
});

elements.locationButton.addEventListener("click", () => {
  if (!navigator.geolocation) {
    elements.locationNote.textContent = "Location is not available in this browser. You can still browse all points.";
    return;
  }
  elements.locationButton.disabled = true;
  elements.locationButton.textContent = "Finding your location…";
  navigator.geolocation.getCurrentPosition(
    position => {
      userCoordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };
      elements.locationButton.disabled = false;
      elements.locationButton.innerHTML = '<span aria-hidden="true">⌖</span> Location on';
      elements.locationNote.textContent = "Sorted by distance. Your location stays on this device and is not saved.";
      render();
    },
    () => {
      elements.locationButton.disabled = false;
      elements.locationButton.innerHTML = '<span aria-hidden="true">⌖</span> Use my location';
      elements.locationNote.textContent = "Location permission was not granted. You can still browse all points.";
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
  );
});

document.querySelector("#reset-button").addEventListener("click", () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("Could not reset MajiWatch demo reports:", error);
    showToast("Could not clear saved reports on this device.");
    return;
  }
  points = demoPoints.map(point => ({ ...point }));
  activeFilter = "all";
  elements.search.value = "";
  document.querySelectorAll(".filter-button").forEach(button => {
    const isActive = button.dataset.filter === "all";
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  render();
  showToast("Demo data restored.");
});

document.addEventListener("keydown", event => {
  if (event.key === "/" && !elements.dialog.open && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    elements.search.focus();
  }
});

render();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(error => {
      console.error("MajiWatch offline caching could not be enabled:", error);
    });
  });
}

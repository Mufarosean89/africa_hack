const STORAGE_KEY = "majiwatch-demo-v1";

const demoPoints = [
  {
    id: "community-tap-a",
    name: "Community Tap A",
    area: "Kibera · near the community hall",
    kind: "Public tap",
    status: "working",
    minutesAgo: 18,
    distance: 0.4,
    latitude: -1.313,
    longitude: 36.785,
    note: ""
  },
  {
    id: "market-borehole",
    name: "Market Borehole",
    area: "Kawangware · by the market entrance",
    kind: "Borehole",
    status: "low",
    minutesAgo: 42,
    distance: 1.1,
    latitude: -1.283,
    longitude: 36.747,
    note: "Queue is moving slowly."
  },
  {
    id: "school-kiosk",
    name: "School Water Kiosk",
    area: "Mathare · next to the primary school",
    kind: "Water kiosk",
    status: "working",
    minutesAgo: 65,
    distance: 1.8,
    latitude: -1.269,
    longitude: 36.855,
    note: ""
  },
  {
    id: "estate-tap",
    name: "Estate Tap 3",
    area: "Mukuru · near the health centre",
    kind: "Public tap",
    status: "unavailable",
    minutesAgo: 97,
    distance: 2.4,
    latitude: -1.325,
    longitude: 36.879,
    note: "Reported closed this morning."
  }
];

const statusLabels = {
  working: "Working",
  low: "Low supply",
  unavailable: "Unavailable"
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
  toast: document.querySelector("#toast")
};

let points = loadPoints();
let activeFilter = "all";
let selectedPointId = null;
let userCoordinates = null;
let toastTimeout;

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
  if (!userCoordinates) return point.distance;
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
    .sort((a, b) => a.currentDistance - b.currentDistance);
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
  distance.textContent = `${point.currentDistance.toFixed(1)} km`;
  meta.append(location, separator, distance);

  const bottom = document.createElement("div");
  bottom.className = "card-bottom";
  const age = document.createElement("span");
  age.className = "report-age";
  age.textContent = `Updated ${relativeTime(point)}`;
  const reportButton = document.createElement("button");
  reportButton.className = "report-button";
  reportButton.type = "button";
  reportButton.dataset.report = point.id;
  reportButton.textContent = "Share update";
  bottom.append(age, reportButton);
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
    : `Showing ${shown.length} sample water point${shown.length === 1 ? "" : "s"}`;
}

function showToast(message) {
  window.clearTimeout(toastTimeout);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  toastTimeout = window.setTimeout(() => elements.toast.classList.remove("visible"), 3200);
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
  const button = event.target.closest("[data-report]");
  if (button) openReport(button.dataset.report);
});
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

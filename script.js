// ============================================================
let selectedPoints = [];
function togglePoint(i) {
  const idx = selectedPoints.indexOf(i);
  if (idx === -1) {
    selectedPoints.push(i);
    updateStats(`Titik ditambahkan: <b>${points[i].name}</b>`);
  } else {
    selectedPoints.splice(idx, 1);
    updateStats(`Titik dihapus: <b>${points[i].name}</b>`);
  }
}
// ============================================================
//  ROUTE LAB — BFS, DFS, UCS, GREEDY, A*, SA-TSP
//  Revisi: Node memakai nama wilayah asli (reverse geocoding)
// ============================================================

const OSRM_TABLE = "https://router.project-osrm.org/table/v1/driving/";
const OSRM_ROUTE = "https://router.project-osrm.org/route/v1/driving/";
const NOMINATIM = "https://nominatim.openstreetmap.org/reverse?format=json&lat=";

const map = L.map("map").setView([-2.5, 118], 5);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap Contributors",
}).addTo(map);

let points = [];          // {lat, lng, name}
let markers = [];
let routeLayer = null;
let distanceMatrix = null;

// ============================================================
// FUNGSI REVERSE GEOCODING UNTUK AMBIL NAMA WILAYAH
// ============================================================

async function getLocationName(lat, lng) {
  try {
    const url = `${NOMINATIM}${lat}&lon=${lng}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "RouteLabStudentApp/1.0" }
    });
    const data = await res.json();

    if (data && data.address) {
      return (
        data.address.village ||
        data.address.town ||
        data.address.suburb ||
        data.address.city ||
        data.address.county ||
        data.display_name ||
        `Titik (${lat.toFixed(4)}, ${lng.toFixed(4)})`
      );
    }
  } catch (e) {}

  return `Titik (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
}

// ============================================================
// RENDER MARKER DAN DAFTAR NODE (PAKAI NAMA WILAYAH)
// ============================================================

function renderMarkers() {
  markers.forEach((m) => map.removeLayer(m));
  markers = [];

  const list = document.getElementById("pointsList");
  list.innerHTML = "";

  const startSel = document.getElementById("startSelect");
  const goalSel = document.getElementById("goalSelect");
  startSel.innerHTML = "";
  goalSel.innerHTML = "";

  points.forEach((p, idx) => {
   const marker = L.marker([p.lat, p.lng]).addTo(map);

marker.bindPopup(`
  <b>${p.name}</b><br><br>

  <button onclick="togglePoint(${idx})">➕ / ❌ Masukkan ke Rute</button>
  <hr>
  <button onclick="runSAfromMap()">▶ Jalankan SA</button>
`);

    marker.bindTooltip(`${p.name}`, {
      permanent: true,
      direction: "top",
      className: "city-label",
    });
    markers.push(marker);

    const li = document.createElement("li");
    li.textContent = `${p.name} — ${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;
    list.appendChild(li);

    const opt1 = document.createElement("option");
    opt1.value = idx;
    opt1.textContent = p.name;
    startSel.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = idx;
    opt2.textContent = p.name;
    goalSel.appendChild(opt2);
  });

  if (points.length > 1) {
    startSel.value = 0;
    goalSel.value = points.length - 1;
  }
}

// ============================================================
// TAMBAH TITIK LEWAT KLIK MAP — LANGSUNG AMBIL NAMA WILAYAH
// ============================================================

map.on("click", async (e) => {
  const lat = e.latlng.lat;
  const lng = e.latlng.lng;



  updateStats("Mengambil nama wilayah...");

  const name = await getLocationName(lat, lng);

  points.push({ lat, lng, name });
  distanceMatrix = null;

  renderMarkers();
  updateStats(`Titik baru ditambahkan: <b>${name}</b>.`);
});

// ============================================================
// TOMBOL CLEAR & RANDOM POINTS
// ============================================================

document.getElementById("btnClearPoints").onclick = () => {
  points = [];
  distanceMatrix = null;
  clearRoute();
  renderMarkers();
  updateStats("Semua titik telah dihapus.");
};

document.getElementById("btnRandomPoints").onclick = async () => {
  const b = map.getBounds();
  for (let i = 0; i < 5; i++) {
    const lat = b.getSouth() + Math.random() * (b.getNorth() - b.getSouth());
    const lng = b.getWest() + Math.random() * (b.getEast() - b.getWest());
    const name = await getLocationName(lat, lng);
    points.push({ lat, lng, name });
  }
  distanceMatrix = null;
  renderMarkers();
  updateStats("Titik acak ditambahkan.");
};

// ============================================================

function updateStats(html) {
  document.getElementById("stats").innerHTML = html;
}

function clearRoute() {
  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }
}

// ============================================================
// AMBIL MATRIX JARAK DARI OSRM TABLE API
// ============================================================

async function ensureDistanceMatrix() {
  if (points.length < 2) throw new Error("Minimal 2 titik diperlukan.");

  if (distanceMatrix) return distanceMatrix;

  const coords = points.map(p => `${p.lng},${p.lat}`).join(";");
  const url = `${OSRM_TABLE}${coords}?annotations=distance`;

  updateStats("Mengambil matrix jarak OSRM...");
  const res = await fetch(url);
  const data = await res.json();

  if (!data.distances) throw new Error("Gagal ambil matrix dari OSRM.");

  distanceMatrix = data.distances;
  return distanceMatrix;
}

// ============================================================
// GAMBAR JALUR OSRM
// ============================================================

async function drawOSRMroute(path) {
  clearRoute();
  if (!path || path.length < 2) return;

  const coords = path.map(i => `${points[i].lng},${points[i].lat}`).join(";");
  const url = `${OSRM_ROUTE}${coords}?overview=full&geometries=geojson`;

  const res = await fetch(url);
  const data = await res.json();

  routeLayer = L.geoJSON(data.routes[0].geometry, {
    style: { color: "#007bff", weight: 4 },
  }).addTo(map);

  map.fitBounds(routeLayer.getBounds().pad(0.2));

  return data.routes[0].distance;
}

// ============================================================
// GRAPH NEIGHBORS
// ============================================================

function neighborsOf(i) {
  return [...Array(points.length).keys()].filter(j => j !== i);
}

function lengthFromMatrix(path) {
  let s = 0;
  for (let i = 0; i < path.length - 1; i++) {
    s += distanceMatrix[path[i]][path[i + 1]];
  }
  return s;
}

// ============================================================
// SA-TSP
// ============================================================

function saDistance(order) {
  let s = 0;
  for (let i = 0; i < order.length - 1; i++)
    s += distanceMatrix[order[i]][order[i + 1]];
  s += distanceMatrix[order[order.length - 1]][order[0]];
  return s;
}

function saOptimize(iters = 3000, t0 = 1200, cooling = 0.995) {
  const n = points.length;
  let order = [...Array(n).keys()];

  let bestOrder = order.slice();
  let bestCost = saDistance(order);
  let T = t0;

  for (let iter = 0; iter < iters; iter++) {
    const i = 1 + Math.floor(Math.random() * (n - 2));
    const j = i + Math.floor(Math.random() * (n - i));

    const newOrder = order.slice(0, i)
      .concat(order.slice(i, j + 1).reverse())
      .concat(order.slice(j + 1));

    const cur = saDistance(order);
    const nxt = saDistance(newOrder);
    const delta = nxt - cur;

    if (delta < 0 || Math.random() < Math.exp(-delta / T)) {
      order = newOrder;
      if (nxt < bestCost) {
        bestCost = nxt;
        bestOrder = newOrder.slice();
      }
    }

    T *= cooling;
    if (T < 1e-12) T = 1e-12;
  }

  return { bestOrder, bestCost };
}

async function drawSARoute(bestOrder) {
  clearRoute();
  const coords = bestOrder.map(i => `${points[i].lng},${points[i].lat}`).join(";");

  const url = `${OSRM_ROUTE}${coords}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  const data = await res.json();

  routeLayer = L.geoJSON(data.routes[0].geometry, {
    style: { color: "#ff5733", weight: 4 },
  }).addTo(map);

  map.fitBounds(routeLayer.getBounds().pad(0.2));
}

// ============================================================
// GENERIC RUN ALGO
// ============================================================

async function runAlgo(name) {
  if (points.length < 2) return alert("Minimal 2 titik.");

  const start = parseInt(startSelect.value);
  const goal = parseInt(goalSelect.value);

  await ensureDistanceMatrix();

  updateStats(`Menjalankan ${name}...`);

  let result = null;

  if (name === "BFS") result = bfs(start, goal);
  if (name === "DFS") result = dfs(start, goal);
  if (name === "UCS") result = ucs(start, goal);
  if (name === "GREEDY") result = greedy(start, goal);
  if (name === "ASTAR") result = astar(start, goal);

  const osrmDist = await drawOSRMroute(result.path);
  const km = osrmDist / 1000;

  const pathNames = result.path.map(i => points[i].name).join(" → ");

  updateStats(`
    Algoritma: <b>${name}</b><br>
    Path: ${pathNames}<br>
    Node dikembangkan: <b>${result.expanded}</b><br>
    Jarak OSRM: <b>${km.toFixed(3)} km</b>
  `);
}

async function runSA() {
  const manualCalc = buildManualCalculation(
  bestOrder,
  distanceMatrix,
  points
);

updateStats(`
  <b>Simulated Annealing – Semua Titik</b><br>
  Jumlah titik: ${points.length}<br>
  Rute: ${nameOrder}<br><br>
  ${manualCalc}
`);


}

// ============================================================
// EVENT LISTENERS
// ============================================================

document.getElementById("btnSA").onclick = () => runSA();

// ============================================================
// INIT
// ============================================================

// ============================================================
// PENCARIAN LOKASI — GEOCODING KE TITIK DI PETA
// ============================================================

async function geosearch(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "RouteLabSearchApp/1.0" }
    });
    const data = await res.json();
    if (data.length === 0) return null;
    return data[0];
  } catch (e) {
    return null;
  }
}

document.getElementById("btnSearchLocation").onclick = async () => {
  const query = document.getElementById("searchInput").value.trim();
  if (!query) return alert("Masukkan nama lokasi.");

  updateStats("Mencari lokasi...");

  const result = await geosearch(query);
  if (!result) {
    updateStats("Lokasi tidak ditemukan.");
    return;
  }

  const lat = parseFloat(result.lat);
  const lng = parseFloat(result.lon);

  // Ambil nama wilayah asli
  const name = await getLocationName(lat, lng);

  // Tambahkan titik baru
  points.push({ lat, lng, name });
  distanceMatrix = null;

  renderMarkers();
  map.setView([lat, lng], 15);

  updateStats(`Lokasi ditemukan & ditambahkan: <b>${name}</b>.`);
};

renderMarkers();
updateStats("Klik peta untuk menambah titik.");

// ============================================================
// PANEL SLIDE (AMAN, TIDAK MERUSAK UI)
// ============================================================
const panel = document.getElementById("panel");

let startY = 0;
let startHeight = 0;
let dragging = false;

panel.addEventListener("mousedown", (e) => {
  if (e.clientY > panel.getBoundingClientRect().top + 20) return;
  dragging = true;
  startY = e.clientY;
  startHeight = panel.offsetHeight;
  document.body.style.userSelect = "none";
});

window.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  const diff = startY - e.clientY;
  let h = startHeight + diff;
  h = Math.max(160, Math.min(420, h));
  panel.style.height = h + "px";
});

window.addEventListener("mouseup", () => {
  dragging = false;
  document.body.style.userSelect = "";
});

// ==============================================

async function runSAfromMap() {
  if (selectedPoints.length < 3) {
    alert("Minimal 3 titik untuk Simulated Annealing.");
    return;
  }

  await ensureDistanceMatrix();
  updateStats("Menjalankan Simulated Annealing dari titik pilihan...");

  // Ambil hanya titik yang dipilih
  const subMatrix = selectedPoints.map(i =>
    selectedPoints.map(j => distanceMatrix[i][j])
  );

  // Mapping indeks
  const indexMap = selectedPoints;

  // Jalankan SA pada subset
  const { bestOrder, bestCost } = saOptimizeSubset(subMatrix);

  // Kembalikan ke indeks asli
  const realOrder = bestOrder.map(i => indexMap[i]);

  await drawSARoute(realOrder);

  const nameOrder = realOrder.map(i => points[i].name).join(" → ");

  const usedPoints = selectedPoints.map(i => points[i]);

const manualCalc = buildManualCalculation(
  bestOrder,
  subMatrix,
  usedPoints
);



const routeButtons = buildRouteButtons(realOrder);

updateStats(`
  <b>Simulated Annealing (Custom Points)</b><br>
  Titik dipilih: ${selectedPoints.length}<br>
  Rute: ${nameOrder}<br><br>

  ${routeButtons}
  <br>
  ${manualCalc}
`);




}
// ============================================================
// ============================================================
function saOptimizeSubset(matrix, iters = 3000, t0 = 1200, cooling = 0.995) {
  const n = matrix.length;
  let order = [...Array(n).keys()];

  let bestOrder = order.slice();
  let bestCost = saDistanceSubset(order, matrix);
  let T = t0;

  for (let iter = 0; iter < iters; iter++) {
    const i = 1 + Math.floor(Math.random() * (n - 2));
    const j = i + Math.floor(Math.random() * (n - i));

    const newOrder = order.slice(0, i)
      .concat(order.slice(i, j + 1).reverse())
      .concat(order.slice(j + 1));

    const cur = saDistanceSubset(order, matrix);
    const nxt = saDistanceSubset(newOrder, matrix);
    const delta = nxt - cur;

    if (delta < 0 || Math.random() < Math.exp(-delta / T)) {
      order = newOrder;
      if (nxt < bestCost) {
        bestCost = nxt;
        bestOrder = newOrder.slice();
      }
    }

    T *= cooling;
    if (T < 1e-12) T = 1e-12;
  }

  return { bestOrder, bestCost };
}

function saDistanceSubset(order, matrix) {
  let s = 0;
  for (let i = 0; i < order.length - 1; i++) {
    s += matrix[order[i]][order[i + 1]];
  }
  s += matrix[order[order.length - 1]][order[0]];
  return s;
}

//=================================

function createNumberIcon(number) {
  return L.divIcon({
    className: "numbered-marker",
    html: number,
    iconSize: [26, 26],
    iconAnchor: [13, 26],   // posisi ujung bawah marker
    popupAnchor: [0, -26]
  });
}
function buildManualCalculation(order, matrix, usedPoints) {
  let html = "<b>Perhitungan Manual:</b><br>";
  let total = 0;

  for (let i = 0; i < order.length - 1; i++) {
    const from = usedPoints[order[i]];
    const to   = usedPoints[order[i + 1]];

    const d = matrix[order[i]][order[i + 1]] / 1000;
    total += d;

    html += `${from.name} → ${to.name} = ${d.toFixed(3)} km<br>`;
  }

  // kembali ke titik awal (TSP)
  const last = usedPoints[order[order.length - 1]];
  const first = usedPoints[order[0]];
  const back = matrix[order[order.length - 1]][order[0]] / 1000;

  total += back;
  html += `${last.name} → ${first.name} = ${back.toFixed(3)} km<br>`;
  html += `<hr><b>Total Jarak = ${total.toFixed(3)} km</b>`;

  return html;
}

// ============================================================
// GAMBAR 1 SEGMEN RUTE SAJA (PER TITIK)
// ============================================================
async function drawRouteSegment(fromIndex, toIndex) {
  clearRoute();

  const coords = `${points[fromIndex].lng},${points[fromIndex].lat};${points[toIndex].lng},${points[toIndex].lat}`;
  const url = `${OSRM_ROUTE}${coords}?overview=full&geometries=geojson`;

  const res = await fetch(url);
  const data = await res.json();

  routeLayer = L.geoJSON(data.routes[0].geometry, {
    style: { color: "#28a745", weight: 4 }, // hijau untuk segmen
  }).addTo(map);

  map.fitBounds(routeLayer.getBounds().pad(0.2));
}


function buildRouteButtons(realOrder) {
  let html = "<b>Rute (Klik Per Segmen):</b><br>";

  for (let i = 0; i < realOrder.length - 1; i++) {
    const from = realOrder[i];
    const to   = realOrder[i + 1];

    html += `
      <button onclick="drawRouteSegment(${from}, ${to})" style="margin:3px; padding:4px 8px;">
        ${i + 1}. ${points[from].name} → ${points[to].name}
      </button><br>
    `;
  }

  // kembali ke titik awal (TSP)
  const last = realOrder[realOrder.length - 1];
  const first = realOrder[0];

  html += `
    <button onclick="drawRouteSegment(${last}, ${first})" style="margin:3px; padding:4px 8px;">
      ${realOrder.length}. ${points[last].name} → ${points[first].name}
    </button><br>
  `;

  return html;
}




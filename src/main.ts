import {
  fetchChannelData,
  isRateLimitError,
  searchStations,
  usgsStationUrl,
  type ChannelData,
  type Station,
} from "./api/usgs";
import { mapRiverToTone, type RiverTone } from "./audio/mapping";
import { RiverSynth } from "./audio/riverSynth";
import { featuredRivers } from "./data/featuredRivers";
import { startMiniWatercolor } from "./visual/miniWatercolor";
import { RiverVisual } from "./visual/riverVisual";
import "./style.css";

type AppState = {
  view: "home" | "channel";
  query: string;
  results: Station[];
  searching: boolean;
  channel?: ChannelData;
  loadingChannel: boolean;
  error?: string;
  aboutOpen: boolean;
  listening: boolean;
  homePreviewPlaying: boolean;
};

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("App root missing");
const app = root;

let state: AppState = {
  view: "home",
  query: "",
  results: [],
  searching: false,
  loadingChannel: false,
  aboutOpen: false,
  listening: false,
  homePreviewPlaying: false,
};

let searchTimer: number | undefined;
let searchRequestId = 0;
let synth: RiverSynth | undefined;
let homePreviewSynth: RiverSynth | undefined;
let visual: RiverVisual | undefined;
let miniVisuals: Array<() => void> = [];
let homePreviewAutoTried = false;
const previewRivers = [
  {
    riverName: "Rogue River",
    location: "Agness, Oregon",
    stationId: "USGS-14372300",
  },
  {
    riverName: "Potomac River",
    location: "Washington, District of Columbia",
    stationId: "USGS-01646500",
  },
  {
    riverName: "Willamette River",
    location: "Salem, Oregon",
    stationId: "USGS-14191000",
  },
  {
    riverName: "San Juan River",
    location: "Bluff, Utah",
    stationId: "USGS-09379500",
  },
  {
    riverName: "Sacramento River",
    location: "Freeport, California",
    stationId: "USGS-11447650",
  },
];
const previewRiver = previewRivers[Math.floor(Math.random() * previewRivers.length)] ?? previewRivers[0];

const setState = (patch: Partial<AppState>) => {
  state = { ...state, ...patch };
  render();
};

const formatAge = (time?: string) => {
  if (!time) return "";
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(time)) / 60000));
  if (minutes < 2) return "measured just now";
  if (minutes < 90) return `measured ${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `measured ${hours} hours ago`;
  return `measured ${Math.round(hours / 24)} days ago`;
};

const formatMeasurement = (kind: keyof ChannelData["measurements"], data: ChannelData) => {
  const item = data.measurements[kind];
  if (!item) return "";
  if (kind === "temperature") return `${Math.round(item.value * 9 / 5 + 32)}°F`;
  if (kind === "flow") return `${Math.round(item.value).toLocaleString()} ft³/s`;
  return `${item.value.toFixed(item.value >= 10 ? 1 : 2)} ft`;
};

const formatStationSuggestion = (station: Station) =>
  [
    station.riverName || station.name,
    station.cityName,
    station.stateName,
    station.countryName ?? "United States",
  ]
    .filter(Boolean)
    .join(", ");

const featuredStation = (stationId: string): Station | undefined => {
  const featured = featuredRivers.find((river) => river.stationId === stationId);
  if (!featured) return undefined;
  return {
    id: featured.stationId,
    name: `${featured.riverName} at ${featured.location}`,
    riverName: featured.riverName,
    cityName: featured.location.split(",")[0]?.trim(),
    stateName: featured.location.split(",")[1]?.trim(),
    countryName: "United States",
    location: featured.location,
  };
};

const stationHintFor = (stationId: string) =>
  state.results.find((station) => station.id === stationId) ?? featuredStation(stationId) ?? previewStation(stationId);

const previewStation = (stationId: string): Station | undefined => {
  const preview = previewRivers.find((river) => river.stationId === stationId);
  if (!preview) return undefined;
  return {
    id: preview.stationId,
    name: `${preview.riverName} at ${preview.location}`,
    riverName: preview.riverName,
    cityName: preview.location.split(",")[0]?.trim(),
    stateName: preview.location.split(",")[1]?.trim(),
    countryName: "United States",
    location: preview.location,
  };
};

const previewChannelData = (): ChannelData => ({
  station: previewStation(previewRiver.stationId) ?? {
    id: previewRiver.stationId,
    name: `${previewRiver.riverName} at ${previewRiver.location}`,
    riverName: previewRiver.riverName,
    cityName: previewRiver.location.split(",")[0]?.trim(),
    stateName: previewRiver.location.split(",")[1]?.trim(),
    countryName: "United States",
    location: previewRiver.location,
  },
  measurements: {},
  movement: 0,
});

const stopHomePreview = () => {
  homePreviewSynth?.destroy();
  homePreviewSynth = undefined;
  state = { ...state, homePreviewPlaying: false };
};

const loadChannel = async (stationId: string) => {
  stopHomePreview();
  synth?.destroy();
  visual?.destroy();
  synth = undefined;
  visual = undefined;
  setState({ view: "channel", loadingChannel: true, error: undefined, listening: false });
  try {
    const channel = await fetchChannelData(stationId, stationHintFor(stationId));
    setState({ channel, loadingChannel: false });
  } catch (error) {
    setState({
      loadingChannel: false,
      error: isRateLimitError(error)
        ? "USGS is rate-limiting live requests right now. Wait a minute, then try this channel again."
        : error instanceof Error ? error.message : "The river could not be tuned.",
    });
  }
};

const runSearch = async (query: string) => {
  const requestId = ++searchRequestId;
  if (query.trim().length < 2) {
    state = { ...state, results: [], searching: false, error: undefined };
    renderSearchResults();
    return;
  }

  state = { ...state, searching: true, error: undefined };
  renderSearchResults();
  try {
    const results = await searchStations(query);
    if (requestId !== searchRequestId) return;
    state = {
      ...state,
      results,
      searching: false,
      error: results.length ? undefined : "No live channel found for this river. Try another location or river.",
    };
    renderSearchResults();
  } catch (error) {
    if (requestId !== searchRequestId) return;
    state = {
      ...state,
      results: [],
      searching: false,
      error: isRateLimitError(error)
        ? "USGS is rate-limiting live requests right now. Wait a minute, then try again."
        : "The USGS signal is quiet right now. Try again in a moment.",
    };
    renderSearchResults();
  }
};

const onSearchInput = (query: string) => {
  state = { ...state, query };
  window.clearTimeout(searchTimer);
  if (query.trim().length < 2) {
    searchRequestId += 1;
    state = { ...state, results: [], searching: false, error: undefined };
    renderSearchResults();
    return;
  }
  searchTimer = window.setTimeout(() => runSearch(query), 460);
};

const backHome = () => {
  stopHomePreview();
  synth?.destroy();
  visual?.destroy();
  synth = undefined;
  visual = undefined;
  setState({ view: "home", channel: undefined, loadingChannel: false, listening: false, error: undefined });
};

const toggleHomePreview = async () => {
  const tone = mapRiverToTone(previewChannelData());
  if (!homePreviewSynth) {
    homePreviewSynth = new RiverSynth(tone, () => undefined);
  } else {
    homePreviewSynth.updateTone(tone);
  }

  if (state.homePreviewPlaying) {
    homePreviewSynth.stop();
    setState({ homePreviewPlaying: false });
  } else {
    setState({ homePreviewPlaying: true });
    try {
      await homePreviewSynth.start();
    } catch {
      homePreviewSynth?.stop();
      setState({ homePreviewPlaying: false });
    }
  }
};

const toggleAudio = async () => {
  if (!state.channel) return;
  const tone = mapRiverToTone(state.channel);
  const canvas = document.querySelector<HTMLCanvasElement>("#river-canvas");
  if (canvas && !visual) {
    visual = new RiverVisual(canvas, tone);
    visual.start();
  }

  if (!synth) {
    synth = new RiverSynth(tone, (energy, note) => visual?.pulse(energy, note));
  } else {
    synth.updateTone(tone);
  }

  if (state.listening) {
    synth.stop();
    setState({ listening: false });
  } else {
    setState({ listening: true });
    await synth.start();
  }
};

const skipRock = async () => {
  if (!state.channel) return;
  const tone = mapRiverToTone(state.channel);
  const canvas = document.querySelector<HTMLCanvasElement>("#river-canvas");
  if (canvas && !visual) {
    visual = new RiverVisual(canvas, tone);
    visual.start();
  }
  visual?.skipRock();

  if (!synth) {
    synth = new RiverSynth(tone, (energy, note) => visual?.pulse(energy, note));
  } else {
    synth.updateTone(tone);
  }
  await synth.skipRock();
};

const miniWatercolor = (seed: number) =>
  `<canvas class="mini-watercolor" data-mini-seed="${seed}" aria-hidden="true"></canvas>`;

const siteFooter = () => `
  <footer class="site-footer">
    <a href="https://www.usgs.gov/" target="_blank" rel="noreferrer">Powered by water data from U.S. Geological Survey</a>
    <a href="https://www.instagram.com/emilyedwards" target="_blank" rel="noreferrer">by ee</a>
  </footer>
`;

const homePlayerTemplate = () => `
  <aside class="home-player" aria-label="Now playing preview">
    <canvas class="home-player-watercolor" data-mini-seed="${previewRiver.stationId.length * 137}" aria-hidden="true"></canvas>
    <button class="home-player-link" type="button" data-station="${previewRiver.stationId}">
      <span>Now Playing:</span>
      <strong>${previewRiver.riverName}</strong>
    </button>
    <button class="home-player-toggle" type="button" data-action="home-preview" aria-label="${state.homePreviewPlaying ? "Pause preview" : "Play preview"}">
      <span aria-hidden="true">${state.homePreviewPlaying ? "||" : "▶"}</span>
    </button>
  </aside>
`;

const homeTemplate = () => `
  <main class="home-shell">
    <header class="topbar">
      <button class="brand" data-action="home">river radio</button>
      ${homePlayerTemplate()}
      <button class="text-link" data-action="about">about</button>
    </header>
    <section class="intro">
      <h1>Every river has a song.</h1>
      <p>Listen to what yours sounds like right now.</p>
    </section>
    <section class="featured">
      <h2>Featured Channels</h2>
      <div class="featured-list">
        ${featuredRivers
          .map(
            (river, index) => `
              <button class="featured-row" data-station="${river.stationId}">
                ${miniWatercolor(index * 97 + river.stationId.length)}
                <span>
                  <strong>${river.riverName}</strong>
                  <small>${river.location}</small>
                </span>
                <span class="play-now">
                  <span>play now</span>
                  <span class="play-now-mark" aria-hidden="true"></span>
                </span>
              </button>
            `,
          )
          .join("")}
      </div>
    </section>
    <section class="search-section">
      <div class="search-panel">
        <label class="search-label" for="river-search">Create a River Channel</label>
        <p class="search-help">Search any river in the United States to harmonize its live water data.</p>
        <div class="search-box">
          <span aria-hidden="true">›</span>
          <input id="river-search" type="search" value="${state.query}" placeholder="river name or state" autocomplete="off" />
          <button class="search-submit" type="button" data-action="search-now">
            <span>search</span>
          </button>
        </div>
      </div>
      <div class="search-side">
        <div class="search-results" aria-live="polite">${searchResultsTemplate()}</div>
      </div>
    </section>
    ${siteFooter()}
  </main>
`;

const searchResultsTemplate = () => `
  ${state.searching ? `<p class="quiet">tuning stations...</p>` : ""}
  ${state.results
    .map(
      (station) => `
        <button class="station-result" data-station="${station.id}">
          <span>${formatStationSuggestion(station)}</span>
        </button>
      `,
    )
    .join("")}
  ${state.error && state.query ? `<p class="error-text">${state.error}</p>` : ""}
`;

const renderSearchResults = () => {
  const results = document.querySelector<HTMLDivElement>(".search-results");
  if (results) results.innerHTML = searchResultsTemplate();
};

const channelTemplate = (channel: ChannelData) => {
  const measurements = [
    ["flow", formatMeasurement("flow", channel), "DISCHARGE"],
    ["stage", formatMeasurement("stage", channel), "STAGE"],
    ["temperature", formatMeasurement("temperature", channel), "WATER TEMP"],
  ].filter(([, value]) => value);
  const movementText = channel.movement === 1 ? "rising" : channel.movement === -1 ? "falling" : "stable";

  return `
    <main class="channel-shell">
      <header class="topbar">
        <button class="brand" data-action="home">river radio</button>
      </header>
      <section class="channel-head">
        <div>
          <h1>${channel.station.riverName.toUpperCase()}</h1>
          <span>${channel.station.location}</span>
        </div>
        <dl class="measurements">
          ${measurements
            .map(
              ([kind, value, label]) => `
                <div>
                  <dt>${label}</dt>
                  <dd class="${kind}">${value}</dd>
                </div>
              `,
            )
            .join("")}
          <div class="measured">
            <dt>${movementText}</dt>
            <dd>${formatAge(channel.measuredAt)}</dd>
          </div>
        </dl>
      </section>
      <section class="river-stage">
        <canvas id="river-canvas" aria-label="Generative pixel river visualization"></canvas>
        <div class="stage-controls">
          <button class="skip-control" data-action="skip-rock">skip a rock</button>
          <button class="listen-control" data-action="listen">${state.listening ? "■ STOP" : "● LISTEN"}</button>
        </div>
      </section>
      <footer class="channel-foot">
        <button class="blue-link" data-action="back">← choose another river</button>
        <a class="blue-link" href="${usgsStationUrl(channel.station.id)}" target="_blank" rel="noreferrer">Data: USGS station ↗</a>
      </footer>
      ${siteFooter()}
    </main>
  `;
};

const loadingTemplate = () => `
  <main class="channel-shell">
    <header class="topbar">
      <button class="brand" data-action="home">river radio</button>
    </header>
    <div class="loading-state">tuning live water data...</div>
    ${siteFooter()}
  </main>
`;

const errorTemplate = () => `
  <main class="home-shell">
    <header class="topbar">
      <button class="brand" data-action="home">river radio</button>
      <button class="text-link" data-action="about">about</button>
    </header>
    <section class="intro">
      <h1>No live channel found.</h1>
      <p>${state.error ?? "Try another location or river."}</p>
      <button class="blue-link back-inline" data-action="back">← choose another river</button>
    </section>
    ${siteFooter()}
  </main>
`;

const aboutTemplate = () => `
  <div class="about-backdrop" data-action="close-about">
    <aside class="about-panel" role="dialog" aria-modal="true" aria-labelledby="about-title">
      <button class="close-button" data-action="close-about" aria-label="Close about">×</button>
      <h2 id="about-title">About</h2>
      <p>River Radio turns live measurements from USGS river monitoring stations into generative music and moving images. The river is the composer.</p>
      <p>Monitoring availability varies by station, and measurements may update periodically rather than continuously every second.</p>
      <p>Data: <a href="https://api.waterdata.usgs.gov/docs/ogcapi/" target="_blank" rel="noreferrer">U.S. Geological Survey</a></p>
    </aside>
  </div>
`;

function render() {
  if (visual) {
    visual.destroy();
    visual = undefined;
  }
  miniVisuals.forEach((stop) => stop());
  miniVisuals = [];

  app.innerHTML = `
    ${state.view === "home" ? homeTemplate() : state.loadingChannel ? loadingTemplate() : state.channel ? channelTemplate(state.channel) : errorTemplate()}
    ${state.aboutOpen ? aboutTemplate() : ""}
  `;

  const input = document.querySelector<HTMLInputElement>("#river-search");
  if (input) {
    input.addEventListener("input", (event) => onSearchInput((event.target as HTMLInputElement).value));
    if (document.activeElement === document.body && state.query) {
      input.selectionStart = input.selectionEnd = input.value.length;
    }
  }

  const canvas = document.querySelector<HTMLCanvasElement>("#river-canvas");
  if (canvas && state.channel) {
    const tone: RiverTone = mapRiverToTone(state.channel);
    if (!visual) {
      visual = new RiverVisual(canvas, tone);
      visual.start();
    }
  }

  document.querySelectorAll<HTMLCanvasElement>(".mini-watercolor, .home-player-watercolor").forEach((canvas) => {
    const seed = Number(canvas.dataset.miniSeed) || 1;
    miniVisuals.push(startMiniWatercolor(canvas, seed));
  });

  if (state.view === "home" && !homePreviewAutoTried) {
    homePreviewAutoTried = true;
    window.setTimeout(() => {
      if (state.view === "home" && !state.homePreviewPlaying) void toggleHomePreview();
    }, 300);
  }
}

app.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const actionTarget = target.closest<HTMLElement>("[data-action], [data-station]");
  if (!actionTarget) return;
  const stationId = actionTarget.dataset.station;
  if (stationId) {
    void loadChannel(stationId);
    return;
  }

  const action = actionTarget.dataset.action;
  if (action === "about") setState({ aboutOpen: true });
  if (action === "close-about") setState({ aboutOpen: false });
  if (action === "back" || action === "home") backHome();
  if (action === "listen") void toggleAudio();
  if (action === "skip-rock") void skipRock();
  if (action === "home-preview") void toggleHomePreview();
  if (action === "search-now") {
    const input = document.querySelector<HTMLInputElement>("#river-search");
    input?.focus();
    void runSearch(state.query);
  }
});

render();

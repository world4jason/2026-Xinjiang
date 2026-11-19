/*
 * Runtime travel context for Travel Lite.
 * Keeps only small changing context (weather) and an overview map for already
 * planned stops. Discovery/recommendation belongs in specialist apps.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
(() => {
  let mapInstance = null;
  // Each initMap() call takes a generation; a call whose MapLibre import resolves after a newer render
  // started must not create a second map in the (replaced) container.
  let mapInitGeneration = 0;
  let maplibrePromise = null;

  const baseRenderNow = renderNow;
  const baseRenderTrip = renderTrip;

  function primaryCoordinate(items = []) {
    const item = items.find((candidate) =>
      Number.isFinite(Number(candidate?.lat)) && Number.isFinite(Number(candidate?.lng)));
    if (item) return {
      lat: Number(item.lat),
      lng: Number(item.lng),
      label: item.title || item.location || "Trip",
    };

    const center = state.data.trip.center;
    if (Array.isArray(center) && center.length >= 2) {
      return { lat: Number(center[0]), lng: Number(center[1]), label: state.data.trip.homeLabel || state.data.trip.title };
    }
    if (center && Number.isFinite(Number(center.lat)) && Number.isFinite(Number(center.lng))) {
      return { lat: Number(center.lat), lng: Number(center.lng), label: state.data.trip.homeLabel || state.data.trip.title };
    }
    return null;
  }

  function mapPreview(item, compact = false) {
    if (!item) return "";
    const src = googleMapsEmbedUrl(item);
    if (src) {
      const title = (window.TravelLiteChinaMaps?.isEnabled?.() ? "高德地圖 · " : "Google Map for ") + (item.title || item.location || "trip location");
      return `<div class="map-frame ${compact ? "compact" : ""}"><iframe title="${escapeAttr(title)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" src="${escapeAttr(src)}" allowfullscreen></iframe></div>`;
    }
    const open = googleMapsOpenUrl(item);
    if (!open) return "";
    const china = window.TravelLiteChinaMaps?.isEnabled?.();
    return `<section class="panel map-handoff ${compact ? "compact" : ""}"><div><p class="eyebrow">${china ? "地圖查詢" : "Map handoff"}</p><strong>${escapeHtml(item.title || item.location || "Place")}</strong><p>${china ? "位置僅供參考，實際團體集合點由領隊公告。" : "Open your normal map app for ratings, photos, live details and navigation."}</p></div><a class="button-link" href="${escapeAttr(open)}" target="_blank" rel="noreferrer">${china ? "開啟高德地圖" : "Open Google Maps"} ↗</a></section>`;
  }

  window.mapPreview = mapPreview;

  itemActions = function runtimeItemActions(item) {
    if (!item) return "";
    const open = googleMapsOpenUrl(item);
    const hasPlace = Boolean(
      Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng))
      || item.location || item.mapQuery
    );
    const china = window.TravelLiteChinaMaps?.isEnabled?.();
    return `<div class="action-row">
      ${hasPlace ? `<button class="button-link primary" type="button" data-map-item="${escapeAttr(item.id)}">${china ? "行程地圖" : "Trip map"}</button>` : ""}
      ${open ? `<a class="button-link" href="${escapeAttr(open)}" target="_blank" rel="noreferrer">${china ? "高德地圖" : "Google Maps"} ↗</a>` : ""}
    </div>`;
  };

  function weatherLabel(code) {
    if (code === 0) return "Clear";
    if ([1, 2].includes(code)) return "Mostly clear";
    if (code === 3) return "Cloudy";
    if ([45, 48].includes(code)) return "Fog";
    if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
    if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
    if ([95, 96, 99].includes(code)) return "Thunderstorm";
    return "Weather";
  }

  function weatherIcon(code) {
    if (code === 0) return "☀";
    if ([1, 2].includes(code)) return "◐";
    if (code === 3) return "☁";
    if ([45, 48].includes(code)) return "≋";
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "☂";
    if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄";
    if ([95, 96, 99].includes(code)) return "ϟ";
    return "◌";
  }

  async function weatherCardFor(date, coordinate, mode = "daily") {
    if (!coordinate) return null;
    try {
      const data = await TravelLiteProviders.weather(coordinate.lat, coordinate.lng);
      const idx = data.daily?.time?.indexOf(date) ?? -1;
      if (idx < 0 && mode !== "current") return null;
      const current = data.current || {};
      const card = document.createElement("section");
      card.className = "panel weather-card";

      if (mode === "current" && date === zonedNow(state.data.trip.timezone).date) {
        card.innerHTML = `<div class="weather-icon">${weatherIcon(current.weather_code)}</div><div><p class="eyebrow">Live weather · ${escapeHtml(coordinate.label)}</p><h2>${Math.round(current.temperature_2m ?? 0)}° · ${escapeHtml(weatherLabel(current.weather_code))}</h2><p>Feels ${Math.round(current.apparent_temperature ?? current.temperature_2m ?? 0)}° · Wind ${Math.round(current.wind_speed_10m ?? 0)} km/h${data.__stale ? " · cached" : ""}</p></div>`;
      } else {
        const hi = data.daily.temperature_2m_max?.[idx];
        const lo = data.daily.temperature_2m_min?.[idx];
        const rain = data.daily.precipitation_probability_max?.[idx];
        const code = data.daily.weather_code?.[idx];
        card.innerHTML = `<div class="weather-icon">${weatherIcon(code)}</div><div><p class="eyebrow">Forecast · ${escapeHtml(coordinate.label)}</p><h2>${Math.round(hi)}° / ${Math.round(lo)}° · ${escapeHtml(weatherLabel(code))}</h2><p>Rain ${rain ?? 0}%${data.__stale ? " · cached" : ""}</p></div>`;
      }
      return card;
    } catch (error) {
      console.warn("Weather provider unavailable", error);
      return null;
    }
  }

  async function injectNowWeather() {
    const context = getNowContext();
    if (context.phase !== "during") return;
    const coordinate = primaryCoordinate([context.current, context.next].filter(Boolean));
    const card = await weatherCardFor(context.now.date, coordinate, "current");
    if (!card || state.view !== "now") return;
    const stack = root.querySelector(".view-stack");
    if (stack && !stack.querySelector(".weather-card")) stack.insertBefore(card, stack.children[1] || null);
  }

  async function injectTripWeather() {
    const day = state.data.days.find((candidate) => candidate.date === state.selectedDate);
    if (!day) return;
    const coordinate = primaryCoordinate(day.items || []);
    const card = await weatherCardFor(day.date, coordinate, "daily");
    if (!card || state.view !== "trip" || state.selectedDate !== day.date) return;
    const summary = root.querySelector(".day-summary");
    if (summary && !root.querySelector(".weather-card")) summary.insertAdjacentElement("afterend", card);
  }

  renderNow = function runtimeRenderNow() {
    baseRenderNow();
    injectNowWeather();
  };

  renderTrip = function runtimeRenderTrip() {
    baseRenderTrip();
    injectTripWeather();
  };

  async function ensureMapLibre() {
    if (maplibrePromise) return maplibrePromise;
    if (!document.querySelector('link[data-maplibre]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://cdn.jsdelivr.net/npm/maplibre-gl@6.10.0/dist/maplibre-gl.css";
      link.dataset.maplibre = "1";
      document.head.appendChild(link);
    }
    maplibrePromise = import("https://cdn.jsdelivr.net/npm/maplibre-gl@6.10.0/+esm").catch((error) => {
      maplibrePromise = null;
      throw error;
    });
    return maplibrePromise;
  }

  function destroyMap() {
    if (!mapInstance) return;
    try { mapInstance.remove(); } catch {}
    mapInstance = null;
  }

  function itemCoordinates(item) {
    const lat = Number(item?.lat);
    const lng = Number(item?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }

  async function initMap(items, selected, day) {
    const generation = ++mapInitGeneration;
    const container = document.querySelector("#runtime-map");
    if (!container) return;
    destroyMap();

    // Taiwan terminals have a source-confirmed NAME (TPE T2) but no sourced
    // WGS84 point. Google can resolve that exact named terminal on its own.
    // Mainland items continue to use Amap. Do not geocode/pin a group counter.
    if (window.TravelLiteChinaMaps?.isEnabled?.()) {
      const amap = window.TravelLiteChinaMaps;
      const taiwan = selected?.mapProvider === "google" && !!selected?.mapQuery;
      const point = !taiwan && itemCoordinates(selected) ? selected : null;
      // A day's weather coordinate is not a map fallback for a stop in a
      // different city/country (e.g. Shanghai or Taiwan on return day).
      const areaLabel = day?.weatherLocation?.label || "";
      const selectedText = [selected?.title, selected?.location].filter(Boolean).join(" ");
      const regionApplies = !selected || (areaLabel && selectedText.includes(areaLabel));
      const area = regionApplies ? day?.weatherLocation : null;
      const embed = taiwan ? googleMapsEmbedUrl(selected) :
        point ? amap.placeEmbedUrl(point) : amap.viewEmbedUrl(area);
      if (embed) {
        const title = taiwan ? "Google 地圖 · " + (selected.location || selected.title) :
          point ? "高德地圖 · " + (point.title || point.location) :
          "高德地圖 · " + (area?.label || "行程區域");
        container.innerHTML = `<iframe class="china-map-iframe"
          title="${escapeAttr(title)}" src="${escapeAttr(embed)}"
          loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
      } else {
        const search = selected ? googleMapsOpenUrl(selected) : "";
        const name = selected?.location || selected?.title || "";
        const flight = selected?.transportMode === "flight";
        container.classList.add("map-lookup-only");
        container.innerHTML = `<div class="map-library-state map-library-fallback" role="status">
          <span class="map-state-mark" aria-hidden="true">${(window.TravelLiteIcons?.svg?.("map-pin") || "")}</span>
          <div><strong>${flight ? "飛行航段沒有地面路線圖" :
            name ? "已知地點：" + escapeHtml(name) : "本日尚無可顯示的位置"}</strong>
          <p>${flight ? "請參考航班資訊與來源註記的起降航廈。" :
            name ? "地點名稱已知；地圖端尚無可嵌入的精確點位，請以地名搜尋。" :
            "沒有可查閱的明確地點，請以領隊最新公告為準。"}</p>
          ${search ? `<a class="button-link" href="${escapeAttr(search)}" target="_blank"
            rel="noopener noreferrer">開啟高德地圖搜尋 ↗</a>` : ""}</div></div>`;
      }
      return;
    }

    const mappable = items.filter(itemCoordinates);
    if (!mappable.length) {
      const zh = /^zh/i.test(state.data?.ui?.locale || "");
      container.innerHTML = `<div class="map-library-state map-library-fallback" role="status">
        <span class="map-state-mark" aria-hidden="true">${(window.TravelLiteIcons?.svg?.("map-pin") || "")}</span>
        <div><p class="eyebrow">${zh ? "地點位置" : "Spatial reference"}</p><strong>${zh ? "尚未標註精確座標" : "No mapped stops for this day"}</strong><p>${zh ? "原始資料未提供精確經緯度，請透過地點詳細資訊與 Google Maps 導航。" : "The itinerary still works normally. Use the stop details and map handoff below when available."}</p></div>
      </div>`;
      return;
    }

    try {
      const maplibregl = await ensureMapLibre();
      if (generation !== mapInitGeneration || !document.querySelector("#runtime-map") || state.view !== "map") return;
      const focus = itemCoordinates(selected) || itemCoordinates(mappable[0]);

      mapInstance = new maplibregl.Map({
        container: "runtime-map",
        style: state.data.providers?.mapStyle || TravelLiteProviders.config().mapStyle,
        center: [focus.lng, focus.lat],
        zoom: mappable.length > 1 ? 11 : 14,
        attributionControl: true,
      });
      mapInstance.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

      const bounds = new maplibregl.LngLatBounds();
      mappable.forEach((item) => {
        const coord = itemCoordinates(item);
        bounds.extend([coord.lng, coord.lat]);

        const el = document.createElement("button");
        const markerSelected = item.id === selected?.id;
        el.className = `map-marker ${markerSelected ? "active" : ""}`;
        el.type = "button";
        el.textContent = item.start || "•";
        el.title = item.title || item.location || "Trip stop";
        el.setAttribute("aria-label", `${markerSelected ? "Selected stop: " : "Select stop: "}${item.title || item.location || "Trip stop"}`);
        el.setAttribute("aria-pressed", markerSelected ? "true" : "false");
        if (state.itemIdentity?.isUnique(item.id)) {
          el.addEventListener("click", () => {
            state.selectedMapItemId = item.id;
            renderMap();
          });
        } else {
          el.disabled = true;
          el.setAttribute("aria-label", "Source item ID ambiguous: selection unavailable");
        }

        new maplibregl.Marker({ element: el }).setLngLat([coord.lng, coord.lat]).addTo(mapInstance);
      });

      if (mappable.length > 1) mapInstance.fitBounds(bounds, { padding: 54, maxZoom: 14, duration: 0 });
    } catch (error) {
      if (generation !== mapInitGeneration) return;
      console.warn("MapLibre unavailable", error);
      container.innerHTML = `<div class="map-library-state map-library-fallback" role="status">
        <span class="map-state-mark" aria-hidden="true">${(window.TravelLiteIcons?.svg?.("map-pin") || "")}</span>
        <div><p class="eyebrow">Map fallback</p><strong>Interactive map unavailable</strong><p>Your planned stops and external map handoffs remain available.</p></div>
      </div>`;
    }
  }

  renderMap = function runtimeRenderMap() {
    const selectedDay = state.data.days.find((day) => day.date === state.selectedDate) || state.data.days[0];
    if (selectedDay) state.selectedDate = selectedDay.date;
    const items = selectedDay?.items || [];

    const requestedId = state.selectedMapItemId;
    const sourceSafe = item => state.itemIdentity?.isUnique(item.id) === true;
    const selected = requestedId
      ? items.find(item => item.id === requestedId && sourceSafe(item)) || null
      : items.find(item => sourceSafe(item) && itemCoordinates(item))
        || items.find(sourceSafe) || null;
    // Never choose a different stop for an ID-only invalid/duplicate deep link.
    state.selectedMapItemId = selected?.id || (requestedId || null);

    const dayTabs = state.data.days.map((day) =>
      `<button class="day-chip ${day.date === state.selectedDate ? "active" : ""}" type="button" data-runtime-map-date="${escapeAttr(day.date)}"><strong>${escapeHtml(day.label)}</strong><small>${prettyDate(day.date)}</small></button>`
    ).join("");

    const placeChips = items.map((item) => {
      const active = selected === item; // Ambiguous ID-only routes never mark a stop selected.
      const unique = sourceSafe(item);
      return `<button class="place-chip ${active ? "active" : ""}" type="button" ${unique ? `data-runtime-map-place="${escapeAttr(item.id)}"` : `disabled aria-label="Ambiguous published stop ID"`} aria-pressed="${active ? "true" : "false"}"><span>${escapeHtml(item.start || "")}</span>${escapeHtml(item.title)}</button>`;
    }).join("");

    const googleUrl = selected ? googleMapsOpenUrl(selected) : "";
    const isChina = window.TravelLiteChinaMaps?.isEnabled?.();
    const isTaiwanTerminal = isChina && selected?.mapProvider === "google" && !!selected?.mapQuery;
    const providerLabel = isTaiwanTerminal ? "Google 地圖" : isChina ? "高德地圖" : "Spatial reference";
    const providerOpen = isTaiwanTerminal ? "開啟 Google Maps" : isChina ? "開啟高德" : "Open in Maps";

    root.innerHTML = `<div class="day-tabs map-day-tabs" aria-label="Map days">${dayTabs}</div>
      ${itemIdentityWarningHtml()}
      <section class="map-panel runtime-map-panel composition-narrative" data-surface-role="map-workspace" aria-label="Trip spatial reference">
        <div class="map-heading"><div><p class="eyebrow">${providerLabel}</p><h2>${escapeHtml(selectedDay?.title || "Trip map")}</h2><p class="map-heading-copy">${isTaiwanTerminal ? "桃園機場第二航廈位置已知；團體櫃檯位置以領隊公告為準" : isChina ? "已知景點顯示標記；其他項目提供區域地圖或地名搜尋" : "Planned stops only · select a stop for context"}</p></div>${googleUrl ? `<a class="button-link map-primary-handoff" href="${escapeAttr(googleUrl)}" target="_blank" rel="noreferrer">${providerOpen} ↗</a>` : ""}</div>
        ${placeChips ? `<div class="place-chips" aria-label="Planned stops">${placeChips}</div>` : ""}
        <div class="map-stage">
          <div id="runtime-map" class="interactive-map" aria-label="Interactive trip map"><div class="map-library-state map-library-loading" role="status"><span class="map-state-mark" aria-hidden="true">${(window.TravelLiteIcons?.svg?.("map-pin") || "")}</span><div><p class="eyebrow">${providerLabel}</p><strong>${isChina ? "載入地圖…" : "Loading planned stops…"}</strong><p>${isChina ? "地圖不影響查看已發布行程與外部連結。" : "Trip details remain available while the map loads."}</p></div></div></div>
        </div>
        ${selected ? `<div class="selected-place-card map-selected-summary" data-surface-role="selected-stop" aria-label="Selected stop"><div><p class="eyebrow">Selected stop · ${escapeHtml(selected.start || "TBD")}</p><h3>${escapeHtml(selected.title || selected.location || "Place")}</h3><p>${escapeHtml(selected.location || "")}</p></div>${googleUrl ? `<a class="button-link map-secondary-handoff" href="${escapeAttr(googleUrl)}" target="_blank" rel="noreferrer">${isTaiwanTerminal ? "Google 地圖" : isChina ? "高德查詢" : "Navigation"} ↗</a>` : ""}</div>` : ""}
      </section>`;

    root.querySelectorAll("[data-runtime-map-date]").forEach((button) => button.addEventListener("click", () => {
      state.selectedDate = button.dataset.runtimeMapDate;
      state.selectedMapItemId = null;
      TravelLiteStorage.set(tripKey("ui:selectedDate"), state.selectedDate);
      renderMap();
    }));

    root.querySelectorAll("[data-runtime-map-place]").forEach((button) => button.addEventListener("click", () => {
      state.selectedMapItemId = button.dataset.runtimeMapPlace;
      renderMap();
    }));

    initMap(items, selected, selectedDay);
  };

  window.addEventListener("beforeunload", destroyMap);

  // Mirrors `#view-root:has(.runtime-map-panel)` for browsers without :has() (iOS Safari < 15.4).
  // An observer covers every module that rewrites #view-root, not just renderMap().
  const syncMapRootClass = () => root.classList.toggle("view-root--map", Boolean(root.querySelector(".runtime-map-panel")));
  new MutationObserver(syncMapRootClass).observe(root, { childList: true });
  syncMapRootClass();
})();
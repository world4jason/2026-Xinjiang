/*
 * Travel Lite runtime providers.
 * Only small changing context belongs here. Stable trip/place facts should be
 * resolved during vibe-time and written to trip.json.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const TravelLiteProviders = (() => {
  const DEFAULTS = {
    weatherEndpoint: "https://api.open-meteo.com/v1/forecast",
    historicalWeatherEndpoint: "https://archive-api.open-meteo.com/v1/archive",
    mapStyle: "https://tiles.openfreemap.org/styles/liberty",
    mapStyleLight: "https://tiles.openfreemap.org/styles/liberty",
    mapStyleDark: "https://tiles.openfreemap.org/styles/dark",
  };

  const memory = new Map();

  function config() {
    return { ...DEFAULTS, ...(state?.data?.providers || {}) };
  }

  async function cachedFetchJson(key, url, options = {}, ttlMs = 30 * 60 * 1000) {
    const memoryHit = memory.get(key);
    if (memoryHit && Date.now() - memoryHit.fetchedAt < ttlMs) return memoryHit.value;

    const stored = await TravelLiteStorage.get(`provider:${key}`).catch(() => null);
    if (stored?.fetchedAt && Date.now() - stored.fetchedAt < ttlMs && stored.value) {
      memory.set(key, stored);
      return stored.value;
    }

    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const value = await response.json();
      const record = { fetchedAt: Date.now(), value };
      memory.set(key, record);
      TravelLiteStorage.set(`provider:${key}`, record).catch(() => {});
      return value;
    } catch (error) {
      if (stored?.value) return { ...stored.value, __stale: true, __providerError: String(error) };
      throw error;
    }
  }

  function coordinateKey(lat, lng, precision = 3) {
    return `${Number(lat).toFixed(precision)},${Number(lng).toFixed(precision)}`;
  }

  async function weather(lat, lng) {
    const cfg = config();
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lng),
      timezone: "auto",
      forecast_days: "16",
      current: "temperature_2m,apparent_temperature,weather_code,precipitation,rain,wind_speed_10m",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
    });
    const key = `weather:${coordinateKey(lat, lng)}`;
    return cachedFetchJson(key, `${cfg.weatherEndpoint}?${params}`, {}, 30 * 60 * 1000);
  }

  // Last 92 days: source-supported recent history; older dates: archive/reanalysis.
  async function recentWeather(lat, lng, pastDays) {
    const days = Math.max(1, Math.min(92, Math.ceil(Number(pastDays) || 1)));
    const cfg = config();
    const params = new URLSearchParams({
      latitude: String(lat), longitude: String(lng), timezone: "auto",
      past_days: String(days), forecast_days: "1",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum",
    });
    const key = "weather:recent:" + coordinateKey(lat,lng) + ":" + days;
    return cachedFetchJson(key, cfg.weatherEndpoint + "?" + params, {}, 3 * 60 * 60 * 1000);
  }

  async function historicalWeather(lat, lng, startDate, endDate) {
    const validDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
    if (!validDate(startDate) || !validDate(endDate) || startDate > endDate)
      throw new Error("Invalid historical weather range");
    const cfg = config();
    const params = new URLSearchParams({
      latitude: String(lat), longitude: String(lng), timezone: "auto",
      start_date: startDate, end_date: endDate,
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum",
    });
    const key = "weather:archive:" + coordinateKey(lat,lng) + ":" + startDate + ":" + endDate;
    return cachedFetchJson(key, cfg.historicalWeatherEndpoint + "?" + params, {}, 24 * 60 * 60 * 1000);
  }

  // Resolve a named, planned secondary weather area using the same provider's
  // GeoNames search. Never select a prefecture/county or a fuzzy first result.
  async function weatherPlace(place) {
    const normalize = value => String(value ?? "").normalize("NFKC").toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, "");
    const country = String(place?.countryCode || "").toUpperCase();
    const region = normalize(place?.admin1);
    const query = String(place?.query || "").trim();
    if (!query || !/^[A-Z]{2}$/.test(country) || !region) return null;
    const aliases = [query, ...(Array.isArray(place.aliases) ? place.aliases : [])]
      .filter(value => typeof value === "string" && value.trim()).slice(0, 12);
    const names = new Set(aliases.map(normalize));
    // Search a bounded set of spellings. The returned coordinates are accepted
    // only for a uniquely matched populated place in the specified region.
    for (const name of aliases.slice(0, 4)) {
      const params = new URLSearchParams({name, countryCode:country, count:"20", language:"en", format:"json"});
      const key = "weather:geocode:" + country + ":" + normalize(name);
      let result;
      try {
        result = await cachedFetchJson(key,
          "https://geocoding-api.open-meteo.com/v1/search?" + params, {}, 30 * 24 * 60 * 60 * 1000);
      } catch { continue; }
      const matches = (Array.isArray(result?.results) ? result.results : []).filter(item =>
        item?.country_code === country && normalize(item.admin1).includes(region) &&
        /^PPL/.test(String(item.feature_code || "")) && names.has(normalize(item.name)) &&
        typeof item.latitude === "number" && typeof item.longitude === "number" &&
        Number.isFinite(item.latitude) && Number.isFinite(item.longitude) &&
        Math.abs(item.latitude) <= 90 && Math.abs(item.longitude) <= 180);
      const points = new Map(matches.map(item => [
        coordinateKey(item.latitude,item.longitude), {lat:item.latitude,lng:item.longitude}
      ]));
      if (points.size === 1) return points.values().next().value;
      if (points.size > 1) return null;
    }
    return null;
  }

  return { config, weather, recentWeather, historicalWeather, weatherPlace };
})();

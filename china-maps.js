/* Official, key-free Amap links for this specific mainland-China trip.
 * No fake GPS, timetable, guessed routes, third-party key, or silent geocoding.
 * SPDX-License-Identifier: AGPL-3.0-or-later */
(() => {
  "use strict";
  const isEnabled = () => typeof state !== "undefined" && state.data?.providers?.mapProvider === "amap";
  const clean = value => typeof value === "string" ? value.trim().slice(0, 180) : "";
  function coordinates(item) {
    if (!item || typeof item !== "object" || item.lat == null || item.lng == null) return null;
    const lat = Number(item.lat), lng = Number(item.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) &&
      Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? {lat,lng} : null;
  }
  function searchUrl(query) {
    const term = clean(query);
    return term ? "https://uri.amap.com/search?" + new URLSearchParams({
      keyword: term, view: "map", src: "TravelLite", callnative: "0",
    }).toString() : "";
  }
  function markerUrl(item) {
    const point = coordinates(item);
    if (!point) return "";
    return "https://uri.amap.com/marker?" + new URLSearchParams({
      position: point.lng + "," + point.lat,
      name: clean(item.title || item.location) || "景區參考位置",
      coordinate: "gaode", src: "TravelLite", callnative: "0",
    }).toString();
  }
  function openUrl(item) {
    if (!item || (item.type === "transport" && item.transportMode === "flight")) return "";
    return markerUrl(item) || searchUrl(
      (item.type === "transport" && item.to) || item.mapQuery || item.location || item.title
    );
  }
  function placeEmbedUrl(item) {
    const point = coordinates(item);
    if (!point) return "";
    return "https://www.amap.com/ssr/embed/place?" + new URLSearchParams({
      lng: String(point.lng), lat: String(point.lat),
      name: clean(item.title || item.location) || "景區參考位置",
      zoom: "13", platform: "pc", src: "TravelLite",
    }).toString();
  }
  function viewEmbedUrl(location) {
    const point = coordinates(location);
    if (!point) return "";
    return "https://www.amap.com/ssr/embed/view?" + new URLSearchParams({
      lng: String(point.lng), lat: String(point.lat),
      zoom: "10", platform: "pc", src: "TravelLite",
    }).toString();
  }
  function journeyUrl(journey) {
    const route = journey?.route;
    const legs = Array.isArray(journey?.legs) ? journey.legs : [];
    if (!route?.from || !route?.to || route.from === route.to || legs.some(x => x.transportMode === "flight")) return "";
    // AMap route URI requires trustworthy endpoint coordinates. A group-tour
    // handbook without them can offer destination search, but NOT a fake route.
    const origin = coordinates(legs[0]?.fromCoordinate);
    const dest = coordinates(legs.at(-1)?.toCoordinate);
    if (origin && dest) {
      const mode = legs.every(x => x.transportMode === "walk") ? "walk" :
        legs.every(x => x.transportMode === "drive") ? "car" : "bus";
      const pair = (p,name) => p.lng + "," + p.lat + "," + clean(name);
      return "https://uri.amap.com/navigation?" + new URLSearchParams({
        from: pair(origin,route.from), to: pair(dest,route.to),
        mode, src: "TravelLite", callnative: "0",
      }).toString();
    }
    return searchUrl(route.to);
  }
  window.TravelLiteChinaMaps = Object.freeze({
    isEnabled, coordinates, searchUrl, markerUrl, openUrl,
    placeEmbedUrl, viewEmbedUrl, journeyUrl,
  });
})();

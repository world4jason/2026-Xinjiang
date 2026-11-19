/* Xinjiang provider and curated image contracts. SPDX-License-Identifier: AGPL-3.0-or-later */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

function chinaAdapter() {
  const code = readFileSync(new URL("../china-maps.js",import.meta.url),"utf8");
  const window = {};
  const state = {data:{providers:{mapProvider:"amap"}}};
  runInNewContext(code,{window,state,URLSearchParams});
  return {api:window.TravelLiteChinaMaps,state};
}
test("AMap is opt-in and does not change other trips",() => {
  const {api,state}=chinaAdapter();
  assert.equal(api.isEnabled(),true);
  state.data.providers.mapProvider="maplibre";
  assert.equal(api.isEnabled(),false);
});
test("one verified location uses the official keyless Amap iframe and marker",()=>{
  const {api}=chinaAdapter();
  const item={title:"禾木村",lat:48.568644,lng:87.433003};
  assert.match(api.placeEmbedUrl(item),/^https:\/\/www\.amap\.com\/ssr\/embed\/place\?/);
  assert.match(api.placeEmbedUrl(item),/platform=pc/);
  assert.match(api.openUrl(item),/^https:\/\/uri\.amap\.com\/marker\?/);
  assert.equal(api.placeEmbedUrl({title:"未知地點"}),"");
  assert.equal(api.placeEmbedUrl({title:"無效座標",lat:91,lng:87}),"");
});
test("area map does not fabricate a selected-stop marker",()=>{
  const {api}=chinaAdapter();
  const area=api.viewEmbedUrl({label:"阿勒泰",lat:47.85,lng:88.13});
  assert.match(area,/\/ssr\/embed\/view\?/);
  assert.doesNotMatch(area,/\/ssr\/embed\/place/);
  assert.equal(api.viewEmbedUrl({label:"未知區域"}),"");
});
test("group-tour route without sourced coordinates searches the destination only",()=>{
  const {api}=chinaAdapter();
  const url=api.journeyUrl({route:{from:"烏魯木齊",to:"阿勒泰"},legs:[{transportMode:"drive"}]});
  assert.match(url,/^https:\/\/uri\.amap\.com\/search\?/);
  assert.doesNotMatch(url,/navigation/);
  assert.equal(api.journeyUrl({route:{from:"桃園",to:"上海"},legs:[{transportMode:"flight"}]}),"");
  assert.equal(api.openUrl({type:"transport",transportMode:"flight",title:"MU5008"}),"");
});
test("explicit origin and destination coordinates permit Amap route URI",()=>{
  const {api}=chinaAdapter();
  const url=api.journeyUrl({
    route:{from:"阿勒泰",to:"禾木村"},
    legs:[{transportMode:"drive",fromCoordinate:{lat:47.85,lng:88.13},toCoordinate:{lat:48.568644,lng:87.433003}}],
  });
  assert.match(url,/\/navigation\?/);
  assert.match(url,/mode=car/);
});
test("all ten curated places have attributed photos and Amap locator links",()=>{
  const data=JSON.parse(readFileSync(new URL("../trip.json",import.meta.url),"utf8"));
  assert.equal(data.providers.mapProvider,"amap");
  const places=data.days.flatMap(x=>x.items).filter(x=>x.type==="place");
  assert.equal(places.length,10);
  for(const item of places){
    const image=item.infoCard;
    for(const field of ["image","imageAlt","imageSource","imageCredit","imageLicense"])
      assert.ok(image?.[field],item.id+" missing "+field);
    assert.ok(item.externalLinks?.some(x=>x.url.startsWith("https://uri.amap.com/marker?")),item.id);
  }
});

test("source-backed Taoyuan T2 name overrides the mainland map only for Taiwan events",()=>{
  const data=JSON.parse(readFileSync(new URL("../trip.json",import.meta.url),"utf8"));
  const items=data.days.flatMap(day=>day.items);
  const taiwan=["d1-assembly","d8-arrival-tpe"].map(id=>items.find(x=>x.id===id));
  for(const item of taiwan){
    assert.ok(item,id+" missing");
    assert.match(item.location,/T2/);
    assert.equal(item.mapProvider,"google");
    assert.match(item.mapQuery,/Airport Terminal 2/);
    assert.equal(item.lat,undefined,"do not invent an exact terminal coordinate");
    assert.equal(item.lng,undefined,"do not invent an exact terminal coordinate");
  }
});
test("Taiwan terminal named-search iframe and handoff use Google without an API key",()=>{
  const js=readFileSync(new URL("../runtime-google.js",import.meta.url),"utf8");
  const map={
    isEnabled:()=>true,
    openUrl:()=> "https://uri.amap.com/search?keyword=%E4%B8%8A%E6%B5%B7",
    placeEmbedUrl:()=> "https://www.amap.com/ssr/embed/place?test=1",
    searchUrl:()=> "https://uri.amap.com/search?test=1"
  };
  const env={
    googleMapsOpenUrl:()=>"",googleMapsEmbedUrl:()=>"",
    window:{TravelLiteChinaMaps:map},
    state:{data:{providers:{googleMapsEmbedKey:""}}},
    URLSearchParams,encodeURIComponent
  };
  runInNewContext(js,env);
  const terminal={mapProvider:"google",mapQuery:"Taoyuan International Airport Terminal 2, Taoyuan, Taiwan"};
  assert.match(env.googleMapsEmbedUrl(terminal),/^https:\/\/www\.google\.com\/maps\?q=.*&output=embed$/);
  assert.match(env.googleMapsOpenUrl(terminal),/^https:\/\/www\.google\.com\/maps\/search\//);
  const shanghai={location:"上海浦東國際機場 T1"};
  assert.match(env.googleMapsOpenUrl(shanghai),/^https:\/\/uri\.amap\.com\/search/);
  assert.equal(env.googleMapsEmbedUrl(shanghai),"https://www.amap.com/ssr/embed/place?test=1");
});
test("unlocated mainland transfer gets a compact named-location lookup, not a false pin",()=>{
  const code=readFileSync(new URL("../runtime-features.js",import.meta.url),"utf8");
  assert.match(code,/container\.classList\.add\("map-lookup-only"\)/);
  assert.match(code,/selectedText\.includes\(areaLabel\)/);
  assert.match(code,/Google 地圖 ·/);
});

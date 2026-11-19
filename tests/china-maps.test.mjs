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

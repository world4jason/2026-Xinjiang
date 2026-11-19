# 北疆專用地圖與圖片規則

此檔是 `2026-Xinjiang` 的地理區域實作備註；遵循 `docs/UIUX.md` 及 `docs/uiux/TRANSPORT.md`、`PLACES.md`、`WEATHER.md`，不得修改原始 Template。

## 地圖
- `trip.json.providers.mapProvider = "amap"` 表示採用高德官方免金鑰嵌入地圖（`china-maps.js`），不載入 Google Maps / MapLibre 國外圖磚。
- 已知景點的座標用 `https://www.amap.com/ssr/embed/place`，未確認所選項目位置但有當日 `weatherLocation` 時用 `https://www.amap.com/ssr/embed/view`；後者僅為「區域示意」，不標記虛構地點。
- 交通 A→B 只有在資料提供雙端來源座標後才能建立導航路線；不然只搜尋已知目的地，不顯示虛構班次或 ETA。航班不建立地面導航。
- 原行程時間軸、分類、source ID 保持不變。內嵌地圖若離線／受阻，其他行程和高德外連仍應可讀。
- 所有有框卡片保留至少 12px 文字安全內距；手機 320/390px、桌面 1100/1920px 及 200% 文字縮放要檢查。
## 圖片
- 10 個真正景點具 `infoCard.image`、`imageAlt`、`imageSource`、`imageCredit`、`imageLicense`。
- 外部 Wikimedia Commons/Unsplash 照片有權利聲明，但不代表能在中國網路環境載入或離線可見。照片失敗時僅隱藏圖片，保留景點說明與來源。
- 非冬季照片標示拍攝季節，不冒充旅程當天雪況。

官方文件：
- https://lbs.amap.com/api/uri-api/guide/embedded-map/single-location
- https://lbs.amap.com/api/uri-api/guide/embedded-map/map-view
- https://lbs.amap.com/api/uri-api/guide/embedded-map/embedded-route

## 台灣境內（11/27 去程及 12/04 返抵）
- 旅行手冊明確提供桃園國際機場 **T2 第二航廈**；這是可以搜尋的確定建築物地名，不必因缺經緯度就顯示「沒有確定位置」。
- 只有 `d1-assembly` 和 `d8-arrival-tpe` 以 `mapProvider: google`、`mapQuery: Taoyuan International Airport Terminal 2, Taoyuan, Taiwan` 開啟台灣境內 Google Maps 的免金鑰地名查詢與 iframe；**未標記具體東方航空團體櫃檯**，仍須以領隊通知為準。
- 中國境內其餘項目使用高德地圖。跨城市／跨國航段不得誤用整天的天氣座標顯示錯誤區域；不能嵌圖時顯示精簡地名搜尋，不再留下一大片空白地圖。

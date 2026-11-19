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

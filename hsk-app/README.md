# HSK 1–4 · Ôn tập

Ứng dụng ôn từ vựng HSK 1–4 chạy offline, dùng được như PWA hoặc đóng gói thành APK Android (Capacitor).

## Chạy thử
- Trình duyệt: mở `index.html` qua máy chủ tĩnh (ví dụ `python3 -m http.server`).
- Kiểm thử: `npm test` (unit), `npm run test:e2e` (Chromium), `npm run test:all` (cả hai).

## Cấu trúc
- `src/srs.js` — thuật toán SM-2 và xếp hàng ôn mỗi ngày.
- `src/store.js` — lưu trữ có số phiên bản, sao lưu dữ liệu hỏng, kiểm tra khi nhập.
- `src/games.js` — tạo câu hỏi cho minigame và kiểm tra xếp lớp.
- `src/audio.js` — giọng đọc tiếng Trung; chỉ bật khi thiết bị có giọng `zh`.
- `data/words.json` — 1192 từ HSK 1–4 (sinh từ `tools/build-words.py`).
- `tools/` — script ghép dữ liệu và tạo icon. Chú thích từ vựng nằm trong `tools/annotations/`.

## Nguồn dữ liệu
- Danh sách từ theo cấp: HSK 2.0 (`@leonsilicon/hsk2.0`).
- Phiên âm và nghĩa tiếng Anh: CC-CEDICT (`cedict-json`), giấy phép CC BY-SA 4.0.
- Nghĩa tiếng Việt và phiên âm đã chỉnh: biên soạn cho dự án này; chưa đối chiếu toàn bộ với nguồn ngoài.
- Font chữ Hán: Noto Sans SC, SIL OFL 1.1 (`fonts/LICENSE-NotoSansSC.txt`).

## Build APK
Trong thư mục `hsk-android/`:
1. `npm install`
2. `npm run cap:sync` (sao chép web sang `www/` rồi đồng bộ Capacitor)
3. `cd android && ./gradlew assembleDebug` (APK debug)
4. `./gradlew assembleRelease` (APK release; cần `android/keystore.properties`, không đưa vào mã nguồn)

Cần Android SDK (platform 36, build-tools 36.0.0) và JDK 21.

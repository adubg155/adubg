# Ôn HSK 1–4 · v2

Ứng dụng ôn tiếng Trung chạy offline: giáo trình HSK 1–4, tiếng Trung công việc (Quyển 1: từ vựng chuyên ngành và mẫu câu, Quyển 2: hội thoại), ôn và luyện ngữ pháp. Chạy trên trình duyệt hoặc đóng gói thành APK bằng `../hsk-android`.

## Nội dung
- **HSK:** 1193 từ (`data/hsk.json`), 107 mẫu ngữ pháp HSK 1–4 (`data/grammar/hsk.json`), 19 cặp dễ nhầm (`data/grammar/pairs.json`).
- **Công việc:** 40 bài, chỉ hiện tên chủ đề (`data/work/`): 1227 mục từ, 106 mẫu ngữ pháp, 197 mẫu câu, 40 đoạn hội thoại.
- **Luyện tập:** thẻ ghi nhớ (lặp lại ngắt quãng), xếp câu, luyện ngữ pháp, hội thoại, ghép nghĩa, nghe.

## Tài liệu gốc
`source/` chứa 3 file Excel là nguồn chuẩn của dữ liệu. Chạy `npm run check:data` (cần `pip install openpyxl`) để so dữ liệu app với Excel theo từng bài. Kết quả hiện tại: khớp, chỉ còn 2 dòng trống trong file HSK 4 (STT 27, 28).

## Kiểm thử
- `npm test`: kiểm tra dữ liệu với Excel và chạy test đầu cuối trong Chromium.
- `npm run test:e2e`: chỉ chạy test đầu cuối (biến `PLAYWRIGHT_PATH`, `CHROME_PATH` để đổi đường dẫn).

## Ghi chú
- Tiến độ lưu trong `localStorage` với khóa `hsk-progress-v1`.
- Trong APK, "Xuất file" ghi file sao lưu rồi mở bảng chia sẻ của Android; trên trình duyệt thì tải file về.
- Giọng đọc dùng plugin `@capacitor-community/text-to-speech` trong APK, và `speechSynthesis` trên trình duyệt.

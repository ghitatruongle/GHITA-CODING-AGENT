# Group - Hệ thống Multi-Agent

## Cấu trúc

```
group/
├── README.md              # Hướng dẫn này
├── PROTOCOL.md            # Quy tắc giao tiếp
├── agents.json            # Danh sách agent & vai trò
├── create-chat.sh         # Script tạo phiên chat mới
├── join-chat.sh           # Script agent tham gia chat
│
└── Chat_YYYY-MM-DD_HH-MM-SS/  # Mỗi phiên chat
    ├── giam_doc.txt       # Giám đốc (tạo đầu tiên)
    ├── developer.txt      # Developer
    ├── reviewer.txt       # Reviewer
    ├── architect.txt      # Architect
    └── pm.txt             # PM
```

## Quy tắc

1. **Giám đốc là tuyệt đối** - Các agent phải tuân theo lệnh Giám đốc
2. **Mỗi agent có 1 file riêng** - Ghi file mình, đọc file người khác
3. **Timestamp HH:MM:SS** - Bắt buộc cho mọi tin nhắn

## Cách sử dụng

### Giám đốc tạo phiên chat:
```bash
cd "D:\ghita coding agent\group"
bash create-chat.sh
```

### Agent khác tham gia:
```bash
bash join-chat.sh developer
bash join-chat.sh reviewer
bash join-chat.sh architect
bash join-chat.sh pm
```

### Hoặc tạo file thủ công:
```bash
cd Chat_2026-05-31_14-30-45
echo "[14:31:00] Developer | Dev:" > developer.txt
echo "Đã tham gia. Đang đọc lệnh..." >> developer.txt
```

## Format tin nhắn

```
[HH:MM:SS] Tên Agent | Vai trò:
Nội dung tin nhắn

---
```

## Lệnh Giám đốc

```
[HH:MM:SS] Giam Doc | Director:
>>> LENH: Developer
Hãy implement API endpoint cho Phase 7.

---

```

## Agent phản hồi

```
[HH:MM:SS] Developer | Dev:
<<< XAC NHAN: Đã nhận lệnh
Bắt đầu implement. Thời gian dự kiến: 30 phút.

---
```

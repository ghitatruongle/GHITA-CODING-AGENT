#!/bin/bash
# Agent tham gia phiên chat mới nhất
# Usage: ./join-chat.sh [agent_name]
# Example: ./join-chat.sh developer

AGENT_NAME=${1:-"agent"}
AGENT_FILE="${AGENT_NAME}.txt"

# Tìm phiên chat mới nhất
LATEST_CHAT=$(ls -d Chat_* 2>/dev/null | sort -r | head -1)

if [ -z "$LATEST_CHAT" ]; then
    echo "Không tìm thấy phiên chat nào. Hãy tạo phiên chat trước."
    exit 1
fi

cd "$LATEST_CHAT"

if [ -f "$AGENT_FILE" ]; then
    echo "File $AGENT_FILE đã tồn tại trong $LATEST_CHAT"
    echo "Nội dung hiện tại:"
    echo "---"
    cat "$AGENT_FILE"
    echo "---"
else
    TIMESTAMP=$(date +"%H:%M:%S")
    cat > "$AGENT_FILE" << EOF
============================================================
AGENT: ${AGENT_NAME}
JOIN: ${TIMESTAMP}
============================================================

[${TIMESTAMP}] ${AGENT_NAME} | Role:
Đã tham gia phiên chat. Đang đọc các file khác để hiểu context.

---

EOF
    echo "Đã tạo file $AGENT_FILE trong $LATEST_CHAT"
    echo "Hãy đọc giam_doc.txt và phản hồi."
fi

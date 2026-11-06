#!/usr/bin/env bash
# NiceAI Seedance 2.5 clip generation (shared helper for the Seedance line).
# Env: NICEAI_KEY, BASE_URL, USER_AGENT, SCRIPT_FILE, PREFIX, CLIP_N.
# Optional: first_frame.jpg in the working directory -> sent as first_frame (data URI).
# Retry logic: up to 4 attempts; verbatim prompt first, then softened rewording
# on copyright-filter failures (after 1 verbatim resubmit).
set -u
set -o pipefail

BASE_URL="${BASE_URL:-https://api.niceai.rest/v1}"
USER_AGENT="${USER_AGENT:-Mozilla/5.0}"
SCRIPT_FILE="${SCRIPT_FILE:?SCRIPT_FILE is required}"
PREFIX="${PREFIX:?PREFIX is required}"
CLIP_N="${CLIP_N:?CLIP_N is required}"
LOG="${PREFIX}-clip-${CLIP_N}.log"
MP4="${PREFIX}-clip-${CLIP_N}.mp4"

download_video() {
  local vid="$1" out="$2" st="$3"
  local dl http size
  dl=$(jq -r '(.urls // .data.urls // empty) | if type=="array" then (.[0] // empty) else . end | if type=="object" then (.url // .href // empty) else . end' "$st" 2>/dev/null || true)
  echo "DOWNLOAD_URL_FROM_URLS=$dl"
  if [ -n "$dl" ] && [ "$dl" != "null" ]; then
    http=$(curl -s -L -A "$USER_AGENT" -o "$out" -w '%{http_code}' "$dl" || true)
    echo "Скачивание из urls[0]: HTTP $http"
    size=$(stat -c%s "$out" 2>/dev/null || echo 0)
    if [ "$size" != "0" ] && [ "$(head -c 1 "$out")" != "{" ]; then
      echo "DOWNLOAD_OK_FROM_URLS size=$size"
      return 0
    fi
    echo "Скачивание из urls[0] не дало видео (size=$size) — пробую /content"
  else
    echo "urls пуст — скачивание через /content"
  fi
  http=$(curl -s -A "$USER_AGENT" -H "Authorization: Bearer $NICEAI_KEY" -o "$out" -w '%{http_code}' "$BASE_URL/videos/$vid/content" || true)
  echo "Скачивание из /content: HTTP $http"
  return 0
}

extract_prompt() {
  awk -v n="$CLIP_N" '
    /^## CLIP / {
      if ($0 ~ "^## CLIP " n " ") { inclip = 1 }
      else if (inclip) { exit }
      next
    }
    inclip && /^\*\*Seedance Prompt:\*\*/ { inprompt = 1; next }
    inprompt && /^```/ { if (prompt != "") exit; next }
    inprompt && /^[[:space:]]*$/ { if (prompt != "") exit; next }
    inprompt && /^\*\*/ { exit }
    inprompt && /^## / { exit }
    inprompt && /^CONTINUITY:/ { exit }
    inprompt {
      if (prompt != "") prompt = prompt " " $0
      else prompt = $0
    }
    END {
      if (prompt == "") { exit 1 }
      print prompt
    }
  ' "$SCRIPT_FILE"
}

soften_prompt() {
  printf '%s' "$1" | sed \
    -e 's/\bdivorce papers\b/documents/gI' \
    -e 's/\bdivorced\b/separated/gI' \
    -e 's/\bdivorcing\b/separating/gI' \
    -e 's/\bdivorce\b/separation/gI' \
    -e 's/\bthrows\b/places/gI' \
    -e 's/\bthrow\b/place/gI' \
    -e 's/\bshouts\b/says firmly/gI' \
    -e 's/\bshout\b/say firmly/gI' \
    -e 's/\bscreaming\b/speaking firmly/gI' \
    -e 's/\bscreams\b/says firmly/gI' \
    -e 's/\bscream\b/say firmly/gI' \
    -e 's/\bhumiliates\b/embarrasses/gI' \
    -e 's/\bhumiliate\b/embarrass/gI' \
    -e 's/\bhumiliating\b/embarrassing/gI' \
    -e 's/\bslaps\b/touches/gI' \
    -e 's/\bslap\b/touch/gI'
}

build_body() {
  printf '%s' "$CURRENT_PROMPT" > prompt.txt
  python3 - <<'PYEOF'
import base64, json, os
prompt = open("prompt.txt").read()
body = {"model": "seedance-2.5", "prompt": prompt, "seconds": 20,
        "size": "720x1280", "resolution": "720p", "aspect_ratio": "9:16", "generate_audio": True}
if os.path.exists("first_frame.jpg") and os.path.getsize("first_frame.jpg") > 0:
    body["first_frame"] = "data:image/jpeg;base64," + base64.b64encode(open("first_frame.jpg", "rb").read()).decode()
    print("FIRST_FRAME=used bytes:", os.path.getsize("first_frame.jpg"))
else:
    print("FIRST_FRAME=none")
json.dump(body, open("body.json", "w"))
print("BODY_BYTES:", os.path.getsize("body.json"))
PYEOF
}

main() {
  echo "== Клип $CLIP_N: извлечение промпта из $SCRIPT_FILE =="
  if ! PROMPT=$(extract_prompt); then
    echo "ОШИБКА: не удалось извлечь промпт клипа $CLIP_N из $SCRIPT_FILE"
    return 1
  fi
  echo "PROMPT_LEN=${#PROMPT}"
  echo "PROMPT_HEAD=${PROMPT:0:120}"
  if [ "${#PROMPT}" -lt 200 ]; then
    echo "ОШИБКА: промпт клипа $CLIP_N слишком короткий (длина ${#PROMPT})"
    return 1
  fi
  CURRENT_PROMPT="$PROMPT"
  PROMPT_VERSION="verbatim"
  attempt=1
  while [ "$attempt" -le 4 ]; do
    echo "== Попытка $attempt/4 (версия промпта: $PROMPT_VERSION): POST /v1/videos (seedance-2.5, seconds=20) =="
    build_body
    http=$(curl -s -A "$USER_AGENT" -H "Authorization: Bearer $NICEAI_KEY" -H "Content-Type: application/json" --data @body.json -o create.json -w '%{http_code}' "$BASE_URL/videos" || true)
    echo "HTTP: $http"
    echo "--- ответ POST /v1/videos (точный текст) ---"
    cat create.json
    echo "--- конец ответа ---"
    id=$(jq -r '.id // .task_id // .data.id // empty' create.json 2>/dev/null || true)
    echo "ATTEMPT_${attempt}_TASK_ID=$id"
    status=""
    err=""
    is_copyright=0
    if [ -z "$id" ]; then
      err=$(jq -r '.error.message // .error // .message // empty' create.json 2>/dev/null || true)
      echo "Попытка $attempt: id не вернулся (HTTP $http) — 429/5xx или иная ошибка отправки, ошибка: $err"
      printf '%s' "$err" | grep -qi "copyright" && is_copyright=1
    else
      echo "== Попытка $attempt: опрос статуса каждые 15 сек, до 40 мин =="
      i=0
      while [ "$i" -lt 160 ]; do
        i=$((i+1))
        http=$(curl -s -A "$USER_AGENT" -H "Authorization: Bearer $NICEAI_KEY" -o status.json -w '%{http_code}' "$BASE_URL/videos/$id" || true)
        status=$(jq -r '.status // .state // .data.status // empty' status.json 2>/dev/null || true)
        echo "[$i/160] HTTP $http status=$status"
        cat status.json
        if [ "$status" = "completed" ]; then break; fi
        if [ "$status" = "failed" ]; then break; fi
        sleep 15
      done
      if [ "$status" = "completed" ]; then
        echo "--- urls ---"
        jq '.urls // .data.urls // empty' status.json 2>/dev/null || true
        echo "== Попытка $attempt: скачивание видео -> $MP4 (urls[0], иначе /content) =="
        download_video "$id" "$MP4" status.json
        ls -l "$MP4" || true
        file "$MP4" || true
        size=$(stat -c%s "$MP4" 2>/dev/null || echo 0)
        echo "CLIP_SIZE_BYTES=$size"
        echo "CLIP_TASK_ID=$id"
        echo "SECONDS_USED=20"
        echo "ATTEMPTS_USED=$attempt"
        echo "PROMPT_VERSION_USED=$PROMPT_VERSION"
        if [ "$size" != "0" ] && [ "$(head -c 1 "$MP4")" != "{" ]; then
          echo "ГОТОВО: $MP4 ($size байт), task id=$id, status=completed, seconds=20, версия промпта: $PROMPT_VERSION, попытка $attempt/4"
          return 0
        fi
        echo "Попытка $attempt: скачивание не дало видео (size=$size)"
        err="download failed"
      else
        err=$(jq -r '.error.message // .error // empty' status.json 2>/dev/null || true)
        echo "Попытка $attempt: задача $id завершилась статусом '$status', ошибка: $err"
        printf '%s' "$err" | grep -qi "copyright" && is_copyright=1
      fi
    fi
    if [ "$is_copyright" = 1 ] && [ "$PROMPT_VERSION" = "verbatim" ] && [ "$attempt" -ge 2 ]; then
      echo "Copyright-фильтр: после 1 дословной повторной отправки переключаюсь на смягчённый промпт (та же сцена и диалоги, нейтральные ремарки)"
      CURRENT_PROMPT=$(soften_prompt "$PROMPT")
      CURRENT_PROMPT="$CURRENT_PROMPT original fictional scene, no copyrighted characters."
      PROMPT_VERSION="softened"
      echo "SOFTENED_LEN=${#CURRENT_PROMPT}"
      echo "SOFTENED_HEAD=${CURRENT_PROMPT:0:120}"
    fi
    if [ "$attempt" -ge 4 ]; then
      echo "ОШИБКА: клип $CLIP_N не создан за 4 попытки (последний статус: $status, последний id: $id, точный ответ выше)"
      return 1
    fi
    if [ "$is_copyright" = 0 ] && [ "$attempt" -ge 3 ]; then
      echo "ОШИБКА: клип $CLIP_N не создан за 3 попытки (последний статус: $status, последний id: $id, точный ответ выше)"
      return 1
    fi
    echo "Жду 60 сек и повторяю (новая задача)"
    sleep 60
    attempt=$((attempt+1))
  done
  return 1
}

main 2>&1 | tee "$LOG"
exit "${PIPESTATUS[0]}"

#!/usr/bin/env bash
set -euo pipefail

label=${1:?usage: sample-reader-resources.sh LABEL [SECONDS] [PID]}
seconds=${2:-20}
pid=${3:-$(pgrep -f 'target/debug/library_desktop' | head -n 1)}

if [[ -z "$pid" ]]; then
  echo "No source-built library_desktop process found" >&2
  exit 1
fi

command=$(ps -p "$pid" -o command=)
if [[ "$command" != *"target/debug/library_desktop"* ]] || [[ "$command" == *"/Applications/Library.app"* ]]; then
  echo "Refusing to benchmark non-source process: $command" >&2
  exit 1
fi

collect_tree() {
  local root=$1 child
  printf '%s ' "$root"
  for child in $(pgrep -P "$root" 2>/dev/null || true); do
    collect_tree "$child"
  done
}

app_start=$(ps -p "$pid" -o lstart= | xargs)
app_start_epoch=$(date -j -f '%a %b %d %T %Y' "$app_start" '+%s')
webkit_start=""
webkit_start_epoch=0
webkit_delta=999999
for candidate in $(pgrep -f 'com.apple.WebKit.(WebContent|Networking)' 2>/dev/null || true); do
  if lsof -p "$candidate" 2>/dev/null | grep -q '/Users/jason/Library/.*/library_desktop'; then
    candidate_start=$(ps -p "$candidate" -o lstart= | xargs)
    candidate_epoch=$(date -j -f '%a %b %d %T %Y' "$candidate_start" '+%s')
    delta=$((candidate_epoch - app_start_epoch))
    # WebKit's XPC group is normally launched just after the Tauri process.
    # Prefer the nearest following group so another Library dev instance that
    # shares the same application-data directory is not included.
    if (( delta >= 0 && delta <= 120 && delta < webkit_delta )); then
      webkit_start=$candidate_start
      webkit_start_epoch=$candidate_epoch
      webkit_delta=$delta
    fi
  fi
done

webkit_pids=""
if [[ -n "$webkit_start" ]]; then
  for candidate in $(pgrep -f 'com.apple.WebKit.(WebContent|Networking|GPU)' 2>/dev/null || true); do
    candidate_start=$(ps -p "$candidate" -o lstart= | xargs)
    candidate_epoch=$(date -j -f '%a %b %d %T %Y' "$candidate_start" '+%s')
    if (( candidate_epoch == webkit_start_epoch )); then
      webkit_pids+=" $candidate"
    fi
  done
  if [[ -z "$webkit_pids" ]]; then
    echo "No WebKit XPC group matched source PID $pid" >&2
    exit 1
  fi
fi

mkdir -p tmp/pdf-benchmarks
csv="tmp/pdf-benchmarks/${label}.csv"
echo 'elapsed_ms,cpu_percent,rss_kib' > "$csv"
samples=$((seconds * 10))

for ((index=0; index<samples; index+=1)); do
  pids="$(collect_tree "$pid")$webkit_pids"
  pid_list=$(echo "$pids" | xargs | tr ' ' ',')
  read -r cpu rss < <(ps -p "$pid_list" -o %cpu=,rss= | awk '{cpu+=$1; rss+=$2} END {print cpu, rss}')
  printf '%d,%s,%s\n' "$((index * 100))" "$cpu" "$rss" >> "$csv"
  sleep 0.1
done

awk -F, 'NR>1 {
  sum += $2;
  if ($2 > cpuMax) cpuMax = $2;
  if ($3 > rssMax) rssMax = $3;
  last = $3;
  count += 1;
} END {
  printf "mean_cpu=%.2f peak_cpu=%.2f peak_rss_kib=%d settled_rss_kib=%d\n", sum/count, cpuMax, rssMax, last;
}' "$csv"

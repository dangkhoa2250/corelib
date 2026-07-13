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

webkit_pids=""
webkit_starts=""
for candidate in $(pgrep -f 'com.apple.WebKit.(WebContent|Networking)' 2>/dev/null || true); do
  if lsof -p "$candidate" 2>/dev/null | grep -q '/Users/jason/Library/.*/library_desktop'; then
    webkit_pids+=" $candidate"
    webkit_starts+="|$(ps -p "$candidate" -o lstart= | xargs)|"
  fi
done
for candidate in $(pgrep -f 'com.apple.WebKit.GPU' 2>/dev/null || true); do
  candidate_start="|$(ps -p "$candidate" -o lstart= | xargs)|"
  if [[ "$webkit_starts" == *"$candidate_start"* ]]; then
    webkit_pids+=" $candidate"
  fi
done

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

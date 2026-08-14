#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
script="${repo_root}/services/pocketbase/deploy/duckdns-update.sh"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

token="test-token-that-must-not-appear-in-argv"
env_file="${tmp_dir}/corelib-pocketbase.env"
args_file="${tmp_dir}/curl-args"
stdin_file="${tmp_dir}/curl-stdin"
fake_bin="${tmp_dir}/bin"

mkdir -p "${fake_bin}"
printf 'DUCKDNS_DOMAIN=corelib\nDUCKDNS_TOKEN=%s\n' "${token}" > "${env_file}"

cat > "${fake_bin}/curl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$@" > "${DUCKDNS_TEST_ARGS_FILE}"
cat > "${DUCKDNS_TEST_STDIN_FILE}"
printf 'OK'
EOF
chmod +x "${fake_bin}/curl"

output="$({
  PATH="${fake_bin}:${PATH}" \
    DUCKDNS_ENV_FILE="${env_file}" \
    DUCKDNS_TEST_ARGS_FILE="${args_file}" \
    DUCKDNS_TEST_STDIN_FILE="${stdin_file}" \
    "${script}"
} 2>&1)"

if grep -Fq "${token}" "${args_file}"; then
  echo "FAIL: DuckDNS token appeared in curl argv" >&2
  exit 1
fi

grep -Fq "domains=corelib" "${stdin_file}"
grep -Fq "token=${token}" "${stdin_file}"
grep -Fq "DuckDNS updated successfully" <<<"${output}"

echo "PASS: DuckDNS token is delivered over stdin, not curl argv"

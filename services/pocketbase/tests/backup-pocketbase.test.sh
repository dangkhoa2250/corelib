#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
script="${repo_root}/services/pocketbase/deploy/backup-pocketbase.sh"
service_file="${repo_root}/services/pocketbase/deploy/backup-pocketbase.service"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

data_dir="${tmp_dir}/pb_data"
backup_dir="${tmp_dir}/backups"
fake_bin="${tmp_dir}/bin"
systemctl_log="${tmp_dir}/systemctl.log"
recipient_log="${tmp_dir}/recipient.log"

mkdir -p "${data_dir}" "${backup_dir}" "${fake_bin}"
printf 'database fixture\n' > "${data_dir}/data.db"

cat > "${fake_bin}/systemctl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "${BACKUP_TEST_SYSTEMCTL_LOG}"
EOF
chmod +x "${fake_bin}/systemctl"

cat > "${fake_bin}/gpg" <<'EOF'
#!/usr/bin/env bash
output=""
input=""
recipient=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output)
      output="$2"
      shift 2
      ;;
    --recipient)
      recipient="$2"
      shift 2
      ;;
    --encrypt)
      input="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
printf '%s\n' "${recipient}" > "${BACKUP_TEST_RECIPIENT_LOG}"
cp "${input}" "${output}"
EOF
chmod +x "${fake_bin}/gpg"

PATH="${fake_bin}:${PATH}" \
  POCKETBASE_DATA_DIR="${data_dir}" \
  BACKUP_DIR="${backup_dir}" \
  BACKUP_GPG_RECIPIENT="test-recipient" \
  BACKUP_TEST_SYSTEMCTL_LOG="${systemctl_log}" \
  BACKUP_TEST_RECIPIENT_LOG="${recipient_log}" \
  "${script}"

test "$(cat "${systemctl_log}")" = $'stop corelib-pocketbase\nstart corelib-pocketbase'
test "$(cat "${recipient_log}")" = "test-recipient"
test "$(find "${backup_dir}" -name '*.tar.gz.gpg' | wc -l | tr -d ' ')" = "1"
test "$(find "${backup_dir}" -name '*.tar.gz' | wc -l | tr -d ' ')" = "0"

if grep -q '^Requires=corelib-pocketbase.service$' "${service_file}"; then
  echo "FAIL: backup service must remain active while PocketBase is stopped" >&2
  exit 1
fi
grep -Fq 'Environment=GNUPGHOME=/var/lib/corelib-pocketbase/gnupg' "${service_file}"

echo "PASS: backup stops PocketBase, encrypts the archive, and restarts the service"

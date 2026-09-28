#!/bin/bash
set -Eeuo pipefail

EXIT_INCOMPATIBLE_FILESYSTEM=20

fail() {
    echo "ERROR: $*" >&2
    exit 1
}

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
    fail "Run this preflight as root."
fi

for command_name in findmnt tune2fs awk; do
    command -v "$command_name" >/dev/null 2>&1 || \
        fail "Required command not found: $command_name"
done

root_device="$(findmnt -n -o SOURCE --target /)"
root_type="$(findmnt -n -o FSTYPE --target /)"
root_uuid="$(findmnt -n -o UUID --target /)"

[ -n "$root_device" ] || fail "Could not identify the root device."
[ -n "$root_type" ] || fail "Could not identify the root filesystem type."
[ -n "$root_uuid" ] || fail "Could not identify the root filesystem UUID."

recovery_device="/dev/disk/by-uuid/$root_uuid"

echo "Filesystem reboot preflight"
echo "  Root device: $root_device"
echo "  Root type:   $root_type"
echo "  Root UUID:   $root_uuid"

if [ "$root_type" != "ext4" ]; then
    echo "PASS: Root is not ext4; the orphan_file compatibility check does not apply."
    exit 0
fi

features="$(tune2fs -l "$root_device" 2>/dev/null | awk -F: '
    /^Filesystem features:/ {
        sub(/^[[:space:]]+/, "", $2)
        print $2
        exit
    }
')"

[ -n "$features" ] || fail "Could not read ext4 features from $root_device."

unsafe_feature=""
for feature in $features; do
    case "$feature" in
        orphan_file|FEATURE_*)
            unsafe_feature="$feature"
            break
            ;;
    esac
done

if [ -n "$unsafe_feature" ]; then
        cat >&2 <<EOF
ERROR: $root_device uses an ext4 feature that is unsafe for this initramfs:
       $unsafe_feature

Enterprise Linux 9 currently ships an e2fsck that may not understand this
feature in the initramfs. A reboot can therefore fail at systemd-fsck-root
even when the filesystem and RAID are healthy.

Older e2fsprogs releases may display orphan_file as FEATURE_C12. Any unknown
FEATURE_* token is treated as unsafe so this preflight fails closed.

DO NOT REBOOT OR CONTINUE THE INSTALLER.

Boot the server into provider rescue mode. Assemble the RAID, verify that the
root filesystem is unmounted and every RAID1 array is [UU], then use the rescue
system's current e2fsprogs tools to run the following UUID-based commands. The
RAID device name can change in rescue mode, but the filesystem UUID will not.

    e2fsck -fn $recovery_device
    tune2fs -O ^orphan_file $recovery_device
    e2fsck -fp $recovery_device
    tune2fs -l $recovery_device | grep -E 'Filesystem features|Filesystem state'

The final output must omit orphan_file and report a clean filesystem before
booting from local disk.
EOF
        exit "$EXIT_INCOMPATIBLE_FILESYSTEM"
fi

echo "PASS: $root_device has no orphan_file or unknown ext4 feature tokens."

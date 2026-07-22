#!/bin/bash
# ============================================================================
# Provision an EXTERNAL "customer" sink box for the GenX load test. Run ON the
# sink box (a spare Asterisk host, NOT a viciboxclone telephony server).
#
# It answers the cluster's outbound test calls with a realistic busy / no-answer
# / human / machine mix, so the telephony boxes carry only real single-leg trunk
# traffic (no loopback second leg / far-end media inflating their load).
#
# Usage:
#   SIP_BOX_IPS="74.208.179.214 62.151.183.120 62.151.183.71" bash setup-sink-box.sh
#
# After this runs, point the load-test carriers at this box's IP:
#   - GENXLOOP / GENXSINK2 host= <this box IP>  (setup.sh SINK1_HOST / SINK2_HOST)
# Removal: see the "Teardown" note at the end.
# ============================================================================
set -euo pipefail

: "${SIP_BOX_IPS:?set SIP_BOX_IPS to a space/comma-separated list of your telephony (sip) box IPs}"
SIP_BOX_IPS="${SIP_BOX_IPS//,/ }"
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "== install behave dialplan =="
cp "$HERE/dialplan/sink-box-extensions.conf" /etc/asterisk/extensions-genx-loadtest.conf

echo "== generate SIP peers for: $SIP_BOX_IPS =="
: > /etc/asterisk/sip-genx-loadtest.conf
i=0
for ip in $SIP_BOX_IPS; do
  i=$((i + 1))
  cat >> /etc/asterisk/sip-genx-loadtest.conf <<EOF
[genx-lt-sip${i}]
type=peer
host=${ip}
context=genx-loadtest-behave
insecure=port,invite
disallow=all
allow=ulaw
qualify=no

EOF
done

echo "== wire #includes (idempotent) =="
grep -q 'sip-genx-loadtest.conf' /etc/asterisk/sip.conf \
  || echo '#include sip-genx-loadtest.conf' >> /etc/asterisk/sip.conf
grep -q 'extensions-genx-loadtest.conf' /etc/asterisk/extensions.conf \
  || echo '#include extensions-genx-loadtest.conf' >> /etc/asterisk/extensions.conf

echo "== firewall: allow SIP from the telephony boxes =="
if command -v firewall-cmd >/dev/null 2>&1; then
  for ip in $SIP_BOX_IPS; do
    firewall-cmd --permanent --add-rich-rule="rule family=\"ipv4\" source address=\"${ip}\" accept" >/dev/null || true
  done
  firewall-cmd --reload >/dev/null
fi

echo "== reload asterisk =="
asterisk -rx "sip reload" >/dev/null
asterisk -rx "dialplan reload" >/dev/null

echo "== verify =="
asterisk -rx "dialplan show genx-loadtest-behave" | grep -c 'beh' | sed 's/^/behave exten lines: /'
asterisk -rx "sip show peers" | grep -c '^genx-lt-sip' | sed 's/^/sink peers: /'
echo "sink box ready. Set the load-test carriers' host= to this box's IP."

# Teardown:
#   rm -f /etc/asterisk/sip-genx-loadtest.conf /etc/asterisk/extensions-genx-loadtest.conf
#   remove the two #include lines from sip.conf / extensions.conf
#   remove the per-IP firewall rich-rules, then: asterisk -rx "sip reload"; asterisk -rx "dialplan reload"

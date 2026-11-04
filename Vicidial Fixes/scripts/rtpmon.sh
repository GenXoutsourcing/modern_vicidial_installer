#!/bin/bash
# 5-minute combined RTP monitor: wire capture (all RTP), kernel UDP drops per 10 s, Asterisk channelstats delta
H=$(hostname -s); W=300
cs() { asterisk -rx "sip show channelstats" | awk 'NR>1 && $1 ~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/' | sed -E 's/\(\s*([0-9.]+)%\)/\1/g' | awk '{rp=$4; sp=$8; gsub(/K$/,"000",rp); gsub(/K$/,"000",sp); print $1, $2, rp+0, $5+0, sp+0, $9+0}'; }
A=$(mktemp); cs > $A
timeout $((W+2)) tcpdump -nn -i any -l -T rtp udp portrange 10000-20000 and not port 5060 2>/dev/null > /tmp/rtpmon.txt &
u0=$(grep -E "^Udp:" /proc/net/snmp | tail -1 | awk '{print $6}'); drops=""
for i in $(seq 1 $((W/10))); do sleep 10; u1=$(grep -E "^Udp:" /proc/net/snmp | tail -1 | awk '{print $6}'); d=$((u1-u0)); [ $d -gt 0 ] && drops="$drops $(date +%H:%M:%S)=+$d"; u0=$u1; done
wait; B=$(mktemp); cs > $B
echo "== $H wire capture: $(wc -l < /tmp/rtpmon.txt) RTP packets in $W s; kernel UDP rcvbuf drops:${drops:- none}"
awk '{t=$1; sub(/\..*/,"",t); s=""; for(i=1;i<=NF;i++){ if($i=="IP"){a=$(i+1); b=$(i+3); sub(/:$/,"",b); s=a">"b} if($i=="seq"){q=$(i+1)+0} } if(s=="")next; n[s]++; if(s in last){d=q-last[s]; if(d>1&&d<3000){gap[s]+=d-1; sec[t]+=d-1; gs[s]=gs[s]" "t":"(d-1)}} last[s]=q}
 END{tp=0; tl=0; for(s in n){tp+=n[s]; tl+=gap[s]} printf "   wire totals: %d packets, %d lost (%.3f%%)\n", tp, tl, tp?100*tl/tp:0; c=0; for(s in n) if(gap[s]>0 && c<8){c++; printf "   lossy stream %-40s pk=%d lost=%d gaps:%s\n", s, n[s], gap[s], substr(gs[s],1,80)} printf "   lost per second:"; for(t in sec) printf " %s=%d", t, sec[t]; print ""}' /tmp/rtpmon.txt
echo "== $H Asterisk channelstats delta over the same $W s (legs with any counted loss):"
awk 'NR==FNR{a[$2]=$0; next} ($2 in a){split(a[$2],x," "); drp=$3-x[3]; drl=$4-x[4]; dsp=$5-x[5]; dsl=$6-x[6]; if(drl>0||dsl>0) printf "   %-16s recv=%d lost=%d (%.1f%%) | send=%d lost=%d\n", $1, drp, drl, drp?100*drl/drp:0, dsp, dsl; tp+=drp; tl+=drl} END{printf "   asterisk totals: recv %d packets, %d counted lost (%.2f%%)\n", tp, tl, tp?100*tl/tp:0}' $A $B
echo "== strict-RTP relearn events in window: $(grep -c "Strict RTP learning" /var/log/asterisk/messages | tail -1) total today"
rm -f $A $B

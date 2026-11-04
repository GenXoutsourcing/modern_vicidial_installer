#!/bin/bash
# 60 s SIP+RTP capture: map carrier media node (SDP c= in 183/200 from carrier) to Call-ID, then loss per inbound stream from that node to the call's RTP port
timeout 62 tcpdump -nn -i any -l -s 0 -A udp port 5060 and host 173.231.41.114 2>/dev/null > /tmp/sipmap.txt &
timeout 62 tcpdump -nn -i any -l -T rtp udp portrange 10000-20000 2>/dev/null > /tmp/rtpmap.txt &
wait
# SDP: for each carrier response (183/200) record Call-ID, c= IP, m=audio port; our port is in our INVITE's SDP (m=audio PORT)
awk '/^[0-9][0-9]:[0-9][0-9]:[0-9][0-9]\./{pkt++; dir=($0 ~ /173\.231\.41\.114\.5060 >/)?"in":"out"; cid=""; c=""; m=""; next}
     /^Call-ID: /{cid=$2} /^c=IN IP4 /{c=$3} /^m=audio /{m=$2; if(cid!=""){ if(dir=="in"){node[cid]=c; nport[cid]=m} else {ourport[cid]=m} }}
     END{for(k in node) if(k in ourport) print k, node[k], nport[k], ourport[k]}' /tmp/sipmap.txt > /tmp/callmap.txt
echo "calls mapped: $(wc -l < /tmp/callmap.txt)"
awk 'NR==FNR{map[$2":"$3">"$4]=$1; next}
     { s=""; q=-1; for(i=1;i<=NF;i++){ if($i=="IP"){a=$(i+1); b=$(i+3); sub(/:$/,"",b); split(a,aa,"."); src=aa[1]"."aa[2]"."aa[3]"."aa[4]; sp=aa[5]; split(b,bb,"."); dp=bb[5]; s=src":"sp">"dp} if($i=="udp/rtp"){q=$(i+3); sub(/^\*/,"",q); q=q+0; pt=$(i+2)} }
       if(s=="" || !(s in map) || pt!="c0") next; k=s; n[k]++; if(k in last){d=q-last[k]; if(d<0)d+=65536; if(d>1&&d<=200) gap[k]+=d-1} last[k]=q }
     END{for(k in n) if(n[k]>300) printf "%-16s lost=%-4d of %-5d (%.1f%%)  Call-ID %s\n", substr(k,1,index(k,":")-1), gap[k], n[k]+gap[k], 100*gap[k]/(n[k]+gap[k]), map[k]}' /tmp/callmap.txt /tmp/rtpmap.txt | sort -t'(' -k2 -rn | head -14

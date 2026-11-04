#!/bin/bash
# group rtpparse2 output: carrier source nodes vs agent sites; streams with pk>=500 only
bash /root/premig/rtpparse2.sh /tmp/rtpmon.txt | awk '{
  split($1,ab,">"); src=ab[1]; sub(/\.[0-9]+$/,"",src); dst=ab[2]; sub(/\.[0-9]+$/,"",dst);
  split($3,a,"="); pk=a[2]; split($5,b,"="); lost=b[2]; pct=$6; gsub(/[()%]/,"",pct); split($4,c,"="); pps=c[2];
  if (pk<500) next;
  inbound = (dst ~ /^(50\.21\.182\.239|62\.151\.177\.110)$/);
  if (!inbound) next;
  carrier = (src ~ /^(45\.|64\.177\.|66\.42\.|66\.135\.|96\.30\.|104\.238\.|108\.61\.|137\.220\.|140\.82\.|144\.202\.|149\.28\.|155\.138\.|207\.148\.|207\.246\.)/);
  k=(carrier?"CARRIER ":"AGENT   ")src;
  n[k]++; p[k]+=pk; l[k]+=lost; if(pct>5) lossy[k]++; if(pct>5) ppsl[k]+=pps; else ppsc[k]+=pps;
} END {
  for(k in n) printf "%s streams=%-3d lossy(>5%%)=%-3d packets=%-7d lost=%-5d (%.2f%%) pps_clean=%.0f pps_lossy=%.0f\n", k, n[k], lossy[k]+0, p[k], l[k], p[k]?100*l[k]/p[k]:0, (n[k]-lossy[k])?ppsc[k]/(n[k]-lossy[k]):0, lossy[k]?ppsl[k]/lossy[k]:0
}' | sort -k1,1 -k3 -t= -rn

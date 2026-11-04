#!/bin/bash
# per stream (5-tuple + payload type): packets, rate, small sequence gaps (2..200 = real loss), big jumps (new stream/port reuse), junk PTs
F=$1
awk '{
  t=$1; split($1,tt,":"); sec=tt[1]*3600+tt[2]*60+tt[3]; s=""; q=-1;
  for(i=1;i<=NF;i++){ if($i=="IP"){a=$(i+1); b=$(i+3); sub(/:$/,"",b); s=a">"b} if($i=="udp/rtp"){pt=$(i+2); q=$(i+3); sub(/^\*/,"",q); q=q+0} }
  if(s=="" || q<0) next; k=s" "pt;
  n[k]++; if(!(k in first)) first[k]=sec; lastt[k]=sec;
  if(k in last){ d=q-last[k]; if(d<0) d+=65536; if(d>1 && d<=200){ gap[k]+=d-1; gs[k]=gs[k]" "substr(t,1,8)":"(d-1) } else if(d>200) jump[k]++ }
  last[k]=q
} END {
  for(k in n){ dur=lastt[k]-first[k]; if(dur<1) dur=1; split(k,kk," "); printf "%-42s %-5s pk=%-6d pps=%-4.0f lost=%-4d (%.2f%%) jumps=%d gaps:%s\n", kk[1], kk[2], n[k], n[k]/dur, gap[k], 100*gap[k]/(n[k]+gap[k]), jump[k], substr(gs[k],1,60) }
}' "$F"

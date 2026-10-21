#!/usr/bin/perl
# parse tcpdump -A text capture; find bad-487 calls:
#  INVITE from us -> 183 from carrier -> 487 from carrier (proxy To-tag != 183 To-tag), no CANCEL from us before the 487
use strict;
my $carrier='173.231.41.114';
my (%pk,@order); my ($ts,$src,$dst,$cid,$meth,$totag,$inpkt);
my @pkts;
my $cur;
while (<>) {
    chomp;
    if (/^(\d\d:\d\d:\d\d\.\d+) \S+\s+(?:In|Out)\s+IP (\S+?)\.\d+ > (\S+?)\.\d+: /) {
        push @pkts,$cur if $cur && $cur->{cid};
        $cur={ts=>$1,src=>$2,dst=>$3,cid=>'',meth=>'',totag=>'',raw=>[]};
        next;
    }
    next unless $cur;
    push @{$cur->{raw}},$_;
    if (!$cur->{meth}) {
        if (/(INVITE|CANCEL|ACK|BYE) sip:/) {$cur->{meth}=$1}
        elsif (/SIP\/2\.0 (\d{3})/) {$cur->{meth}=$1}
    }
    if (/^Call-ID:\s*(\S+)/i) {$cur->{cid}=$1}
    if (/^To:.*;tag=([^;\s]+)/i) {$cur->{totag}=$1}
    if (/^(INVITE|CANCEL) sip:(\d+)@/ ) {$cur->{num}=$2}
}
push @pkts,$cur if $cur && $cur->{cid};
sub sec { my($t)=@_; my($h,$m,$s)=split /:/,$t; return $h*3600+$m*60+$s }
my %c;
for my $p (@pkts) {
    my $k=$p->{cid}; $c{$k}{pk}||=[]; push @{$c{$k}{pk}},$p;
    my $m=$p->{meth};
    if ($m eq 'INVITE' && $p->{dst} eq $carrier && !$c{$k}{inv}) {$c{$k}{inv}=$p->{ts}; $c{$k}{num}=$p->{num}}
    if ($m eq '183' && $p->{src} eq $carrier && !$c{$k}{p183}) {$c{$k}{p183}=$p->{ts}; $c{$k}{tag183}=$p->{totag}}
    if ($m eq '180' && $p->{src} eq $carrier && !$c{$k}{p180}) {$c{$k}{p180}=$p->{ts}}
    if ($m eq 'CANCEL' && $p->{dst} eq $carrier && !$c{$k}{can}) {$c{$k}{can}=$p->{ts}}
    if ($m eq '487' && $p->{src} eq $carrier && !$c{$k}{p487}) {$c{$k}{p487}=$p->{ts}; $c{$k}{tag487}=$p->{totag}}
    if ($m eq '200' && $p->{src} eq $carrier && !$c{$k}{p200}) {$c{$k}{p200}=$p->{ts}}
}
my ($tot,$bad,$ourcancel,$ans)=(0,0,0,0); my @badlist;
for my $k (keys %c) {
    my $x=$c{$k}; next unless $x->{inv}; $tot++;
    $ans++ if $x->{p200};
    if ($x->{p487}) {
        if ($x->{can} && sec($x->{can}) <= sec($x->{p487})) {$ourcancel++; next}
        $bad++;
        push @badlist,$k;
    }
}
print "invites=$tot answered=$ans 487_after_our_cancel=$ourcancel 487_without_cancel=$bad\n";
for my $k (sort { sec($c{$a}{inv}) <=> sec($c{$b}{inv}) } @badlist) {
    my $x=$c{$k};
    my $d183 = $x->{p183} ? sprintf("%.2f",sec($x->{p183})-sec($x->{inv})) : '-';
    my $d487 = sprintf("%.2f",sec($x->{p487})-sec($x->{inv}));
    my $gap  = $x->{p183} ? sprintf("%.2f",sec($x->{p487})-sec($x->{p183})) : '-';
    my $tagdiff = ($x->{tag183} && $x->{tag487} && $x->{tag183} ne $x->{tag487}) ? 'DIFF' : ($x->{tag183} ? 'same' : 'no183');
    printf "%s inv=%s num=%s 183@+%ss 487@+%ss gap183->487=%ss totag=%s cancel=%s 180=%s\n",
        $k,$x->{inv},$x->{num}//'',$d183,$d487,$gap,$tagdiff,$x->{can}//'none',$x->{p180}//'none';
}
if ($ARGV[0]) {} 
# dump full exchange for best example: 183 present, tag DIFF, gap 1-4s, no cancel
my @best = grep { my $x=$c{$_}; $x->{p183} && !$x->{can} && $x->{tag183} ne $x->{tag487} && (sec($x->{p487})-sec($x->{p183}))>=0.5 && (sec($x->{p487})-sec($x->{p183}))<=5 } @badlist;
if (@best) {
    my $k=$best[0]; print "\n==== EXAMPLE Call-ID $k ====\n";
    for my $p (@{$c{$k}{pk}}) {
        my @hdr = grep { /(INVITE|CANCEL|ACK|BYE) sip:|SIP\/2\.0 \d{3}|^(From|To|Call-ID|CSeq|Reason|Server|User-Agent|Contact):/i } @{$p->{raw}};
        print "--- $p->{ts} $p->{src} -> $p->{dst}\n"; print "    $_\n" for @hdr;
    }
}

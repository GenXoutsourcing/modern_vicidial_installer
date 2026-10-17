# usage: perl alguard2.pl [guard] [hook] < stock > out
my %opt = map { $_ => 1 } @ARGV; @ARGV=();
my $guard = <<'G';
			### GENX agent_log guard (2026-10-17): if the row vicidial_live_agents points at already holds a finished call
			### (lead_id set and dispo_epoch stamped), the VDADready NEW_ID request that creates the next row has not
			### completed yet (it sets READY before it inserts the row). Re-read the id for up to 2 seconds so this call
			### is stamped on the new row instead of overwriting the previous call. Falls through to stock behaviour.
			$gl_try=0;
			while ($gl_try < 20)
				{
				$stmt = "SELECT lead_id,dispo_epoch from vicidial_agent_log where agent_log_id='$agent_log_id';";
				$rslt=mysql_to_mysqli($stmt, $link);
				if ( (!$rslt) or (mysqli_num_rows($rslt) < 1) ) {break;}
				$rowg=mysqli_fetch_row($rslt);
				if ( ($rowg[0] < 1) or ($rowg[1] < 1000) ) {break;}
				usleep(100000);
				$stmt = "SELECT agent_log_id from vicidial_live_agents where user='$user' LIMIT 1;";
				$rslt=mysql_to_mysqli($stmt, $link);
				if ( ($rslt) and (mysqli_num_rows($rslt) > 0) )
					{
					$rowg=mysqli_fetch_row($rslt);
					if ( ($rowg[0] > 0) and ($rowg[0] != $agent_log_id) ) {$agent_log_id = $rowg[0]; break;}
					}
				$gl_try++;
				}
G
my $hook = "\t\t\tif (\$comments == 'GENXTEST_SLOWREADY') {usleep(1500000);}   ### 10-box TEST HOOK ONLY, never ship\n";
my ($ng,$nh,$armed)=(0,0,0);
while (<>) {
  if ($opt{guard} && $_ =~ /^\t\t\t\$stmt = "SELECT wait_epoch,wait_sec from vicidial_agent_log where agent_log_id='\$agent_log_id';";\s*$/) { print $guard; $ng++; }
  print;
  if ($opt{hook}) {
    if ($_ =~ /^\t\t\t\$stmt="UPDATE vicidial_live_agents set status='\$vla_status' \$vla_lead_wipeSQL \$vla_ring_resetSQL where user='\$user' and server_ip='\$server_ip' \$vla_where_SQL;";\s*$/) { $armed=1; next; }
    if ($armed && $_ =~ /^\t\t\t\$rslt=mysql_to_mysqli\(\$stmt, \$link\);\s*$/) { print $hook; $nh++; $armed=0; }
  }
}
print STDERR "guards=$ng hooks=$nh\n";

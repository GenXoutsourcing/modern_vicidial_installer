// Report catalog shared by the nav and the Reports search screen.
// REPORT_GROUPS is the master list: items with a `view` key are native GenX
// screens (the value must match a case in AdminShell's view switch);
// LEGACY_REPORT_GROUPS at the bottom is DERIVED from it with the view keys
// dropped, feeding the Admin Reports page's links to legacy PHP pages.
export const REPORT_GROUPS = [
  {
    // href doubles as extra search keywords for the catalog filter; the
    // Custom Report Matrix is a native GenX screen with no legacy equivalent.
    title: 'Custom',
    items: [
      { label: 'Custom Report Matrix', href: 'custom report builder matrix', view: 'reportCustom' },
    ],
  },
  {
    title: 'Real-Time',
    items: [
      { label: 'Real-Time Main', href: '/vicidial/realtime_report.php?report_display_type=HTML', view: 'reportRealtimeMain' },
      { label: 'Campaign Summary', href: '/vicidial/AST_timeonVDADallSUMMARY.php', view: 'reportCampaignSummary' },
      { label: 'Whiteboard', href: '/vicidial/AST_rt_whiteboard_rpt.php', view: 'reportWhiteboard' },
      { label: 'Agent Monitor Log', href: '/vicidial/AST_rt_monitor_log_report.php', view: 'reportAgentMonitorLog' },
    ],
  },
  {
    title: 'Inbound',
    items: [
      { label: 'Inbound Report', href: '/vicidial/AST_CLOSERstats.php', view: 'reportInboundSummary' },
      { label: 'Inbound v2', href: '/vicidial/AST_CLOSERstats_v2.php', view: 'reportInboundSummary' },
      { label: 'Service Level', href: '/vicidial/AST_CLOSER_service_level.php', view: 'reportServiceLevel' },
      { label: 'Hourly Summary', href: '/vicidial/AST_CLOSERsummary_hourly.php', view: 'reportInboundHourly' },
      { label: 'Daily Summary', href: '/vicidial/AST_inbound_daily_report.php', view: 'reportInboundDaily' },
      { label: 'DID Report', href: '/vicidial/AST_DIDstats.php', view: 'reportDidStats' },
      { label: 'DID Summary', href: '/vicidial/AST_DIDstats_v2.php', view: 'reportDidStats' },
      { label: 'DID Detail', href: '/vicidial/AST_DIDdetail.php', view: 'reportDidDetail' },
      { label: 'IVR Report', href: '/vicidial/AST_IVRstats.php', view: 'reportIvr' },
      { label: 'Forecasting', href: '/vicidial/AST_inbound_forecasting.php', view: 'reportForecasting' },
    ],
  },
  {
    title: 'Outbound and Lists',
    items: [
      { label: 'Outbound Calling', href: '/vicidial/AST_VDADstats.php', view: 'reportOutboundCalling' },
      { label: 'Outbound Interval', href: '/vicidial/AST_OUTBOUNDsummary_interval.php', view: 'reportOutboundInterval' },
      { label: 'Outbound IVR', href: '/vicidial/AST_IVRstats.php?type=outbound', view: 'reportIvr' },
      { label: 'Lead Source', href: '/vicidial/AST_source_vlc_status_report.php', view: 'reportLeadSource' },
      { label: 'Hopper List', href: '/vicidial/AST_VICIDIAL_hopperlist.php', view: 'reportHopperList' },
      { label: 'List Statuses', href: '/vicidial/AST_LISTS_stats.php', view: 'reportListStatuses' },
      { label: 'List Campaign Statuses', href: '/vicidial/AST_LISTS_campaign_stats.php', view: 'reportListCampaignStatuses' },
      { label: 'Campaign Status List', href: '/vicidial/AST_campaign_status_list_report.php', view: 'reportCampaignStatusList' },
      { label: 'Dialer Inventory', href: '/vicidial/AST_dialer_inventory_report.php', view: 'reportDialerInventory' },
      { label: 'CallBack Holds', href: '/vicidial/admin.php?ADD=81', view: 'reportCallbackHolds' },
    ],
  },
  {
    title: 'Agents and Teams',
    items: [
      { label: 'Agent Time Detail', href: '/vicidial/AST_agent_time_detail.php', view: 'reportAgentTimeDetail' },
      { label: 'Agent Status Detail', href: '/vicidial/AST_agent_status_detail.php', view: 'reportAgentStatusDetail' },
      { label: 'Agent Performance Detail', href: '/vicidial/AST_agent_performance_detail.php', view: 'reportAgentPerformance' },
      { label: 'Agent Performance', href: '/vicidial/AST_agent_performance.php', view: 'reportAgentPerformance' },
      { label: 'Team Performance', href: '/vicidial/AST_team_performance_detail.php', view: 'reportTeamPerformance' },
      { label: 'Performance Comparison', href: '/vicidial/AST_performance_comparison_report.php', view: 'reportPerformanceComparison' },
      { label: 'Single Agent Daily', href: '/vicidial/AST_agent_days_detail.php', view: 'reportAgentDays' },
      { label: 'Single Agent Time', href: '/vicidial/AST_agent_days_time.php', view: 'reportAgentDays' },
      { label: 'User Group Login', href: '/vicidial/AST_usergroup_login_report.php', view: 'reportUserGroupLogin' },
      { label: 'User Group Hourly', href: '/vicidial/AST_user_group_hourly_detail.php', view: 'reportUserGroupHourly' },
      { label: 'User Logins', href: '/vicidial/user_logins_report.php', view: 'reportUserLogins' },
      { label: 'User Stats', href: '/vicidial/user_stats.php', view: 'reportUserStats' },
      { label: 'Agent Disposition', href: '/vicidial/AST_agent_disposition.php', view: 'reportAgentDisposition' },
    ],
  },
  {
    title: 'Time Clock',
    items: [
      { label: 'User Timeclock Report', href: '/vicidial/AST_timeclock_report.php', view: 'reportTimeclock' },
      { label: 'Timeclock Status', href: '/vicidial/timeclock_status.php', view: 'reportTimeclockStatus' },
    ],
  },
  {
    title: 'Exports',
    items: [
      { label: 'Export Calls', href: '/vicidial/call_report_export.php', view: 'reportExports' },
      { label: 'Export Calls by Carrier', href: '/vicidial/call_report_export_carrier.php', view: 'reportExports' },
      { label: 'Export Leads', href: '/vicidial/lead_report_export.php', view: 'reportExports' },
      { label: 'Callbacks Export', href: '/vicidial/callbacks_export.php', view: 'reportExports' },
      { label: 'Called Counts List IDs', href: '/vicidial/called_counts_multilist_report.php', view: 'reportCalledCounts' },
    ],
  },
  {
    title: 'Logs and QA',
    items: [
      { label: 'Administration Change Log', href: '/vicidial/AST_admin_report.php', view: 'reportAdminLog' },
      { label: 'Recording Access Log', href: '/vicidial/AST_recording_log_report.php', view: 'reportRecordingAccess' },
      { label: 'API Log', href: '/vicidial/AST_API_log_report.php', view: 'reportApiLog' },
      { label: 'Agent Debug Log', href: '/vicidial/AST_agent_debug_log_report.php', view: 'reportAgentDebugLog' },
      { label: 'Dial Log', href: '/vicidial/AST_dial_log_report.php', view: 'reportDialLog' },
      { label: 'Carrier Log', href: '/vicidial/AST_carrier_log_report.php', view: 'reportCarrierLog' },
      { label: 'Hangup Cause', href: '/vicidial/AST_hangup_cause_report.php', view: 'reportHangupCause' },
      { label: 'SIP Event', href: '/vicidial/AST_SIP_event_report.php', view: 'reportSipEvent' },
      { label: 'AMD Log', href: '/vicidial/AST_AMD_log_report.php', view: 'reportAmdLog' },
      { label: '3-Way Press Log', href: '/vicidial/AST_3way_press_log_report.php', view: 'reportThreewayPressLog' },
      { label: 'Quality Control', href: '/vicidial/AST_quality_control_report.php' },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Server Performance', href: '/vicidial/AST_server_performance.php', view: 'reportServerPerformance' },
      { label: 'Maximum System Stats', href: '/vicidial/admin.php?ADD=999992&stage=TOTAL', view: 'reportMaxStats' },
      { label: 'Maximum Stats Detail', href: '/vicidial/admin.php?ADD=999993', view: 'reportMaxStats' },
      { label: 'Phone Stats', href: '/vicidial/phone_stats.php', view: 'reportPhoneStats' },
      { label: 'Process Report', href: '/vicidial/process_report.php', view: 'reportProcess' },
      { label: 'SPH Report', href: '/vicidial/sph_report.php', view: 'reportSph' },
      { label: 'Webserver URL', href: '/vicidial/AST_webserver_url_report.php', view: 'reportWebserverUrl' },
      { label: 'URL Log', href: '/vicidial/AST_url_log_report.php', view: 'reportUrlLog' },
      { label: 'Demographic Quotas', href: '/vicidial/demographic_quotas_report.php' },
    ],
  },
];

// Legacy report link catalog for the Admin Reports page (Admin nav section):
// every real legacy URL above, rendered as an external link (view dropped).
// The Reporting Center itself shows only native GenX report screens.
export const LEGACY_REPORT_GROUPS = REPORT_GROUPS
  .map((group) => ({
    title: group.title,
    items: group.items
      .filter((item) => item.href.startsWith('/'))
      .map(({ label, href }) => ({ label, href })),
  }))
  .filter((group) => group.items.length);

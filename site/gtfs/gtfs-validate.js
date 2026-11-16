// gtfs-validate.js: checks a Feed against the GTFS Schedule reference. Findings carry a code, a severity,
// the file and the entity to open; the viewer turns the code into a sentence in the chosen language.
(function () {
  'use strict';
  const C = window.GtfsCore;
  const tick = () => new Promise((r) => setTimeout(r, 0));

  const REQUIRED_FILES = ['agency.txt', 'routes.txt', 'trips.txt', 'stop_times.txt', 'stops.txt'];
  const REQUIRED_COLS = {
    'agency.txt': ['agency_name', 'agency_url', 'agency_timezone'], 'stops.txt': ['stop_id'], 'routes.txt': ['route_id', 'route_type'],
    'trips.txt': ['route_id', 'service_id', 'trip_id'], 'stop_times.txt': ['trip_id', 'stop_sequence'], 'calendar.txt': ['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'],
    'calendar_dates.txt': ['service_id', 'date', 'exception_type'], 'shapes.txt': ['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence'], 'frequencies.txt': ['trip_id', 'start_time', 'end_time', 'headway_secs'],
    'transfers.txt': ['from_stop_id', 'to_stop_id', 'transfer_type'], 'pathways.txt': ['pathway_id', 'from_stop_id', 'to_stop_id', 'pathway_mode', 'is_bidirectional'], 'levels.txt': ['level_id', 'level_index'],
    'feed_info.txt': ['feed_publisher_name', 'feed_publisher_url', 'feed_lang'], 'fare_attributes.txt': ['fare_id', 'price', 'currency_type', 'payment_method', 'transfers'], 'fare_rules.txt': ['fare_id'],
    'fare_products.txt': ['fare_product_id'], 'fare_media.txt': ['fare_media_id', 'fare_media_type'], 'rider_categories.txt': ['rider_category_id', 'rider_category_name'], 'areas.txt': ['area_id'], 'networks.txt': ['network_id'],
    'stop_areas.txt': ['area_id', 'stop_id'], 'route_networks.txt': ['network_id', 'route_id'], 'timeframes.txt': ['timeframe_group_id'], 'fare_leg_rules.txt': ['fare_product_id'], 'fare_transfer_rules.txt': ['fare_transfer_type', 'fare_product_id'],
    'fare_leg_join_rules.txt': ['from_network_id', 'to_network_id'], 'location_groups.txt': ['location_group_id'], 'location_group_stops.txt': ['location_group_id', 'stop_id'], 'booking_rules.txt': ['booking_rule_id', 'booking_type'],
    'translations.txt': ['table_name', 'field_name', 'language', 'translation'], 'attributions.txt': ['attribution_id'.replace('attribution_id', 'organization_name')]
  };
  const UNIQUE = [['stops', 'stop_id'], ['routes', 'route_id'], ['trips', 'trip_id'], ['agency', 'agency_id'], ['calendar', 'service_id'], ['levels', 'level_id'], ['pathways', 'pathway_id'], ['fare_attributes', 'fare_id'], ['areas', 'area_id'], ['networks', 'network_id'], ['fare_media', 'fare_media_id'], ['rider_categories', 'rider_category_id'], ['location_groups', 'location_group_id'], ['booking_rules', 'booking_rule_id']];
  const ENUMS = [
    ['trips', 'direction_id', ['0', '1']], ['trips', 'wheelchair_accessible', ['0', '1', '2']], ['trips', 'bikes_allowed', ['0', '1', '2']], ['stops', 'location_type', ['0', '1', '2', '3', '4']], ['stops', 'wheelchair_boarding', ['0', '1', '2']],
    ['calendar_dates', 'exception_type', ['1', '2']], ['transfers', 'transfer_type', ['0', '1', '2', '3', '4', '5']], ['pathways', 'pathway_mode', ['1', '2', '3', '4', '5', '6', '7']], ['pathways', 'is_bidirectional', ['0', '1']],
    ['frequencies', 'exact_times', ['0', '1']], ['routes', 'continuous_pickup', ['0', '1', '2', '3']], ['routes', 'continuous_drop_off', ['0', '1', '2', '3']], ['fare_attributes', 'payment_method', ['0', '1']], ['fare_media', 'fare_media_type', ['0', '1', '2', '3', '4']],
    ['fare_transfer_rules', 'fare_transfer_type', ['0', '1', '2']], ['booking_rules', 'booking_type', ['0', '1', '2']], ['calendar', 'monday', ['0', '1']], ['calendar', 'tuesday', ['0', '1']], ['calendar', 'wednesday', ['0', '1']], ['calendar', 'thursday', ['0', '1']], ['calendar', 'friday', ['0', '1']], ['calendar', 'saturday', ['0', '1']], ['calendar', 'sunday', ['0', '1']]
  ];
  // [table, column, target kind, target table, target column]
  const REFS = [
    ['trips', 'route_id', 'routes', 'route_id'], ['routes', 'agency_id', 'agency', 'agency_id'], ['stops', 'parent_station', 'stops', 'stop_id'], ['stops', 'level_id', 'levels', 'level_id'],
    ['transfers', 'from_stop_id', 'stops', 'stop_id'], ['transfers', 'to_stop_id', 'stops', 'stop_id'], ['transfers', 'from_route_id', 'routes', 'route_id'], ['transfers', 'to_route_id', 'routes', 'route_id'], ['transfers', 'from_trip_id', 'trips', 'trip_id'], ['transfers', 'to_trip_id', 'trips', 'trip_id'],
    ['pathways', 'from_stop_id', 'stops', 'stop_id'], ['pathways', 'to_stop_id', 'stops', 'stop_id'], ['frequencies', 'trip_id', 'trips', 'trip_id'], ['fare_rules', 'fare_id', 'fare_attributes', 'fare_id'], ['fare_rules', 'route_id', 'routes', 'route_id'],
    ['stop_areas', 'area_id', 'areas', 'area_id'], ['stop_areas', 'stop_id', 'stops', 'stop_id'], ['route_networks', 'network_id', 'networks', 'network_id'], ['route_networks', 'route_id', 'routes', 'route_id'],
    ['fare_leg_rules', 'network_id', 'networks', 'network_id'], ['fare_leg_rules', 'from_area_id', 'areas', 'area_id'], ['fare_leg_rules', 'to_area_id', 'areas', 'area_id'], ['fare_leg_rules', 'fare_product_id', 'fare_products', 'fare_product_id'],
    ['fare_transfer_rules', 'fare_product_id', 'fare_products', 'fare_product_id'], ['fare_products', 'fare_media_id', 'fare_media', 'fare_media_id'], ['fare_products', 'rider_category_id', 'rider_categories', 'rider_category_id'],
    ['fare_leg_join_rules', 'from_network_id', 'networks', 'network_id'], ['fare_leg_join_rules', 'to_network_id', 'networks', 'network_id'], ['location_group_stops', 'location_group_id', 'location_groups', 'location_group_id'], ['location_group_stops', 'stop_id', 'stops', 'stop_id'],
    ['booking_rules', 'prior_notice_last_day', 'booking_rules', 'booking_rule_id']
  ].filter((r) => r[1] !== 'prior_notice_last_day');

  async function validate(feed, progress) {
    const issues = [], counts = {}, SEV = {};
    const add = (code, sev, file, extra) => {
      const c = counts[code] || (counts[code] = { sev, n: 0 }); c.n++;
      if (c.n <= 200) issues.push(Object.assign({ code, sev, file }, extra));
    };
    const err = (code, file, extra) => add(code, 'error', file, extra), warn = (code, file, extra) => add(code, 'warning', file, extra);
    const T = feed.T, st = feed.st, files = feed.files;
    const step = async (p) => { if (progress) progress(p); await tick(); };

    // required files
    for (const f of REQUIRED_FILES) if (!files[f]) { if (f === 'stops.txt' && feed.geo) continue; err('file_missing', f); }
    if (!files['calendar.txt'] && !files['calendar_dates.txt']) err('file_missing', 'calendar.txt', { alt: 'calendar_dates.txt' });
    if (files['stops.txt'] && !(files['stops.txt'].rows > 0)) err('file_empty', 'stops.txt');
    // required columns
    for (const f in REQUIRED_COLS) { if (!files[f]) continue; const have = feed.cols[f] || []; for (const c of REQUIRED_COLS[f]) if (!have.includes(c)) err('col_missing', f, { field: c }); }
    if (files['routes.txt'] && !(feed.cols['routes.txt'] || []).includes('route_short_name') && !(feed.cols['routes.txt'] || []).includes('route_long_name')) err('col_missing', 'routes.txt', { field: 'route_short_name / route_long_name' });
    await step(5);

    // blank required values, enums, ids
    const blank = (tbl, file, fields, kind, idf) => { for (const r of T[tbl] || []) for (const f of fields) if (f in r && r[f] === '') err('value_missing', file, { field: f, kind, id: r[idf] }); };
    blank('agency', 'agency.txt', ['agency_name', 'agency_url', 'agency_timezone'], 'agency', 'agency_id');
    blank('routes', 'routes.txt', ['route_id', 'route_type'], 'route', 'route_id'); blank('trips', 'trips.txt', ['route_id', 'service_id', 'trip_id'], 'trip', 'trip_id');
    for (const r of T.routes || []) if (r.route_short_name === '' && r.route_long_name === '' && ('route_short_name' in r || 'route_long_name' in r)) err('route_no_name', 'routes.txt', { kind: 'route', id: r.route_id });
    for (const s of T.stops || []) {
      const lt = s.location_type || '0';
      if (lt <= '2' && s.stop_name === '' && 'stop_name' in s) err('value_missing', 'stops.txt', { field: 'stop_name', kind: 'stop', id: s.stop_id });
      if (s.stop_id === '') err('value_missing', 'stops.txt', { field: 'stop_id', kind: 'stop', id: '' });
    }
    for (const [tbl, f, ok] of ENUMS) for (const r of T[tbl] || []) if (r[f] && !ok.includes(r[f])) err('enum_value', tbl + '.txt', { field: f, value: r[f], kind: tbl === 'stops' ? 'stop' : tbl === 'routes' ? 'route' : tbl === 'trips' ? 'trip' : '', id: r[(tbl === 'stops' ? 'stop_id' : tbl === 'routes' ? 'route_id' : tbl === 'trips' ? 'trip_id' : 'x')] });
    for (const r of T.routes || []) if (r.route_type !== '' && (!/^\d+$/.test(r.route_type) || !(C.ROUTE_TYPES[+r.route_type] || (+r.route_type >= 100 && +r.route_type < 1800)))) err('enum_value', 'routes.txt', { field: 'route_type', value: r.route_type, kind: 'route', id: r.route_id });
    for (const [tbl, idf] of UNIQUE) { const seen = new Set(); for (const r of T[tbl] || []) { const v = r[idf]; if (v === undefined || (v === '' && tbl !== 'agency')) continue; if (seen.has(v)) err('dup_id', tbl + '.txt', { field: idf, value: v, kind: tbl === 'stops' ? 'stop' : tbl === 'routes' ? 'route' : tbl === 'trips' ? 'trip' : '', id: v }); seen.add(v); } }
    await step(15);

    // referential integrity
    const keyset = {}; const setOf = (tbl, col) => { const k = tbl + '.' + col; return keyset[k] || (keyset[k] = new Set((T[tbl] || []).map((r) => r[col]))); };
    for (const [tbl, col, tt, tc] of REFS) {
      if (!files[tbl + '.txt'] || !files[tt + '.txt']) continue; const target = setOf(tt, tc);
      for (const r of T[tbl] || []) { const v = r[col]; if (v && !target.has(v)) err('ref_missing', tbl + '.txt', { field: col, value: v, target: tt + '.txt', kind: tbl === 'trips' ? 'trip' : tbl === 'stops' ? 'stop' : tbl === 'routes' ? 'route' : '', id: tbl === 'trips' ? r.trip_id : tbl === 'stops' ? r.stop_id : tbl === 'routes' ? r.route_id : '' }); }
    }
    const svc = new Set([...feed.cal.keys(), ...feed.exc.keys()]);
    for (const t of feed.trips) if (t.service_id && !svc.has(t.service_id)) err('ref_missing', 'trips.txt', { field: 'service_id', value: t.service_id, target: 'calendar.txt', kind: 'trip', id: t.trip_id });
    if (files['shapes.txt']) for (const t of feed.trips) if (t.shape_id && !feed.shapeIx.has(t.shape_id)) err('ref_missing', 'trips.txt', { field: 'shape_id', value: t.shape_id, target: 'shapes.txt', kind: 'trip', id: t.trip_id });
    const zones = new Set((T.stops || []).map((s) => s.zone_id).filter(Boolean));
    for (const r of T.fare_rules || []) for (const f of ['origin_id', 'destination_id', 'contains_id']) if (r[f] && !zones.has(r[f])) err('ref_missing', 'fare_rules.txt', { field: f, value: r[f], target: 'stops.txt zone_id' });
    if (st.orphanTrips) err('ref_missing', 'stop_times.txt', { field: 'trip_id', value: (st.orphanTripIds || []).slice(0, 3).join(', '), target: 'trips.txt', count: st.orphanTrips });
    if (st.orphanStops) err('ref_missing', 'stop_times.txt', { field: 'stop_id', value: (st.orphanStopIds || []).slice(0, 3).join(', '), target: 'stops.txt', count: st.orphanStops });
    await step(35);

    // stop coordinates and hierarchy
    for (const s of feed.stops) {
      const lt = s.location_type || '0';
      if (!s.ok && (lt === '0' || lt === '1' || lt === '2')) { if (s.stop_lat === '' || s.stop_lon === '') err('coord_missing', 'stops.txt', { kind: 'stop', id: s.stop_id }); else err('coord_range', 'stops.txt', { kind: 'stop', id: s.stop_id, value: s.stop_lat + ', ' + s.stop_lon }); }
      else if (s.stop_lat !== '' && (Math.abs(parseFloat(s.stop_lat)) > 90 || Math.abs(parseFloat(s.stop_lon)) > 180)) err('coord_range', 'stops.txt', { kind: 'stop', id: s.stop_id, value: s.stop_lat + ', ' + s.stop_lon });
      if (s.parent_station) { const p = feed.stops[feed.stopIx.get(s.parent_station)]; if (p) { const pl = p.location_type || '0'; if ((lt === '0' || lt === '4' || lt === '3') && pl === '0' && lt !== '4') warn('parent_type', 'stops.txt', { kind: 'stop', id: s.stop_id }); if (lt === '1') err('parent_type', 'stops.txt', { kind: 'stop', id: s.stop_id }); } }
      else if (lt === '2' || lt === '3' || lt === '4') err('parent_required', 'stops.txt', { kind: 'stop', id: s.stop_id });
    }
    await step(40);

    // calendar
    for (const c of feed.cal.values()) {
      if (!C.dateOk(c.start_date) || !C.dateOk(c.end_date)) err('date_format', 'calendar.txt', { kind: 'service', id: c.service_id, value: c.start_date + ' / ' + c.end_date });
      else if (c.start_date > c.end_date) err('calendar_range', 'calendar.txt', { kind: 'service', id: c.service_id });
      if (C.DAYS.every((d) => c[d] !== '1')) warn('calendar_nodays', 'calendar.txt', { kind: 'service', id: c.service_id });
    }
    for (const x of T.calendar_dates || []) if (!C.dateOk(x.date)) err('date_format', 'calendar_dates.txt', { kind: 'service', id: x.service_id, value: x.date });
    const fi = feed.feedInfo; if (fi.feed_end_date && C.dateOk(fi.feed_end_date) && fi.feed_end_date < C.key(new Date())) warn('feed_expired', 'feed_info.txt', { value: fi.feed_end_date });
    if (C.dateOk(fi.feed_start_date || '') && C.dateOk(fi.feed_end_date || '')) for (const c of feed.cal.values()) if (C.dateOk(c.start_date) && (c.start_date < fi.feed_start_date || c.end_date > fi.feed_end_date)) warn('feed_range', 'calendar.txt', { kind: 'service', id: c.service_id });
    await step(45);

    // routes: colours
    for (const r of T.routes || []) {
      for (const f of ['route_color', 'route_text_color']) if (r[f] && !/^[0-9a-fA-F]{6}$/.test(r[f])) err('color_format', 'routes.txt', { field: f, value: r[f], kind: 'route', id: r.route_id });
      const bg = C.hex6(r.route_color), fg = C.hex6(r.route_text_color);
      if (bg && fg) { const k = C.contrast(bg, fg); if (k < 4.5) warn('color_contrast', 'routes.txt', { kind: 'route', id: r.route_id, value: k.toFixed(1) + ':1' }); }
    }

    // usage
    const usedStops = new Set(); for (let r = 0; r < st.n; r++) if (st.stop[r] >= 0) usedStops.add(st.stop[r]);
    const referenced = new Set(); for (const tbl of ['transfers', 'pathways', 'location_group_stops', 'stop_areas']) for (const r of T[tbl] || []) for (const f of ['from_stop_id', 'to_stop_id', 'stop_id']) if (r[f]) referenced.add(r[f]);
    const parents = new Set(feed.stops.map((s) => s.parent_station).filter(Boolean));
    feed.stops.forEach((s, i) => { const lt = s.location_type || '0'; if (lt === '0' && !usedStops.has(i) && !referenced.has(s.stop_id) && !parents.has(s.stop_id)) warn('unused_stop', 'stops.txt', { kind: 'stop', id: s.stop_id }); });
    feed.routes.forEach((r, i) => { if (!feed.routeTrips[i].length) warn('unused_route', 'routes.txt', { kind: 'route', id: r.route_id }); });
    const usedShapes = new Set(feed.trips.map((t) => t.shape_id).filter(Boolean)); if (feed.shapes) for (const id of feed.shapes.ids) if (!usedShapes.has(id)) warn('unused_shape', 'shapes.txt', { kind: 'shape', id });
    for (const id of feed.serviceIds) if (!feed.tripsByService.has(id)) warn('unused_service', 'calendar.txt', { kind: 'service', id });
    await step(55);

    // trips and times
    const cls = feed.routes.map((r) => C.typeClass(r.route_type)); const limit = { bus: 120, tram: 110, subway: 160, rail: 300, ferry: 90, other: 200 };
    const dist = st.dist;
    if (st.badTimes) err('time_format', 'stop_times.txt', { count: st.badTimes });
    if (st.noSeq) err('value_missing', 'stop_times.txt', { field: 'stop_sequence', count: st.noSeq });
    for (let t = 0; t < feed.trips.length; t++) {
      const a = st.tripStart[t], b = st.tripStart[t + 1], tid = feed.trips[t].trip_id;
      if (b - a === 0) { warn('trip_no_times', 'trips.txt', { kind: 'trip', id: tid }); continue; }
      if (b - a === 1) warn('trip_few_stops', 'stop_times.txt', { kind: 'trip', id: tid });
      const ri = feed.routeIx.get(feed.trips[t].route_id), lim = ri === undefined ? 200 : limit[cls[ri]];
      let prev = -1, lastDist = -Infinity, bad = false, slow = false, dbad = false, ps = null;
      for (let r = a; r < b; r++) {
        const ar = st.arr[r], dp = st.dep[r], ex = feed.stExtra.get(r);
        if (ar >= 0 && dp >= 0 && dp < ar && !bad) { err('time_decrease', 'stop_times.txt', { kind: 'trip', id: tid, row: r - a + 1 }); bad = true; }
        const v = ar >= 0 ? ar : dp;
        if (v >= 0) { if (prev >= 0 && v < prev && !bad) { err('time_decrease', 'stop_times.txt', { kind: 'trip', id: tid, row: r - a + 1 }); bad = true; } prev = dp >= 0 ? dp : v; }
        if ((r === a || r === b - 1) && ar < 0 && dp < 0 && !(ex && (ex.start_pickup_drop_off_window || ex.location_id || ex.location_group_id))) err('time_missing', 'stop_times.txt', { kind: 'trip', id: tid, row: r - a + 1 });
        const dd = dist[r]; if (!Number.isNaN(dd)) { if (dd < lastDist && !dbad) { err('dist_decrease', 'stop_times.txt', { kind: 'trip', id: tid, row: r - a + 1 }); dbad = true; } lastDist = dd; }
        const s = feed.stops[st.stop[r]];
        if (s && s.ok && ps && ps.s.ok && !slow) {
          const t0 = ps.t, t1 = ar >= 0 ? ar : dp;
          if (t0 >= 0 && t1 >= 0) { const m = C.haversine(ps.s.lat, ps.s.lon, s.lat, s.lon), dt = t1 - t0; if ((dt > 0 && m / dt * 3.6 > lim && m > 200) || (dt <= 0 && m > 300)) { warn('speed', 'stop_times.txt', { kind: 'trip', id: tid, row: r - a + 1, value: dt > 0 ? Math.round(m / dt * 3.6) + ' km/h' : Math.round(m) + ' m in 0 s' }); slow = true; } }
        }
        if (s) ps = { s, t: dp >= 0 ? dp : ar };
      }
    }
    await step(80);
    if (feed.shapes) { const S = feed.shapes; for (let i = 0; i < S.ids.length; i++) { let last = -Infinity; for (let k = S.start[i]; k < S.start[i + 1]; k++) { const d = S.dist[k]; if (!Number.isNaN(d)) { if (d < last) { err('dist_decrease', 'shapes.txt', { kind: 'shape', id: S.ids[i] }); break; } last = d; } } if (S.start[i + 1] - S.start[i] < 2) warn('shape_short', 'shapes.txt', { kind: 'shape', id: S.ids[i] }); } if (S.badPoints) err('coord_range', 'shapes.txt', { count: S.badPoints }); }
    if (T.frequencies) for (const f of T.frequencies) { const ti = feed.tripIx.get(f.trip_id); if (ti !== undefined && (+f.headway_secs <= 0 || !(f.headway_secs))) err('enum_value', 'frequencies.txt', { field: 'headway_secs', value: f.headway_secs, kind: 'trip', id: f.trip_id }); }
    await step(100);
    const order = { error: 0, warning: 1 };
    issues.sort((a, b) => order[a.sev] - order[b.sev]);
    let errors = 0, warnings = 0; for (const k in counts) { if (counts[k].sev === 'error') errors += counts[k].n; else warnings += counts[k].n; }
    return { issues, counts, errors, warnings };
  }
  window.GtfsValidate = { validate };
})();

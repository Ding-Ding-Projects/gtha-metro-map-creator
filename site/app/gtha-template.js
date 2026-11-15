/*
 * Built-in GTHA schematic template.
 *
 * Coordinates are schematic grid units, not geography. Station lists are
 * simplified, colours are approximate, and planned or under-construction
 * lines use the dashed style. Verify service details with TTC and Metrolinx.
 */
(function () {
  'use strict';

  const S = [
    // Line 1, Yonge branch
    ['finch', 'Finch', 2, -28], ['north_york_centre', 'North York Centre', 2, -26],
    ['sheppard_yonge', 'Sheppard-Yonge', 2, -24], ['york_mills', 'York Mills', 2, -22],
    ['lawrence', 'Lawrence', 2, -20], ['eglinton', 'Eglinton', 2, -18],
    ['davisville', 'Davisville', 2, -16], ['st_clair', 'St Clair', 2, -14],
    ['summerhill', 'Summerhill', 2, -12], ['rosedale', 'Rosedale', 2, -10],
    ['bloor_yonge', 'Bloor-Yonge', 2, -8], ['wellesley', 'Wellesley', 2, -6],
    ['college', 'College', 2, -4], ['tmu', 'TMU', 2, -2], ['queen', 'Queen', 2, 0],
    ['king', 'King', 2, 2], ['union', 'Union', 0, 4],
    // Line 1, University-Spadina branch
    ['st_andrew', 'St Andrew', -2, 2], ['osgoode', 'Osgoode', -2, 0],
    ['st_patrick', 'St Patrick', -2, -2], ['queens_park', "Queen's Park", -2, -4],
    ['museum', 'Museum', -2, -6], ['st_george', 'St George', -2, -8],
    ['spadina', 'Spadina', -4, -8], ['dupont', 'Dupont', -4, -12],
    ['st_clair_west', 'St Clair West', -4, -14], ['cedarvale', 'Cedarvale', -4, -18],
    ['glencairn', 'Glencairn', -6, -20], ['lawrence_west', 'Lawrence West', -8, -22],
    ['yorkdale', 'Yorkdale', -8, -24], ['wilson', 'Wilson', -8, -26],
    ['sheppard_west', 'Sheppard West', -8, -28], ['downsview_park', 'Downsview Park', -11, -31],
    ['finch_west', 'Finch West', -13, -33], ['york_university', 'York University', -15, -35],
    ['pioneer_village', 'Pioneer Village', -15, -37], ['highway_407', 'Highway 407', -15, -39],
    ['vmc', 'Vaughan Metropolitan Centre', -15, -41],
    // Line 2
    ['kipling', 'Kipling', -32, -8], ['islington', 'Islington', -30, -8],
    ['royal_york', 'Royal York', -28, -8], ['old_mill', 'Old Mill', -26, -8],
    ['jane', 'Jane', -24, -8], ['runnymede', 'Runnymede', -22, -8],
    ['high_park', 'High Park', -20, -8], ['keele', 'Keele', -18, -8],
    ['dundas_west', 'Dundas West', -16, -8], ['lansdowne', 'Lansdowne', -14, -8],
    ['dufferin', 'Dufferin', -12, -8], ['ossington', 'Ossington', -10, -8],
    ['christie', 'Christie', -8, -8], ['bathurst', 'Bathurst', -6, -8],
    ['bay', 'Bay', 0, -8], ['sherbourne', 'Sherbourne', 4, -8],
    ['castle_frank', 'Castle Frank', 6, -8], ['broadview', 'Broadview', 8, -8],
    ['chester', 'Chester', 10, -8], ['pape', 'Pape', 12, -8],
    ['donlands', 'Donlands', 14, -8], ['greenwood', 'Greenwood', 16, -8],
    ['coxwell', 'Coxwell', 18, -8], ['woodbine', 'Woodbine', 20, -8],
    ['main_street', 'Main Street', 22, -8], ['victoria_park', 'Victoria Park', 24, -8],
    ['warden', 'Warden', 26, -8], ['kennedy', 'Kennedy', 28, -8],
    // Line 4
    ['bayview', 'Bayview', 4, -24], ['bessarion', 'Bessarion', 6, -24],
    ['leslie', 'Leslie', 8, -24], ['don_mills', 'Don Mills', 10, -24],
    // Line 5
    ['mount_dennis', 'Mount Dennis', -15, -18], ['keelesdale', 'Keelesdale', -13, -18],
    ['caledonia', 'Caledonia', -11, -18], ['fairbank', 'Fairbank', -9, -18],
    ['oakwood', 'Oakwood', -7, -18], ['forest_hill', 'Forest Hill', -3, -18]
  ];
  const S2 = [
    ['chaplin', 'Chaplin', -2, -18], ['avenue', 'Avenue', 0, -18],
    ['mount_pleasant', 'Mount Pleasant', 3, -18], ['leaside', 'Leaside', 5, -18],
    ['laird', 'Laird', 6, -18], ['sunnybrook_park', 'Sunnybrook Park', 8, -18],
    ['science_centre', 'Science Centre', 10, -18], ['aga_khan', 'Aga Khan Park & Museum', 12, -18],
    ['wynford', 'Wynford', 13, -18], ['sloane', 'Sloane', 14, -18],
    ['oconnor', "O'Connor", 16, -18], ['pharmacy', 'Pharmacy', 18, -18],
    ['hakimi_lebovic', 'Hakimi Lebovic', 20, -18], ['golden_mile', 'Golden Mile', 22, -18],
    ['birchmount', 'Birchmount', 23, -18], ['ionview', 'Ionview', 24, -18],
    // Line 6 (simplified)
    ['jane_and_finch', 'Jane and Finch', -18, -33], ['emery', 'Emery', -22, -33],
    ['humber_college', 'Humber College', -30, -33],
    // Lakeshore West
    ['exhibition', 'Exhibition', -6, 6], ['mimico', 'Mimico', -14, 6],
    ['long_branch', 'Long Branch', -20, 6], ['port_credit', 'Port Credit', -26, 6],
    ['clarkson', 'Clarkson', -30, 6], ['oakville', 'Oakville', -34, 6],
    ['bronte', 'Bronte', -38, 6], ['appleby', 'Appleby', -42, 6],
    ['burlington', 'Burlington', -46, 6], ['aldershot', 'Aldershot', -50, 6],
    ['west_harbour', 'Hamilton West Harbour', -54, 6],
    // Lakeshore East
    ['danforth_go', 'Danforth', 12, 6], ['scarborough_go', 'Scarborough', 18, 6],
    ['eglinton_go', 'Eglinton GO', 22, 6], ['guildwood', 'Guildwood', 26, 6],
    ['rouge_hill', 'Rouge Hill', 30, 6], ['pickering', 'Pickering', 34, 6],
    ['ajax', 'Ajax', 38, 6], ['whitby', 'Whitby', 42, 6], ['oshawa', 'Oshawa', 46, 6],
    // Kitchener and UP Express
    ['bloor_go', 'Bloor', -17, -9], ['weston', 'Weston', -20, -20],
    ['pearson', 'Pearson Airport', -30, -20], ['etobicoke_north', 'Etobicoke North', -24, -26],
    ['malton', 'Malton', -30, -30], ['bramalea', 'Bramalea', -36, -30],
    ['brampton', 'Brampton', -42, -30], ['mount_pleasant_go', 'Mount Pleasant (Brampton)', -46, -30],
    ['georgetown', 'Georgetown', -52, -30], ['acton', 'Acton', -56, -30],
    ['guelph', 'Guelph Central', -62, -30], ['kitchener', 'Kitchener', -68, -30],
    // Milton
    ['dixie', 'Dixie', -36, -12], ['cooksville', 'Cooksville', -40, -14],
    ['erindale', 'Erindale', -44, -16], ['streetsville', 'Streetsville', -48, -18],
    ['meadowvale', 'Meadowvale', -52, -20], ['lisgar', 'Lisgar', -54, -22],
    ['milton', 'Milton', -58, -24],
    // Barrie
    ['rutherford', 'Rutherford', -11, -40], ['maple', 'Maple', -11, -44],
    ['king_city', 'King City', -11, -48], ['aurora', 'Aurora', -11, -52],
    ['newmarket', 'Newmarket', -11, -56], ['east_gwillimbury', 'East Gwillimbury', -11, -60],
    ['bradford', 'Bradford', -11, -64], ['barrie_south', 'Barrie South', -11, -70],
    ['allandale', 'Allandale Waterfront', -11, -74],
    // Richmond Hill
    ['oriole', 'Oriole', 11, -26], ['old_cummer', 'Old Cummer', 11, -30],
    ['langstaff', 'Langstaff', 11, -36], ['richmond_hill', 'Richmond Hill', 11, -40],
    ['gormley', 'Gormley', 11, -46], ['bloomington', 'Bloomington', 11, -50],
    // Stouffville
    ['agincourt', 'Agincourt', 30, -24], ['milliken', 'Milliken', 30, -30],
    ['unionville', 'Unionville', 30, -36], ['centennial', 'Centennial', 30, -40],
    ['markham', 'Markham', 30, -44], ['mount_joy', 'Mount Joy', 30, -48],
    ['stouffville', 'Stouffville', 30, -54], ['old_elm', 'Old Elm', 30, -58],
    // Ontario Line (planned)
    ['king_bathurst', 'King-Bathurst', -6, 2], ['queen_spadina', 'Queen-Spadina', -4, 0],
    ['moss_park', 'Moss Park', 4, 0], ['corktown', 'Corktown', 6, 2],
    ['east_harbour', 'East Harbour', 8, 2], ['riverside', 'Riverside-Leslieville', 10, 2],
    ['gerrard', 'Gerrard', 12, 0], ['cosburn', 'Cosburn', 12, -12],
    ['thorncliffe_park', 'Thorncliffe Park', 12, -14], ['flemingdon_park', 'Flemingdon Park', 12, -16],
    // Hurontario LRT and Hamilton LRT (simplified)
    ['brampton_gateway', 'Brampton Gateway', -40, -34],
    ['mcmaster', 'McMaster University', -64, 12], ['downtown_hamilton', 'Downtown Hamilton', -56, 12],
    ['eastgate', 'Eastgate Square', -46, 12]
  ];

  const W = '@-8,4', W2 = '@-11,1', E1 = '@7,4', E2 = '@24,4', E3 = '@11,0';

  const L = [
    { id: 'l1', name: 'Line 1 Yonge-University', color: '#F8C300', width: 10, style: 'solid',
      path: ['finch', 'north_york_centre', 'sheppard_yonge', 'york_mills', 'lawrence', 'eglinton', 'davisville', 'st_clair', 'summerhill', 'rosedale', 'bloor_yonge', 'wellesley', 'college', 'tmu', 'queen', 'king', 'union', 'st_andrew', 'osgoode', 'st_patrick', 'queens_park', 'museum', 'st_george', 'spadina', 'dupont', 'st_clair_west', 'cedarvale', 'glencairn', 'lawrence_west', 'yorkdale', 'wilson', 'sheppard_west', 'downsview_park', 'finch_west', 'york_university', 'pioneer_village', 'highway_407', 'vmc'] },
    { id: 'l2', name: 'Line 2 Bloor-Danforth', color: '#00923F', width: 10, style: 'solid',
      path: ['kipling', 'islington', 'royal_york', 'old_mill', 'jane', 'runnymede', 'high_park', 'keele', 'dundas_west', 'lansdowne', 'dufferin', 'ossington', 'christie', 'bathurst', 'spadina', 'st_george', 'bay', 'bloor_yonge', 'sherbourne', 'castle_frank', 'broadview', 'chester', 'pape', 'donlands', 'greenwood', 'coxwell', 'woodbine', 'main_street', 'victoria_park', 'warden', 'kennedy'] },
    { id: 'l4', name: 'Line 4 Sheppard', color: '#A21A68', width: 10, style: 'solid',
      path: ['sheppard_yonge', 'bayview', 'bessarion', 'leslie', 'don_mills'] },
    { id: 'l5', name: 'Line 5 Eglinton', color: '#F37021', width: 8, style: 'solid',
      path: ['mount_dennis', 'keelesdale', 'caledonia', 'fairbank', 'oakwood', 'cedarvale', 'forest_hill', 'chaplin', 'avenue', 'eglinton', 'mount_pleasant', 'leaside', 'laird', 'sunnybrook_park', 'science_centre', 'aga_khan', 'wynford', 'sloane', 'oconnor', 'pharmacy', 'hakimi_lebovic', 'golden_mile', 'birchmount', 'ionview', 'kennedy'] },
    { id: 'l6', name: 'Line 6 Finch West', color: '#8B8C8E', width: 8, style: 'solid',
      path: ['finch_west', 'jane_and_finch', 'emery', 'humber_college'] },
    { id: 'ontario', name: 'Ontario Line (planned)', color: '#0067B1', width: 8, style: 'dashed',
      path: ['exhibition', 'king_bathurst', 'queen_spadina', 'osgoode', 'queen', 'moss_park', 'corktown', 'east_harbour', 'riverside', 'gerrard', 'pape', 'cosburn', 'thorncliffe_park', 'flemingdon_park', 'science_centre'] },
    { id: 'lsw', name: 'Lakeshore West', color: '#98002E', width: 8, style: 'rail',
      path: ['union', 'exhibition', 'mimico', 'long_branch', 'port_credit', 'clarkson', 'oakville', 'bronte', 'appleby', 'burlington', 'aldershot', 'west_harbour'] },
    { id: 'lse', name: 'Lakeshore East', color: '#EE3124', width: 8, style: 'rail',
      path: ['union', 'danforth_go', 'scarborough_go', 'eglinton_go', 'guildwood', 'rouge_hill', 'pickering', 'ajax', 'whitby', 'oshawa'] },
    { id: 'kit', name: 'Kitchener', color: '#00853F', width: 8, style: 'rail',
      path: ['union', W, W2, 'bloor_go', 'weston', 'etobicoke_north', 'malton', 'bramalea', 'brampton', 'mount_pleasant_go', 'georgetown', 'acton', 'guelph', 'kitchener'] },
    { id: 'up', name: 'UP Express', color: '#5B2C6F', width: 6, style: 'rail',
      path: ['union', W, W2, 'bloor_go', 'weston', 'pearson'] },
    { id: 'mil', name: 'Milton', color: '#F57F25', width: 8, style: 'rail',
      path: ['union', W, 'kipling', 'dixie', 'cooksville', 'erindale', 'streetsville', 'meadowvale', 'lisgar', 'milton'], bends: { 1: 'late' } },
    { id: 'bar', name: 'Barrie', color: '#003767', width: 8, style: 'rail',
      path: ['union', W, W2, 'caledonia', 'downsview_park', 'rutherford', 'maple', 'king_city', 'aurora', 'newmarket', 'east_gwillimbury', 'bradford', 'barrie_south', 'allandale'] },
    { id: 'rh', name: 'Richmond Hill', color: '#00A4E4', width: 8, style: 'rail',
      path: ['union', E1, E3, 'oriole', 'old_cummer', 'langstaff', 'richmond_hill', 'gormley', 'bloomington'] },
    { id: 'stf', name: 'Stouffville', color: '#794500', width: 8, style: 'rail',
      path: ['union', E1, E2, 'kennedy', 'agincourt', 'milliken', 'unionville', 'centennial', 'markham', 'mount_joy', 'stouffville', 'old_elm'] },
    { id: 'hur', name: 'Hurontario LRT (planned)', color: '#6B4FA1', width: 7, style: 'dashed',
      path: ['port_credit', 'cooksville', 'brampton_gateway'] },
    { id: 'ham', name: 'Hamilton LRT (planned)', color: '#0E8A8A', width: 7, style: 'dashed',
      path: ['mcmaster', 'downtown_hamilton', 'eastgate'] }
  ];

  function build() {
    const stations = {};
    for (const [id, name, x, y] of S.concat(S2)) {
      stations[id] = { id, name, nameZh: '', x, y, label: 'auto', interchange: 'auto' };
    }
    return {
      version: 1,
      title: 'GTHA Rapid Transit',
      titleZh: '大多倫多及咸美頓地區快速交通',
      stations,
      lines: L.map((l) => Object.assign({ nameZh: '', visible: true, bends: {} }, JSON.parse(JSON.stringify(l)))),
      labels: [
        { id: 'note1', x: -66, y: 18, text: 'Schematic template. Not an official map. Verify service with TTC and Metrolinx.', size: 12 }
      ]
    };
  }

  function blank() {
    return { version: 1, title: 'Untitled map', titleZh: '', stations: {}, lines: [], labels: [] };
  }

  window.GTHATemplates = { gtha: build, blank };
})();

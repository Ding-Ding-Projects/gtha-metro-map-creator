// mod-realtime.js: see docs/features/realtime.md. Registers hooks on window.GMMCX before app.js loads.
(function () {
  'use strict';
  const X = window.GMMCX = window.GMMCX || {};
  void X;
})();

// mod-coverage.js: see docs/features/coverage.md. Registers hooks on window.GMMCX before app.js loads.
(function () {
  'use strict';
  const X = window.GMMCX = window.GMMCX || {};
  void X;
})();

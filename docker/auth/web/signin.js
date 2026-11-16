// Show or hide the password. The form works without this script.
(function () {
  var eye = document.getElementById('eye');
  var pw = document.getElementById('pw');
  if (!eye || !pw) return;
  eye.addEventListener('click', function () {
    var show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    eye.setAttribute('aria-label', show ? eye.dataset.hide : eye.dataset.show);
    eye.setAttribute('aria-pressed', show ? 'true' : 'false');
    pw.focus();
  });
})();

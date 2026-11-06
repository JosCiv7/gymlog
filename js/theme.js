// Runs before the page draws, so the chosen theme never flashes. Auto follows the phone.
(function () {
  var COLORS = { light: '#F4F2ED', dark: '#141312' };
  var query = window.matchMedia('(prefers-color-scheme: dark)');

  function read() {
    try {
      return localStorage.getItem('gymlog-theme') || 'auto';
    } catch (err) {
      return 'auto';
    }
  }

  function apply(choice) {
    var root = document.documentElement;
    if (choice === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', choice);
    var dark = choice === 'dark' || (choice === 'auto' && query.matches);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? COLORS.dark : COLORS.light);
  }

  window.gymTheme = {
    get: read,
    set: function (choice) {
      try {
        localStorage.setItem('gymlog-theme', choice);
      } catch (err) {
        // Without storage the choice only lasts for this visit.
      }
      apply(choice);
    },
  };

  query.addEventListener('change', function () { apply(read()); });
  apply(read());
})();

// Runs in the page at capture time (see capture.ts tagPage). Plain JS so the bundler adds nothing.
(() => {
    const IC = {
      'Home': 'home', 'Tee sheet': 'calendar', 'Pro shop': 'bag', 'Revenue': 'dollar', 'Cancellations': 'dollar', 'Memberships': 'users',
      'Events': 'flag', 'Schedule': 'clock', 'Analytics': 'chart', 'Team': 'team', 'Settings': 'sliders', 'Support': 'message',
      'Course alert': 'alert', 'Your booking page ↗': 'external', 'Sign out': 'logout',
      'Overview': 'grid', 'Golf courses': 'pin', 'Inquiries': 'inbox', 'Onboarding': 'clipboard', 'Bookings': 'calendar', 'Golfers': 'users',
      'Expenses': 'dollar', 'Financial analytics': 'chart', 'Business analytics': 'chart', 'Course support': 'message', 'Announcements': 'megaphone',
      'Platform activity': 'activity', 'Goals': 'target', 'Audit': 'clipboard', 'Security': 'lock', 'Company docs': 'file',
    };
    const rails = Array.from(document.querySelectorAll('.op-rail, [class*="admin-glass_rail_"]'));
    for (const r of rails) {
      r.setAttribute('data-ui-rail', '');
      r.querySelectorAll('a, button').forEach(el => {
        const t = (el.textContent || '').replace(/\d+\+?$/, '').trim();
        const k = IC[t] ?? IC[(el.querySelector('span:not([aria-hidden])')?.textContent || '').trim()];
        if (k) el.setAttribute('data-ic', k);
      });
      r.querySelectorAll('input').forEach(i => { const w = i.closest('.relative') || i.parentElement; if (w && r.contains(w)) w.setAttribute('data-ui-railsearch', ''); });
      r.querySelectorAll('nav > div > div:first-child, [class*="admin-glass_grpLabel_"]').forEach(l => { if (!l.querySelector('a,button')) l.setAttribute('data-ui-glabel', ''); });
    }

    // 3: dashboard Home: the date, search and "As of" line become one header band in the sidebar's colour.
    const home = document.querySelector('.op-home');
    if (home && !home.querySelector('[data-ui-homehead]')) {
      const row = home.children[0], asof = home.children[1];
      if (row && asof && asof.tagName === 'P') {
        const band = document.createElement('div'); band.setAttribute('data-ui-homehead', '');
        home.insertBefore(band, row); band.appendChild(row); band.appendChild(asof);
      }
    }
    // 4: tee sheet: the day's number tiles (Players, On the course, …) get one row on a phone.
    document.querySelectorAll('div').forEach(d => {
      if (d.children.length === 0 && d.textContent === 'On the course') { const grid = d.parentElement && d.parentElement.parentElement; if (grid) grid.setAttribute('data-ui-stats', ''); }
    });
    // 7/8: golfer course page: a sliding "Tee times | Course information" control centred at the top.
    const cinfo = document.querySelector('[class*="_cinfo_"]');
    const top = document.querySelector('header[class*="_top_"]');
    if (cinfo && top && !document.querySelector('[data-ui-ctabs]')) {
      const wrap = document.createElement('div'); wrap.setAttribute('data-ui-ctabs', '');
      wrap.innerHTML = '<div role="tablist" aria-label="Course page"><span data-ui-thumb></span><button role="tab" aria-selected="true" data-t="times">Tee times</button><button role="tab" aria-selected="false" data-t="info">Course information</button></div>';
      top.insertAdjacentElement('afterend', wrap);
      const site = top.parentElement; site.setAttribute('data-ui-ctab', 'times');
      wrap.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        site.setAttribute('data-ui-ctab', b.dataset.t);
        wrap.querySelectorAll('button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
      }));
    }
    const found = [];
    document.querySelectorAll('input').forEach(inp => {
      const hint = `${inp.type} ${inp.placeholder} ${inp.getAttribute('aria-label') || ''} ${inp.name}`;
      if (!/search|find/i.test(hint)) return;
      if (!(inp).offsetParent) return;
      inp.setAttribute('data-ui-search', '');
      // The visible box is the nearest ancestor about as tall as the field (icon + input wrappers).
      // The visible box: the nearest element (the input or a wrapper of about the same size) that paints a fill or a border.
      const paints = (e) => { const c = getComputedStyle(e); return (c.backgroundColor !== 'rgba(0, 0, 0, 0)' && c.backgroundColor !== 'transparent') || parseFloat(c.borderTopWidth) > 0 || c.boxShadow !== 'none'; };
      let box = inp; const ir = inp.getBoundingClientRect();
      for (let a = inp; a && a !== document.body; a = a.parentElement) {
        const ar = a.getBoundingClientRect();
        if (ar.height > ir.height + 30 || ar.width > ir.width + 120) break;
        if (paints(a)) { box = a; break; }
      }
      box.setAttribute('data-ui-searchbox', '');
      found.push(hint.trim() + ' -> ' + box.tagName + '.' + (box.className || '').toString().slice(0, 60));
    });
    document.querySelectorAll('[class*="admin-glass_search_"]').forEach(b => { b.setAttribute('data-ui-searchbox', ''); found.push('admin palette button'); });
    return found;
})()

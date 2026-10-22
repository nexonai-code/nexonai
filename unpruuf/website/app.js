(() => {
  'use strict';
  const languages = ['de', 'en', 'ro'];
  const copy = {
    de: {
      title: 'unpruuf | Kommunikation in eigener Hand',
      description: 'Kommunikation und Hinweiskanäle auf eigenen Servern. Ohne Namen, ohne Konten. Unsere Lösungen mit Problem, Lösung und Unterschied.',
      openMenu: 'Menü öffnen', closeMenu: 'Menü schließen', navigation: 'Hauptnavigation',
      topics: ['Chat (unpruuf Business)', 'Meldekanäle (unpruuf Compliance)', 'Presse und Quellen', 'Krise und Zugang', 'Nachfolge und Zeit', 'Büro-KI', 'Etwas anderes'],
      alt: { server: 'Eigener Server in einem hellen Büro, Konzeptillustration', comparisonCentral: "Mehrere Geräte und Nutzerprofile hängen an einer gemeinsamen zentralen Plattform.", comparisonOwned: "Getrennte Kommunikationsbereiche mit eigenen Schlüsseln auf gemeinsam nutzbarer Kundeninfrastruktur." },
      formPrepared: 'Ihr E-Mail-Entwurf ist vorbereitet. Öffnen Sie Ihre E-Mail-App oder kopieren Sie den Text. Die Anfrage wurde noch nicht versendet.',
      email: 'E-Mail-App öffnen', copy: 'Anfrage kopieren', copied: 'Text kopiert. Senden Sie ihn an unpruuf@nexonai.ro.',
      fallback: 'Markieren Sie den Text unten und kopieren Sie ihn in Ihre E-Mail-App.',
      subject: 'Anfrage zu unpruuf',
      fields: ['Name', 'E-Mail', 'Organisation', 'Thema', 'Problem'],
      empty: 'Keine weiteren Angaben', privacy: 'Besprechen Sie vertrauliche Informationen nur über einen vereinbarten sicheren Kanal.'
    },
    en: {
      title: 'unpruuf | Communication in your own hands',
      description: 'Communication and reporting channels on your own servers. No names, no accounts. Our solutions with problem, solution and difference.',
      openMenu: 'Open menu', closeMenu: 'Close menu', navigation: 'Main navigation',
      topics: ['Chat (unpruuf Business)', 'Reporting channels (unpruuf Compliance)', 'Press and sources', 'Crisis and access', 'Succession and time', 'Office AI', 'Something else'],
      alt: { server: 'A dedicated server in a bright office, concept illustration', comparisonCentral: "Several devices and user profiles depend on a shared central platform.", comparisonOwned: "Separate communication spaces with their own keys on customer infrastructure that can be shared." },
      formPrepared: 'Your e-mail draft is ready. Open your e-mail app or copy the text. The request has not been sent yet.',
      email: 'Open e-mail app', copy: 'Copy request', copied: 'Text copied. Send it to unpruuf@nexonai.ro.',
      fallback: 'Select the text below and copy it into your e-mail app.',
      subject: 'Enquiry about unpruuf',
      fields: ['Name', 'E-mail', 'Organisation', 'Topic', 'Problem'],
      empty: 'No further details', privacy: 'Discuss confidential information only through an agreed secure channel.'
    },
    ro: {
      title: 'unpruuf | Comunicarea în mâinile tale',
      description: 'Comunicare și canale de raportare pe servere proprii. Fără nume, fără conturi. Soluțiile noastre cu problemă, soluție și diferență.',
      openMenu: 'Deschide meniul', closeMenu: 'Închide meniul', navigation: 'Navigare principală',
      topics: ['Chat (unpruuf Business)', 'Canale de raportare (unpruuf Compliance)', 'Presă și surse', 'Criză și acces', 'Succesiune și timp', 'AI de birou', 'Altceva'],
      alt: { server: 'Server propriu într-un birou luminos, ilustrație conceptuală', comparisonCentral: "Mai multe dispozitive și profiluri de utilizator depind de o platformă centrală comună.", comparisonOwned: "Spații de comunicare separate, cu chei proprii, pe infrastructura clientului care poate fi comună." },
      formPrepared: 'Ciorna de e-mail este pregătită. Deschide aplicația de e-mail sau copiază textul. Solicitarea nu a fost încă trimisă.',
      email: 'Deschide aplicația de e-mail', copy: 'Copiază solicitarea', copied: 'Text copiat. Trimite-l la unpruuf@nexonai.ro.',
      fallback: 'Selectează textul de mai jos și copiază-l în aplicația de e-mail.',
      subject: 'Solicitare despre unpruuf',
      fields: ['Nume', 'E-mail', 'Organizație', 'Subiect', 'Problemă'],
      empty: 'Fără detalii suplimentare', privacy: 'Discută informațiile confidențiale doar printr-un canal securizat convenit.'
    }
  };
  const menu = document.getElementById('mobile-nav');
  const menuButton = document.getElementById('menu-toggle');
  const form = document.getElementById('auditForm');
  let language = 'de';
  let requestText = '';
  function setMenu(open) {
    menu.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', copy[language][open ? 'closeMenu' : 'openMenu']);
  }
  function setLanguage(value) {
    language = languages.includes(value) ? value : 'de';
    const strings = copy[language];
    document.documentElement.lang = language;
    document.documentElement.dataset.lang = language;
    const state = document.getElementById('page-lang-' + language);
    if (state) state.checked = true;
    document.title = strings.title;
    document.querySelector('meta[name="description"]').content = strings.description;
    for (const code of languages) {
      const button = document.getElementById('lang-btn-' + code);
      button.classList.toggle('lang-active', code === language);
      button.setAttribute('aria-pressed', String(code === language));
    }
    const topic = document.getElementById('contact-topic');
    const previous = topic.selectedIndex;
    topic.replaceChildren(...strings.topics.map((label, index) => {
      const option = document.createElement('option'); option.value = String(index); option.textContent = label; return option;
    }));
    topic.selectedIndex = Math.min(Math.max(previous, 0), strings.topics.length - 1);
    document.querySelectorAll('[data-alt-key]').forEach(image => image.alt = strings.alt[image.dataset.altKey]);
    document.querySelectorAll('nav').forEach(nav => nav.setAttribute('aria-label', strings.navigation));
    document.getElementById('copy-request').textContent = strings.copy;
    document.getElementById('email-draft').textContent = strings.email;
    if (!document.getElementById('form-result').hidden) prepareRequest();
    setMenu(false);
    document.querySelectorAll('.nav-drop').forEach(el => el.open = false);
    try { localStorage.setItem('nexonai-lang', language); } catch { /* Private browsing can disable storage. */ }
    try { const url = new URL(location.href); url.searchParams.set('lang', language); history.replaceState(null, '', url); } catch { /* Local content URI may prohibit history changes. */ }
  }
  window.setLanguage = setLanguage;
  document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => setLanguage(button.dataset.language)));
  document.querySelectorAll('.language-state').forEach(radio => radio.addEventListener('change', () => { if (radio.checked) setLanguage(radio.value); }));
  menuButton.addEventListener('click', () => setMenu(menu.hidden));
  menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !menu.hidden) { setMenu(false); menuButton.focus(); } });
  document.addEventListener('click', event => { if (!menu.hidden && !event.target.closest('header')) setMenu(false); });
  const wideScreen = matchMedia('(min-width:1100px)');
  const closeWideMenu = event => { if (event.matches) setMenu(false); };
  if (wideScreen.addEventListener) wideScreen.addEventListener('change', closeWideMenu);
  else if (wideScreen.addListener) wideScreen.addListener(closeWideMenu);
  function prepareRequest() {
    const strings = copy[language];
    const values = new FormData(form);
    const topic = document.getElementById('contact-topic');
    const items = [values.get('name'), values.get('email'), values.get('organization'), topic.options[topic.selectedIndex].textContent, values.get('message') || strings.empty];
    requestText = strings.subject + '\n\n' + items.map((value, index) => strings.fields[index] + ': ' + String(value).trim()).join('\n\n') + '\n\n' + strings.privacy;
    document.getElementById('email-draft').href = 'mailto:unpruuf@nexonai.ro?subject=' + encodeURIComponent(strings.subject) + '&body=' + encodeURIComponent(requestText);
    document.getElementById('email-draft').textContent = strings.email;
    document.getElementById('copy-request').textContent = strings.copy;
    document.getElementById('form-result-text').textContent = strings.formPrepared;
    document.getElementById('form-result').hidden = false;
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    prepareRequest();
    document.getElementById('form-result').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
    document.getElementById('email-draft').focus({ preventScroll: true });
  });
  document.getElementById('copy-request').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(requestText);
      document.getElementById('form-result-text').textContent = copy[language].copied;
    } catch {
      document.getElementById('form-result-text').textContent = copy[language].fallback;
      let area = document.getElementById('request-copy-fallback');
      if (!area) { area = document.createElement('textarea'); area.id = 'request-copy-fallback'; area.rows = 10; area.readOnly = true; document.getElementById('form-result').append(area); }
      area.setAttribute('aria-label', copy[language].copy); area.value = requestText; area.focus(); area.select();
    }
  });
  let selected = document.documentElement.getAttribute('data-fixed-language') || new URLSearchParams(location.search).get('lang');
  if (!languages.includes(selected)) { try { selected = localStorage.getItem('nexonai-lang'); } catch {} }
  setLanguage(languages.includes(selected) ? selected : 'de');
})();

document.querySelectorAll('.nav-drop a').forEach(a => a.addEventListener('click', () => a.closest('details').open = false));
document.addEventListener('click',e=>{if(!e.target.closest('.nav-drop'))document.querySelectorAll('.nav-drop').forEach(d=>d.open=false);});
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.nav-drop').forEach(d=>d.open=false);});
document.querySelectorAll('a[href^="#g"]').forEach(a=>a.addEventListener('click',()=>{const d=document.querySelector(a.getAttribute('href'));if(d?.tagName==='DETAILS')d.open=true;}));
if(/^#g[1-6]$/.test(location.hash)){document.querySelector(location.hash).open=true;}

(() => {
  const track = document.getElementById('security-track');
  const previous = document.getElementById('security-prev');
  const next = document.getElementById('security-next');
  if (!track || !previous || !next) return;
  const labels = {de:['Vorherige Sicherheitsprinzipien','Nächste Sicherheitsprinzipien','Sicherheitsprinzipien'],en:['Previous security principles','Next security principles','Security principles'],ro:['Principiile anterioare','Principiile următoare','Principii de securitate']};
  const update = () => {
    const strings=labels[document.documentElement.lang] || labels.de;
    previous.setAttribute('aria-label', strings[0]);next.setAttribute('aria-label', strings[1]);track.setAttribute('aria-label',strings[2]);
    previous.disabled = track.scrollLeft < 4;
    next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
  };
  const move = direction => {
    const card=track.querySelector('.security-card');
    const gap=parseFloat(getComputedStyle(track).gap)||24;
    track.scrollBy({left:direction*(card.getBoundingClientRect().width+gap),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant':'smooth'});
  };
  previous.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));
  track.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',update);
  track.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();move(e.key==='ArrowLeft'?-1:1);}});
  new MutationObserver(update).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(update).observe(track);
  update();
})();

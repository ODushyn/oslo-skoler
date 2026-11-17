// Look of the site: the theme (Blå or Grønn, chosen under "Tema" at the bottom of the "Meny" dropdown, so it
// does not take room in the header). The themes are Digdir's Designsystemet themes: the green Designsystemet
// theme is the default (it is also the one in the page's <link id="dsTheme">, so it loads without a swap) and
// the blue is Altinn's brand theme. The site uses the theme's brand1 colour. The menu names the themes by
// colour, not by the agencies they were made for, so the site does not look as if it belongs to them.
// The site is always light (data-color-scheme="light" on <html>), with OpenFreeMap's light base map.
// The choice is kept in this browser (localStorage). Loaded right after the theme stylesheet in <head>,
// so it is in place before first paint.
// Scripts run: the school page shows its loading placeholder instead of the static text it replaces (styles.css)
document.documentElement.classList.add('js');

const THEME = (() => {
    const STORAGE_KEY = 'skolekartet.tema';
    const DEFAULT = 'designsystemet';
    const THEMES = [
        { id: 'designsystemet', name: 'Grønn', href: 'https://cdn.jsdelivr.net/npm/@digdir/designsystemet-css@1.24.0/dist/theme/designsystemet.css',
          integrity: 'sha384-CaMwhtl194lwIHkKMzv8JlvkIRiAlHAofG5leTwGh0/Uy5Kirvvx5Rus42qj77J8' },
        { id: 'altinn', name: 'Blå', href: 'https://cdn.jsdelivr.net/npm/@digdir/designsystemet-theme@1.11.0/brand/altinn.css',
          integrity: 'sha384-10JjCex1jGBJLom9HfIfF8Ymoqd40FK4QYr1oKBDmIIlqsqB2lVYLfzDw6KTCuve' }
    ];
    const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
    const link = document.getElementById('dsTheme');

    function read(key) {
        try {
            return localStorage.getItem(key);
        } catch (error) {
            return null; // Storage blocked: the defaults
        }
    }

    function write(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (error) {
            // Storage blocked: the choice still applies to this page
        }
    }

    // ── Visning (Figma D1): text size, contrast and motion (data saving and «Lytt» come with the pages that use them) ──
    // Kept in this browser. What the browser or the phone already says (higher contrast, less motion) is the
    // default, so people who have set it there do not have to set it again.
    const DISPLAY_KEY = 'skolekartet.visning';
    const media = query => (window.matchMedia ? window.matchMedia(query).matches : false);
    const DISPLAY_DEFAULTS = {
        text: 'normal',                                            // normal | stor | ekstra
        contrast: media('(prefers-contrast: more)') ? 'hoy' : 'standard',
        motion: media('(prefers-reduced-motion: reduce)'),         // less movement and animation
        saveData: false,                                           // the map only when asked for
        listen: true                                               // the «Lytt til siden» button on information pages
    };
    function readDisplay() {
        try {
            const saved = JSON.parse(read(DISPLAY_KEY) || '{}') || {};
            return {
                text: ['normal', 'stor', 'ekstra'].includes(saved.text) ? saved.text : DISPLAY_DEFAULTS.text,
                contrast: ['standard', 'hoy'].includes(saved.contrast) ? saved.contrast : DISPLAY_DEFAULTS.contrast,
                motion: typeof saved.motion === 'boolean' ? saved.motion : DISPLAY_DEFAULTS.motion,
                saveData: typeof saved.saveData === 'boolean' ? saved.saveData : DISPLAY_DEFAULTS.saveData,
                listen: typeof saved.listen === 'boolean' ? saved.listen : DISPLAY_DEFAULTS.listen
            };
        } catch (error) {
            return { ...DISPLAY_DEFAULTS };
        }
    }
    let display = readDisplay();
    function applyDisplay() {
        const root = document.documentElement;
        root.dataset.text = display.text;
        root.dataset.contrast = display.contrast;
        root.dataset.motion = display.motion ? 'less' : 'normal';
        root.dataset.listen = display.listen ? 'on' : 'off';
        root.dataset.savedata = display.saveData ? 'on' : 'off';
    }
    applyDisplay();

    let current = THEMES.some(theme => theme.id === read(STORAGE_KEY)) ? read(STORAGE_KEY) : DEFAULT;
    apply(current);
    // Dark mode is gone: forget a choice saved while it existed
    try {
        localStorage.removeItem('skolekartet.modus');
    } catch (error) {
        // Storage blocked: nothing saved
    }

    function apply(id) {
        const theme = THEMES.find(item => item.id === id) || THEMES.find(item => item.id === DEFAULT);
        current = theme.id;
        // Subresource Integrity: the browser only uses the file if it is exactly the one we checked
        if (link && link.getAttribute('href') !== theme.href) {
            link.setAttribute('integrity', theme.integrity);
            link.setAttribute('crossorigin', 'anonymous');
            link.setAttribute('href', theme.href);
        }
        document.documentElement.dataset.theme = theme.id;
    }

    function choose(id) {
        apply(id);
        write(STORAGE_KEY, id);
        document.querySelectorAll('.theme-menu__item').forEach(item => {
            if (item.dataset.theme === current) item.setAttribute('aria-current', 'true');
            else item.removeAttribute('aria-current');
        });
    }

    // D1 «Visning»: the panel opened from the «Visning» button (and shown at the bottom of «Meny» on phones)
    const segment = (group, value, label, on) => `<button type="button" class="seg__item" role="radio" aria-checked="${on}" data-display="${group}" data-value="${value}">${t(label)}</button>`;
    const segmented = (group, title, items, active) => `<div class="display-field" role="radiogroup" aria-label="${t(title)}"><h3 class="display-field__title">${t(title)}</h3>
            <div class="seg">${items.map(([value, label]) => segment(group, value, label, value === active)).join('')}</div></div>`;
    const toggle = (group, label, on) => `<div class="display-switch"><span id="sw-${group}">${t(label)}</span>
            <button type="button" class="switch" role="switch" aria-checked="${on}" aria-labelledby="sw-${group}" data-switch="${group}"><span class="switch__knob"></span></button></div>`;
    function panelHtml() {
        return `<div class="display-panel">
            <div class="display-panel__head"><h2 class="display-panel__title">${t('Visning')}</h2><span class="display-panel__rule" aria-hidden="true"></span>
                <button type="button" class="display-panel__close" data-display-close><svg class="ds-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M7 7l10 10M17 7 7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><span>${t('Lukk')}</span></button></div>
            ${segmented('text', 'Tekststørrelse', [['normal', 'Normal'], ['stor', 'Stor'], ['ekstra', 'Ekstra stor']], display.text)}
            ${segmented('contrast', 'Kontrast', [['standard', 'Standard'], ['hoy', 'Høy kontrast']], display.contrast)}
            ${segmented('theme', 'Fargetema', THEMES.map(theme => [theme.id, theme.name]), current)}
            ${toggle('motion', 'Mindre bevegelse og animasjon', display.motion)}
            <p class="display-panel__note">${t('Innstillingene huskes på denne enheten. Du kan også bruke innstillingene i nettleseren eller telefonen – vi følger dem automatisk.')}</p>
        </div>`;
    }

    function syncPanels() {
        document.querySelectorAll('[data-display]').forEach(button => {
            const group = button.dataset.display;
            const active = group === 'theme' ? current : display[group];
            button.setAttribute('aria-checked', String(button.dataset.value === active));
        });
        document.querySelectorAll('[data-switch]').forEach(button => button.setAttribute('aria-checked', String(Boolean(display[button.dataset.switch]))));
    }

    function setDisplay(group, value) {
        if (group === 'theme') choose(value);
        else {
            display = { ...display, [group]: value };
            write(DISPLAY_KEY, JSON.stringify(display));
            applyDisplay();
        }
        syncPanels();
        document.dispatchEvent(new CustomEvent('displaychange', { detail: { group, value } }));
    }

    document.addEventListener('click', event => {
        const option = event.target.closest('[data-display]');
        if (option) { setDisplay(option.dataset.display, option.dataset.value); return; }
        const sw = event.target.closest('[data-switch]');
        if (sw) { setDisplay(sw.dataset.switch, !display[sw.dataset.switch]); return; }
        const close = event.target.closest('[data-display-close]');
        if (close) { const box = close.closest('[popover]'); if (box && box.hidePopover) box.hidePopover(); }
    });

    return {
        panelHtml,
        get display() { return display; },
        mapStyle: () => MAP_STYLE,
        get current() { return current; }
    };
})();

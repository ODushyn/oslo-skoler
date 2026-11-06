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
        { id: 'designsystemet', name: 'Grønn', href: 'https://cdn.jsdelivr.net/npm/@digdir/designsystemet-css@1.23.0/dist/theme/designsystemet.css',
          integrity: 'sha384-IT4guVJwkq1uL/GwNWhv2zk3uUZ18gRVe1qOVMWTTjaEkDut+i02gT9l/cnPrDSm' },
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

    // At the bottom of the "Meny" dropdown, under "Tema": the two themes, each with a dot in its brand1 colour
    function menuItemsHtml() {
        const items = THEMES.map(theme => `<li><button type="button" class="ds-button theme-menu__item" data-variant="tertiary" data-size="sm"
                data-theme="${theme.id}"${theme.id === current ? ' aria-current="true"' : ''}>
                <span class="theme-menu__dot theme-menu__dot--${theme.id}" aria-hidden="true"></span><span>${t(theme.name)}</span></button></li>`).join('');
        return `<h2 class="site-menu__heading">${t('Tema')}</h2><ul>${items}</ul>`;
    }

    document.addEventListener('click', event => {
        const item = event.target.closest('.theme-menu__item');
        if (!item) return;
        choose(item.dataset.theme);
    });

    return {
        menuItemsHtml,
        mapStyle: () => MAP_STYLE,
        get current() { return current; }
    };
})();

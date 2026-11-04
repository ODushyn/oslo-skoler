// Look of the site: the theme (Blå or Grønn, chosen under "Tema" at the bottom of the "Meny" dropdown, so it
// does not take room in the header) and light or dark mode (the sun/moon button in the header).
// Both are Designsystemet's own. The themes are Digdir's: the green Designsystemet theme is the default
// (it is also the one in the page's <link id="dsTheme">, so it loads without a swap) and the blue is
// Altinn's brand theme. Dark mode is Designsystemet's data-color-scheme="dark", and the map switches to OpenFreeMap's
// dark style. The site uses the theme's brand1 colour. The menu names the themes by colour, not by the
// agencies they were made for, so the site does not look as if it belongs to them.
// Both choices are kept in this browser (localStorage). Loaded right after the theme stylesheet in
// <head>, so they are in place before first paint.
const THEME = (() => {
    const STORAGE_KEY = 'skolekartet.tema';
    const SCHEME_KEY = 'skolekartet.modus';
    const DEFAULT = 'designsystemet';
    const THEMES = [
        { id: 'designsystemet', name: 'Grønn', href: 'https://cdn.jsdelivr.net/npm/@digdir/designsystemet-css@1.23.0/dist/theme/designsystemet.css' },
        { id: 'altinn', name: 'Blå', href: 'https://cdn.jsdelivr.net/npm/@digdir/designsystemet-theme@1.11.0/brand/altinn.css' }
    ];
    const MAP_STYLES = {
        light: 'https://tiles.openfreemap.org/styles/liberty',
        dark: 'https://tiles.openfreemap.org/styles/dark'
    };
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
    let scheme = read(SCHEME_KEY) === 'dark' ? 'dark' : 'light';
    apply(current);
    applyScheme(scheme);

    function apply(id) {
        const theme = THEMES.find(item => item.id === id) || THEMES.find(item => item.id === DEFAULT);
        current = theme.id;
        if (link && link.getAttribute('href') !== theme.href) link.setAttribute('href', theme.href);
        document.documentElement.dataset.theme = theme.id;
    }

    function applyScheme(value) {
        scheme = value;
        document.documentElement.setAttribute('data-color-scheme', value);
    }

    function choose(id) {
        apply(id);
        write(STORAGE_KEY, id);
        document.querySelectorAll('.theme-menu__item').forEach(item => {
            if (item.dataset.theme === current) item.setAttribute('aria-current', 'true');
            else item.removeAttribute('aria-current');
        });
    }

    // Light ⇄ dark; the maps listen for "colorscheme" and change their base map
    function toggleScheme() {
        applyScheme(scheme === 'dark' ? 'light' : 'dark');
        write(SCHEME_KEY, scheme);
        document.querySelectorAll('.scheme-switch').forEach(button => { button.outerHTML = schemeButtonHtml(); });
        document.dispatchEvent(new CustomEvent('colorscheme', { detail: scheme }));
    }

    // "Sun" and "Moon" from Aksel icons by Nav (MIT licence)
    const SUN = '<svg class="ds-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 1.75C12.4142 1.75 12.75 2.08579 12.75 2.5V4.5C12.75 4.91421 12.4142 5.25 12 5.25C11.5858 5.25 11.25 4.91421 11.25 4.5V2.5C11.25 2.08579 11.5858 1.75 12 1.75ZM4.75238 4.75214C5.04528 4.45925 5.52015 4.45925 5.81305 4.75214L7.22726 6.16635C7.52015 6.45925 7.52015 6.93412 7.22726 7.22701C6.93437 7.51991 6.45949 7.51991 6.1666 7.22701L4.75238 5.8128C4.45949 5.51991 4.45949 5.04503 4.75238 4.75214ZM1.75 12C1.75 11.5858 2.08579 11.25 2.5 11.25H4.5C4.91421 11.25 5.25 11.5858 5.25 12C5.25 12.4142 4.91421 12.75 4.5 12.75H2.5C2.08579 12.75 1.75 12.4142 1.75 12ZM19.5 11.25C19.0858 11.25 18.75 11.5858 18.75 12C18.75 12.4142 19.0858 12.75 19.5 12.75H21.5C21.9142 12.75 22.25 12.4142 22.25 12C22.25 11.5858 21.9142 11.25 21.5 11.25H19.5ZM16.7729 16.773C17.0658 16.4801 17.5407 16.4801 17.8336 16.773L19.2478 18.1872C19.5407 18.4801 19.5407 18.955 19.2478 19.2479C18.9549 19.5408 18.48 19.5408 18.1871 19.2479L16.7729 17.8337C16.48 17.5408 16.48 17.0659 16.7729 16.773ZM8.25 12C8.25 9.92893 9.92893 8.25 12 8.25C14.0711 8.25 15.75 9.92893 15.75 12C15.75 14.0711 14.0711 15.75 12 15.75C9.92893 15.75 8.25 14.0711 8.25 12ZM12 6.75C9.1005 6.75 6.75 9.1005 6.75 12C6.75 14.8995 9.1005 17.25 12 17.25C14.8995 17.25 17.25 14.8995 17.25 12C17.25 9.1005 14.8995 6.75 12 6.75ZM19.2476 5.8128C19.5405 5.51991 19.5405 5.04503 19.2476 4.75214C18.9547 4.45925 18.4798 4.45925 18.187 4.75214L16.7727 6.16635C16.4798 6.45925 16.4798 6.93412 16.7727 7.22701C17.0656 7.51991 17.5405 7.51991 17.8334 7.22701L19.2476 5.8128ZM12 18.75C12.4142 18.75 12.75 19.0858 12.75 19.5V21.5C12.75 21.9142 12.4142 22.25 12 22.25C11.5858 22.25 11.25 21.9142 11.25 21.5V19.5C11.25 19.0858 11.5858 18.75 12 18.75ZM7.22711 17.8337C7.52 17.5408 7.52 17.0659 7.22711 16.773C6.93421 16.4801 6.45934 16.4801 6.16645 16.773L4.75223 18.1872C4.45934 18.4801 4.45934 18.955 4.75223 19.2479C5.04513 19.5408 5.52 19.5408 5.81289 19.2479L7.22711 17.8337Z" fill="currentColor"/></svg>';
    const MOON = '<svg class="ds-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path fill-rule="evenodd" clip-rule="evenodd" d="M14.8238 3.11549C15.0363 2.90303 15.3551 2.83787 15.6338 2.94991C19.2176 4.39011 21.75 7.89842 21.75 12C21.75 17.3848 17.3848 21.75 12 21.75C7.8984 21.75 4.3901 19.2176 2.9499 15.6339C2.83786 15.3551 2.90302 15.0363 3.11547 14.8239C3.32793 14.6114 3.64668 14.5462 3.92547 14.6583C4.87464 15.0397 5.91184 15.25 6.99999 15.25C11.5563 15.25 15.25 11.5564 15.25 7C15.25 5.91185 15.0397 4.87465 14.6583 3.92548C14.5462 3.64669 14.6114 3.32795 14.8238 3.11549ZM16.5708 5.13072C16.6884 5.73604 16.75 6.36106 16.75 7C16.75 12.3848 12.3848 16.75 6.99999 16.75C6.36105 16.75 5.73603 16.6884 5.1307 16.5709C6.61 18.7895 9.13505 20.25 12 20.25C16.5563 20.25 20.25 16.5564 20.25 12C20.25 9.13507 18.7895 6.61002 16.5708 5.13072Z" fill="currentColor"/></svg>';

    // The header button: a moon in light mode, a sun in dark mode, named by what it does
    function schemeButtonHtml() {
        const label = t(scheme === 'dark' ? 'Bytt til lys modus' : 'Bytt til mørk modus');
        return `<button type="button" class="ds-button scheme-switch" data-variant="tertiary" data-size="sm" data-icon
                        aria-label="${label}" data-tooltip="${label}">${scheme === 'dark' ? SUN : MOON}</button>`;
    }

    // At the bottom of the "Meny" dropdown, under "Tema": the two themes, each with a dot in its brand1 colour
    function menuItemsHtml() {
        const items = THEMES.map(theme => `<li><button type="button" class="ds-button theme-menu__item" data-variant="tertiary" data-size="sm"
                data-theme="${theme.id}"${theme.id === current ? ' aria-current="true"' : ''}>
                <span class="theme-menu__dot theme-menu__dot--${theme.id}" aria-hidden="true"></span><span>${t(theme.name)}</span></button></li>`).join('');
        return `<h2 class="site-menu__heading">${t('Tema')}</h2><ul>${items}</ul>`;
    }

    document.addEventListener('click', event => {
        if (event.target.closest('.scheme-switch')) {
            toggleScheme();
            const button = document.querySelector('.scheme-switch');
            if (button) button.focus();
            return;
        }
        const item = event.target.closest('.theme-menu__item');
        if (!item) return;
        choose(item.dataset.theme);
    });

    return {
        schemeButtonHtml,
        menuItemsHtml,
        mapStyle: () => MAP_STYLES[scheme],
        get current() { return current; },
        get scheme() { return scheme; }
    };
})();

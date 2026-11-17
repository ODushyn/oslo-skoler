// Shared header and footer for all pages (index and the info pages).
// Loaded right after the header placeholder so the header is in place before first paint.
(function () {
    const ICONS = {
        // The backpack before the hat in the logo: barneskole, then ungdomsskole, as on the map markers
        "logoBackpack": "<svg class=\"site-logo__icon site-logo__icon--backpack\" viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M10.75 4.5C10.75 4.36193 10.8619 4.25 11 4.25H13C13.1381 4.25 13.25 4.36193 13.25 4.5V5.25534C13.1671 5.25179 13.0838 5.25 13 5.25H11C10.9162 5.25 10.8329 5.25179 10.75 5.25534V4.5ZM9.25 5.52115V4.5C9.25 3.5335 10.0335 2.75 11 2.75H13C13.9665 2.75 14.75 3.5335 14.75 4.5V5.52115C17.0699 6.26153 18.75 8.43456 18.75 11V12.25H19C20.5188 12.25 21.75 13.4812 21.75 15V18C21.75 18.9665 20.9665 19.75 20 19.75H18.75V20C18.75 20.9665 17.9665 21.75 17 21.75H7C6.0335 21.75 5.25 20.9665 5.25 20V19.75H4C3.0335 19.75 2.25 18.9665 2.25 18V15C2.25 13.4812 3.48122 12.25 5 12.25H5.25V11C5.25 8.43456 6.93008 6.26153 9.25 5.52115ZM19 13.75C18.8619 13.75 18.75 13.8619 18.75 14V18C18.75 18.1381 18.8619 18.25 19 18.25H20C20.1381 18.25 20.25 18.1381 20.25 18V15C20.25 14.3096 19.6904 13.75 19 13.75ZM3.75 15C3.75 14.3096 4.30964 13.75 5 13.75C5.13807 13.75 5.25 13.8619 5.25 14V18C5.25 18.1381 5.13807 18.25 5 18.25H4C3.86193 18.25 3.75 18.1381 3.75 18V15ZM9.25 10C9.25 9.58579 9.58579 9.25 10 9.25H14C14.4142 9.25 14.75 9.58579 14.75 10C14.75 10.4142 14.4142 10.75 14 10.75H10C9.58579 10.75 9.25 10.4142 9.25 10ZM10 13.25C9.0335 13.25 8.25 14.0335 8.25 15V17C8.25 17.9665 9.0335 18.75 10 18.75H14C14.9665 18.75 15.75 17.9665 15.75 17V15C15.75 14.0335 14.9665 13.25 14 13.25H10ZM9.75 15C9.75 14.8619 9.86193 14.75 10 14.75H14C14.1381 14.75 14.25 14.8619 14.25 15V17C14.25 17.1381 14.1381 17.25 14 17.25H10C9.86193 17.25 9.75 17.1381 9.75 17V15Z\" fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"currentColor\"/></svg>",
        "logo": "<svg class=\"site-logo__icon\" viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M11.6954 4.31464C11.8893 4.22845 12.1107 4.22845 12.3046 4.31464L21.2889 8.30768C21.3525 8.33423 21.4116 8.36926 21.4648 8.41136C21.5016 8.4404 21.5354 8.4727 21.5658 8.50771C21.6805 8.63944 21.75 8.81161 21.75 9V16C21.75 16.4142 21.4142 16.75 21 16.75C20.5858 16.75 20.25 16.4142 20.25 16V10.1541L12.3046 13.6854C12.1107 13.7715 11.8893 13.7715 11.6954 13.6854L2.6954 9.68536C2.42455 9.56498 2.25 9.29639 2.25 9C2.25 8.70361 2.42455 8.43502 2.6954 8.31464L11.6954 4.31464ZM5.25 12.7054C5.25 12.5245 5.43621 12.4035 5.60153 12.477L11.6954 15.1854C11.8893 15.2715 12.1107 15.2715 12.3046 15.1854L18.3985 12.477C18.5638 12.4035 18.75 12.5245 18.75 12.7054V16C18.75 16.2841 18.5895 16.5438 18.3354 16.6708L18.1492 16.7639C14.2782 18.6994 9.72182 18.6994 5.85081 16.7639L5.66459 16.6708C5.4105 16.5438 5.25 16.2841 5.25 16V12.7054Z\" fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"currentColor\"/></svg>",
        "mail": "<svg class=\"ds-icon\" viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M3 5.25C2.58579 5.25 2.25 5.58579 2.25 6V19C2.25 19.4142 2.58579 19.75 3 19.75H21C21.4142 19.75 21.75 19.4142 21.75 19V6C21.75 5.58579 21.4142 5.25 21 5.25H3ZM3.75 17.1893L9.02277 11.9166L3.75 8.40139V17.1893ZM10.2956 12.7651L4.81066 18.25H19.1893L13.7044 12.7651L12.416 13.624C12.1641 13.792 11.8359 13.792 11.584 13.624L10.2956 12.7651ZM14.9772 11.9166L20.25 8.40139V17.1893L14.9772 11.9166ZM3.97708 6.75L12 12.0986L20.0229 6.75H3.97708Z\" fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"currentColor\"/></svg>",
        "bookmark": "<svg class=\"ds-icon\" viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M8 4.75C7.86193 4.75 7.75 4.86193 7.75 5V18.1893L11.4697 14.4697C11.7626 14.1768 12.2374 14.1768 12.5303 14.4697L16.25 18.1893V5C16.25 4.86193 16.1381 4.75 16 4.75H8ZM6.25 5C6.25 4.0335 7.0335 3.25 8 3.25H16C16.9665 3.25 17.75 4.0335 17.75 5V20C17.75 20.3033 17.5673 20.5768 17.287 20.6929C17.0068 20.809 16.6842 20.7448 16.4697 20.5303L12 16.0607L7.53033 20.5303C7.31583 20.7448 6.99324 20.809 6.71299 20.6929C6.43273 20.5768 6.25 20.3033 6.25 20V5Z\" fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"currentColor\"/></svg>",
        "back": "<svg class=\"ds-icon\" viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M8.96973 6.96973C9.26262 6.67684 9.73738 6.67685 10.0303 6.96973C10.3232 7.26262 10.3232 7.73738 10.0303 8.03027L6.81055 11.25H19C19.4142 11.25 19.75 11.5858 19.75 12C19.75 12.4142 19.4142 12.75 19 12.75H6.81055L10.0303 15.9697C10.3232 16.2626 10.3232 16.7374 10.0303 17.0303C9.73738 17.3232 9.26262 17.3232 8.96973 17.0303L4.46973 12.5303C4.32907 12.3896 4.25 12.1989 4.25 12C4.25 11.8011 4.32907 11.6104 4.46973 11.4697L8.96973 6.96973Z\" fill=\"currentColor\"/></svg>"
    };

    // "ChevronUp" from Aksel icons by Nav (MIT licence)
    const ICON_UP = "<svg class=\"ds-icon\" viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M11.4697 7.96967C11.7626 7.67678 12.2374 7.67678 12.5303 7.96967L18.0303 13.4697C18.3232 13.7626 18.3232 14.2374 18.0303 14.5303C17.7374 14.8232 17.2626 14.8232 16.9697 14.5303L12 9.56066L7.03033 14.5303C6.73744 14.8232 6.26256 14.8232 5.96967 14.5303C5.67678 14.2374 5.67678 13.7626 5.96967 13.4697L11.4697 7.96967Z\" fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"currentColor\"/></svg>";

    // "MenuHamburger" from Aksel icons by Nav (MIT licence)
    const ICON_MENU = '<svg class="ds-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M2.75 6C2.75 5.58579 3.08579 5.25 3.5 5.25H20.5C20.9142 5.25 21.25 5.58579 21.25 6C21.25 6.41421 20.9142 6.75 20.5 6.75H3.5C3.08579 6.75 2.75 6.41421 2.75 6ZM2.75 12C2.75 11.5858 3.08579 11.25 3.5 11.25H20.5C20.9142 11.25 21.25 11.5858 21.25 12C21.25 12.4142 20.9142 12.75 20.5 12.75H3.5C3.08579 12.75 2.75 12.4142 2.75 12ZM3.5 17.25C3.08579 17.25 2.75 17.5858 2.75 18C2.75 18.4142 3.08579 18.75 3.5 18.75H20.5C20.9142 18.75 21.25 18.4142 21.25 18C21.25 17.5858 20.9142 17.25 20.5 17.25H3.5Z" fill-rule="evenodd" clip-rule="evenodd" fill="currentColor"/></svg>';

    // The map page opens on Oslo and the area around it
    const KART_HREF = 'kart#59.92011,10.61440,10.5';

    // All pages in one menu ("Meny"), grouped as on Digdir's own sites. The school pages only have
    // what is about the school; the general information is on these pages.
    const MENU = [
        { heading: 'Finn skole', links: [
            { href: './', label: 'Skolekartet' },
            { href: './?lagrede=1', label: 'Lagrede skoler' },
            { href: KART_HREF, label: 'Kart med kartlag og måling' },
            { href: 'skoler/', label: 'Skoler etter kommune' }
        ] },
        { heading: 'For foreldre', links: [
            { href: 'om-skolekrets', label: 'Om skolekrets' },
            { href: 'skolefritid', label: 'SFO og AKS' },
            { href: 'skolehverdag', label: 'Mat og aktiviteter' },
            { href: 'ny-i-norge', label: 'Ny i Norge' }
        ] },
        { heading: 'Om tjenesten', links: [
            { href: 'om-skolekartet', label: 'Om Skolekartet' },
            { href: 'om-fargefordelingen', label: 'Om fargefordelingen' },
            { href: 'datakilder', label: 'Datakilder' },
            { href: 'tilbakemelding', label: 'Tilbakemelding' }
        ] }
    ];

    // This page's path from the site's root ("" for the front page; the pages under skoler/ match no link)
    const current = typeof I18N !== 'undefined' ? I18N.page : location.pathname.split('/').pop().replace(/(index)?\.html$/, '');
    const ariaCurrent = href => (href.split('#')[0] === current ? ' aria-current="page"' : '');
    // The map page is two entries: the map, and the saved schools (?lagrede=1)
    function ariaCurrentMenu(href) {
        const saved = new URLSearchParams(location.search).get('lagrede') === '1';
        if (href === './') return current === '' && !saved ? ' aria-current="page"' : '';
        if (href === './?lagrede=1') return current === '' && saved ? ' aria-current="page"' : '';
        return ariaCurrent(href);
    }
    const localHref = href => (typeof I18N !== 'undefined' ? I18N.href(href) : href);
    const menuHtml = `
        <button type="button" class="ds-button site-menu__button" data-variant="secondary" data-size="sm" popovertarget="siteMenu">${ICON_MENU}<span class="site-nav__label">Meny</span></button>
        <div class="ds-dropdown site-menu" popover id="siteMenu" data-placement="bottom-end">
            ${MENU.map(group => `<h2 class="site-menu__heading">${group.heading}</h2>
            <ul>${group.links.map(l => `<li><a class="ds-button" data-variant="tertiary" data-size="sm" href="${localHref(l.href)}"${ariaCurrentMenu(l.href)}>${l.label}</a></li>`).join('')}</ul>`).join('')}
            ${typeof THEME !== 'undefined' ? `<h2 class="site-menu__heading">${t('Visning')}</h2><ul><li><button type="button" class="ds-button" data-variant="tertiary" data-size="sm" popovertarget="displayMenu">${t('Tekststørrelse')}, ${t('Kontrast').toLowerCase()}, ${t('Fargetema').toLowerCase()}</button></li></ul>` : ''}
            ${typeof I18N !== 'undefined' && I18N.langItemsHtml ? `<div class="site-menu__lang"><h2 class="site-menu__heading">Språk</h2><ul>${I18N.langItemsHtml()}</ul></div>` : ''}
        </div>`;


    // Header v2 (Figma, section 10): the menu's three groups as dropdowns in the middle of the header
    // ("Finn skole", "For foreldre", "Om tjenesten"); below 1280 px they are only in "Meny"
    // A menu is underlined when you are on one of its pages
    // Pages that are not in a menu but belong to one (the footer's): the menu is current there too, as in
    // the breadcrumbs
    const IN_GROUP = { personvern: 'Om tjenesten', tilgjengelighet: 'Om tjenesten', tilbakemelding: 'Om tjenesten' };
    // The kommune lists and the school pages (skoler/…, skole?id=) are under «Finn skole», as in their breadcrumbs
    const inFinnSkole = current === 'skole' || current.startsWith('skoler/');
    const groupCurrent = group => IN_GROUP[current] === group.heading
        || (group.heading === 'Finn skole' && inFinnSkole)
        || group.links.some(l => ariaCurrentMenu(l.href));
    const primaryHtml = MENU.map((group, i) => `
        <button type="button" class="site-primary__link site-primary__menu" popovertarget="primaryMenu${i}"${groupCurrent(group) ? ' data-current="true"' : ''}>${group.heading}</button>
        <div class="ds-dropdown site-menu site-primary__dropdown" popover id="primaryMenu${i}" data-placement="bottom-start">
            <ul>${group.links.map(l => `<li><a class="ds-button" data-variant="tertiary" data-size="sm" href="${localHref(l.href)}"${ariaCurrentMenu(l.href)}>${l.label}</a></li>`).join('')}</ul>
        </div>`).join('');
    // "Visning": the colour theme (light, dark, system) in its own dropdown, as in the design
    const ICON_TEXT = '<svg class="ds-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M7.3 6.2a.75.75 0 0 1 1.4 0l4.5 12a.75.75 0 0 1-1.4.53L10.6 15.5H5.4l-1.2 3.23a.75.75 0 1 1-1.4-.53l4.5-12Zm-1.34 7.8h4.08L8 8.56 5.96 14ZM16.8 10.2a.75.75 0 0 1 1.4 0l3 8a.75.75 0 1 1-1.4.53l-.69-1.83h-3.22l-.69 1.83a.75.75 0 1 1-1.4-.53l3-8Zm-.35 5.2h2.1l-1.05-2.8-1.05 2.8Z" fill="currentColor"/></svg>';
    const displayHtml = typeof THEME === 'undefined' ? '' : `
        <button type="button" class="ds-button display-button" data-variant="secondary" data-size="sm" popovertarget="displayMenu">${ICON_TEXT}<span class="site-nav__label">Visning</span></button>
        <div class="ds-dropdown site-menu display-dropdown" popover id="displayMenu" data-placement="bottom-end">${THEME.panelHtml()}</div>`;

    // «Om fargefordelingen» is in the «Om tjenesten» menu; the colours themselves are explained on the maps
    // («Fargene», score-colors.js)

    const header = `
        <header class="site-header">
            <div class="site-container site-header__inner">
                <a class="site-logo" href="${localHref('./')}">
                    <span class="site-logo__mark" aria-hidden="true">${ICONS.logoBackpack}${ICONS.logo}</span>
                    Skolekartet
                </a>
                <!-- The map and the two pages most people need, in the middle as on Digdir's own sites; on narrow
                     screens they are only in the menu -->
                <nav class="site-primary" aria-label="Hovedmeny">${primaryHtml}</nav>
                <nav class="site-nav" aria-label="Hovedmeny">
                    <a class="ds-button saved-link" data-variant="tertiary" data-size="sm" href="${typeof I18N !== 'undefined' ? I18N.href('./?lagrede=1') : './?lagrede=1'}"
                       aria-label="Lagrede skoler">${ICONS.bookmark}<span class="site-nav__label">Lagrede skoler</span><span class="saved-link__count" aria-hidden="true" hidden></span></a>
                    ${displayHtml}
                    ${typeof I18N !== 'undefined' ? I18N.switchLink() : ''}
                    ${menuHtml}
                </nav>
            </div>
        </header>
        ${typeof I18N !== 'undefined' ? I18N.noticeHtml() : ''}`;

    // The footer has the same pages as the menu (except the map itself)
    // The footer only has what footers on Digdir's, Nav's and Altinn's sites have: what the service is,
    // where the data comes from, privacy, and feedback. The pages and the languages are in the header.
    // "ChatElipsis" from Aksel icons by Nav (MIT licence); the GitHub mark from Simple Icons (CC0)
    const ICON_CHAT = '<svg class="ds-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path fill-rule="evenodd" clip-rule="evenodd" d="M4.75 6C4.75 5.30964 5.30964 4.75 6 4.75H18C18.6904 4.75 19.25 5.30964 19.25 6V15C19.25 15.6904 18.6904 16.25 18 16.25H9C8.86407 16.25 8.73069 16.2869 8.61413 16.3569L4.75 18.6754V6ZM6 3.25C4.48122 3.25 3.25 4.48122 3.25 6V20C3.25 20.2702 3.39534 20.5195 3.63048 20.6527C3.86561 20.7858 4.15417 20.7821 4.38587 20.6431L9.20774 17.75H18C19.5188 17.75 20.75 16.5188 20.75 15V6C20.75 4.48122 19.5188 3.25 18 3.25H6ZM9 9.75C8.58579 9.75 8.25 10.0858 8.25 10.5C8.25 10.9142 8.58579 11.25 9 11.25H9.01C9.42421 11.25 9.76 10.9142 9.76 10.5C9.76 10.0858 9.42421 9.75 9.01 9.75H9ZM11.25 10.5C11.25 10.0858 11.5858 9.75 12 9.75H12.01C12.4242 9.75 12.76 10.0858 12.76 10.5C12.76 10.9142 12.4242 11.25 12.01 11.25H12C11.5858 11.25 11.25 10.9142 11.25 10.5ZM15 9.75C14.5858 9.75 14.25 10.0858 14.25 10.5C14.25 10.9142 14.5858 11.25 15 11.25H15.01C15.4242 11.25 15.76 10.9142 15.76 10.5C15.76 10.0858 15.4242 9.75 15.01 9.75H15Z" fill="currentColor"/></svg>';
    const ICON_GITHUB = '<svg class="ds-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" fill="currentColor"/></svg>';

    // Footer v2 (Figma, section 10): what the service is, the pages for parents, the pages about the
    // service and the real ways to reach us (the form and GitHub; there is no e-mail or phone)
    const parentLinks = [
        { href: 'om-skolekrets', label: 'Skolekrets og skoleplass' },
        { href: 'skolefritid', label: 'SFO og AKS' },
        { href: 'skolehverdag', label: 'Mat og aktiviteter' },
        { href: 'ny-i-norge', label: 'Ny i Norge' }
    ];
    const footerLinks = [
        { href: 'om-skolekartet', label: 'Om Skolekartet' },
        { href: 'om-fargefordelingen', label: 'Om fargefordelingen' },
        { href: 'datakilder', label: 'Datakilder' },
        { href: 'skoler/', label: 'Skoler etter kommune' },
        { href: 'personvern', label: 'Personvern' },
        { href: 'tilgjengelighet', label: 'Tilgjengelighetserklæring' }
    ];

    const footer = `
        <footer class="site-footer">
            <div class="site-container site-footer__top">
                <a class="ds-button back-to-top" data-icon href="#top" aria-label="Til toppen" data-tooltip="Til toppen" data-placement="right">${ICON_UP}</a>
            </div>
            <!-- Footer v2: «Fant du det du lette etter?» as a row at the top of the footer (page-feedback.js) -->
            <div class="site-container site-footer__feedback"></div>
            <div class="site-container site-footer__grid">
                <div>
                    <p class="ds-heading" data-size="2xs">Skolekartet</p>
                    <p class="ds-paragraph" data-size="sm">Finn skoler i hele Norge og se resultater, trivsel og mobbing – i liste og på kart.</p>
                    <p class="ds-paragraph footer-status" data-size="xs" hidden></p>
                </div>
                <nav aria-label="For foreldre">
                    <p class="ds-heading" data-size="2xs">For foreldre</p>
                    <ul class="ds-list ds-list--unstyled footer-links" data-size="sm">
                        ${parentLinks.map(l => `<li><a class="ds-link" href="${localHref(l.href)}"${ariaCurrent(l.href)}>${l.label}</a></li>`).join('')}
                    </ul>
                </nav>
                <nav aria-label="Om tjenesten">
                    <p class="ds-heading" data-size="2xs">Om tjenesten</p>
                    <ul class="ds-list ds-list--unstyled footer-links" data-size="sm">
                        ${footerLinks.map(l => `<li><a class="ds-link" href="${localHref(l.href)}"${ariaCurrent(l.href)}>${l.label}</a></li>`).join('')}
                    </ul>
                </nav>
                <!-- Contact as links with icons, as in Designsystemet's own footer -->
                <nav aria-label="Kontakt oss">
                    <p class="ds-heading" data-size="2xs">Kontakt oss</p>
                    <ul class="ds-list ds-list--unstyled footer-links footer-contact" data-size="sm">
                        <li>${ICON_CHAT}<a class="ds-link" href="${localHref('tilbakemelding')}"${ariaCurrent('tilbakemelding')}>Gi tilbakemelding</a></li>
                        <li>${ICON_GITHUB}<a class="ds-link" href="https://github.com/ODushyn/oslo-skoler" target="_blank" rel="noopener">Kildekoden på GitHub</a></li>
                    </ul>
                </nav>
            </div>
            <div class="site-container site-footer__bottom">
                <p class="ds-paragraph" data-size="sm">© ${new Date().getFullYear()} Skolekartet</p>
            </div>
        </footer>`;

    document.getElementById('site-header').outerHTML = header;

    // "Lagrede skoler" in the header, with how many are saved (from localStorage, see shared.js)
    function updateSavedCount() {
        let count = 0;
        try {
            count = JSON.parse(localStorage.getItem('skolekartet.lagrede') || '[]').length;
        } catch (_) { /* storage blocked */ }
        document.querySelectorAll('.saved-link').forEach(link => {
            const badge = link.querySelector('.saved-link__count');
            badge.textContent = count;
            badge.hidden = !count;
            const label = typeof I18N !== 'undefined' ? I18N.t('Lagrede skoler ({count})', { count }) : `Lagrede skoler (${count})`;
            link.setAttribute('aria-label', label);
            if (current === '' && new URLSearchParams(location.search).get('lagrede') === '1') link.setAttribute('aria-current', 'page');
        });
    }
    updateSavedCount();
    document.addEventListener('savedschools', updateSavedCount);
    window.addEventListener('storage', event => { if (event.key === 'skolekartet.lagrede') updateSavedCount(); });

    // Dialogs and confirmations (Figma section I), on every page
    const dialogs = document.createElement('script');
    dialogs.src = `${typeof I18N !== 'undefined' ? I18N.url('static/js/dialogs.js') : 'static/js/dialogs.js'}?v=14`;
    document.head.appendChild(dialogs);

    document.addEventListener('DOMContentLoaded', () => {
        const slot = document.getElementById('site-footer');
        // "Fant du det du lette etter?" sits right above the footer (not on the feedback page itself)
        if (slot && current !== 'tilbakemelding') {
            slot.insertAdjacentHTML('beforebegin', '<div id="page-feedback"></div>');
            const script = document.createElement('script');
            script.src = `${I18N.url('static/js/page-feedback.js')}?v=8`;
            document.body.appendChild(script);
        }
        if (slot) slot.outerHTML = footer;

        // "Tallene ble sist sjekket …": the day the daily refresh (update_data.py) last checked the sources
        fetch(I18N.url('static/js/data-status.json'), { cache: 'no-cache' })
            .then(response => (response.ok ? response.json() : null))
            .then(status => {
                const line = document.querySelector('.footer-status');
                if (!status || !status.checked || !line) return;
                const date = new Intl.DateTimeFormat(I18N.locale, { day: 'numeric', month: 'long', year: 'numeric' })
                    .format(new Date(`${status.checked}T12:00:00`));
                line.textContent = t('Elevundersøkelsen og skoleregisteret ble sist sjekket {date}.', { date });
                line.hidden = false;
            })
            .catch(() => {});

        // "Til toppen": scroll to the top and move focus there, so keyboard users continue from the start
        document.querySelectorAll('.back-to-top').forEach(link => {
            link.addEventListener('click', event => {
                event.preventDefault();
                const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
                const first = document.querySelector('.site-logo');
                if (first) first.focus({ preventScroll: true });
            });
        });

        // Information pages (Figma 321:31557): breadcrumbs (321:31553) instead of «Tilbake», and «Relatert»
        // beside the text with the other pages in the same group, as on Nav's and Digdir's pages
        const EXTRA_RELATED = {
            'For foreldre': [{ href: 'tilbakemelding', label: 'Kontakt oss' }],
            'Om tjenesten': [{ href: 'personvern', label: 'Personvern' }, { href: 'tilgjengelighet', label: 'Tilgjengelighetserklæring' }]
        };
        const article = document.querySelector('.page__container > article.page__content');
        const group = MENU.find(g => g.heading !== 'Finn skole' && g.links.some(l => l.href === current))
            || MENU.find(g => g.heading === IN_GROUP[current]);
        if (article && group) {
            const tx = text => (typeof I18N !== 'undefined' ? I18N.t(text) : text);
            // The group's own place: «For foreldre» is the guide at the bottom of the front page, «Om tjenesten»
            // starts with «Om Skolekartet» (no link on that page itself)
            const groupHref = { 'For foreldre': './#for-foreldre', 'Om tjenesten': 'om-skolekartet' }[group.heading];
            const heading = article.querySelector('h1');
            const title = heading ? heading.textContent.trim() : document.title;
            const crumbs = `<nav class="page-crumbs" aria-label="${tx('Du er her')}"><ol>
                    <li><a class="ds-link" href="${localHref('./')}">Skolekartet</a></li>
                    ${groupHref && groupHref !== current
                        ? `<li><a class="ds-link" href="${localHref(groupHref)}">${tx(group.heading)}</a></li>`
                        : `<li><span>${tx(group.heading)}</span></li>`}
                    <li><a class="ds-link" aria-current="page" href="${localHref(current)}">${title}</a></li>
                </ol></nav>`;
            const back = document.querySelector('.page__container > .page__back');
            if (back) back.outerHTML = crumbs; else article.insertAdjacentHTML('beforebegin', crumbs);
            const related = [...group.links, ...(EXTRA_RELATED[group.heading] || [])]
                .filter((l, i, all) => l.href !== current && all.findIndex(o => o.href === l.href) === i);
            article.insertAdjacentHTML('afterend', `<aside class="page-related" aria-labelledby="relatedHeading">
                    <h2 class="page-related__title" id="relatedHeading">${tx('Relatert')}</h2>
                    <ul>${related.map(l => `<li><a class="ds-link" href="${localHref(l.href)}">${tx(l.label)}</a></li>`).join('')}</ul>
                </aside>`);
            article.parentElement.classList.add('page__container--related');
        }

        // "Tilbake" goes back in history when we came from this site, so the map keeps its state
        document.querySelectorAll('[data-back]').forEach(link => {
            link.insertAdjacentHTML('afterbegin', ICONS.back);
            link.addEventListener('click', event => {
                // The map page restores its view (address, map, list, open school) when it sees this
                try { sessionStorage.setItem('skolekartet.tilbake', '1'); } catch (_) { /* storage blocked */ }
                if (document.referrer.startsWith(location.origin) && history.length > 1) {
                    event.preventDefault();
                    history.back();
                }
            });
        });
    });
})();

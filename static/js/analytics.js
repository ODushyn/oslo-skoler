// Google Analytics 4 (G-HHMNN59GDS), on the home page, only after the visitor says yes.
// Until then nothing is loaded from Google and no cookies are set. The answer is kept in this browser
// (localStorage, key skolekartet.analyse: "ja" or "nei"), so the banner is not asked again. Changed on
// personvern.html («Endre valg»). The gtag snippet is a file, not an inline script (no inline scripts in the CSP).
(function () {
    const GA_ID = 'G-HHMNN59GDS';
    const KEY = 'skolekartet.analyse';
    const say = (text) => (typeof t === 'function' ? t(text) : text);

    function read() {
        try { return localStorage.getItem(KEY); } catch (_) { return null; }
    }
    function write(value) {
        try {
            if (value) localStorage.setItem(KEY, value); else localStorage.removeItem(KEY);
        } catch (_) { /* storage blocked: the banner comes back next time */ }
    }

    let loaded = false;
    function loadGA() {
        if (loaded) return;
        loaded = true;
        window.dataLayer = window.dataLayer || [];
        window.gtag = function () { window.dataLayer.push(arguments); };
        window.gtag('js', new Date());
        window.gtag('config', GA_ID);
        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
        document.head.appendChild(script);
    }

    function banner() {
        const box = document.createElement('section');
        box.className = 'analyse-banner';
        box.setAttribute('aria-label', say('Statistikk'));
        box.innerHTML = `
            <p class="ds-paragraph" data-size="sm">${say('Vil du hjelpe oss med statistikk? Vi bruker Google Analytics til å se hvor mange som besøker siden. Google setter informasjonskapsler og får IP-adressen din. Du bestemmer selv.')}
                <a class="ds-link" href="${typeof I18N !== 'undefined' ? I18N.href('personvern') : 'personvern'}">${say('Personvern')}</a></p>
            <div class="analyse-banner__actions">
                <button type="button" class="ds-button" data-variant="primary" data-size="sm" data-consent="ja">${say('Ja, godta')}</button>
                <button type="button" class="ds-button" data-variant="secondary" data-size="sm" data-consent="nei">${say('Nei takk')}</button>
            </div>`;
        document.body.appendChild(box);
        // While the banner is up, the page gets room under its last line (the footer's links), so the banner never
        // covers them; the space goes again when the banner does. The banner itself is fixed, so nothing above it moves.
        const room = () => { document.body.style.paddingBottom = `${box.offsetHeight + 32}px`; };
        room();
        window.addEventListener('resize', room);
        box.addEventListener('click', event => {
            const button = event.target.closest("[data-consent]");
            if (!button) return;
            const answer = button.dataset.consent;
            write(answer);
            box.remove();
            window.removeEventListener('resize', room);
            document.body.style.paddingBottom = '';
            if (answer === 'ja') loadGA();
        });
        box.querySelector("[data-consent=\"ja\"]").focus({ preventScroll: true });
    }

    const answer = read();
    if (answer === 'ja') loadGA();
    else if (answer !== 'nei') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', banner);
        else banner();
    }

    // personvern.html: «Endre valg for statistikk» forgets the answer and asks again on the next visit
    document.addEventListener('click', event => {
        if (!event.target.closest('[data-analyse-reset]')) return;
        write(null);
        location.reload();
    });
})();

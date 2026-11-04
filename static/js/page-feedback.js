// "Fant du det du lette etter?" as a tab at the bottom of the screen (closed until clicked),
// on every page except tilbakemelding.html.
// Answers go to Formspree, the same form as tilbakemelding.html (see static/js/feedback.js).
// Ja/Nei is sent right after step 1 and the optional text in a second request, so the answer
// is kept even if the block is closed. The page address is sent without the hash.
(function () {
    const ENDPOINT = 'https://formspree.io/f/xzdalbbr';
    const STORAGE_KEY = `skolekartet.feedback.${location.pathname}`;
    const slot = document.getElementById('page-feedback');
    if (!slot) return;

    // Already answered on this page in this tab: do not ask again
    try {
        if (sessionStorage.getItem(STORAGE_KEY)) {
            slot.remove();
            return;
        }
    } catch (_) { /* storage blocked: just ask */ }

    // "ChevronDown" from Aksel icons by Nav (MIT licence); points up while the tab is closed
    const CHEVRON = '<svg class="ds-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M5.96967 9.46967C6.26256 9.17678 6.73744 9.17678 7.03033 9.46967L12 14.4393L16.9697 9.46967C17.2626 9.17678 17.7374 9.17678 18.0303 9.46967C18.3232 9.76256 18.3232 10.2374 18.0303 10.5303L12.5303 16.0303C12.2374 16.3232 11.7626 16.3232 11.4697 16.0303L5.96967 10.5303C5.67678 10.2374 5.67678 9.76256 5.96967 9.46967Z" fill="currentColor"/></svg>';
    const QUESTION = t('Fant du det du lette etter?');
    let answer = null;

    slot.outerHTML = `
        <section class="page-feedback" id="page-feedback" aria-label="${QUESTION}">
            <h2 class="page-feedback__title">
                <button type="button" class="page-feedback__toggle" aria-expanded="false" aria-controls="pageFeedbackBody">
                    <span>${QUESTION}</span>${CHEVRON}
                </button>
            </h2>
            <div class="page-feedback__body" id="pageFeedbackBody" hidden></div>
            <p class="ds-sr-only" id="pageFeedbackStatus" aria-live="polite"></p>
        </section>`;

    const block = document.getElementById('page-feedback');
    const body = document.getElementById('pageFeedbackBody');
    const status = document.getElementById('pageFeedbackStatus');
    const toggle = block.querySelector('.page-feedback__toggle');
    document.body.classList.add('has-page-feedback');

    const setOpen = open => {
        toggle.setAttribute('aria-expanded', String(open));
        body.hidden = !open;
    };
    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    // Escape closes the open tab and returns focus to it
    block.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !body.hidden) {
            setOpen(false);
            toggle.focus();
        }
    });

    async function send(message) {
        const data = new FormData();
        data.append('answer', answer);
        if (message !== undefined) data.append('message', message);
        data.append('page', location.pathname + location.search);
        data.append('title', document.title);
        data.append('_subject', `Skolekartet: Fant du det? – ${answer} – ${document.title}`);
        const response = await fetch(ENDPOINT, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`Formspree ${response.status}`);
    }

    function errorHtml() {
        return `<div class="ds-alert page-feedback__error" data-color="danger" data-size="sm" hidden>
                    <p class="ds-paragraph" data-size="sm">${t('Noe gikk galt. Prøv igjen senere.')}</p></div>`;
    }

    // Move focus to the new step's heading so keyboard and screen reader users follow along
    function show(html) {
        body.innerHTML = html;
        const heading = body.querySelector('[data-step-heading]');
        if (heading) heading.focus();
    }

    function stepOne() {
        show(`
            <form class="page-feedback__form" novalidate>
                <fieldset class="ds-fieldset">
                    <legend class="ds-sr-only" tabindex="-1">${QUESTION}</legend>
                    <div class="page-feedback__options">
                        <ds-field class="ds-field">
                            <input class="ds-input" type="radio" name="answer" id="pageFeedbackJa" value="ja">
                            <label class="ds-label" data-weight="regular" for="pageFeedbackJa">${t('Ja')}</label>
                        </ds-field>
                        <ds-field class="ds-field">
                            <input class="ds-input" type="radio" name="answer" id="pageFeedbackNei" value="nei">
                            <label class="ds-label" data-weight="regular" for="pageFeedbackNei">${t('Nei')}</label>
                        </ds-field>
                    </div>
                </fieldset>
                ${errorHtml()}
                <div class="page-feedback__actions">
                    <button type="submit" class="ds-button" data-variant="primary" data-size="sm" disabled>${t('Neste')}</button>
                </div>
            </form>`);
        const form = body.querySelector('form');
        const next = form.querySelector('button[type="submit"]');
        form.addEventListener('change', () => { next.disabled = !form.querySelector('input:checked'); });
        form.addEventListener('submit', async event => {
            event.preventDefault();
            const checked = form.querySelector('input:checked');
            if (!checked) return;
            answer = checked.value;
            next.disabled = true;
            next.setAttribute('aria-busy', 'true');
            try {
                await send();
                try { sessionStorage.setItem(STORAGE_KEY, answer); } catch (_) { /* storage blocked */ }
                status.textContent = t('Svaret ditt er sendt.');
                stepTwo();
            } catch (_) {
                form.querySelector('.page-feedback__error').hidden = false;
                next.disabled = false;
                next.removeAttribute('aria-busy');
            }
        });
    }

    function stepTwo() {
        const question = answer === 'nei'
            ? t('Hva lette du etter? (Svaret hjelper oss med å forbedre nettstedet!)')
            : t('Er det noe vi kan gjøre bedre? (valgfritt)');
        show(`
            <form class="page-feedback__form" novalidate>
                <ds-field class="ds-field">
                    <label class="ds-label page-feedback__heading" for="pageFeedbackText" tabindex="-1" data-step-heading>${question}</label>
                    <p class="ds-paragraph" data-field="description" data-size="xs">${t('Ikke skriv navn, telefonnummer eller andre personopplysninger.')}</p>
                    <textarea class="ds-input" id="pageFeedbackText" name="message" rows="3" maxlength="1000"></textarea>
                </ds-field>
                ${errorHtml()}
                <div class="page-feedback__actions">
                    <button type="button" class="ds-button" data-variant="tertiary" data-size="sm" data-skip>${t('Hopp over')}</button>
                    <button type="submit" class="ds-button" data-variant="primary" data-size="sm">${t('Send')}</button>
                </div>
            </form>`);
        const form = body.querySelector('form');
        const submit = form.querySelector('button[type="submit"]');
        form.querySelector('[data-skip]').addEventListener('click', stepThree);
        form.addEventListener('submit', async event => {
            event.preventDefault();
            const message = form.querySelector('textarea').value.trim();
            if (!message) {
                stepThree();
                return;
            }
            submit.disabled = true;
            submit.setAttribute('aria-busy', 'true');
            try {
                await send(message);
                stepThree();
            } catch (_) {
                form.querySelector('.page-feedback__error').hidden = false;
                submit.disabled = false;
                submit.removeAttribute('aria-busy');
            }
        });
    }

    function stepThree() {
        show(`
            <h2 class="ds-heading page-feedback__heading" data-size="xs" tabindex="-1" data-step-heading>${t('Takk for tilbakemeldingen!')}</h2>
            <div class="page-feedback__actions">
                <button type="button" class="ds-button" data-variant="secondary" data-size="sm" data-close>${t('Lukk')}</button>
            </div>
            <p class="ds-paragraph" data-size="xs"><a class="ds-link" href="${typeof I18N !== 'undefined' ? I18N.href('personvern.html') : 'personvern.html'}">${t('Personvern')}</a></p>`);
        body.querySelector('[data-close]').addEventListener('click', () => {
            block.remove();
            document.body.classList.remove('has-page-feedback');
            const main = document.getElementById('main');
            if (main) main.focus({ preventScroll: true });
        });
    }

    // Step one starts without moving focus, so the page loads as usual
    stepOne();
    const legend = body.querySelector('legend');
    if (legend) legend.setAttribute('data-step-heading', '');
})();

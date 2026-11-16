// «Lytt til siden» (Figma 5 · PROTOTYPE, E1, and the player J13): reads the text of the page aloud with the browser's
// own speech synthesis. While it reads, a bar at the bottom shows how long it has read, with Pause and Stopp.
// The button is only there where the browser can speak (and «Visning» has not turned it off).
(function () {
    const button = document.getElementById('listenButton');
    const article = document.getElementById('articleBody');
    if (!button || !article || !('speechSynthesis' in window)) return;
    button.hidden = false;
    const tr = text => (typeof t === 'function' ? t(text) : text);
    const label = button.querySelector('[data-label]');
    const idle = label.textContent;
    const lang = { no: 'nb-NO', en: 'en-GB', uk: 'uk-UA' }[(typeof I18N !== 'undefined' && I18N.lang) || 'no'] || 'nb-NO';
    const speech = window.speechSynthesis;
    let speaking = false, paused = false, seconds = 0, timer = null;

    const bar = document.createElement('div');
    bar.className = 'listen-bar';
    bar.hidden = true;
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', tr('Opplesning'));
    bar.innerHTML = `<p class="listen-bar__status" aria-live="polite"></p>
        <div class="listen-bar__actions">
            <button type="button" class="hero-button hero-button--secondary" data-listen="pause"></button>
            <button type="button" class="hero-button hero-button--primary" data-listen="stop">${tr('Stopp')}</button>
        </div>`;
    document.body.appendChild(bar);
    const status = bar.querySelector('.listen-bar__status');
    const pauseButton = bar.querySelector('[data-listen="pause"]');

    const clock = () => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    function draw() {
        status.textContent = `${paused ? '❚❚' : '▶'}  ${tr(paused ? 'Opplesingen er satt på pause' : 'Leser opp siden')} · ${clock()}`;
        pauseButton.textContent = tr(paused ? 'Fortsett' : 'Pause');
    }

    function stop() {
        speech.cancel();
        clearInterval(timer);
        speaking = false;
        paused = false;
        bar.hidden = true;
        label.textContent = idle;
        button.setAttribute('aria-pressed', 'false');
    }

    function start() {
        // The text of the article in reading order, without the buttons, icons and check boxes
        const clone = article.cloneNode(true);
        clone.querySelectorAll('button, svg, input, [aria-hidden="true"]').forEach(node => node.remove());
        const utterance = new SpeechSynthesisUtterance(clone.innerText.replace(/\s+/g, ' ').trim());
        utterance.lang = lang;
        utterance.onend = utterance.onerror = stop;
        speaking = true;
        paused = false;
        seconds = 0;
        label.textContent = tr('Stopp opplesing');
        button.setAttribute('aria-pressed', 'true');
        bar.hidden = false;
        draw();
        timer = setInterval(() => { if (!paused) { seconds += 1; draw(); } }, 1000);
        speech.speak(utterance);
    }

    button.addEventListener('click', () => (speaking ? stop() : start()));
    bar.addEventListener('click', event => {
        const action = event.target.closest('[data-listen]');
        if (!action) return;
        if (action.dataset.listen === 'stop') { stop(); return; }
        paused = !paused;
        if (paused) speech.pause(); else speech.resume();
        draw();
    });
    window.addEventListener('pagehide', stop);
})();

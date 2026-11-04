// Feedback form on tilbakemelding.html (sent to Formspree)

async function handleFeedbackSubmit(event) {
    event.preventDefault();
    const form = document.getElementById('feedbackForm');
    const btn = document.getElementById('feedbackSubmitBtn');
    const status = document.getElementById('feedbackStatus');

    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.textContent = 'Sender...';
    status.hidden = true;

    try {
        const response = await fetch(form.action, {
            method: 'POST',
            body: new FormData(form),
            headers: { 'Accept': 'application/json' }
        });

        if (response.ok) {
            status.dataset.color = 'success';
            status.textContent = 'Takk! Meldingen din er sendt.';
            status.hidden = false;
            form.reset();
            btn.removeAttribute('aria-busy');
            btn.textContent = 'Sendt!';
        } else {
            throw new Error('server error');
        }
    } catch (_) {
        status.dataset.color = 'danger';
        status.textContent = 'Noe gikk galt. Prøv igjen eller send e-post direkte.';
        status.hidden = false;
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        btn.textContent = 'Send melding';
    }
}

// Feedback form on the tilbakemelding page (sent to Formspree)

async function handleFeedbackSubmit(event) {
    event.preventDefault();
    const form = document.getElementById('feedbackForm');
    const btn = document.getElementById('feedbackSubmitBtn');
    const status = document.getElementById('feedbackStatus');

    // The message is the one field that must be filled in: an error summary at the top with a link to it,
    // and the message under the field (Designsystemet's pattern), instead of the browser's bubble
    const message = document.getElementById('feedbackMessage');
    const missing = !message.value.trim();
    document.getElementById('feedbackErrors').hidden = !missing;
    document.getElementById('feedbackMessageError').hidden = !missing;
    message.toggleAttribute('aria-invalid', missing);
    if (missing) {
        message.setAttribute('aria-invalid', 'true');
        message.setAttribute('aria-describedby', 'feedbackMessageHint feedbackMessageError');
        document.getElementById('feedbackErrors').focus();
        return;
    }
    message.setAttribute('aria-describedby', 'feedbackMessageHint');

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
        status.textContent = 'Noe gikk galt. Prøv igjen litt senere.';
        status.hidden = false;
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        btn.textContent = 'Send melding';
    }
}

// The link in the error summary puts the cursor in the field
document.querySelector('#feedbackErrors a').addEventListener('click', event => {
    event.preventDefault();
    document.getElementById('feedbackMessage').focus();
});

// Bound here rather than in an onsubmit attribute, so the page needs no inline script
document.getElementById('feedbackForm').addEventListener('submit', handleFeedbackSubmit);

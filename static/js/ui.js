// Dialogs, sheets and confirmations (Figma 5 · PROTOTYPE, rows I and J). One component on the native <dialog>:
// focus stays inside while it is open, Esc and a click outside close it, focus goes back to where it was, the
// page behind does not scroll. On wide screens it is a centred dialog (520 px, 620 px for the share dialog);
// on phones a «dialog» becomes a sheet from the bottom with a handle, a «confirm» a card at the top.
//
//   UI.dialog({ title, mobileTitle, body, actions: [{ label, mobileLabel, variant, href, onClick, keepOpen }],
//               closeButton, kind: 'dialog' | 'confirm', size: 'md' | 'lg', onClose })
//
// `title`, `body` and the labels are HTML written by the caller (escape names with escapeHtml). The texts come
// through t() so they follow the page language.
const UI = (() => {
    let counter = 0;
    let current = null;

    const both = (wide, narrow) => (narrow && narrow !== wide
        ? `<span class="ui-wide">${wide}</span><span class="ui-narrow" aria-hidden="true">${narrow}</span>` : wide);

    function dialog({ title, mobileTitle, body = '', actions = [], closeButton = false, kind = 'dialog', size = 'md', onClose } = {}) {
        if (current) current.close();
        const node = document.createElement('dialog');
        const titleId = `uiTitle${++counter}`;
        node.className = 'ui-dialog';
        node.dataset.kind = kind;
        node.dataset.size = size;
        node.setAttribute('aria-labelledby', titleId);
        const action = (a, i) => {
            const label = both(a.label, a.mobileLabel);
            const cls = `ui-button ui-button--${a.variant === 'secondary' ? 'secondary' : 'primary'}`;
            return a.href
                ? `<a class="${cls}" data-ui-action="${i}" href="${escapeHtml(a.href)}"${a.external ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`
                : `<button type="button" class="${cls}" data-ui-action="${i}">${label}</button>`;
        };
        node.innerHTML = `
            <div class="ui-dialog__panel">
                ${kind === 'dialog' ? '<span class="ui-dialog__handle" aria-hidden="true"></span>' : ''}
                <div class="ui-dialog__head">
                    <h2 class="ui-dialog__title" id="${titleId}">${both(title, mobileTitle)}</h2>
                    ${closeButton ? `<button type="button" class="ui-dialog__close" data-ui-close><span aria-hidden="true">✕</span> ${t('Lukk')}</button>` : ''}
                </div>
                ${body ? `<div class="ui-dialog__body">${body}</div>` : ''}
                ${actions.length ? `<div class="ui-dialog__actions">${actions.map(action).join('')}</div>` : ''}
            </div>`;

        const api = { node, close: () => { if (node.open) node.close(); } };
        node.addEventListener('click', event => {
            if (event.target === node || event.target.closest('[data-ui-close]')) { api.close(); return; }
            const button = event.target.closest('[data-ui-action]');
            if (!button) return;
            const a = actions[Number(button.dataset.uiAction)];
            if (a.onClick) a.onClick(event, api);
            if (!a.keepOpen && !(a.href && a.external)) api.close();
        });
        node.addEventListener('close', () => {
            node.remove();
            if (current === api) current = null;
            document.documentElement.classList.remove('ui-locked');
            if (onClose) onClose();
        });
        document.body.appendChild(node);
        document.documentElement.classList.add('ui-locked');
        node.showModal();
        current = api;
        return api;
    }

    // «Lagret – N skoler i listen» (I6, J8) and «Skolen er fjernet fra listen» (I7), after the bookmark is pressed
    function announceSaved({ key, saved, count }) {
        if (saved) {
            const wide = count === 1 ? t('✓  Lagret – 1 skole i listen') : t('✓  Lagret – {count} skoler i listen', { count });
            const narrow = count === 1 ? t('✓  Lagret – 1 skole') : t('✓  Lagret – {count} skoler', { count });
            dialog({
                kind: 'confirm',
                title: wide,
                mobileTitle: narrow,
                body: `<p>${t('Du finner dem under «Lagrede skoler» øverst på siden.')}</p>`,
                actions: [
                    { label: t('Se lagrede skoler'), mobileLabel: t('Se listen'), href: I18N.href('sammenlign') },
                    { label: t('Fortsett å se'), mobileLabel: t('OK'), variant: 'secondary' }
                ]
            });
        } else {
            dialog({
                kind: 'confirm',
                title: t('Skolen er fjernet fra listen'),
                actions: [
                    { label: t('Angre'), onClick: () => toggleSaved(key, false) },
                    { label: t('OK'), variant: 'secondary' }
                ]
            });
        }
    }

    document.addEventListener('savedschools', event => {
        if (event.detail && event.detail.announce !== false) announceSaved(event.detail);
    });

    // J10 «✓  Lenken er kopiert» and J12 «✓  N spørsmål er kopiert»: a short confirmation after copying
    function confirmCopied(kind, count) {
        dialog({
            kind: 'confirm',
            title: kind === 'questions' ? t('✓  {count} spørsmål er kopiert', { count }) : t('✓  Lenken er kopiert'),
            body: kind === 'questions' ? `<p>${t('Lim dem inn i notater før du ringer.')}</p>` : '',
            actions: [{ label: t('OK') }]
        });
    }

    // Copy a text; the confirmation follows. Where the browser does not allow it, the text is shown to copy by hand.
    async function copyText(text, kind, count) {
        try {
            await navigator.clipboard.writeText(text);
            confirmCopied(kind, count);
        } catch (error) {
            // The browser does not let the page copy: show the text, selected, to copy by hand
            const api = dialog({
                title: t('Kopier teksten'),
                closeButton: true,
                body: `<p>${t('Nettleseren lar oss ikke kopiere. Teksten er merket – kopier den selv.')}</p><textarea class="ui-copy" readonly rows="6">${escapeHtml(text)}</textarea>`,
                actions: [{ label: t('OK') }]
            });
            const box = api.node.querySelector('.ui-copy');
            box.focus();
            box.select();
        }
    }

    // J9 «Del skolen» (and the same for any page): SMS, copy, e-mail
    function shareSheet({ title, url, subject }) {
        dialog({
            title,
            closeButton: true,
            actions: [
                { label: t('Send på SMS'), href: `sms:?&body=${encodeURIComponent(`${subject}: ${url}`)}` },
                { label: t('Kopier lenke'), variant: 'secondary', onClick: () => setTimeout(() => copyText(url, 'link'), 0) },
                { label: t('Send på e-post'), variant: 'secondary', href: `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(url)}` }
            ]
        });
    }

    // J11 «Ring skolen»: a tel: link marked with data-call opens a sheet with the number and the school first,
    // so a tap does not start a call by mistake (and a PC without phone gets to see the number)
    document.addEventListener('click', event => {
        const link = event.target.closest('a[href^="tel:"][data-call]');
        if (!link) return;
        event.preventDefault();
        const number = link.getAttribute('href').replace(/^tel:(\+47)?/, '');
        const spaced = number.replace(/^(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4');
        dialog({
            title: t('Ring skolen'),
            closeButton: true,
            body: `<p class="ui-call__number">${escapeHtml(spaced)}</p><p>${escapeHtml(link.dataset.call)}</p>`,
            actions: [
                { label: t('Ring nå'), href: link.getAttribute('href') },
                { label: t('Avbryt'), variant: 'secondary' }
            ]
        });
    });

    return { dialog, announceSaved, confirmCopied, copyText, shareSheet };
})();

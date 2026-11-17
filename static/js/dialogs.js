// Dialogs and confirmations (Figma section I, «Dialoger, menyer og bekreftelser»), shared by every page and
// loaded by layout.js.
// - UiDialog.open: a modal dialog over the page (Designsystemet Dialog, <dialog> with showModal): the title and
//   «✕ Lukk» on top, the content, then the buttons in a column. A click outside or Escape closes it, and the
//   focus goes back to what opened it.
// - UiDialog.confirm: «✓ Lenken er kopiert» and the like: a small box at the top of the screen that does not
//   block the page. It stays until it is closed (no timer, so everyone has time to read it, WCAG 2.2.1), is read
//   out by screen readers, and its first button gets the focus so «Angre» is one key away.
(function () {
    const say = (text, values) => (typeof t === 'function' ? t(text, values) : text.replace(/\{(\w+)\}/g, (_, k) => values[k]));
    const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let count = 0;

    // A button or link for the column at the bottom: { label, primary, href, external, onClick, keepOpen }
    function actionHtml(action, i) {
        const variant = action.primary ? 'primary' : 'secondary';
        const attrs = `class="ds-button ui-dialog__action" data-variant="${variant}" data-action="${i}"`;
        return action.href
            ? `<a ${attrs} href="${esc(action.href)}"${action.external ? ' target="_blank" rel="noopener"' : ''}>${esc(action.label)}</a>`
            : `<button type="button" ${attrs}>${esc(action.label)}</button>`;
    }

    function bindActions(box, actions, close) {
        box.querySelectorAll('[data-action]').forEach(node => node.addEventListener('click', event => {
            const action = actions[Number(node.dataset.action)];
            if (action.onClick) action.onClick(event, close);
            if (!action.keepOpen) close();
        }));
    }

    function open({ title, html = '', actions = [], className = '', onClose }) {
        const opener = document.activeElement;
        const id = `uiDialog${++count}`;
        const dialog = document.createElement('dialog');
        dialog.className = `ds-dialog ui-dialog ${className}`;
        dialog.setAttribute('aria-labelledby', `${id}Title`);
        dialog.innerHTML = `
            <div class="ui-dialog__head">
                <h2 class="ds-heading" data-size="sm" id="${id}Title">${esc(title)}</h2>
                <button type="button" class="ds-button ui-dialog__close" data-variant="tertiary" data-close>
                    <span aria-hidden="true">✕</span> ${esc(say('Lukk'))}</button>
            </div>
            <div class="ui-dialog__body">${html}</div>
            ${actions.length ? `<div class="ui-dialog__actions">${actions.map(actionHtml).join('')}</div>` : ''}`;
        document.body.appendChild(dialog);
        // One ending for «Lukk», a button, a click outside and Escape: the box goes, and the focus goes back
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            dialog.remove();
            if (onClose) onClose();
            if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
        };
        const close = () => {
            if (dialog.open) dialog.close();
            finish();
        };
        dialog.querySelector('[data-close]').addEventListener('click', close);
        // A click on the dark area around the box closes it (Figma «Klikk utenfor = lukk»)
        dialog.addEventListener('click', event => {
            const box = dialog.getBoundingClientRect();
            const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
            if (event.target === dialog && outside) close();
        });
        dialog.addEventListener('close', finish);
        bindActions(dialog, actions, close);
        dialog.showModal();
        return { dialog, close };
    }

    let current = null;
    function confirm({ title, text = '', html = '', actions }) {
        if (current) current.close();
        const opener = document.activeElement;
        const id = `uiConfirm${++count}`;
        const list = actions && actions.length ? actions : [{ label: say('OK'), primary: true }];
        const box = document.createElement('dialog');
        box.className = 'ui-confirm';
        box.setAttribute('aria-labelledby', `${id}Title`);
        box.innerHTML = `
            <h2 class="ds-heading" data-size="sm" id="${id}Title" role="status">${esc(title)}</h2>
            ${text ? `<p class="ds-paragraph">${esc(text)}</p>` : ''}${html}
            <div class="ui-dialog__actions">${list.map(actionHtml).join('')}</div>`;
        document.body.appendChild(box);
        // The focus goes back to what was used before, when it was in the box (not when the visitor clicked elsewhere)
        const close = () => {
            const hadFocus = box.contains(document.activeElement);
            if (box.open) box.close();
            box.remove();
            if (current && current.box === box) current = null;
            if (hadFocus && opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
        };
        box.addEventListener('close', () => {
            box.remove();
            if (current && current.box === box) current = null;
        });
        box.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
        // A click anywhere else closes it too
        const outside = event => {
            if (!box.contains(event.target)) {
                document.removeEventListener('pointerdown', outside, true);
                close();
            }
        };
        setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
        bindActions(box, list, close);
        box.show();
        box.querySelector('[data-action]').focus();
        current = { box, close };
        return current;
    }

    // ── «✓ Lagret – 4 skoler i listen» (Figma I6) whenever a school is saved, on any page ──
    // Saves made by the page itself (undoing a removal) are not announced
    let quiet = false;
    function quietly(fn) {
        quiet = true;
        try { fn(); } finally { quiet = false; }
    }
    document.addEventListener('savedschools', event => {
        if (quiet || !event.detail || !event.detail.saved) return;
        const href = typeof I18N !== 'undefined' ? I18N.href('./?lagrede=1') : './?lagrede=1';
        clearTimeout(confirm.savedTimer);
        // Several at once (a shared list saved): one message for all
        confirm.savedTimer = setTimeout(() => {
            const n = event.detail.count;
            confirm({
                title: `✓ ${say(n === 1 ? 'Lagret – 1 skole i listen' : 'Lagret – {count} skoler i listen', { count: n })}`,
                text: say('Du finner dem under «Lagrede skoler» øverst på siden.'),
                actions: [
                    { label: say('Se lagrede skoler'), primary: true, href },
                    { label: say('Fortsett å se') }
                ]
            });
        }, 50);
    });

    window.UiDialog = { open, confirm, quietly, esc };
})();

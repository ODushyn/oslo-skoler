// The priorities of the prototype (Figma 5 · PROTOTYPE, A4 «Hva er viktig for dere?») and how a school meets them.
// Shared by the list (finder.js) and the comparison (compare.js). Needs shared.js.
const FLOW_ICON = {"check": "<svg class=\"ds-icon\" viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\" focusable=\"false\"><circle cx=\"12\" cy=\"12\" r=\"9\" stroke=\"currentColor\" stroke-width=\"1.5\"/><path d=\"M8 12.5l2.7 2.7L16.2 9.5\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>", "question": "<svg class=\"ds-icon\" viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\" focusable=\"false\"><circle cx=\"12\" cy=\"12\" r=\"9\" stroke=\"currentColor\" stroke-width=\"1.5\"/><path d=\"M9.6 9.6a2.4 2.4 0 1 1 3.4 2.2c-.6.3-1 .8-1 1.5\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"16.6\" r=\"1\" fill=\"currentColor\"/></svg>", "warn": "<svg class=\"ds-icon\" viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M12 4 21 19.5H3L12 4Z\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linejoin=\"round\"/><path d=\"M12 10v4.5\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"17\" r=\"1\" fill=\"currentColor\"/></svg>", "target": "<svg class=\"ds-icon\" viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\" focusable=\"false\"><circle cx=\"12\" cy=\"12\" r=\"6.25\" stroke=\"currentColor\" stroke-width=\"1.5\"/><circle cx=\"12\" cy=\"12\" r=\"2.25\" fill=\"currentColor\"/><path d=\"M12 2.75V5.75M12 18.25V21.25M2.75 12H5.75M18.25 12H21.25\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\"/></svg>", "plus": "<svg class=\"ds-icon\" viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M12 5.25a.75.75 0 0 1 .75.75v5.25H18a.75.75 0 0 1 0 1.5h-5.25V18a.75.75 0 0 1-1.5 0v-5.25H6a.75.75 0 0 1 0-1.5h5.25V6a.75.75 0 0 1 .75-.75Z\" fill=\"currentColor\"/></svg>", "info": "<svg class=\"ds-icon\" viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\" focusable=\"false\"><circle cx=\"12\" cy=\"12\" r=\"9\" stroke=\"currentColor\" stroke-width=\"1.5\"/><path d=\"M12 11v6\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"7.75\" r=\"1.1\" fill=\"currentColor\"/></svg>", "chev": "<svg class=\"ds-icon\" viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M9.47 5.97a.75.75 0 0 1 1.06 0l5.5 5.5a.75.75 0 0 1 0 1.06l-5.5 5.5a.75.75 0 1 1-1.06-1.06L14.44 12 9.47 7.03a.75.75 0 0 1 0-1.06Z\" fill=\"currentColor\"/></svg>"};

// ── The flow of the prototype (Figma 5 · PROTOTYPE): A1 address → A4 what matters → A6 results ──
// What a family can say matters (frame A4). Only some of it has data behind it (bullying, well-being, national
// tests, extra Norwegian teaching); the rest is shown as «Ukjent» on each school, never guessed.
const PRIORITIES = [
    { group: 'Komme seg rundt', id: 'rullestol', title: 'Barnet bruker rullestol eller rullator', text: 'Det finnes ikke åpne data om trinnfri adkomst og heis ennå. Vi viser hva du bør spørre skolen om.', chip: 'Rullestol', unknown: 'Heis og trinnfri inngang' },
    { group: 'Komme seg rundt', id: 'trinnfri', title: 'Jeg som forelder trenger trinnfri adkomst', text: 'Gjelder også foreldremøter, henting og levering.', chip: 'Trinnfri adkomst for forelder', unknown: 'Trinnfri hovedinngang' },
    { group: 'Sanser og kommunikasjon', id: 'horsel', title: 'Barnet har nedsatt hørsel', text: 'Det finnes ikke åpne data om teleslynge og lydforhold ennå. Vi viser hva du bør spørre skolen om.', chip: 'Nedsatt hørsel', unknown: 'Teleslynge og lydforhold' },
    { group: 'Sanser og kommunikasjon', id: 'syn', title: 'Barnet har nedsatt syn', text: 'Det finnes ikke åpne data om kontrastmerking og ledelinjer ennå. Vi viser hva du bør spørre skolen om.', chip: 'Nedsatt syn', unknown: 'Kontrastmerking og ledelinjer' },
    { group: 'Støtte og tilrettelegging', id: 'tilrettelagt', title: 'Barnet får eller kan trenge tilrettelagt opplæring', text: 'Tidligere kalt spesialundervisning. Vi viser hvordan du kontakter skolen og hva du kan spørre om.', chip: 'Tilrettelagt opplæring', unknown: 'Kontaktperson for tilrettelegging' },
    { group: 'Støtte og tilrettelegging', id: 'spesialgruppe', title: 'Aktuelt med spesialgruppe eller forsterket avdeling', text: 'Kommunen tildeler plass etter sakkyndig vurdering fra PP-tjenesten.', chip: 'Spesialgruppe', unknown: 'Spesialgruppe' },
    { group: 'Støtte og tilrettelegging', id: 'aks', title: 'SFO/AKS også etter 4. trinn', text: 'Barn med særskilte behov har rett til SFO/AKS til og med 7. trinn.', chip: 'SFO/AKS etter 4. trinn', unknown: 'SFO/AKS etter 4. trinn' },
    { group: 'Støtte og tilrettelegging', id: 'rolige', title: 'Rolige rom og forutsigbar hverdag', text: 'For barn som blir slitne av lyd og mange inntrykk.', chip: 'Rolige rom', unknown: 'Rolige rom' },
    { group: 'Støtte og tilrettelegging', id: 'norsk', title: 'Barnet trenger norskopplæring', text: 'Vi viser hvor mange elever som får forsterket opplæring i norsk, og om skolen har mottaksgruppe (Oslo).', chip: 'Norskopplæring', unknown: 'Mottaksgruppe og norskopplæring' },
    { group: 'Trivsel', id: 'mobbing', title: 'Lite mobbing og god trivsel', text: 'Vi viser tallene med sammenligning i ord.', chip: 'Lite mobbing' },
    { group: 'Hverdagen', id: 'sti', title: 'Kort skolevei uten trapper', text: 'Vi viser avstanden i luftlinje. Om veien har trapper, vet vi ikke ennå.', chip: 'Skolevei uten trapper', unknown: 'Trinnfri skolevei' },
    { group: 'Hverdagen', id: 'kollektiv', title: 'Kollektivtransport eller skoleskyss', text: 'Barn med funksjonsnedsettelse kan ha rett til gratis skoleskyss.', chip: 'Kollektivtransport', unknown: 'Kollektivtransport og skoleskyss' },
    { group: 'Resultater (valgfritt)', id: 'resultater', title: 'Resultater fra nasjonale prøver', text: 'Vises i ord. Mange elever med tilrettelagt opplæring er fritatt fra prøvene.', chip: 'Nasjonale prøver' }
];

// How a school meets what the family chose: `ok` = the numbers say so, `warn` = worth asking about, `unknown` = we
// have no data. Each chosen priority gives one or two facts; it is met when all of them are ok.
function evaluatePriorities(selected, school, n) {
    const facts = [];
    let met = 0, known = 0, warnings = 0;
    let current = null;
    const add = (tone, text) => { facts.push({ tone, text, id: current }); if (tone === 'warn') warnings++; };
    selected.forEach(pr => {
        current = pr.id;
        if (pr.id === 'mobbing') {
            const mw = mobbingWord(n.mob, n.national), tw = trivselWord(n.triv);
            if (!mw && !tw) { add('unknown', `${t('Mobbing og trivsel')} – ${t('spør skolen')}`); return; }
            known++;
            let ok = true;
            if (mw) {
                const phrase = { 'Over dobbelt så høyt': 'over dobbelt så høyt som landet', 'Mer enn snittet': 'høyere enn landet', 'Mindre enn snittet': 'lavere enn landet', 'Som snittet': 'omtrent som landet' }[mw[0]];
                ok = ok && mw[1] !== 'warn';
                add(mw[1] === 'warn' ? 'warn' : 'ok', `${t('Mobbing')} ${formatPercent(n.mob)} – ${t(phrase)} (${formatPercent(n.national)})`);
            }
            if (tw) {
                const phrase = { 'Over snittet': 'høyere enn landet', 'Under snittet': 'lavere enn landet', 'Som snittet': 'omtrent som landet' }[tw[0]];
                ok = ok && tw[1] !== 'warn';
                add(tw[1] === 'warn' ? 'warn' : 'ok', `${t('Trivsel')} ${formatDecimal(n.triv)} ${t('av 5')} – ${t(phrase)} (${formatDecimal(n.trivNational)})`);
            }
            if (ok) met++;
        } else if (pr.id === 'resultater') {
            const band = scoreBand(n.avg, n.avgNational);
            if (band === 'none') { add('unknown', `${t('Nasjonale prøver')} – ${t('spør skolen')}`); return; }
            known++;
            const good = band === 'very-high' || band === 'high';
            if (good) met++;
            add(good ? 'ok' : 'warn', `${t('Nasjonale prøver')} ${formatDecimal(n.avg)} – ${t(SCORE_WORD[band][0]).toLowerCase()}`);
        } else if (pr.id === 'norsk' && school.gsi && school.gsi.norsk > 0) {
            known++; met++;
            // The year beside the share: for some schools the newest GSI figure is from an earlier school year
            const norskYear = school.gsi.norskYear ? String(school.gsi.norskYear).replace('-', '–') : null;
            add('ok', norskYear
                ? t('Forsterket opplæring i norsk for {share} av elevene ({year})', { share: formatPercent(school.gsi.norsk), year: norskYear })
                : t('Forsterket opplæring i norsk for {share} av elevene', { share: formatPercent(school.gsi.norsk) }));
        } else {
            add('unknown', `${t(pr.unknown)} – ${t('spør skolen')}`);
        }
    });
    // Confirmed facts first, then what we do not know, then what is worth checking
    facts.sort((a, b) => ({ ok: 0, unknown: 1, warn: 2 }[a.tone] - { ok: 0, unknown: 1, warn: 2 }[b.tone]));
    return { facts, met, known, warnings };
}

const priorityFactHtml = ({ tone, text }) => {
    const label = { ok: 'Bekreftet', unknown: 'Ukjent', warn: 'Verdt å sjekke' }[tone];
    const name = { ok: 'check', unknown: 'question', warn: 'warn' }[tone];
    return `<span class="fact fact--${tone}">${FLOW_ICON[name]}<span><strong>${t(label)}:</strong> ${text}</span></span>`;
};


// The chosen priorities live in the address bar (a link the family shares itself) and, for the other pages of the
// same tab (the comparison), in sessionStorage. Never anywhere else.
const PRIORITIES_STORAGE_KEY = 'skolekartet-prioriteringer';

function rememberPriorities(ids) {
    try {
        if (ids.length) sessionStorage.setItem(PRIORITIES_STORAGE_KEY, ids.join(','));
        else sessionStorage.removeItem(PRIORITIES_STORAGE_KEY);
    } catch (error) {
        // Storage blocked: the comparison then only has the priorities in its own link
    }
}

function rememberedPriorities() {
    try {
        return (sessionStorage.getItem(PRIORITIES_STORAGE_KEY) || '').split(',').filter(id => PRIORITIES.some(p => p.id === id));
    } catch (error) {
        return [];
    }
}

// Language support: Norwegian (default), English and Ukrainian.
//
// The Norwegian text is the key. t('Nullstill') returns the English or Ukrainian text when that
// language is chosen, otherwise the Norwegian text itself. Texts with values use placeholders:
// t('Viser {shown} av {total}', { shown: 20, total: 300 }).
// The English texts are below (EN). The Ukrainian texts are in i18n-uk.js (I18N_UK), which this
// file loads only when Ukrainian is chosen, so the other languages do not download them.
//
// Fixed texts in the HTML and in content added later (lists, popups, the school page) are
// translated automatically when their whole text matches a key, so most code needs no
// changes. Only texts with values in them call t() directly.
//
// The English and Ukrainian texts must be checked by a person. A notice under the header says that the
// Norwegian version applies if anything differs.
// Choose language with ?lang=en, ?lang=uk or ?lang=no; the choice is remembered in this browser.

const I18N = (() => {
    const SUPPORTED = ['no', 'en', 'uk'];
    // Each language in its own words, for the switch: [long name, short name]
    const NAMES = { no: ['Norsk', 'NO'], en: ['English', 'EN'], uk: ['Українська', 'УКР'] };
    const STORAGE_KEY = 'skolekartet-lang';
    // Pages whose own content is translated; on the others only the header and footer are
    const TRANSLATED_PAGES = ['', 'index.html', 'om-skolekartet.html', 'skole.html', 'datakilder.html', 'om-fargefordelingen.html', 'om-skolekrets.html', 'tilbakemelding.html',
                              'ny-i-norge.html', 'skolefritid.html', 'skolehverdag.html', 'tilgjengelighet.html', 'personvern.html'];

    // The site's root, from this file's own address (static/js/i18n.js), so links and data work the same
    // on the pages at the top and on the school and kommune pages under skoler/
    const ROOT = new URL('../../', (document.currentScript && document.currentScript.src) || location.href);
    // The page's path from the root: "", "skole.html", "skoler/oslo/", "skoler/oslo/majorstuen-skole.html"
    const PAGE = location.pathname.startsWith(ROOT.pathname) ? location.pathname.slice(ROOT.pathname.length) : location.pathname.split('/').pop();
    // A school page under skoler/<kommune>/ is drawn by school-page.js with translations, like skole.html
    const SCHOOL_PAGE = /^skoler\/[^/]+\/[^/]+\.html$/.test(PAGE);

    // A file or page of this site, as a path from the site's root ("static/js/x.json" → "/static/js/x.json")
    function url(path) {
        return new URL(path, ROOT).pathname;
    }

    let lang = 'no';
    try {
        const fromUrl = new URLSearchParams(location.search).get('lang');
        if (SUPPORTED.includes(fromUrl)) {
            lang = fromUrl;
            localStorage.setItem(STORAGE_KEY, fromUrl);
        } else if (SUPPORTED.includes(localStorage.getItem(STORAGE_KEY))) {
            lang = localStorage.getItem(STORAGE_KEY);
        }
    } catch (error) {
        // Storage can be blocked (private mode); the URL parameter still works
    }
    const isEnglish = lang === 'en';
    const translated = lang !== 'no';
    const locale = { no: 'nb-NO', en: 'en-GB', uk: 'uk-UA' }[lang];
    document.documentElement.lang = lang;
    // The Ukrainian texts: a blocking script, so they are there before the page is drawn
    if (lang === 'uk') {
        const self = document.currentScript && document.currentScript.src;
        const version = self ? (self.match(/[?&]v=(\d+)/) || [])[1] : null;
        document.write(`<script src="${url('static/js/i18n-uk.js')}${version ? `?v=${version}` : ''}"><\/script>`);
    }

    const EN = {
        // ── Header, footer, notices ───────────────────────────────────────
        'Hovedmeny': 'Main menu',
        'Om fargefordelingen': 'About the colours',
        'Om skolekrets': 'About school districts',
        'Tilbakemelding': 'Feedback',
        'Datakilder': 'Data sources',
        'Til toppen': 'Back to top',
        'Resultater fra nasjonale prøver på kart. Fargene viser skolens snitt sammenlignet med landsgjennomsnittet.':
            'Results from the national tests on a map. The colours show each school’s average compared with the national average.',
        'Om tjenesten': 'About the service',
        'Personvern': 'Privacy',
        'Adressen du søker på sendes til Kartverkets adresse-API for å finne posisjonen. Skolekartet lagrer den ikke.':
            'The address you search for is sent to the Norwegian Mapping Authority’s address API to find its position. Skolekartet does not store it.',
        'Hopp til hovedinnhold': 'Skip to main content',
        'Kjennetegn': 'Features',
        'Tilbake til kartet': 'Back to the map',
        'Tilbake': 'Back',
        'Skolekartet – finn skole og se nasjonale prøver på kart': 'Skolekartet – find a school and see national test results on a map',
        'Skole – Skolekartet': 'School – Skolekartet',
        'Laster skole…': 'Loading school…',

        // ── Search ────────────────────────────────────────────────────────
        'Søk på': 'Search by',
        'Adresse': 'Address',
        'Skolenavn': 'School name',
        'F.eks. Kirkeveien 64, Oslo': 'E.g. Kirkeveien 64, Oslo',
        'F.eks. Majorstuen skole': 'E.g. Majorstuen skole',
        'Tøm adressesøk': 'Clear address search',
        'Tøm skolesøk': 'Clear school search',
        '%d adresse': '%d address',
        '%d adresser': '%d addresses',
        '%d skole': '%d school',
        '%d skoler': '%d schools',
        'Ingen adresser funnet': 'No addresses found',
        'Adressesøket er ikke tilgjengelig akkurat nå': 'The address search is not available right now',
        'Ingen skoler funnet': 'No schools found',
        'Viser {shown} av {total} treff. Skriv mer for å snevre inn.': 'Showing {shown} of {total} matches. Type more to narrow the search.',

        // ── Filters ───────────────────────────────────────────────────────
        'Filtrer skoler': 'Filter schools',
        'Alle': 'All',
        'Resultat': 'Result',
        'Ingen': 'None',
        '1 aktivt filter': '1 active filter',
        '{count} aktive filtre': '{count} active filters',
        'Skoletype': 'School type',
        'Barneskole': 'Primary school',
        'Ungdomsskole': 'Lower secondary school',
        'Eierform': 'Ownership',
        'Offentlig': 'Public',
        'Privat': 'Private',
        'Kommune': 'Municipality',
        'Alle kommuner': 'All municipalities',
        'Profil': 'Profile',
        'Alle profiler': 'All profiles',
        'Snittet er gjennomsnittet av skolens skalapoeng i engelsk, lesing og regning på nasjonale prøver 2025–26. Fag uten publisert resultat telles ikke med. Skalaen er satt slik at landsgjennomsnittet var 50 i 2022.':
            'The average of the school’s scale points in English, reading and numeracy on the 2025–26 national tests. Subjects without a published result are not counted. The scale is set so that the national average was 50 in 2022.',
        'Under 45': 'Under 45',
        '45–49,3': '45–49.3',
        '49,3–55': '49.3–55',
        '55 og over': '55 and over',
        'Ingen data': 'No data',
        'Trivsel (1–5)': 'Well-being (1–5)',
        'Elevenes gjennomsnittlige svar på «Trives du på skolen?» i Elevundersøkelsen, på en skala fra 1 til 5. 7. trinn for barneskoler og 10. trinn for ungdomsskoler. Små grupper er skjult av Udir.':
            'Pupils’ average answer to “Do you enjoy school?” in the Pupil Survey, on a scale from 1 to 5. Year 7 for primary schools and year 10 for lower secondary schools. Small groups are hidden by Udir.',
        'Under 3,8': 'Under 3.8',
        '3,8–3,9': '3.8–3.9',
        '4,0–4,1': '4.0–4.1',
        '4,2–4,3': '4.2–4.3',
        '4,4 og over': '4.4 and over',
        'Mobbing (andel elever)': 'Bullying (share of pupils)',
        'Andelen elever som svarer at de er blitt mobbet to eller tre ganger i måneden eller oftere, av andre elever, digitalt eller av voksne på skolen. Elevundersøkelsen 2025–26, 7. trinn for barneskoler og 10. trinn for ungdomsskoler. Landsgjennomsnittet er 11,3 % på 7. trinn og 9,6 % på 10. trinn. Små grupper er skjult av Udir.':
            'The share of pupils who say they have been bullied two or three times a month or more, by other pupils, online or by adults at school. Pupil Survey 2025–26, year 7 for primary schools and year 10 for lower secondary schools. The national average is 11.3% in year 7 and 9.6% in year 10. Small groups are hidden by Udir.',
        'Under 5 %': 'Under 5%',
        '5–9,9 %': '5–9.9%',
        '10–14,9 %': '10–14.9%',
        '15 % og over': '15% and over',
        'Montessori': 'Montessori',
        'Steiner': 'Steiner',
        'Kristen': 'Christian',
        'Internasjonal': 'International',
        'Toppidrett': 'Elite sports',
        'Realfag': 'Science',
        'Andre privatskoler': 'Other private schools',

        // ── School list ───────────────────────────────────────────────────
        'Skoler og kart': 'Schools and map',
        'Skoler': 'Schools',
        'Nærmest': 'Nearest',
        'Navn': 'Name',
        'Høyest snitt': 'Highest average',
        'Lavest snitt': 'Lowest average',
        'Høyest trivsel': 'Highest well-being',
        'Lavest trivsel': 'Lowest well-being',
        'Minst mobbing': 'Least bullying',
        'Mest mobbing': 'Most bullying',
        'Vis flere skoler': 'Show more schools',
        'Kart over skoler': 'Map of schools',
        'skole': 'school',
        'skoler': 'schools',
        'Ingen skoler': 'No schools',
        'Viser {shown} av {total} {noun}': 'Showing {shown} of {total} {noun}',
        '{total} {noun}': '{total} {noun}',
        'filtrert': 'filtered',
        'Flytt kartet eller endre filtrene.': 'Move the map or change the filters.',
        'Privat, {profile}': 'Private, {profile}',
        'Snitt': 'Average',
        'Trivsel': 'Well-being',
        'Mobbing': 'Bullying',
        '{value} av 5': '{value} out of 5',
        'Skolekrets (pilot)': 'School district (pilot)',
        'Slå opp adressen hos Oslo kommune:': 'Look up the address with Oslo municipality (in Norwegian):',
        'Finn barneskole': 'Find primary school',
        'Finn ungdomsskole': 'Find lower secondary school',
        'Skolen for adressen': 'The school for the address',
        'Lagre': 'Save',
        'Om skolekretsdataene': 'About the school district data',
        'Lagret': 'Saved',
        'Del': 'Share',
        'Lenken er kopiert': 'Link copied',
        'Kopier lenken til skolen:': 'Copy the link to the school:',

        // ── School district note (address search) ─────────────────────────
        'Listen viser skolene nærmest adressen. Det er ikke sikkert at dette er skolen barnet sogner til. Kommunen bestemmer skolekretsen.':
            'The list shows the schools nearest to the address. This is not necessarily the school your child belongs to. The municipality decides the school district.',
        'Sjekk skolekretsen hos {kommune} kommune': 'Check the school district with {kommune} municipality',
        'Sjekk skolekretsen hos kommunen': 'Check the school district with the municipality',
        'Pilot': 'Pilot',
        'Skolekrets fra kommunens åpne data': 'School district from the municipality’s open data',
        'Barneskole:': 'Primary school:',
        'Ungdomsskole:': 'Lower secondary school:',
        'ingen skole i dataene': 'no school in the data',
        '({name} skolekrets)': '({name} school district)',
        'Adressen ligger utenfor skolekretsene i datasettet.': 'The address is outside the school districts in the dataset.',
        'Dette er en pilot på åpne data og kan avvike fra kommunens gjeldende grenser.':
            'This is a pilot based on open data and may differ from the municipality’s current boundaries.',
        'Kilde:': 'Source:',
        'Halden kommune, «Barneskolekretser i Halden kommune» (Geonorge, åpne data)':
            'Halden municipality, “Primary school districts in Halden” (Geonorge, open data)',
        'Bare barneskolekretser. Halden har ikke publisert ungdomsskolekretsene som åpne data.':
            'Primary school districts only. Halden has not published its lower secondary districts as open data.',
        'Stavanger kommune, «Skolekretser Stavanger» (NLOD 2.0)': 'Stavanger municipality, “School districts Stavanger” (NLOD 2.0)',
        'Oslo kommune, skolekretser (brukt med tillatelse)': 'Oslo municipality, school districts (used with permission)',
        'Kretsgrensene er veiledende. Det er kommunen som fatter vedtak om skoleplass.': 'The district boundaries are a guide. The municipality decides on the school place.',
        'Datasettet er ikke datert, og datakatalogen oppgir 2018 som siste oppdatering. Kretsene kan derfor avvike fra dagens grenser.':
            'The dataset is not dated, and the data catalogue gives 2018 as the last update. The districts may therefore differ from today’s boundaries.',

        // ── Map popup ─────────────────────────────────────────────────────
        'Barneskole (5. trinn)': 'Primary school (year 5)',
        'Engelsk {engelsk} · Lesing {lesing} · Regning {regning}': 'English {engelsk} · Reading {lesing} · Numeracy {regning}',
        'Ingen resultater publisert': 'No results published',
        'ingen data': 'no data',
        '({count} fag)': '({count} subjects)',
        '({trinn}. trinn)': '(year {trinn})',
        '(landet {value})': '(national {value})',
        'Vis historikk': 'Show history',
        'Skjul historikk': 'Hide history',
        'Resultater tidligere år': 'Results in earlier years',
        'Les mer om skolen': 'Read more about the school',
        'Foto av {name}': 'Photo of {name}',
        'Foto:': 'Photo:',

        // ── School page ───────────────────────────────────────────────────
        'Kunne ikke laste skolen': 'Could not load the school',
        'Kunne ikke laste skolene': 'Could not load the schools',
        'Sjekk nettforbindelsen og prøv igjen.': 'Check your internet connection and try again.',
        'Prøv igjen': 'Try again',
        'Laster skoler…': 'Loading schools…',
        'Fant ikke skolen': 'School not found',
        'Lenken peker ikke til en skole vi har data for.': 'The link does not point to a school we have data for.',
        'Gå til kartet': 'Go to the map',
        'Geonorge, Grunnskoler (Udir)': 'Geonorge, Primary schools (Udir)',
        'Nasjonalt skoleregister (Udir)': 'National School Register (Udir)',
        'Kartverket, adresse fra skoleregisteret': 'Norwegian Mapping Authority, address from the school register',
        'OpenStreetMap': 'OpenStreetMap',
        'åpne kilder': 'open sources',
        'landet {value}': 'national {value}',
        'Snitt av skalapoeng i engelsk, lesing og regning ({count} fag). Skalaen har ingen makspoeng, derfor vises landsgjennomsnittet.':
            'Average scale points in English, reading and numeracy ({count} subjects). The scale has no maximum, so the national average is shown.',
        'Nasjonale prøver, {type}, {year}': 'National tests, {type}, {year}',
        'Udir har ikke publisert resultater for skolen, ofte fordi gruppen er liten.': 'Udir has not published results for the school, often because the group is small.',
        'av 5': 'out of 5',
        'Elevenes gjennomsnittlige svar på en skala fra 1 til 5.': 'Pupils’ average answer on a scale from 1 to 5.',
        'Trivsel, {trinn}. trinn, Elevundersøkelsen {year}': 'Well-being, year {trinn}, Pupil Survey {year}',
        'Ikke publisert for skolen, ofte fordi for få elever svarte.': 'Not published for the school, often because too few pupils answered.',
        'Andel elever som er blitt mobbet to eller tre ganger i måneden eller oftere. Landsgjennomsnitt: {value}.':
            'Share of pupils who have been bullied two or three times a month or more. National average: {value}.',
        'Mobbing på skolen, {trinn}. trinn, Elevundersøkelsen {year}': 'Bullying at school, year {trinn}, Pupil Survey {year}',
        'Om skolen': 'About the school',
        'Resultater': 'Results',
        'Aktivitetsskolen': 'After-school care',
        'SFO': 'After-school care',
        'Ny i Norge': 'New in Norway',
        'Kart': 'Map',
        'Skole i': 'School in',
        '{kommune} kommune': '{kommune} municipality',
        'Besøksadresse': 'Visiting address',
        'Henter adresse…': 'Fetching address…',
        'Åpne i Google Maps': 'Open in Google Maps',
        'Kontakt': 'Contact',
        'Følg skolen': 'Follow the school',
        'Vis på kartet': 'Show on the map',
        'Se {type}': 'See {type}',
        'Skolens nettside': 'School website',
        'Snarveier': 'Shortcuts',
        'Vis i skolekartet': 'Show on the school map',
        'Postadresse og beliggenhet': 'Postal address and location',
        'Kart og gangtid': 'Map and walking time',
        'Anlegg': 'Facilities',
        'Mat hver dag': 'Food every day',
        'Mat på AKS: hvor mange dager, varm mat og dager med ekstra matpakke': 'Food at after-school care: how many days, warm food and days with an extra packed lunch',
        'AKS-sidene på skolens nettside (startsiden og sidene i AKS-menyen)': 'The after-school pages on the school’s website (the start page and the pages in its menu)',
        'Bare disse faktaene, lest med faste regler, ikke tekst fra siden. Vises bare når sidene sier det tydelig og ikke motsier hverandre': 'Only these facts, read with fixed rules, not text from the pages. Shown only when the pages say it clearly and do not contradict each other',
        'Mat én dag i uken': 'Food one day a week',
        'Mat {count} dager i uken': 'Food {count} days a week',
        'Varm mat': 'Warm food',
        'Hver dag': 'Every day',
        '{count} ganger i uken': '{count} times a week',
        'Ta med ekstra matpakke': 'Bring an extra packed lunch',
        'AKS-sidene på skolens nettside, lest {date}': 'the after-school pages on the school’s website, read {date}',
        'Én gang i uken': 'Once a week',
        'Lagre til senere': 'Save for later',
        'Fjern alle': 'Remove all',
        'Aktive filtre': 'Active filters',
        'Fjern filter: {label}': 'Remove filter: {label}',
        'lavere enn landsgjennomsnittet': 'lower than the national average',
        'høyere enn landsgjennomsnittet': 'higher than the national average',
        'Rødt betyr lavere enn landsgjennomsnittet.': 'Red means lower than the national average.',
        'Rødt betyr høyere enn landsgjennomsnittet.': 'Red means higher than the national average.',
        'Rødt betyr lavere enn landsgjennomsnittet, for mobbing høyere.': 'Red means lower than the national average; for bullying, higher.',
        'Skoler etter kommune': 'Schools by municipality',
        'Nasjonale prøver {year}': 'National tests {year}',
        'Skjul kartet': 'Hide the map',
        "Skolekartet er et privat, ikke-kommersielt prosjekt og har ansvaret for opplysningene som beskrives her. Spørsmål om personvern, eller ønske om å få slettet en tilbakemelding, kan sendes via": "Skolekartet is a private, non-commercial project and is responsible for the information described here. Questions about privacy, or a request to have feedback deleted, can be sent through",
        "Kom i kontakt med oss": "Get in touch",
        "Kildekoden på GitHub": "Source code on GitHub",
        "Fargene på kartet og i listen bygger på det siste skoleåret med publiserte resultater fra nasjonale prøver. Resultatene fra tidligere år ser du på siden til hver skole.": "The colours on the map and in the list are based on the latest school year with published national test results. Results from earlier years are on each school’s page.",
        "Snitt nasjonale prøver": "National test average",
        "Lukk filter": "Close filters",
        "Vis skolene": "Show the schools",
        "Vis 1 skole": "Show 1 school",
        "Vis {count} skoler": "Show {count} schools",
        "Filter": "Filters",
        "Nullstill": "Reset",
        "Sist oppdatert 4. november 2026.": "Last updated 4 November 2026.",
        "Adressen eller posisjonen du søkte på, for gangtid på skolesiden": "The address or location you searched from, for the walking time on the school page",
        "Leter du etter en skole?": "Looking for a school?",
        "Velger du «Din posisjon» i adressefeltet eller på kartet, spør nettleseren deg først om lov. Posisjonen brukes bare i nettleseren din, akkurat som en adresse du har søkt på: den sendes ikke til Kartverket eller oss og legges ikke i lenker. For gangtid sendes bare koordinatene til Entur, som for en adresse. Du kan når som helst ta tilbake tillatelsen i nettleserens innstillinger.": "If you choose “Your location” in the address field or on the map, the browser first asks for your permission. The location is only used in your browser, just like an address you have searched for: it is not sent to the Norwegian Mapping Authority or to us and is not put in links. For the walking time, only the coordinates are sent to Entur, as for an address. You can withdraw the permission at any time in the browser’s settings.",
        "Tema": "Theme",
        "Temaet du har valgt": "The theme you have chosen",
        "Bruk min posisjon": "Use my location",
        "Din posisjon": "Your location",
        "Nettleseren har ikke lov til å bruke posisjonen din. Skriv inn en adresse i stedet.": "The browser is not allowed to use your location. Enter an address instead.",
        "Fant ikke posisjonen din. Skriv inn en adresse i stedet.": "Could not find your location. Enter an address instead.",
        "Adressesøk, posisjon og gangtid": "Address search, location and walking time",
        "Til du velger noe annet eller sletter nettstedsdata": "Until you choose something else or clear site data",
        "Skoler i nærheten ({shown} av {total})": "Nearby schools ({shown} of {total})",
        "Skoler i nærheten ({count})": "Nearby schools ({count})",
        "Datakilder og metode – Skolekartet": "Data sources and method – Skolekartet",
        "Datakilder og metode": "Data sources and method",
        "Hvor tallene i Skolekartet kommer fra, hvor ofte de oppdateres, og hva du bør vite om dem.": "Where the figures in Skolekartet come from, how often they are updated, and what you should know about them.",
        "Vi kjøper ingen data og bruker ingen kommersielle dataleverandører.": "We do not buy any data and use no commercial data suppliers.",
        "På denne siden": "On this page",
        "Kilder og lisenser": "Sources and licences",
        "Hvor ofte tallene oppdateres": "How often the figures are updated",
        "Kjente begrensninger": "Known limitations",
        "Retting av feil": "Correcting errors",
        "Vi henter nye tall når kilden har publisert dem, aldri oftere. Nederst på hver side står datoen da tallene sist ble sjekket mot kildene.": "We fetch new figures when the source has published them, never more often. The bottom of every page shows the date the figures were last checked against the sources.",
        "Kilden publiserer": "The source publishes",
        "Hos oss": "On Skolekartet",
        "Navn, adresse, eierform og elevtall (Nasjonalt skoleregister)": "Name, address, ownership and number of pupils (National School Register)",
        "Løpende": "Continuously",
        "Sjekkes hver natt": "Checked every night",
        "Elevundersøkelsen: trivsel, mobbing og de andre indikatorene": "Pupil Survey: well-being, bullying and the other indicators",
        "Én gang i året": "Once a year",
        "Sjekkes hver natt og lastes ned når Udir har publisert nye tall": "Checked every night and downloaded when Udir has published new figures",
        "Legges inn når Udir har publisert resultatene": "Added when Udir has published the results",
        "Skolekretser (pilot)": "School catchment areas (pilot)",
        "Når kommunen oppdaterer kartdataene": "When the municipality updates its map data",
        "Legges inn for hånd": "Added by hand",
        "Opplysninger fra skolenes og kommunenes nettsider": "Information from the schools’ and municipalities’ websites",
        "Når skolen eller kommunen endrer siden": "When the school or municipality changes the page",
        "Hentes jevnlig. Datoen står ved opplysningen på skolesiden": "Fetched regularly. The date is shown next to the information on the school page",
        "Ingen datakilde er uten hull. Det er viktigere å være åpen om dem enn å gi inntrykk av at tallene sier alt.": "No data source is without gaps. It is more important to be open about them than to give the impression that the figures say everything.",
        "Små grupper er skjult.": "Small groups are hidden.",
        "Udir publiserer ikke resultater når det er så få elever at tallene kan si noe om enkeltelever. Små skoler mangler derfor ofte tall, og vi viser «–». Det betyr ikke at skolen har noe å skjule.": "Udir does not publish results when there are so few pupils that the figures could reveal something about individual pupils. Small schools therefore often lack figures, and we show “–”. This does not mean the school has anything to hide.",
        "Svarene er frivillige.": "Answering is voluntary.",
        "Skolene må gjennomføre Elevundersøkelsen på 7. og 10. trinn, men elevene velger selv om de vil svare. Når få har svart, er tallene mindre sikre.": "Schools must run the Pupil Survey in years 7 and 10, but pupils choose whether to answer. When few have answered, the figures are less reliable.",
        "Tallene er fra forrige skoleår.": "The figures are from the previous school year.",
        "Udir publiserer resultatene noen måneder etter at prøvene og undersøkelsen er gjennomført. Tallene du ser, kan derfor være opptil et år gamle. Det er vanlig for slik statistikk.": "Udir publishes the results a few months after the tests and the survey have taken place. The figures you see can therefore be up to a year old. This is normal for this kind of statistics.",
        "Ett år er et øyeblikksbilde.": "One year is a snapshot.",
        "Resultatene kan variere mye fra år til år, særlig på små skoler. Se utviklingen over flere år på skolesiden.": "Results can vary a lot from year to year, especially at small schools. See the trend over several years on the school page.",
        "Skolekrets bare i noen kommuner.": "Catchment areas only in some municipalities.",
        "Vi viser skolekrets for adressen bare der kommunen har åpne kartdata. Ellers viser vi den nærmeste skolen, som trolig er nærskolen, men det avgjør kommunen.": "We only show the catchment area for an address where the municipality has open map data. Elsewhere we show the nearest school, which is probably the local school, but the municipality decides.",
        "Avstand og gangtid er beregnet.": "Distance and walking time are calculated.",
        "Avstanden er i luftlinje, og gangtiden er et anslag fra Enturs reiseplanlegger.": "The distance is in a straight line, and the walking time is an estimate from Entur’s journey planner.",
        "Ser du noe som er feil, for eksempel en lenke som ikke virker eller et tall som ikke stemmer med Udir?": "Do you see something wrong, for example a link that does not work or a figure that does not match Udir?",
        "Feil vi har gjort selv, retter vi. Tall fra Udir eller kommunen kan vi ikke endre. Hvis vi viser dem slik kilden publiserer dem, må feilen rettes hos kilden, og da hjelper vi deg gjerne med å finne hvem du skal kontakte.": "We correct errors we have made ourselves. We cannot change figures from Udir or the municipality. If we show them as the source publishes them, the error must be corrected by the source, and we are happy to help you find who to contact.",
        "Slik melder du fra om feil, og slik retter vi dem:": "How to report errors, and how we correct them:",
        "Sorter:": "Sort:",
        "Ansvar for innholdet": "Responsibility for the content",
        "Skolekartet er bare til informasjon. Innholdet skal gjøre det lettere å finne og sammenligne skoler, men er ikke et offisielt vedtak eller et råd om skolevalg.": "Skolekartet is for information only. The content is meant to make it easier to find and compare schools, but it is not an official decision or advice on choosing a school.",
        "Opplysningene kommer fra offentlige kilder og skolenes og kommunenes egne nettsider. Alle kilder og lisenser står under": "The information comes from public sources and the schools’ and municipalities’ own websites. All sources and licences are listed under",
        "Vi gjør vårt beste for at opplysningene er riktige og oppdaterte, men tar forbehold om feil og mangler.": "We do our best to keep the information correct and up to date, but we cannot rule out errors and omissions.",
        "Hvis noe her avviker fra kilden, er det kilden som gjelder.": "If anything here differs from the source, the source applies.",
        "Hvilken skole et barn skal gå på, og hvilket tilbud skolen har, avgjør kommunen og skolen. Ta kontakt med dem før du tar viktige valg.": "Which school a child attends, and what the school offers, is decided by the municipality and the school. Contact them before you make important choices.",
        "Vi har ikke ansvar for innholdet på nettsider vi lenker til.": "We are not responsible for the content of websites we link to.",
        "Hvem som står bak Skolekartet: uavhengig, uten reklame og uten sponsorer, og bare til informasjon.": "Who is behind Skolekartet: independent, with no advertising or sponsors, and for information only.",
        "Snittet er gjennomsnittet av skolens skalapoeng i engelsk, lesing og regning på nasjonale prøver {year}. Fag uten publisert resultat telles ikke med. Skalaen er satt slik at landsgjennomsnittet var 50 i 2022.": "The average of the school’s scale points in English, reading and numeracy on the {year} national tests. Subjects without a published result are not counted. The scale is set so that the national average was 50 in 2022.",
        "Andelen elever som svarer at de er blitt mobbet to eller tre ganger i måneden eller oftere, av andre elever, digitalt eller av voksne på skolen. Elevundersøkelsen {year}, 7. trinn for barneskoler og 10. trinn for ungdomsskoler. Landsgjennomsnittet er {barne} på 7. trinn og {ungdom} på 10. trinn. Små grupper er skjult av Udir.": "The share of pupils who say they have been bullied two or three times a month or more, by other pupils, online or by adults at school. Pupil Survey {year}, year 7 for primary schools and year 10 for lower secondary schools. The national average is {barne} in year 7 and {ungdom} in year 10. Small groups are hidden by Udir.",
        "Tallene ble sist sjekket mot kildene {date}.": "The figures were last checked against the sources on {date}.",
        "Vi bruker tilbakemeldingene bare til å rette feil, forbedre Skolekartet og svare deg hvis du har oppgitt e-post. Grunnlaget er vår berettigede interesse i å drive en tjeneste som fungerer (personvernforordningen artikkel 6 nr. 1 bokstav f). Vi publiserer ikke tilbakemeldinger og deler dem ikke med andre. Vi beholder dem så lenge de er nyttige for å forbedre tjenesten, og sletter dem når de ikke lenger trengs. Du kan når som helst be oss slette en tilbakemelding du har sendt.": "We only use feedback to fix errors, improve Skolekartet and reply to you if you have given an email address. The legal basis is our legitimate interest in running a service that works (GDPR Article 6(1)(f)). We do not publish feedback or share it with others. We keep it as long as it is useful for improving the service, and delete it when it is no longer needed. You can ask us at any time to delete feedback you have sent.",
        "Grønn": "Green",
        "Blå": "Blue",
        "Skolekartet er en informasjonstjeneste. Vi samler ikke inn opplysninger om deg, med ett unntak: tilbakemeldinger du selv velger å sende. Vi har ingen innlogging, ingen analyseverktøy og setter ingen informasjonskapsler (cookies).": "Skolekartet is an information service. We do not collect information about you, with one exception: feedback you choose to send. We have no login, no analytics tools and set no cookies.",
        "Adressen du søker på, lagres ikke hos oss og legges aldri i lenker du kan dele.": "The address you search for is not stored by us and is never put in links you can share.",
        "Det er frivillig å sende tilbakemelding. Svar på «Fant du det du lette etter?» og meldinger fra tilbakemeldingsskjemaet sendes via Formspree (Formspree Inc., USA), som behandler dem på våre vegne. Med svaret følger adressen til siden og sidetittelen. E-postadressen din følger bare med hvis du selv skriver den inn. Formspree registrerer også IP-adressen din. Formspree lagrer data hos Amazon Web Services i USA og oppgir at overføringen bygger på EUs standardkontraktsklausuler.": "Sending feedback is voluntary. Answers to “Did you find what you were looking for?” and messages from the feedback form are sent through Formspree (Formspree Inc., USA), which processes them on our behalf. The answer includes the page address and page title. Your email address is only included if you enter it yourself. Formspree also records your IP address. Formspree stores data with Amazon Web Services in the USA and states that the transfer is based on the EU standard contractual clauses.",
        "Ikke skriv navn, telefonnummer eller andre personopplysninger i tekstfeltet.": "Do not write names, phone numbers or other personal information in the text field.",
        "Snitt 5. trinn": "Average year 5",
        "Snitt ungdomstrinnet": "Average lower secondary",
        "Om Skolekartet": "About Skolekartet",
        "Skolekartet samler resultater fra nasjonale prøver og annen offentlig informasjon om grunnskoler på ett kart, slik at det blir lettere å finne og sammenligne skoler.": "Skolekartet brings together results from the national tests and other public information about primary and lower secondary schools on one map, making it easier to find and compare schools.",
        "Dette er vi ikke": "What we are not",
        "Ikke en offentlig etat.": "Not a public authority.",
        "Vi er ikke Utdanningsdirektoratet, statsforvalteren, en kommune eller en annen offentlig myndighet.": "We are not the Norwegian Directorate for Education and Training, the county governor, a municipality or any other public authority.",
        "Ikke sponset.": "Not sponsored.",
        "Ingen skole, kommune, forlag, friskole eller programvareleverandør betaler for å bli omtalt eller vist.": "No school, municipality, publisher, independent school or software supplier pays to be mentioned or shown.",
        "Ingen reklame.": "No advertising.",
        "Du ser ingen bannere, popup-vinduer, cookie-vegger eller tilknyttede lenker (affiliate). Vi laster ingen analyseverktøy i nettleseren din. Les mer under": "You will see no banners, pop-ups, cookie walls or affiliate links. We load no analytics tools in your browser. Read more under",
        "Finansiering": "Funding",
        "Skolekartet er finansiert med egne midler. Hvis tjenesten en dag trenger annen finansiering, skal det skje åpent og uten at det går ut over den redaksjonelle uavhengigheten.": "Skolekartet is self-funded. If the service one day needs other funding, this will be done openly and without affecting its editorial independence.",
        "Hvem har ansvaret?": "Who is responsible?",
        "tilbakemeldingsskjemaet": "the feedback form",
        "Dette samler vi ikke inn": "What we do not collect",
        "Vi har ingen innlogging eller brukerkontoer.": "We have no login or user accounts.",
        "Vi bruker ingen analyseverktøy og teller ikke besøk.": "We use no analytics tools and do not count visits.",
        "Vi setter ingen informasjonskapsler.": "We set no cookies.",
        "Vi lagrer ikke hvilke skoler du ser på eller hva du søker etter.": "We do not store which schools you look at or what you search for.",
        "Adressen du skriver, sendes direkte fra nettleseren din til Kartverkets adresse-API for å finne posisjonen. Kartverket ser da teksten og IP-adressen din. For gangtid sendes bare koordinatene for adressen og skolen til Enturs reiseplanlegger, ikke selve adressen. Adressen huskes i nettleserfanen så lenge den er åpen, slik at skolesiden kan vise gangtid og kartet kan vises likt når du går tilbake. Den forsvinner når fanen lukkes.": "The address you type is sent directly from your browser to the Norwegian Mapping Authority’s address API to find the position. The Mapping Authority then sees the text and your IP address. For the walking time, only the coordinates of the address and the school are sent to Entur’s journey planner, not the address itself. The address is remembered in the browser tab while it is open, so the school page can show the walking time and the map looks the same when you go back. It disappears when the tab is closed.",
        "Lagring på enheten din": "Storage on your device",
        "Skolekartet lagrer bare det som trengs for funksjoner du selv bruker. Slik lagring krever ikke samtykke etter ekomloven § 3-15. Du kan slette alt ved å slette nettstedsdata i nettleseren.": "Skolekartet only stores what is needed for features you use yourself. Such storage does not require consent under the Electronic Communications Act § 3-15. You can delete everything by clearing site data in your browser.",
        "Nøkkel og type": "Key and type",
        "Formål": "Purpose",
        "Lagringstid": "Storage period",
        "Skoler du selv lagrer med bokmerket («Lagre til senere»)": "Schools you save yourself with the bookmark (“Save for later”)",
        "Til du fjerner skolene eller sletter nettstedsdata": "Until you remove the schools or clear site data",
        "Språket du har valgt": "The language you have chosen",
        "Til du velger et annet språk eller sletter nettstedsdata": "Until you choose another language or clear site data",
        "Til fanen lukkes": "Until the tab is closed",
        "Kartet og listen slik de var, når du går tilbake fra en skoleside": "The map and list as they were, when you go back from a school page",
        "At du har svart på «Fant du det du lette etter?» på en side": "That you have answered “Did you find what you were looking for?” on a page",
        "Tilbakemeldinger": "Feedback",
        "Tjenester nettleseren din kontakter": "Services your browser contacts",
        "Når du bruker Skolekartet, henter nettleseren innhold fra disse tjenestene. De ser IP-adressen din, slik det er på de fleste nettsider, men får ikke vite hva du søker på, med unntak av Kartverket ved adressesøk.": "When you use Skolekartet, your browser fetches content from these services. They see your IP address, as on most websites, but do not learn what you search for, except Kartverket when you search for an address.",
        "GitHub Pages (GitHub Inc., USA): selve nettstedet": "GitHub Pages (GitHub Inc., USA): the website itself",
        "OpenFreeMap: bakgrunnskartet": "OpenFreeMap: the background map",
        "jsDelivr og cdnjs: Designsystemet og kartbibliotekene": "jsDelivr and cdnjs: Designsystemet and the map libraries",
        "Kartverket: adressesøk": "Kartverket: address search",
        "Entur: gangrute, bare koordinater": "Entur: walking route, coordinates only",
        "Utdanningsdirektoratet: opplysninger fra skoleregisteret når du åpner en skoleside": "Norwegian Directorate for Education and Training: information from the school register when you open a school page",
        "Wikimedia Commons: bilder av skolene": "Wikimedia Commons: photos of the schools",
        "Opplysninger om skoler": "Information about schools",
        "Vi viser offentlige opplysninger om skolene. Fra Enhetsregisteret viser vi bare felles e-postadresser og fasttelefon, ikke adresser eller mobilnumre som ser ut til å tilhøre en person. Ved bilder står fotografens navn, slik lisensen krever. Resultatene fra nasjonale prøver og Elevundersøkelsen er tall for hele grupper. Udir skjuler tall for små grupper, og vi viser aldri svar fra enkeltelever.": "We show public information about the schools. From the Central Coordinating Register we only show shared email addresses and landlines, not addresses or mobile numbers that seem to belong to a person. Photos show the photographer’s name, as the licence requires. The results from the national tests and the Pupil Survey are figures for whole groups. Udir hides figures for small groups, and we never show answers from individual pupils.",
        "Dine rettigheter": "Your rights",
        "Du kan be om innsyn i, retting av eller sletting av opplysninger vi har om deg, for eksempel en tilbakemelding du har sendt. Du kan også klage til": "You can ask for access to, correction of or deletion of information we have about you, for example feedback you have sent. You can also complain to",
        "Skolekartet bruker åpne data og offentlige opplysninger fra skolenes og kommunenes egne nettsider. Tabellen viser hvor hver opplysning kommer fra, og hvilken lisens eller hvilke vilkår som gjelder.": "Skolekartet uses open data and public information from the schools’ and municipalities’ own websites. The table shows where each piece of information comes from, and which licence or terms apply.",
        "Hvordan vi behandler opplysninger, og hva som lagres på enheten din, står på siden": "How we handle information, and what is stored on your device, is described on the page",
        "Data": "Data",
        "Personvern – Skolekartet": "Privacy – Skolekartet",
        "Skolekrets, pilot for Fredrikstad": "School district, pilot for Fredrikstad",
        "Inntakssoner for barne- og ungdomsskoler i Fredrikstad kommune (Geonorge)": "Intake zones for primary and lower secondary schools in Fredrikstad municipality (Geonorge)",
        "Åpne data, ingen vilkår for bruk (2018)": "Open data, no conditions of use (2018)",
        "En skole med 1.–10. trinn har egne resultater for barnetrinnet (nasjonale prøver på 5. trinn, Elevundersøkelsen på 7. trinn) og ungdomstrinnet (nasjonale prøver på 8. trinn, Elevundersøkelsen på 10. trinn). På kartet vises den som én skole. Når begge trinn er valgt i filteret, sorteres den etter gjennomsnittet av de to resultatene, og begge vises på kortet.": "A school with years 1–10 has separate results for the primary level (national tests in year 5, the Pupil Survey in year 7) and the lower secondary level (national tests in year 8, the Pupil Survey in year 10). On the map it is shown as one school. When both levels are selected in the filter, it is sorted by the mean of the two results, and both are shown on the card.",
        "Tilgjengelighetserklæring": "Accessibility statement",
        "Tilgjengelighetserklæring – Skolekartet": "Accessibility statement – Skolekartet",
        "Sist oppdatert 3. november 2026.": "Last updated 3 November 2026.",
        "Skolekartet skal kunne brukes av alle, også med skjermleser, tastatur eller forstørrelse. Vi følger kravene i WCAG 2.1 på nivå AA så langt vi klarer, og bygger på Designsystemet fra Digdir.": "Skolekartet should be usable by everyone, also with a screen reader, keyboard or magnification. We follow the requirements in WCAG 2.1 at level AA as far as we can, and build on Designsystemet from Digdir.",
        "Slik har vi sjekket": "How we have checked",
        "Navigering med tastatur": "Navigation with the keyboard",
        "Skjermbredder fra mobil til PC": "Screen widths from mobile to PC",
        "Alternativ tekst til bilder og tabeller til diagrammene": "Alternative text for images and tables for the charts",
        "Løsningen er ikke kontrollert av en uavhengig revisor.": "The service has not been checked by an independent auditor.",
        "Dette fungerer ikke godt nok ennå": "What does not work well enough yet",
        "Kartet er vanskelig å bruke med skjermleser. Listen ved siden av kartet har de samme skolene.": "The map is hard to use with a screen reader. The list next to the map has the same schools.",
        "Fargene på resultatene (rød, gul og grønn) kan være vanskelige å skille for personer med fargesvakhet. Tallene står alltid også i tekst.": "The colours of the results (red, yellow and green) can be hard to tell apart for people with colour vision deficiency. The numbers are always also given as text.",
        "Den engelske og den ukrainske versjonen er ikke kontrollert av en person ennå.": "The English and the Ukrainian version have not yet been checked by a person.",
        "Vi har ikke ansvar for skolenes og kommunenes egne nettsider som vi lenker til.": "We are not responsible for the schools’ and municipalities’ own websites that we link to.",
        "Gi oss beskjed": "Let us know",
        "Opplever du problemer, eller trenger du innholdet i en annen form?": "Do you have problems, or do you need the content in another form?",
        "Send oss en tilbakemelding": "Send us feedback",
        "Les mer om kravene til universell utforming hos": "Read more about the requirements for universal design at",
        "Tilsynet for universell utforming av ikt (Uutilsynet)": "the Authority for Universal Design of ICT (Uutilsynet)",
        "Gi tilbakemelding": "Give feedback",
        'Skolen har 1.–10. trinn og egne resultater for barnetrinnet og ungdomstrinnet.': 'The school has years 1–10 and separate results for the primary and the lower secondary level.',
        'Resultater for': 'Results for',
        'Barnetrinnet (5. trinn)': 'Primary level (year 5)',
        'Barne- og ungdomsskole (1.–10. trinn)': 'Primary and lower secondary school (years 1–10)',
        '5. trinn': 'Year 5',
        'Ungdomstrinnet': 'Lower secondary',
        'Meny': 'Menu',
        'Finn skole': 'Find a school',
        'For foreldre': 'For parents',
        'Skolekartet': 'Skolekartet',
        'SFO og AKS': 'After-school care (SFO and AKS)',
        'Mat og aktiviteter': 'Food and activities',
        'Aktiviteter': 'Activities',
        'Nettbrett og nettfilter': 'Tablets and web filter',
        'Nyankomne elever i Oslo': 'Newly arrived pupils in Oslo',
        'Om AKS i Oslo: søknad, plass og pris': 'About AKS in Oslo: application, place and price',
        'Om språkopplæring, tolk og informasjon på ditt språk': 'About language support, interpreters and information in your language',
        'Om skolehage, fritidsaktiviteter og nettfilter i Osloskolen': 'About school gardens, leisure activities and the web filter in Oslo schools',
        'Om skolemat i Oslo, allergier og spesialkost': 'About school meals in Oslo, allergies and special diets',
        'Kilde: Utdanningsdirektoratet, Oslo kommune, Ny i Norge (IMDi) og tolkeloven, hentet 2. november 2026.': 'Source: Norwegian Directorate for Education and Training, City of Oslo, Ny i Norge (IMDi) and the Interpreter Act, retrieved 2 November 2026.',
        'På siden til hver skole i Oslo ser du om skolen har mottaksgruppe eller alfabetiseringsgruppe.': 'On the page for each school in Oslo you can see whether the school has a reception group or a literacy group.',
        'Kilde: Oslo kommune og opplæringsloven, hentet 2. november 2026.': 'Source: City of Oslo and the Education Act, retrieved 2 November 2026.',
        'Mat på AKS: Et mellommåltid etter skolelunsjen. Matpengene er med i prisen.': 'Food at AKS: a snack meal after school lunch. Food money is included in the price.',
        'Aktiviteter, kurs og meny på AKS ved hver skole i Oslo finner du på skolens side i Skolekartet.': 'Activities, courses and the menu at AKS for each school in Oslo are on the school’s page in Skolekartet.',
        'Kilde: Oslo kommune og Aktiv i Oslo, hentet 2. november 2026.': 'Source: City of Oslo and Aktiv i Oslo, retrieved 2 November 2026.',
        'Ny i Norge – Skolekartet': 'New in Norway – Skolekartet',
        'SFO og AKS – Skolekartet': 'After-school care – Skolekartet',
        'Mat og aktiviteter – Skolekartet': 'Food and activities – Skolekartet',
        'Velg språk': 'Choose language',
        'Skolekartet bruker ingen analyseverktøy og setter ingen informasjonskapsler (cookies). Språk, tema og lagrede skoler huskes bare i nettleseren din og sendes ikke noe sted.':
            'Skolekartet uses no analytics tools and sets no cookies. Language, theme and saved schools are remembered only in your browser and are not sent anywhere.',
        'Kilde: {np} og {eu}, Utdanningsdirektoratet (NLOD).': 'Source: {np} and {eu}, Norwegian Directorate for Education and Training (NLOD).',
        'Videre': 'Next school',
        'Barnetrinnet (1.–7. trinn) på samme skole: {school}.': 'Primary level (years 1–7) at the same school: {school}.',
        'Lagrede skoler': 'Saved schools',
        'E-post og telefon': 'Email and phone',
        'Enhetsregisteret, Brønnøysundregistrene (NLOD)': 'The Central Coordinating Register for Legal Entities, Brønnøysund Register Centre (NLOD)',
        'Bare felles postkasser (som postmottak@) og fasttelefon. Adresser som ser ut som en persons navn og mobilnumre vises ikke': 'Only shared mailboxes (such as postmottak@) and landlines. Addresses that look like a person’s name and mobile numbers are not shown',
        'Skolekrets på kartet (Halden, Stavanger, Fredrikstad)': 'School district on the map (Halden, Stavanger, Fredrikstad)',
        'Kommunenes egne åpne data, se Om skolekrets': 'The municipalities’ own open data, see About school districts',
        'Pilot, kan avvike fra kommunens gjeldende grenser': 'Pilot; may differ from the municipality’s current boundaries',
        'Skoler du lagrer med bokmerket («Lagre til senere») huskes bare i denne nettleseren (localStorage), som en liste over skolene. Den sendes ikke noe sted, og du kan fjerne en skole ved å trykke på bokmerket igjen. Valg av språk og tema huskes på samme måte.': 'Schools you save with the bookmark (“Save for later”) are remembered only in this browser (localStorage), as a list of schools. It is not sent anywhere, and you can remove a school by tapping the bookmark again. Your choice of language and theme is remembered the same way.',
        'Lagret. Klikk for å fjerne': 'Saved. Click to remove',
        'Lagrede skoler ({count})': 'Saved schools ({count})',
        'Vis alle skoler': 'Show all schools',
        'Lagret i denne nettleseren. Bare du ser dem.': 'Saved in this browser. Only you can see them.',
        'Du har ikke lagret noen skoler ennå. Trykk på bokmerket ved en skole for å lagre den til senere.': 'You have not saved any schools yet. Tap the bookmark next to a school to save it for later.',
        'Åpne i Google Maps': 'Open in Google Maps',
        'Send e-post til skolen': 'Email the school',
        'Ring skolen': 'Call the school',
        'Den stiplede linjen viser skolekretsen ({name}). Pilot på åpne data, kan avvike fra kommunens gjeldende grenser.': 'The dashed line shows the school district ({name}). A pilot on open data; it may differ from the municipality’s current boundaries.',
        'mandag': 'Monday',
        'tirsdag': 'Tuesday',
        'onsdag': 'Wednesday',
        'torsdag': 'Thursday',
        'fredag': 'Friday',
        'Fra skolens nettside ({count} lenker)': 'From the school’s website ({count} links)',
        'Slå opp skolekretsen hos Oslo kommune:': 'Look up the school catchment area with the City of Oslo:',
        'Trolig skolekrets for adressen': 'Likely school district for the address',
        'Skolekrets for adressen': 'School district for the address',
        'Om skolekretsen': 'About the school district',
        'Kommunen bestemmer skolekretsen, men har ikke publisert kretsgrensene som åpne data. Vi viser derfor de nærmeste offentlige skolene, som oftest er skolene i kretsen. Sjekk alltid med kommunen.': 'The municipality decides the school district, but has not published the district boundaries as open data. We therefore show the nearest public schools, which are usually the schools in the district. Always check with the municipality.',
        'Fant du det du lette etter?': 'Did you find what you were looking for?',
        'Skjul spørsmålet': 'Hide the question',
        'Vis spørsmålet': 'Show the question',
        'Ja': 'Yes',
        'Nei': 'No',
        'Neste': 'Next',
        'Svaret ditt er sendt.': 'Your answer has been sent.',
        'Hva lette du etter? (Svaret hjelper oss med å forbedre nettstedet!)': 'What were you looking for? (Your answer helps us improve the website!)',
        'Er det noe vi kan gjøre bedre? (valgfritt)': 'Is there anything we can do better? (optional)',
        'Ikke skriv navn, telefonnummer eller andre personopplysninger.': 'Do not write names, phone numbers or other personal data.',
        'Hopp over': 'Skip',
        'Send': 'Send',
        'Noe gikk galt. Prøv igjen senere.': 'Something went wrong. Please try again later.',
        'Takk for tilbakemeldingen!': 'Thank you for your feedback!',
        'Svar på spørsmålet «Fant du det du lette etter?» nederst på sidene sendes via Formspree, som har servere i USA. Med svaret følger adressen til siden og sidetittelen, men ikke IP-adressen din i teksten i e-posten. Svarene lagres hos Formspree og i Skolekartets e-post. Ikke skriv navn eller andre personopplysninger i tekstfeltet.':
            'Answers to the question “Did you find what you were looking for?” at the bottom of the pages are sent via Formspree, which has servers in the USA. The answer comes with the page address and page title, but not your IP address in the email text. The answers are stored at Formspree and in Skolekartet’s email. Do not write names or other personal data in the text field.',
        'Adresse for å se gangtid til skolen': 'Address to see the walking time to the school',
        'Skriv inn en adresse': 'Enter an address',
        'Entur fant ingen gangrute akkurat nå, så gangtiden er et anslag ut fra luftlinjen.': 'Entur found no walking route just now, so the walking time is an estimate from the straight-line distance.',
        'Andel elever som er blitt mobbet to eller tre ganger i måneden eller oftere.': 'Share of pupils who have been bullied two or three times a month or more.',
        'Hele landet: {value}': 'Whole country: {value}',
        '{count} svar': '{count} answers',
        'Resultat per fag, {year}': 'Result per subject, {year}',
        'Skolen': 'The school',
        'Hele landet': 'Whole country',
        'Fag': 'Subject',
        'Prøveresultater sier noe om svarene på én prøve, ikke om hele skolen.': 'Test results say something about the answers on one test, not about the whole school.',
        'Elevundersøkelsen, {trinn}. trinn': 'Pupil Survey, year {trinn}',
        'Skala fra 1 til 5, der høyere er bedre. Mobbing er andel elever i prosent, der lavere er bedre.': 'Scale from 1 to 5, where higher is better. Bullying is the share of pupils in percent, where lower is better.',
        'Indikator': 'Indicator',
        'Utvikling': 'Trend',
        'Støtte fra lærerne': 'Support from teachers',
        'Mestring': 'Mastery',
        'Motivasjon': 'Motivation',
        'Vurdering for læring': 'Assessment for learning',
        'Læringskultur': 'Learning culture',
        'Elevdemokrati og medvirkning': 'Pupil democracy and participation',
        '* betyr at Udir har skjult tallet, ofte fordi for få elever svarte. – betyr at skolen ikke har tall det året.': '* means Udir has hidden the figure, often because too few pupils answered. – means the school has no figure that year.',
        'Andre skoler i nærheten': 'Other schools nearby',
        '{km} km i luftlinje': '{km} km in a straight line',
        'Ingen andre skoler av samme type innen 3 km.': 'No other schools of the same type within 3 km.',
        'De nærmeste skolene med samme trinn, innen 3 km. Det er kommunen som bestemmer hvilken skole eleven hører til.': 'The nearest schools with the same years, within 3 km. The municipality decides which school a pupil belongs to.',
        'Kilde: skolenes posisjon fra Geonorge og Utdanningsdirektoratet. Avstanden er målt i luftlinje.': 'Source: school positions from Geonorge and the Norwegian Directorate for Education and Training. The distance is measured in a straight line.',
        'AKS': 'After-school care',
        'Aktiviteter og anlegg': 'Activities and facilities',
        'Mat': 'Food',
        'Henter…': 'Loading…',
        'Les mer': 'Read more',
        'Svømmebasseng ved skolen': 'Swimming pool at the school',
        'Nærmeste svømmehall: {name}': 'Nearest indoor pool: {name}',
        'Nærmeste svømmebasseng: {name}': 'Nearest swimming pool: {name}',
        '{distance} i luftlinje fra skolen': '{distance} in a straight line from the school',
        'Fotballbane ved skolen': 'Football pitch at the school',
        'Gymsal eller idrettshall ved skolen': 'Gym or sports hall at the school',
        'OpenStreetMap (ODbL), kartdata fra {date}': 'OpenStreetMap (ODbL), map data from {date}',
        'Leksehjelp på AKS': 'Homework help at after-school care',
        'Kurs og aktiviteter på AKS': 'Courses and activities at after-school care',
        'Ferietilbud på AKS': 'Holiday programme at after-school care',
        'Læringsbrett – les mer på skolens nettside': 'Learning tablets – read more on the school’s website',
        'lenker fra skolens nettside, hentet {date}': 'links from the school’s website, retrieved {date}',
        'Alle kommunale skoler i Oslo kan søke om en parsell i Geitmyra skolehage.': 'All municipal schools in Oslo can apply for a plot in the Geitmyra school garden.',
        'Om skolehagene': 'About the school gardens',
        'På nettbrett og PC fra Osloskolen har elever på 1.–4. trinn bare tilgang til læremidler og godkjente apper. For 5.–7. trinn sperrer et nettfilter skadelig innhold, reklame, sosiale medier og YouTube.':
            'On tablets and PCs from Oslo schools, pupils in years 1–4 can only use learning resources and approved apps. For years 5–7 a web filter blocks harmful content, ads, social media and YouTube.',
        'Osloskolens nettfilter': 'The Oslo schools’ web filter',
        'Fritidsaktiviteter for barn i Oslo': 'Leisure activities for children in Oslo',
        'Oslo kommune og Aktiv i Oslo, hentet {date}': 'City of Oslo and Aktiv i Oslo, retrieved {date}',
        'Vi har ikke funnet idrettsanlegg ved skolen i OpenStreetMap eller sider om aktiviteter på skolens nettside.':
            'We found no sports facilities at the school in OpenStreetMap and no pages about activities on the school’s website.',
        'Nasjonalt skoleregister (skolens nettside)': 'National School Register (the school’s website)',
        'Mat på AKS': 'Food at after-school care',
        'Et mellommåltid etter skolelunsjen. Matpengene er med i prisen.': 'A snack meal after school lunch. Food money is included in the price.',
        'Se menyen': 'See the menu',
        'Skolemelk': 'School milk',
        'Oslo kommune har ingen felles ordning med gratis skolemat på barnetrinnet. Noen skoler serverer likevel mat enkelte dager, så sjekk skolens nettside.':
            'The City of Oslo has no common free school meal scheme for primary school. Some schools still serve food on some days, so check the school’s website.',
        'Gratis skolemåltid i ungdomsskolene i Oslo ble avviklet i 2024. Skolene fikk i stedet mer penger som de kan prioritere selv.':
            'Free school meals in Oslo’s lower secondary schools ended in 2024. Instead, the schools got more money that they can prioritise themselves.',
        'Les saken fra Oslo kommune': 'Read the article from the City of Oslo',
        'Oslo kommune, hentet {date}': 'City of Oslo, retrieved {date}',
        'Spørsmål om allergier, vegetarmat eller halal? Se menyen eller spør AKS på skolen.': 'Questions about allergies, vegetarian food or halal? See the menu or ask the after-school care at the school.',
        'Spørsmål om allergier, vegetarmat eller halal? Spør skolen.': 'Questions about allergies, vegetarian food or halal? Ask the school.',
        'Vi har ikke opplysninger om mat ved denne skolen.': 'We have no information about food at this school.',
        'Henter opplysninger fra Nasjonalt skoleregister…': 'Fetching details from the National School Register…',
        'Resultater, trivsel og mobbing': 'Results, well-being and bullying',
        'Velg et kort for å se utviklingen over tid.': 'Choose a card to see the trend over time.',
        'Velg hva du vil se over tid': 'Choose what to see over time',
        'Nasjonale prøver': 'National tests',
        'Nasjonale prøver over tid': 'National tests over time',
        'År': 'Year',
        'Engelsk': 'English',
        'Lesing': 'Reading',
        'Regning': 'Numeracy',
        'Hele landet': 'Whole country',
        'Skalapoeng, {type}. Landsgjennomsnittet var 50 i 2022. * betyr at resultatet ikke er publisert. Resultater for 2026–27 kommer når Udir publiserer dem.':
            'Scale points, {type}. The national average was 50 in 2022. * means the result is not published. Results for 2026–27 will come when Udir publishes them.',
        'Henter tall…': 'Fetching figures…',
        'Aktivitetsskolen (AKS)': 'After-school care (AKS)',
        'Skolefritidsordning (SFO)': 'After-school care (SFO)',
        'Kart som viser hvor {name} ligger': 'Map showing where {name} is',
        'Posisjon: {source}.': 'Position: {source}.',
        'Mer fra skoleregisteret': 'More from the school register',
        'Kilder: nasjonale prøver, Elevundersøkelsen og Nasjonalt skoleregister fra Utdanningsdirektoratet (NLOD). Foto fra Wikimedia Commons med fotografens lisens. Lenker til nettside og sosiale medier er hentet fra skolens egen nettside.':
            'Sources: national tests, the Pupil Survey and the National School Register from the Norwegian Directorate for Education and Training (NLOD). Photos from Wikimedia Commons under the photographer’s licence. Links to websites and social media are taken from the school’s own website.',
        'Om datakildene': 'About the data sources',
        'Hjertesone: bilfri sone ved skolen': 'Heart zone: car-free zone at the school',
        'Hjertesone betyr en bilfri sone rundt skolen. Foreldre blir bedt om ikke å kjøre barna helt fram, slik at skoleveien blir tryggere.':
            'A heart zone is a car-free zone around the school. Parents are asked not to drive their children all the way to the door, so the way to school is safer.',
        'Les mer under Trygg skolevei': 'Read more under Safe way to school',
        'Udir har ikke publisert {label} for skolen noen år, ofte fordi for få elever svarte.':
            'Udir has not published {label} for the school in any year, often because too few pupils answered.',
        'trivsel': 'well-being',
        'mobbing': 'bullying',
        'Som landet': 'Same as national',
        'Over landet': 'Above national',
        'Under landet': 'Below national',
        'Skolen': 'School',
        'Sammenlignet': 'Compared',
        'Trivsel over tid': 'Well-being over time',
        'Mobbing over tid': 'Bullying over time',
        'Gjennomsnittlig svar på «Trives du på skolen?» på en skala fra 1 til 5, {trinn}. trinn. År som mangler, er ikke publisert av Udir.':
            'Average answer to “Do you enjoy school?” on a scale from 1 to 5, year {trinn}. Missing years are not published by Udir.',
        'Andel elever på {trinn}. trinn som er blitt mobbet to eller tre ganger i måneden eller oftere. År som mangler, er ikke publisert av Udir, ofte fordi for få svarte. Landsgjennomsnittet steg mye fra 2022–23 til 2023–24, og fra 2023–24 publiserer Udir tall for langt flere skoler. Sammenlign derfor helst år fra 2023–24 og senere.':
            'Share of pupils in year {trinn} who have been bullied two or three times a month or more. Missing years are not published by Udir, often because too few answered. The national average rose sharply from 2022–23 to 2023–24, and from 2023–24 Udir publishes figures for many more schools. It is best to compare years from 2023–24 onwards.',
        'Ingen åpent lisensiert foto av skolen ennå': 'No openly licensed photo of the school yet',
        'Foto ikke funnet': 'Photo not found',
        'bilde': 'image',
        'karusell': 'carousel',
        '{current} av {total}': '{current} of {total}',
        'Bilder av {name}': 'Photos of {name}',
        'Forrige bilde': 'Previous image',
        'Neste bilde': 'Next image',
        'Ikke registrert i skoleregisteret': 'Not registered in the school register',
        'Nasjonalt skoleregister': 'National School Register',
        '{name}: fant ingen offisiell side': '{name}: no official page found',
        'Fant ingen offisiell {name}-side for skolen': 'No official {name} page found for the school',
        'Kilde: Oslo kommune, Skolekrets ungdomsskole, hentet {date}.': 'Source: Oslo municipality, lower secondary school districts, retrieved {date}.',
        'Etter 7. trinn fortsetter elevene på samme skole: {school}.': 'After year 7, pupils continue at the same school: {school}.',
        'Etter 7. trinn går elevene videre til {first} eller {second}. Det avhenger av hvor eleven bor.': 'After year 7, pupils go on to {first} or {second}. It depends on where the pupil lives.',
        'Etter 7. trinn går elevene videre til {school}.': 'After year 7, pupils go on to {school}.',
        'Se grensekartet': 'See the boundary map (in Norwegian)',
        'Elevene kommer fra': 'Where the pupils come from',
        'Elever fra disse barneskolene går videre hit:': 'Pupils from these primary schools go on to this school:',
        'ca. {minutes} min å gå': 'about {minutes} min walk',
        'Gangtid': 'Walking time',
        'Gangtid fra adressen': 'Walking time from the address',
        'Skriv inn en adresse for å se omtrent hvor lang tid det tar å gå til skolen.': 'Enter an address to see roughly how long it takes to walk to the school.',
        'Adressen sendes til Kartverkets adresse-API for å finne posisjonen. Den lagres bare i denne fanen og legges ikke i lenken.':
            'The address is sent to the Norwegian Mapping Authority’s address API to find its position. It is kept only in this browser tab and is not added to the link.',
        'Adresse:': 'Address:',
        'Bytt adresse': 'Change address',
        'Fjern adressen': 'Remove the address',
        'omtrent': 'about',
        'min å gå': 'min walk',
        'For langt å gå': 'Too far to walk',
        'Luftlinje omtrent {air} km, omtrent {road} km langs vei.': 'About {air} km in a straight line, about {road} km along roads.',
        'Skoleveien er anslått til over 4 km. Elever i grunnskolen har rett til gratis skyss når de bor mer enn 4 km fra skolen, og elever på 1. trinn når de bor mer enn 2 km unna.':
            'The way to school is estimated at more than 4 km. Pupils in compulsory school have the right to free school transport when they live more than 4 km from school, and pupils in year 1 when they live more than 2 km away.',
        'Skoleveien er anslått til over 2 km. Elever på 1. trinn har rett til gratis skyss når de bor mer enn 2 km fra skolen.':
            'The way to school is estimated at more than 2 km. Pupils in year 1 have the right to free school transport when they live more than 2 km from school.',
        'Kommunen måler den faktiske skoleveien, og retten gjelder også når veien er særlig farlig eller vanskelig.':
            'The municipality measures the actual way to school, and the right also applies when the way is particularly dangerous or difficult.',
        'Opplæringslova § 4-1': 'Education Act section 4-1 (in Norwegian)',
        'Slik regner vi': 'How we calculate',
        'Vi måler luftlinjen mellom adressen og skolen og ganger med 1,3 for å anslå avstanden langs vei. Gangtiden bygger på 4,5 km/t. Dette er ikke en beregnet rute og sier ikke noe om trafikksikkerhet, kryssinger eller terreng.':
            'We measure the straight line between the address and the school and multiply it by 1.3 to estimate the distance along roads. The walking time assumes 4.5 km/h. This is not a calculated route and says nothing about road safety, crossings or terrain.',
        'Se gangrute på OpenStreetMap': 'See a walking route on OpenStreetMap',
        'fra {address}': 'from {address}',
        '{km} km i luftlinje': '{km} km in a straight line',
        'Se gangrute': 'See walking route',
        'Omtrent {road} km langs gangveien ({air} km i luftlinje).': 'About {road} km along the walking route ({air} km in a straight line).',
        'Beregner gangrute…': 'Calculating walking route…',
        'Kunne ikke hente gangruten akkurat nå. Tallet er et anslag ut fra luftlinjen.': 'Could not get the walking route right now. The figure is an estimate based on the straight line.',
        'Vi finner korteste gangvei langs veier og stier med Enturs reiseplanlegger, som bruker kartdata fra OpenStreetMap. Gangtiden bygger på 4,5 km/t, et tempo som passer for barn. Ruten sier ikke noe om trafikksikkerhet eller kryssinger, og kommunen måler selv skoleveien når den vurderer skyss.':
            'We find the shortest walking route along roads and paths with Entur’s journey planner, which uses map data from OpenStreetMap. The walking time assumes 4.5 km/h, a pace that suits children. The route says nothing about road safety or crossings, and the municipality measures the way to school itself when it decides on school transport.',
        '{km} km langs gangveien': '{km} km along the walking route',
        'Lukk': 'Close',
        'Nettsiden svarer ikke': 'The website does not respond',
        'svarer ikke': 'does not respond',

        // AKS and SFO
        'Alle kommuner skal ha et tilbud om skolefritidsordning (SFO) før og etter skoletid for elever på 1.–4. trinn. Innhold, åpningstider og priser finner du hos skolen eller kommunen.':
            'All municipalities must offer after-school care (SFO) before and after school for pupils in years 1–4. Ask the school or the municipality about activities, opening hours and prices.',
        'Gå til skolens nettside': 'Go to the school’s website',
        'Fra skolens nettside': 'From the school’s website',
        'Alt om AKS på skolens nettside': 'All about AKS on the school’s website',
        'Aktiviteter, kurs og åpningstid for AKS på skolen finner du på': 'Activities, courses and opening hours for AKS at the school are on',
        'skolens nettside': 'the school’s website',
        'Aktivitetsskolen er Oslo kommunes skolefritidsordning (SFO). Den er et tilbud før og etter skoletid og i noen av skolens ferier for elever på 1.–4. trinn.':
            'The Activity School (AKS) is Oslo municipality’s after-school care. It is offered before and after school and in some school holidays for pupils in years 1–4.',
        'Alle elever på 1.–3. trinn har tilbud om gratis deltidsplass skoleåret 2026/2027.': 'All pupils in years 1–3 are offered a free part-time place in the 2026/2027 school year.',
        'Elever på 4. trinn i bydelene Alna, Bjerke, Gamle Oslo, Grorud, Stovner og Søndre Nordstrand har også gratis deltidsplass.':
            'Pupils in year 4 in the districts of Alna, Bjerke, Gamle Oslo, Grorud, Stovner and Søndre Nordstrand also get a free part-time place.',
        'Vanlig åpningstid er 07.30–16.30, men den kan variere fra skole til skole. AKS er stengt hele juli.':
            'Usual opening hours are 07:30–16:30, but they can vary from school to school. AKS is closed all of July.',
        'Søknad og betaling': 'Applying and paying',
        'Søk om plass på Aktivitetsskolen': 'Apply for a place at the Activity School',
        'Heltidsplass eller deltidsplass': 'Full-time or part-time place',
        'Pris og betaling': 'Prices and payment',
        'Les om hva barna gjør på AKS': 'Read about what children do at AKS',
        'Kilde: Oslo kommune (oslo.kommune.no), hentet 2. november 2026': 'Source: Oslo municipality (oslo.kommune.no), retrieved 2 November 2026',
        ', og lenker fra skolens nettside': ', and links from the school’s website',

        // New in Norway
        'Barn som ikke kan nok norsk ennå, har rett til særskilt språkopplæring. Skolen kartlegger norsken til eleven og vurderer hva eleven trenger. Tilbudet er frivillig.':
            'Children who do not yet know enough Norwegian have the right to special language education. The school assesses the pupil’s Norwegian and decides what the pupil needs. The offer is voluntary.',
        'Denne skolen har:': 'This school has:',
        'Mottaksgruppe': 'Reception group',
        'Alfabetiseringsgruppe': 'Literacy group',
        'barnetrinnet': 'primary level',
        'ungdomstrinnet': 'lower secondary level',
        '{group} for {level}': '{group} for {level}',
        ' ({count} plasser totalt)': ' ({count} places in total)',
        'Antall plasser er totalt, ikke ledige plasser.': 'The number of places is the total, not free places.',
        'Skolen står ikke på Oslo kommunes liste over skoler med mottaksgruppe eller alfabetiseringsgruppe. Eleven kan likevel få særskilt språkopplæring på skolen.':
            'The school is not on Oslo municipality’s list of schools with a reception group or literacy group. The pupil can still get special language education at the school.',
        'Tilbudet kan være:': 'The offer can include:',
        'Forsterket opplæring i norsk': 'Extra teaching in Norwegian',
        'Tospråklig fagopplæring – fag på et språk eleven kan og på norsk': 'Bilingual subject teaching – subjects in a language the pupil knows and in Norwegian',
        'Morsmålsopplæring – kan være på en annen skole': 'Mother tongue teaching – may be at another school',
        'Nyankomne elever': 'Newly arrived pupils',
        '1.–2. trinn begynner i vanlig klasse på nærskolen. Fra 3. trinn kan eleven også få plass i en mottaksgruppe eller alfabetiseringsgruppe, og fra 5. trinn på Språksenteret.':
            'Pupils in years 1–2 start in an ordinary class at their local school. From year 3, a pupil can also get a place in a reception group or literacy group, and from year 5 at the Language Centre (Språksenteret).',
        'Tilbud til minoritetsspråklige elever (Oslo kommune)': 'Offers for minority language pupils (Oslo municipality, in Norwegian)',
        'Ny i norsk skole (Språksenteret)': 'New to Norwegian school (Language Centre, in Norwegian)',
        'Spør skolen eller kommunen om hvilke tilbud de har.': 'Ask the school or the municipality what they offer.',
        'Tolk': 'Interpreter',
        'Skolen skal bruke tolk når det trengs for at dere skal forstå hverandre, for eksempel i foreldresamtaler. Barn under 18 år skal ikke brukes som tolk.':
            'The school must use an interpreter when it is needed for you to understand each other, for example in parent meetings. Children under 18 must not be used as interpreters.',
        'Om tolkeloven': 'About the Interpreting Act (in Norwegian)',
        'Bruk av tolk i barnehagen og skolen (Udir)': 'Use of interpreters in kindergarten and school (Udir, in Norwegian)',
        'Informasjon på ditt språk': 'Information in your language',
        '«Skole i Norge» fra Ny i Norge (IMDi) og informasjon fra Udir:': '“School in Norway” from New in Norway (IMDi) and information from Udir:',
        'Kilde: {sources}, hentet {date}.': 'Source: {sources}, retrieved {date}.',
        'Oslo kommune, Utdanningsdirektoratet, Ny i Norge (IMDi) og tolkeloven': 'Oslo municipality, the Norwegian Directorate for Education and Training, New in Norway (IMDi) and the Interpreting Act',
        'Utdanningsdirektoratet, Ny i Norge (IMDi) og tolkeloven': 'the Norwegian Directorate for Education and Training, New in Norway (IMDi) and the Interpreting Act',

        // Safe way to school
        'Trygg skolevei': 'Safe way to school',
        '{name} er en hjertesoneskole. Rundt skolen er det en sone der foreldre blir bedt om ikke å kjøre barna helt fram, slik at det blir tryggere for dem som går og sykler.':
            '{name} is a heart zone school. Around the school there is a zone where parents are asked not to drive their children all the way to the door, so it is safer for those who walk and cycle.',
        '{name} står ikke på Oslo kommunes liste over hjertesoneskoler. Spør gjerne skolen eller FAU om hvordan de jobber med trygg skolevei.':
            '{name} is not on Oslo municipality’s list of heart zone schools. You can ask the school or the parents’ council (FAU) how they work for a safe way to school.',
        'Hjertesone er et samarbeid mellom skolen, FAU, Bymiljøetaten og Trygg Trafikk.':
            'Heart zones are a cooperation between the school, the parents’ council (FAU), the city’s Agency for Urban Environment and the Norwegian Council for Road Safety.',
        'Les om hjertesoner': 'Read about heart zones (in Norwegian)',
        'Kilde: Oslo kommune, liste over hjertesoneskoler, hentet {date}.': 'Source: Oslo municipality, list of heart zone schools, retrieved {date}.',

        // School register
        'Fant ikke skolen i Nasjonalt skoleregister.': 'The school was not found in the National School Register.',
        'Kunne ikke hente opplysninger fra Nasjonalt skoleregister akkurat nå.': 'Could not fetch details from the National School Register right now.',
        'Trinn': 'Years',
        'Elever': 'Pupils',
        'Ansatte': 'Staff',
        'Målform': 'Written Norwegian',
        '{from}.–{to}. trinn': 'Years {from}–{to}',
        'Spesialskole': 'Special school',
        'Godkjent etter {law}, status: {status}': 'Approved under {law}, status: {status}',
        'Kilde: Nasjonalt skoleregister (Udir).': 'Source: National School Register (Udir).',
        'Nøkkeltall fra Nasjonalt skoleregister (Udir).': 'Key figures from the National School Register (Udir).',
        'Skolen har elever på {from}. til {to}. trinn.': 'The school has pupils in years {from} to {to}.',
        'Videregående trinn.': 'Upper secondary years.',
        'Elever registrert ved skolen.': 'Pupils registered at the school.',
        'Ansatte registrert ved skolen.': 'Staff registered at the school.',
        'Skolens hovedmålform.': 'The school’s main written form of Norwegian.',
        'Kontakt og beliggenhet': 'Contact and location',
        'Postadresse': 'Postal address',
        'Fylke': 'County',
        'Nettside': 'Website',
        'Registeropplysninger': 'Register details',
        'Navn i registeret': 'Name in the register',
        'Organisasjonsnummer': 'Organisation number',
        'Organisasjonsform': 'Type of organisation',
        'Næringskode': 'Industry code',
        'Status': 'Status',
        'Aktiv': 'Active',
        'Ikke aktiv': 'Not active',
        'Oppstart': 'Started',
        'Sist endret i registeret': 'Last changed in the register',
        'Tilknytning': 'Connections',
        '(underenhet)': '(sub-unit)',
        'Se skolen i Nasjonalt skoleregister': 'See the school in the National School Register',
        // ── Info pages: datakilder ───────────────────────────────────────
        'Datakilder – Skolekartet': 'Data sources – Skolekartet',
        'Kilde': 'Source',
        'Lisens': 'Licence',
        'Resultater fra nasjonale prøver': 'Results from the national tests',
        'Udirs statistikkbank': 'Udir’s statistics bank',
        'Trivsel (Elevundersøkelsen)': 'Well-being (Pupil Survey)',
        'Udirs statistikkbank, API': 'Udir’s statistics bank, API',
        'Mobbing (Elevundersøkelsen)': 'Bullying (Pupil Survey)',
        'Udirs statistikkbank, tabell «EUG – Mobbing»': 'Udir’s statistics bank, table “EUG – Mobbing”',
        'Eierform, adresse, elevtall, tilknytning': 'Ownership, address, number of pupils, connections',
        'Skolens posisjon': 'School position',
        'Geonorge, Grunnskoler (data fra Udir)': 'Geonorge, Primary schools (data from Udir)',
        '. For noen få skoler: Nasjonalt skoleregister, Kartverkets adresse-API eller OpenStreetMap.':
            '. For a few schools: the National School Register, the Norwegian Mapping Authority’s address API or OpenStreetMap.',
        'Adressesøk': 'Address search',
        'Gangrute og gangtid': 'Walking route and time',
        'Entur, reiseplanlegger (API)': 'Entur, journey planner (API)',
        ', kartdata fra OpenStreetMap': ', map data from OpenStreetMap',
        'Åpent API. Kartdata:': 'Open API. Map data:',
        'Kartverkets adresse-API': 'Norwegian Mapping Authority’s address API',
        ', © Kartverket': ', © Norwegian Mapping Authority',
        'Bilder av skolene': 'Photos of the schools',
        'Skolens eget bilde og bilder fra skolens kategori på': 'The school’s own photo and photos from the school’s category on',
        ', funnet via Wikidata': ', found through Wikidata',
        'Bildets egen frie lisens (CC BY, CC BY-SA, CC0 m.fl.), vist ved hvert bilde. Wikidata: CC0':
            'Each photo’s own free licence (CC BY, CC BY-SA, CC0 and others), shown with each photo. Wikidata: CC0',
        'Bakgrunnskart': 'Background map',
        'Kartdata fra OpenStreetMap:': 'Map data from OpenStreetMap:',
        'Nettside, Facebook og Instagram': 'Website, Facebook and Instagram',
        'Nettside fra Nasjonalt skoleregister. Facebook og Instagram er lenker som skolen selv viser på forsiden av nettsiden sin. Lenker til kommunens sider er filtrert bort.':
            'Website from the National School Register. Facebook and Instagram are links the school itself shows on the front page of its website. Links to the municipality’s pages are filtered out.',
        'Bare lenker lagres, ikke innhold': 'Only links are stored, not content',
        'Aktivitetsskolen (AKS) i Oslo': 'After-school care (AKS) in Oslo',
        'Oslo kommune': 'Oslo municipality',
        'og AKS-menyen på skolens nettside': 'and the AKS menu on the school’s website',
        'Fakta og lenker, ikke tekst fra sidene': 'Facts and links, not text from the pages',
        'Svømmebasseng, fotballbane og idrettshall ved skolen': 'Swimming pool, football pitch and sports hall at the school',
        'OpenStreetMap, uttrekk for Norge fra Geofabrik': 'OpenStreetMap, extract for Norway from Geofabrik',
        '. Anleggsregisteret brukes ikke: den åpne nedlastingen oppdateres ikke lenger.': '. We do not use Anleggsregisteret: its open download is no longer updated.',
        'ODbL 1.0 (© OpenStreetMap-bidragsytere). Bare det som er kartlagt i OSM, innen 150 m fra skolen (basseng innen 2 km)':
            'ODbL 1.0 (© OpenStreetMap contributors). Only what is mapped in OSM, within 150 m of the school (pools within 2 km)',
        'Leksehjelp, kurs, ferietilbud og meny på AKS i Oslo': 'Homework help, courses, holiday programme and menu at after-school care in Oslo',
        'Lenker i AKS-menyen på skolens nettside': 'Links in the AKS menu on the school’s website',
        'Bare lenketittel og adresse, ikke tekst fra sidene': 'Only link title and address, not text from the pages',
        'Læringsbrett': 'Learning tablets',
        'Lenker på forsiden av skolens nettside som nevner læringsbrett, iPad eller Chromebook': 'Links on the school’s front page that mention learning tablets, iPad or Chromebook',
        'Mat på AKS og skolemat i Oslo': 'Food at after-school care and school meals in Oslo',
        'Oslo kommune:': 'City of Oslo:',
        'Hva er Aktivitetsskolen': 'What is after-school care (AKS)',
        'Pris og betaling': 'Price and payment',
        'evaluering av gratis skolemat': 'evaluation of free school meals',
        'Fakta med egne ord og lenker, ikke tekst fra sidene': 'Facts in our own words and links, not text from the pages',
        'Skolehage, nettfilter og fritidsaktiviteter i Oslo': 'School garden, web filter and leisure activities in Oslo',
        'Oslo kommune, skolehager': 'City of Oslo, school gardens',
        'Fakta med egne ord og lenker': 'Facts in our own words and links',
        'Alle indikatorer i Elevundersøkelsen, tre siste år, med kommune og hele landet': 'All Pupil Survey indicators, three latest years, with municipality and whole country',
        'Udir statistikkbank, tabell 148 (EUG - Indikator)': 'Udir statistics bank, table 148 (EUG - Indicator)',
        'tabell 150 (EUG - Mobbing)': 'table 150 (EUG - Bullying)',
        'NLOD. Tall som Udir har skjult, vises som *': 'NLOD. Figures hidden by Udir are shown as *',
        'Kommunesnitt på nasjonale prøver': 'Municipality averages on the national tests',
        'Samme Udir-filer som skoleresultatene, raden «Alle skoler» i kommunen': 'The same Udir files as the school results, the row “Alle skoler” in the municipality',
        'Regnet ut fra skolenes posisjon (se «Skolens posisjon»), avstand i luftlinje': 'Calculated from the schools’ positions (see “School position”), straight-line distance',
        'Samme lisens som posisjonen': 'Same licence as the position',
        'Hjertesoneskoler i Oslo': 'Heart zone schools in Oslo',
        'Oslo kommune, Hjertesone – tryggere skolevei': 'Oslo municipality, Heart zone – safer way to school (in Norwegian)',
        'Bare skolenavn fra listen på siden': 'Only school names from the list on the page',
        'Mottaks- og alfabetiseringsgrupper i Oslo': 'Reception and literacy groups in Oslo',
        'Oslo kommune, Tilbud til minoritetsspråklige elever': 'Oslo municipality, Offers for minority language pupils (in Norwegian)',
        'Bare skolenavn og antall plasser fra listene på siden': 'Only school names and number of places from the lists on the page',
        'Ungdomsskole etter barneskolen i Oslo': 'Lower secondary school after primary school in Oslo',
        'Oslo kommune, Skolekrets ungdomsskole': 'Oslo municipality, lower secondary school districts (in Norwegian)',
        'Bare skolenavn og lenker til grensekart fra listen på siden': 'Only school names and links to boundary maps from the list on the page',
        'Informasjon til nyankomne': 'Information for newcomers',
        'Ny i Norge (IMDi), Skole i Norge': 'New in Norway (IMDi), School in Norway',
        'og Utdanningsdirektoratet': 'and the Norwegian Directorate for Education and Training',
        'Bare lenker': 'Links only',
        'Skolekrets, pilot for Halden': 'School district, pilot for Halden',
        'Barneskolekretser i Halden kommune (Geonorge)': 'Primary school districts in Halden (Geonorge)',
        'Åpne data': 'Open data',
        'Skolekrets, pilot for Stavanger': 'School district, pilot for Stavanger',
        'Skolekretser Stavanger': 'School districts Stavanger',
        'Profil (Montessori, Steiner …)': 'Profile (Montessori, Steiner …)',
        'Utledet fra skolens navn': 'Derived from the school’s name',
        'Om tallene': 'About the figures',
        'Snitt er gjennomsnittet av skolens skalapoeng i engelsk, lesing og regning på nasjonale prøver. Trivsel er elevenes gjennomsnittlige svar på «Trives du på skolen?» i Elevundersøkelsen, på en skala fra 1 til 5, for 7. trinn på barneskoler og 10. trinn på ungdomsskoler. Mobbing er andelen elever som svarer at de er blitt mobbet to eller tre ganger i måneden eller oftere, av andre elever, digitalt eller av voksne på skolen, på de samme trinnene. Udir skjuler resultater for små grupper, og da står det en strek (–).':
            'The average is the mean of the school’s scale points in English, reading and numeracy on the national tests. Well-being is pupils’ average answer to “Do you enjoy school?” in the Pupil Survey, on a scale from 1 to 5, for year 7 at primary schools and year 10 at lower secondary schools. Bullying is the share of pupils who say they have been bullied two or three times a month or more, by other pupils, online or by adults at school, in the same years. Udir hides results for small groups, and then a dash (–) is shown.',
        'Profilen er utledet fra skolens navn, fordi Udir ikke publiserer godkjenningsgrunnlaget for privatskoler som åpne data. Noen skoler kan derfor mangle profil.':
            'The profile is derived from the school’s name, because Udir does not publish the grounds on which private schools are approved as open data. Some schools may therefore lack a profile.',
        'Vi viser ikke bilder eller kart fra Google Maps, fordi de ikke har åpen lisens. Skolesiden har bare en lenke som åpner skolens adresse i Google Maps.':
            'We do not show photos or maps from Google Maps, because they are not openly licensed. The school page only has a link that opens the school’s address in Google Maps.',
        'Adressen du søker på sendes til Kartverkets adresse-API for å finne posisjonen. Skolekartet lagrer den ikke på noen server, og den legges ikke i lenken du kan dele. For å vise gangtid på skolesiden huskes adressen bare i denne nettleserfanen, og den forsvinner når fanen lukkes. Gangruten hentes fra Enturs reiseplanlegger: bare koordinatene for adressen og skolen sendes dit, ikke selve adressen. Bilder hentes fra Wikimedias servere, og opplysningene på skolesiden hentes fra Udirs skoleregister når du åpner siden.':
            'The address you search for is sent to the Norwegian Mapping Authority’s address API to find its position. Skolekartet does not store it on any server, and it is not added to the link you can share. To show the walking time on the school page, the address is kept only in this browser tab and disappears when the tab is closed. The walking route comes from Entur’s journey planner: only the coordinates of the address and the school are sent there, not the address itself. Photos are loaded from Wikimedia’s servers, and the details on the school page are fetched from Udir’s school register when you open the page.',

        // ── Info pages: om fargefordelingen ──────────────────────────────
        'Om fargefordelingen – Skolekartet': 'About the colours – Skolekartet',
        'Om Fargefordelingen': 'About the colours',
        'Offisiell Skala': 'Official scale',
        'Til nasjonale prøver er det utviklet en egen skala (skalapoeng) hvor': 'The national tests use their own scale (scale points), where',
        'gjennomsnittet i 2022 ble satt til 50': 'the average in 2022 was set to 50',
        'og': 'and',
        'standardavviket til 10': 'the standard deviation to 10',
        '. Alle prøveresultater blir omregnet til denne skalaen.': '. All test results are converted to this scale.',
        'Datagrunnlag (1 947 skoler):': 'Data (1,947 schools):',
        'Gjennomsnitt: 49,31 (nær landsgjennomsnitt ✓)': 'Average: 49.31 (close to the national average ✓)',
        'Median: 49,33': 'Median: 49.33',
        'Standardavvik: 2,84': 'Standard deviation: 2.84',
        'Spredning: 39-59 poeng': 'Range: 39–59 points',
        'Fargeforklaring': 'What the colours mean',
        'Rød (< 45):': 'Red (< 45):',
        'Betydelig under landsgjennomsnitt (3,7% av skoler)': 'Well below the national average (3.7% of schools)',
        'Oransje (45 – 49,31):': 'Orange (45 – 49.31):',
        'Under landsgjennomsnitt (44,9% av skoler)': 'Below the national average (44.9% of schools)',
        'Lysegrønn (49,31 – 55):': 'Light green (49.31 – 55):',
        'Over landsgjennomsnitt (48,2% av skoler)': 'Above the national average (48.2% of schools)',
        'Mørkegrønn (≥ 55):': 'Dark green (≥ 55):',
        'Betydelig over landsgjennomsnitt (3,2% av skoler)': 'Well above the national average (3.2% of schools)',
        'Grå:': 'Grey:',
        'Ingen data tilgjengelig (alle fag mangler)': 'No data available (all subjects missing)',
        'Intervall': 'Interval',
        'Andel': 'Share',
        'Over 55': 'Over 55',
        'Basert på 1 947 skoler med data (2025–26)': 'Based on 1,947 schools with data (2025–26)',
        'Begrunnelse': 'Why these colours',
        'Fargefordelingen bruker det faktiske gjennomsnittlige resultatet blant skoler i datagrunnlaget (':
            'The colours use the actual average result among the schools in the data (',
        ') som skillelinje mellom oransje og lysegrønn, i stedet for den teoretiske midtverdien 50. Dette gir en:':
            ') as the line between orange and light green, instead of the theoretical midpoint of 50. This gives a:',
        'Realistisk fordeling': 'Realistic spread',
        'basert på faktiske resultater fra 1 947 skoler': 'based on actual results from 1,947 schools',
        'Rettferdig vurdering': 'Fair assessment',
        'som gjenspeiler det faktiske landsgjennomsnitt': 'that reflects the actual national average',
        'Meningsfull tolkning': 'Meaningful reading',
        '– ca. halvparten av skolene er over/under midten': '– about half of the schools are above or below the middle',
        'Dette sikrer at skoler som presterer over det faktiske gjennomsnittet får anerkjennelse, mens skoler som trenger støtte blir identifisert.':
            'This makes sure that schools performing above the actual average get recognition, while schools that need support are identified.',
        'Les mer hos UDIR (offisiell forklaring)': 'Read more at Udir (official explanation, in Norwegian)',

        // ── Info pages: om skolekrets ────────────────────────────────────
        'Om skolekrets – Skolekartet': 'About school districts – Skolekartet',
        'Om Skolekrets': 'About school districts',
        'En': 'A',
        'skolekrets': 'school district',
        'er det geografiske området som sogner til en bestemt skole. Hvilken skole barnet ditt tilhører, avhenger av hvilken adresse dere er folkeregistrert på.':
            'is the geographical area that belongs to a particular school. Which school your child belongs to depends on the address you are registered at in the National Population Register.',
        'Skolekretsinformasjon administreres av den enkelte kommune. Du finner din skolekrets på den offisielle nettsiden til kommunen skolen ligger i.':
            'School districts are managed by each municipality. You can find your school district on the official website of the municipality the school is in.',
        'Hvorfor viser kartet nærmeste skole?': 'Why does the map show the nearest school?',
        'Når du søker på en adresse, sorterer Skolekartet skolene etter avstand i luftlinje. Nærmeste skole er ofte, men ikke alltid, skolen adressen sogner til. Grensene kan følge veier, elver eller gamle kretser, og noen kommuner har ikke faste kretsgrenser i det hele tatt.':
            'When you search for an address, Skolekartet sorts the schools by straight-line distance. The nearest school is often, but not always, the school the address belongs to. Boundaries can follow roads, rivers or old districts, and some municipalities have no fixed district boundaries at all.',
        'Det finnes ikke et åpent, nasjonalt datasett med skolekretsgrenser. Kommunene registrerer kretsene i matrikkelen hos Kartverket, men disse dataene er ikke åpent tilgjengelige. Skolekartet bruker bare åpne data, og kan derfor bare vise skolekretsen i kommunene som har publisert den selv (se under).':
            'There is no open national dataset of school district boundaries. Municipalities register the districts in the Norwegian Mapping Authority’s property register, but this data is not openly available. Skolekartet only uses open data, so it can only show the school district in the municipalities that publish it themselves (see below).',
        'Vi har søkt i Geonorge og den nasjonale datakatalogen (data.norge.no) i november 2026. Oslo, Bergen, Trondheim, Nordre Follo (Kolbotn), Hamar og de andre kommunene har ikke publisert skolekretsene som åpne data. For dem viser Skolekartet de nærmeste offentlige skolene og lenker til kommunens eget oppslag.':
            'We searched Geonorge and the national data catalogue (data.norge.no) in November 2026. Oslo, Bergen, Trondheim, Nordre Follo (Kolbotn), Hamar and the other municipalities have not published their school districts as open data. For them, Skolekartet shows the nearest public schools and links to the municipality’s own lookup.',
        'Fredrikstad:': 'Fredrikstad:',
        'inntakssoner for barne- og ungdomsskoler, oppdatert 3. juli 2018. Grensene kan derfor avvike fra dagens.':
            'intake zones for primary and lower secondary schools, updated 3 July 2018. The boundaries may therefore differ from today’s.',
        'Se hvilke kommuner vi kan vise skolekretsen for, og hvor dataene kommer fra': 'See which municipalities we can show the school district for, and where the data comes from',
        'Fredrikstad kommune, «Inntakssoner for barneskoler» og «Inntakssoner for ungdomskoler» (Geonorge, åpne data)':
            'Fredrikstad municipality, “Intake zones for primary schools” and “Intake zones for lower secondary schools” (Geonorge, open data)',
        'Inntakssonene ble sist oppdatert i 2018 og kan avvike fra dagens grenser.': 'The intake zones were last updated in 2018 and may differ from today’s boundaries.',
        'Selv innenfor skolekretsen er det kommunen som fatter vedtak om skoleplass. Sjekk alltid med kommunen.':
            'Even within the school district, the municipality decides on the school place. Always check with the municipality.',
        'Pilot: skolekrets fra åpne data': 'Pilot: school district from open data',
        'Noen få kommuner publiserer skolekretsene sine som åpne data. For adresser i disse kommunene viser Skolekartet skolekretsen som en pilot. Den er merket «Pilot» og kan avvike fra kommunens gjeldende grenser.':
            'A few municipalities publish their school districts as open data. For addresses in these municipalities, Skolekartet shows the school district as a pilot. It is marked “Pilot” and may differ from the municipality’s current boundaries.',
        'Halden:': 'Halden:',
        'barneskolekretser, oppdatert 1. august 2025. Ungdomsskolekretsene er ikke publisert som åpne data.':
            'primary school districts, updated 1 August 2025. The lower secondary districts are not published as open data.',
        'Stavanger:': 'Stavanger:',
        'barne- og ungdomsskolekretser. Datasettet er ikke datert, og datakatalogen oppgir 2018 som siste oppdatering.':
            'primary and lower secondary school districts. The dataset is not dated, and the data catalogue gives 2018 as the last update.',
        'Skolekrets – barneskole': 'School district – primary school (in Norwegian)',
        'Skolekrets – ungdomsskole': 'School district – lower secondary school (in Norwegian)',
        'Bergen kommune': 'Bergen municipality',
        'Kart over skoler og skolekretsgrenser': 'Map of schools and school district boundaries (in Norwegian)',
        'Andre kommuner': 'Other municipalities',
        'Søk etter «skolekrets» eller «nærskole» på kommunens egne nettsider. Mange kommuner har et kart der du kan slå opp adressen din.':
            'Search for “skolekrets” (school district) or “nærskole” (local school) on the municipality’s own website. Many municipalities have a map where you can look up your address.',

        // ── Info pages: tilbakemelding ───────────────────────────────────
        'Tilbakemelding – Skolekartet': 'Feedback – Skolekartet',
        'Send tilbakemelding': 'Send feedback',
        'Har du spørsmål, feil du vil melde fra om, eller forslag til forbedringer? Vi setter pris på din tilbakemelding!':
            'Do you have questions, errors to report or ideas for improvements? We appreciate your feedback!',
        'Din e-post': 'Your e-mail',
        '(valgfritt)': '(optional)',
        'din@epost.no': 'you@example.com',
        'Melding': 'Message',
        'Må fylles ut': 'Required',
        'Skriv din melding her...': 'Write your message here...',
        'Send melding': 'Send message',
        'Sender...': 'Sending...',
        'Takk! Meldingen din er sendt.': 'Thank you! Your message has been sent.',
        'Sendt!': 'Sent!',
        'Noe gikk galt. Prøv igjen litt senere.': 'Something went wrong. Please try again a little later.'
    };

    // The dictionary for the chosen language (null for Norwegian)
    function dictionary() {
        return lang === 'en' ? EN : lang === 'uk' ? (window.I18N_UK || {}) : null;
    }

    function has(key) {
        const dict = dictionary();
        return Boolean(dict) && Object.prototype.hasOwnProperty.call(dict, key);
    }

    function t(key, values) {
        const text = has(key) ? dictionary()[key] : key;
        return values ? text.replace(/\{(\w+)\}/g, (match, name) => (name in values ? values[name] : match)) : text;
    }

    // Internal links: from the site's root, so links built in code work at any depth ("skole.html" is the
    // same page from skoler/oslo/), and with the language, so it also works when the browser blocks storage.
    // `base`: what a relative link is read from; links already in the page use the page's own address.
    // Anchors on the page, e-mail and phone links stay as they are.
    function href(link, base = ROOT) {
        if (!link || /^(#|mailto:|tel:)/.test(link)) return link;
        try {
            const target = new URL(link, base);
            if (target.origin !== location.origin) return link;
            if (translated) target.searchParams.set('lang', lang);
            return target.pathname + target.search + target.hash;
        } catch (error) {
            return link;
        }
    }

    // ── Automatic translation of fixed texts and attributes ────────────────
    const ATTRIBUTES = ['placeholder', 'aria-label', 'data-tooltip', 'title', 'alt', 'aria-roledescription',
                        'data-sr-singular', 'data-sr-plural'];

    function translateText(node) {
        const raw = node.nodeValue;
        const key = raw.replace(/\s+/g, ' ').trim();
        if (!key || !has(key)) return;
        const value = dictionary()[key];
        const lead = raw.match(/^\s*/)[0] ? ' ' : '';
        const tail = raw.match(/\s*$/)[0] ? ' ' : '';
        const next = lead + value + tail;
        // Only write when it changes, or the observer would loop on texts that are the same in both languages
        if (next !== raw && value !== key) node.nodeValue = next;
    }

    function translateElement(element) {
        ATTRIBUTES.forEach(name => {
            const value = element.getAttribute(name);
            const key = value && value.trim();
            if (key && has(key) && dictionary()[key] !== key) element.setAttribute(name, dictionary()[key]);
        });
        if (element.tagName === 'A' && element.hasAttribute('href') && !element.hasAttribute('data-lang-keep')) {
            const original = element.getAttribute('href');
            const localized = href(original, location.href);
            if (localized !== original) element.setAttribute('href', localized);
        }
    }

    function translate(root) {
        if (!translated || !root) return;
        if (root.nodeType === Node.TEXT_NODE) {
            translateText(root);
            return;
        }
        if (root.nodeType !== Node.ELEMENT_NODE) return;
        if (['SCRIPT', 'STYLE', 'TEXTAREA'].includes(root.tagName)) return;
        translateElement(root);
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
            acceptNode: node => {
                if (node.nodeType !== Node.ELEMENT_NODE) return NodeFilter.FILTER_ACCEPT;
                // A textarea's placeholder is translated, never what the user has typed
                if (node.tagName === 'TEXTAREA') translateElement(node);
                return ['SCRIPT', 'STYLE', 'TEXTAREA', 'svg'].includes(node.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
            }
        });
        let node = walker.nextNode();
        while (node) {
            if (node.nodeType === Node.TEXT_NODE) translateText(node);
            else translateElement(node);
            node = walker.nextNode();
        }
    }

    // ── Language switch and language notice ────────────────────────────────
    function switchUrl(target) {
        const url = new URL(location.href);
        url.searchParams.set('lang', target);
        return url.pathname + url.search + url.hash;
    }

    // Language menu (Designsystemet Dropdown): the button shows the chosen language's short name,
    // the list has every language in its own words, the chosen one marked as current
    const CHEVRON_DOWN = '<svg class="ds-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M5.96967 9.46967C6.26256 9.17678 6.73744 9.17678 7.03033 9.46967L12 14.4393L16.9697 9.46967C17.2626 9.17678 17.7374 9.17678 18.0303 9.46967C18.3232 9.76256 18.3232 10.2374 18.0303 10.5303L12.5303 16.0303C12.2374 16.3232 11.7626 16.3232 11.4697 16.0303L5.96967 10.5303C5.67678 10.2374 5.67678 9.76256 5.96967 9.46967Z" fill="currentColor"/></svg>';
    const MENU_LABEL = { no: 'Velg språk', en: 'Choose language', uk: 'Виберіть мову' };

    function switchLink() {
        const items = SUPPORTED.map(code => {
            const [long, short] = NAMES[code];
            const current = code === lang ? ' aria-current="true"' : '';
            return `<li><a class="ds-button lang-menu__item" data-variant="tertiary" data-size="sm" href="${switchUrl(code)}" lang="${code}" hreflang="${code}" data-lang-keep${current}>`
                + `<span class="lang-menu__code" aria-hidden="true">${short}</span><span>${long}</span></a></li>`;
        }).join('');
        return `<button type="button" class="ds-button lang-switch" data-variant="tertiary" data-size="sm" popovertarget="langMenu"
                        aria-label="${MENU_LABEL[lang]}: ${NAMES[lang][0]}">${NAMES[lang][1]}${CHEVRON_DOWN}</button>
                <div class="ds-dropdown lang-menu" popover id="langMenu" data-placement="bottom-end"><ul>${items}</ul></div>`;
    }


    // The language notice, in the chosen language, with a link back to Norwegian
    const NOTICE = {
        en: {
            applies: 'If anything differs, the Norwegian version applies.',
            onlyNorwegian: 'The main text on this page is only available in Norwegian.'
        },
        uk: {
            applies: 'Якщо щось відрізняється, чинною є норвезька версія.',
            onlyNorwegian: 'Основний текст цієї сторінки доступний лише норвезькою.'
        }
    };

    function noticeHtml() {
        if (!translated) return '';
        const text = NOTICE[lang];
        const onlyNorwegian = TRANSLATED_PAGES.includes(PAGE) || SCHOOL_PAGE ? '' : ` ${text.onlyNorwegian}`;
        return `<div class="lang-notice" role="note"><div class="site-container">
                    <p class="ds-paragraph" data-size="sm">${text.applies}${onlyNorwegian}
                    <a class="ds-link" href="${switchUrl('no')}" lang="no" hreflang="no" data-lang-keep>Norsk versjon</a></p>
                </div></div>`;
    }

    if (translated) {
        // Hide the page until the first translation pass, so Norwegian does not flash (max 1.5 s)
        document.documentElement.classList.add('i18n-pending');
        setTimeout(() => document.documentElement.classList.remove('i18n-pending'), 1500);

        document.addEventListener('DOMContentLoaded', () => {
            if (has(document.title)) document.title = dictionary()[document.title];
            translate(document.body);
            document.documentElement.classList.remove('i18n-pending');
            new MutationObserver(records => records.forEach(record => {
                if (record.type === 'characterData') translateText(record.target);
                else if (record.type === 'attributes') translateElement(record.target);
                else record.addedNodes.forEach(translate);
            })).observe(document.body, {
                childList: true, subtree: true, characterData: true,
                attributes: true, attributeFilter: ATTRIBUTES
            });
        });
    }

    return { lang, isEnglish, translated, locale, page: PAGE, t, href, url, translate, switchLink, noticeHtml };
})();

const t = I18N.t;

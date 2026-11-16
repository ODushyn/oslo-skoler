# Повний флоу прототипа: аудит, шлях користувача, кроки й тести

Джерело: Figma, секція **5 · PROTOTYPE – hele opplevelsen for brukertesting** (вузол `321:29289`, сторінка «Copy Nastia»).
110 екранів у розділах A–K. Це копії секцій 3 і 4 (redesign v1–v3), тобто **не** секція 10.1, за якою зроблена поточна головна.
Статус на дату складання: нічого з цього плану ще не закомічено, поточні зміни лежать у `feature/sok-rekkefolge`.

Позначки: ✅ є · 🟡 є частково / інший дизайн · ❌ немає · 🔒 потребує даних або рішення (див. «Рішення»).

---

## 1. Рішення, без яких не можна починати розділ A (рекомендації виділені)

| # | Питання | Чому це розвилка | Рекомендація |
|---|---|---|---|
| D1 | Головна: лишити дизайн 10.1 (щойно зроблений, зірений до пікселя) чи перейти на A1 прототипа («Steg 1 av 2», картка «Hvor bor dere?», «Slik hjelper vi dere», «Trenger barnet tilrettelegging?») | Це два різні дизайни головної й флоу. Прототип A1→A4→A6 замінює 10.1 F0→F2 | Перейти на прототип (ваш останній наказ), але **перенести з 10.1** список-картки «Idé E», рядок «Sorter / Liste · Kart», фільтр-панель F3 і картку округу F2, якщо вони є в A6/A7. Перевірити diff A6↔F2 на кроці 2.1 |
| D2 | Крок A4 «Hva er viktig for dere?» (раніше відкладений) і «Passer 3 av 4 prioriteringer» | Половини критеріїв (heis, trinnfri, ліфт, слух/зір, спецгрупа) нема даних | Робити A4 з чесним станом **«Ukjent»** (його й має дизайн). «Passer X av N» рахувати лише по критеріях з реальними даними; решта = «Ukjent», не вгадувати |
| D3 | Дані про доступність (heis, toalett, trinnfri, спецгрупа, «Bekreftet av skolen») | Національної відкритої бази нема (див. відповідь про джерела) | Показувати «Ukjent», а підтвердження збирати через F7 «For skoler» (Formspree → ручна перевірка → файл даних) |
| D4 | Контакти у футері й F5: `hei@skolekartet.no`, `400 00 000` | У пам'яті проєкту це плейсхолдери, не справжні | Не випускати вигаданих контактів. Дати реальні або лишити лише «Skjema» |
| D5 | Тексти прав і процедур (E1, E3, E4, E5, frister, skoleskyss) | Юридичні/процедурні твердження; правило Røde Kors №6: людина перевіряє текст, створений ШІ | Брати текст із макета дослівно, на сторінці ставити «Utkast – ikke faglig kontrollert», доки відповідальна особа не підтвердить |
| D6 | F7 збирає ім'я й контакт особи в школі | Персональні дані (правило №5, №3: оцінка ризику) | Форма на Formspree тільки з робочими контактами; описати в «Personvern»; про дитину даних не збирати |
| D7 | Короткі посилання `skolekartet.no/liste/7KQ2-MAJ-MAR-URA` (C1) | Потрібен сервер; сайт статичний | Робити посилання зі «зашитим» списком у query (`?s=`), як зараз у «Sammenlign» |

---

## 2. Шлях користувача (з TESTGUIDE макета)

Сценарій тесту: «Dere har flyttet til Kirkeveien 64A i Oslo. Barnet deres bruker rullestol og trenger tilrettelagt opplæring.» Ніяких персональних даних про дитину, лише сценарій.

### 12 стартових флоу
| № | Флоу | Послідовність екранів |
|---|---|---|
| 1 | Finn en skole (PC) | A1 → A2 → A4 → A5 → A6 → A7 → A8 → I6 → C1 → I3 → I4/I5 |
| 2 | Мобільний | H1 → J4 (Filter) → J5 (Sorter) → H3 → J8 (Lagret) → J9/J10 (Del) → J11/J12 (Ring, spørsmål) |
| 3 | Ingen treff | G2 |
| 4 | Adressen finnes ikke | G1 |
| 5 | Lagrede (tom) | C5 → «Åpne liste» → C4 |
| 6 | Visning | D1 (текст, контраст, тема) |
| 7 | Høy kontrast | H4 |
| 8 | Mørk тема | H5 |
| 9 | Ukrainsk | D2 → I1 |
| 10 | Kontakt oss | F5 → K3 (помилки) → F6 |
| 11 | For skoler | F7 → K4 |
| 12 | Kart på PC | B1 → B2 → K2 |

### 7 завдань тестування (це і є приймальні тести)
1. Знайти школи, що найкраще пасують дитині, і назвати, яку розглянути ближче й чому.
2. Побачити школи на карті: яка найближча, наскільки пасує.
3. З'ясувати, чи є в Majorstuen skole heis, і що спитати в школи. 🔒 D3
4. Зберегти три школи й надіслати список комусь із родини.
5. Текст замалий: збільшити його.
6. Поскаржитися на хибну інформацію.
7. (Мобільний) повторити 1 і 3 на телефоні.

Критерій успіху кожного: завдання виконується без підказок, без мертвих кліків (у макеті мертві місця блимають синім, у нас їх бути не повинно), з клавіатури й зі скрінрідером.

---

## 3. Трасування екранів: де ми зараз і що робити

Кожен рядок = один вузол Figma. «Крок» посилається на розділ 4.

### Розділ A: знайти школу
| Вузол | Екран | Стан | Що не вистачає / примітки | Крок |
|---|---|---|---|---|
| 321:29291 | A1 Forside – hvor bor dere? | 🟡🔒D1 | «Steg 1 av 2», картка «Hvor bor dere?», «Neste: hva er viktig for dere?», «Bruk min posisjon», «Jeg vil heller se alle skoler i en liste», «Ser dere på flere boliger?», «Skoleord forklart», «Slik hjelper vi dere», 3 лінк-картки | 2.1 |
| 321:29382 | A2 Adressesøk med forslag | 🟡 | Групи підказок є (F1 10.1); звірити з A2 | 2.2 |
| 321:29508 | A3 Posisjon ikke tilgjengelig | 🟡 | Є помилка під полем; дизайн: блок «Vi fikk ikke bruke posisjonen din» + «Slik tillater du posisjon» (→I19) + «Prøv igjen» | 2.3 |
| 321:29612 | A4 Hva er viktig for dere? | ❌🔒D2 | 6 груп, 12 чекбоксів, «N valgt», «Hopp over», «Vis skoler (19)», примітка про приватність (вибір лишається в браузері) | 2.4 |
| 321:29674 | A5 Laster skoler | 🟡 | Скелетон є; дизайн A5→A6 по таймеру | 2.5 |
| 321:29805 | A6 Resultater – liste | 🟡🔒D1 | «Passer best», «Endre prioriteringer», «Legg til adresse (maks 3)», «Passer X av N», блок «Hvilken skole hører adressen til?» | 2.6 |
| 321:29937 | A7 Filter | ✅🟡 | Панель F3 уже є; звірити з A7 | 2.7 |
| 321:30163 | A8 Skoleside – Majorstuen | 🟡 | C6 (сторінка школи) зроблена; A8 — старіша версія, звірити; «Tilrettelegging», «Viktige frister», «Skoleskyss» 🔒D3/D5 | 2.8 |

### Розділ B–C: карта, списки
| Вузол | Екран | Стан | Примітки | Крок |
|---|---|---|---|---|
| 321:30474 / 321:30681 | B1 Kart, B2 skole valgt | 🟡 | «Søk i dette området», картка школи «Se skolen / Lagret / Vis rute» | 3.1 |
| 321:34458 | K2 Kart – tegnforklaring skjult | ❌ | перемикач легенди | 3.1 |
| 321:30877 | C1 Lagrede – sammenlign og del | 🟡 | блок «Del listen», «Kopier lenke», «Send på SMS/e-post», «Skriv ut», «Fjern» | 3.2 |
| 321:31050 | C2 Sammenlign adresser | ❌ | до 3 адрес; I21 | 3.3 |
| 321:31146 | C3 Utskrift / PDF | 🟡 | print-CSS 794×1123 | 3.4 |
| 321:31233 | C4 Delt liste på телефоні | 🟡 | «Skoler dere har fått tilsendt», «Lytt til listen» | 3.5 |
| 321:31296 | C5 Lagrede – tom | 🟡 | «Har du fått en liste fra noen? Åpne liste» | 3.5 |

### Розділ D, G, H: мова, стани, мобільний
| Вузол | Екран | Стан | Примітки | Крок |
|---|---|---|---|---|
| 321:31327 | D1 Visning (текст, контраст, тема) | 🟡 | тема є; **розмір тексту й висока контрастність відсутні** | 1.3 |
| 321:31459 | D2 Forside på ukrainsk | 🟡 | усі нові тексти потребують UK/EN | у кожному кроці |
| 321:32956 / 321:33058 | G1 Adressen finnes ikke, G2 Ingen treff | 🟡 | окремі екрани станів | 2.9 |
| 321:33200–33607 | H1–H5 мобільні | 🟡 | H4 (контраст і великий текст) залежить від 1.3, H5 від теми | 5.2 |

### Розділ E–F: інформаційні сторінки
| Вузол | Екран | Поточна сторінка | Стан | Крок |
|---|---|---|---|---|
| 321:31551 | E1 Barn med særskilte behov | немає | ❌🔒D5 | 4.1 |
| 321:31739 | E2 Slik leser du tallene | om-fargefordelingen | 🟡 (дизайн каже «Hvorfor vi har sluttet med rødt og grønt») | 4.2 |
| 321:31829 | E3 Skolekrets og skoleplass | om-skolekrets | 🟡🔒D5 | 4.2 |
| 321:31924 | E4 Søknadshjelp – bytte skole | немає | ❌🔒D5 | 4.3 |
| 321:32016 | E5 SFO og AKS | skolefritid | 🟡 | 4.2 |
| 321:32107 | E6 Mat og aktiviteter | skolehverdag | 🟡 | 4.2 |
| 321:32163 | E7 Ny i Norge | ny-i-norge | 🟡 | 4.2 |
| 321:32260–32578 | F1 Om, F2 Datakilder, F3 Personvern, F4 Tilgjengelighet | om-skolekartet, datakilder, personvern, tilgjengelighet | 🟡 | 4.2 |
| 321:32709 | F5 Kontakt oss | tilbakemelding (Formspree) | 🟡 | 4.4 |
| 321:32783 | F6 Melding sendt | немає | ❌ | 4.4 |
| 321:32811 | F7 For skoler – bekreft opplysninger | немає | ❌🔒D6 | 4.5 |
| 321:34624 / 321:34702 | K3 форма з помилками, K4 підтвердження для шкіл | ❌ | валідація й квитанція | 4.4 / 4.5 |

### Розділ I: 23 діалоги й підтвердження (десктоп)
Зараз це випадні меню чи вбудовані повідомлення, діалогів нема.
| Вузли | Що | Стан | Крок |
|---|---|---|---|
| 321:33767 | I1 Velg språk | 🟡 (є меню) | 5.1 |
| 321:33800 | I2 Sorter skolene | 🟡 (є меню) | 5.1 |
| 321:33821, 33839, 33847 | I3 Del listen, I4 «Lenken er kopiert», I5 «E-posten er klar» | ❌ | 3.2 |
| 321:33855, 33865 | I6 «Lagret – N skoler», I7 «Skolen er fjernet» | ❌ (тости) | 1.2 |
| 321:33874, 33889 | I8 Ring skolen, I9 «Nummeret er kopiert» | ❌ | 2.8 |
| 321:33896 | I10 «5 spørsmål er kopiert» | 🟡 (змінюємо підпис кнопки) | 2.8 |
| 321:33909, 33932 | I11 Legg fristene i kalenderen, I12 «3 frister er lagt…» | ❌🔒D5 | відкладено |
| 321:33940, 33948 | I13 «Takk for svaret!», I14 «Hva manglet?» | 🟡 (є Ja/Nei) | 4.4 |
| 321:33975 | I15 Спільний «Leser opp siden» (синтез мовлення) | ❌ | 5.3 |
| 321:33987 | I16 Trinnfri rute | ❌🔒D3 | відкладено |
| 321:34005, 34019, 34075 | I17 Utkast søknad, I18 «Teksten er kopiert», I22 «Utkastet er lagret» | ❌ | 4.3 |
| 321:34026 | I19 Slik tillater du posisjon | ❌ | 2.3 |
| 321:34045 | I20 «Du går til en annen nettside» | ❌ (див. примітку) | 5.1 |
| 321:34057 | I21 Legg til en adresse | ❌ | 3.3 |
| 321:34083 | I23 Hva betyr fargene? | 🟡 (є розгортний блок) | 2.6 |

Примітка про I20: показ проміжного вікна перед кожним зовнішнім посиланням погіршує досвід і потребує окремого рішення. За замовчуванням робимо тільки позначку ↗ і `rel="noopener"`, діалог лишаємо за рішенням користувача.

### Розділ J: 15 мобільних аркушів
J1 Meny (321:34099) 🟡, J2 Visning, J3 Språk, J4 Filter, J5 Sorter, J6 Endre adresse, J7 Tegnforklaring, J8 «Lagret – 4 skoler», J9 Del skolen, J10 «Lenken er kopiert», J11 Ring skolen, J12 «5 spørsmål er kopiert», J13 «Leser opp listen», J14 «Åpnes på en annen nettside», J15 Kontakt oss. Усе робиться одним компонентом «діалог на ≥768 px, нижній аркуш на <768 px» (крок 1.1). Крок 5.2 перевіряє кожен.

---

## 4. Кроки реалізації

Кожен крок закінчується умовою «готово»: (а) екран відкривається з клавіатури й мишею; (б) перевірка текстів: усі текстові вузли кадру Figma є в DOM або внесені як погоджені відхилення; (в) розміри до пікселя на 1440 px і 390 px; (г) EN/UK переклади, `check_i18n.py` проходить; (д) без помилок у консолі.

### Фаза 0. Рішення
0.1 Підтвердити D1–D7 (розділ 1).

### Фаза 1. Основа (незалежна від рішень)
1.1 (зроблено) `static/js/ui.js`: компонент діалогу на `<dialog>` (десктоп) й нижнього аркуша (<768 px): фокус-пастка, Esc, клік поза вікном, повернення фокусу, `aria-modal`, заборона прокрутки фону.
1.2 Підтвердження I4, I5, I6, I7, I9, I10, I18, I22, J8, J10, J12. У макеті це **модальні вікна** (520 px, зверху), не тости, тому робимо їх тим самим компонентом `kind: 'confirm'`. «Lagret – N skoler» бере лічильник зі `savedSchools()`. **Зроблено:** I6, I7, J8 (див. розділ 6). Примітка D8: модальне вікно після кожного збереження перериває користувача; варто показувати його лише при першому збереженні за сесію (рішення за вами).
1.3 Налаштування «Visning» (D1, J2, H4): розмір тексту (звичайний / більший / найбільший), висока контрастність, тема; зберігати у `localStorage` (try/catch), застосовувати через `data-` на `<html>` до першого малювання, без стрибків.
1.4 Друк (C3): `@media print`, A4 794×1123, прибрати навігацію й карти.
1.5 Дизайн-токени: звести кольори Figma до змінних Digdir; перевірити контраст ≥ 4,5:1 у всіх темах.
1.6 Ядро перевірки паритету (див. розділ 5).

### Фаза 2. Основний флоу (A, G, B)
2.1 Головна A1 (після D1) і «Steg 1 av 2».
2.2 Підказки A2.
2.3 A3 + діалог I19.
2.4 A4 «Hva er viktig for dere?» (після D2), вибір лише в браузері.
2.5 A5 завантаження, A6 результати («Passer best» тільки по відомих критеріях).
2.6 Легенда кольорів як діалог (I23, J7).
2.7 Фільтр A7 і J4.
2.8 Сторінка школи A8 (C6 вже зроблена): діалоги «Ring skolen» (I8, I9), копіювання питань (I10).
2.9 Екрани станів G1, G2.
3.1 Карта B1, B2, K2.

### Фаза 3. Списки й обмін (C)
3.2 C1 + I3, I4, I5: Del, Kopier lenke, SMS (`sms:`), e-post (`mailto:`).
3.3 C2 «Sammenlign adresser» + I21 (до 3 адрес, лише в сесії).
3.4 C3 друк.
3.5 C4, C5 («Åpne liste» приймає посилання).

### Фаза 4. Інформаційні сторінки й форми (E, F)
4.1 E1 нова сторінка.
4.2 Звірити й переписати E2, E3, E5, E6, E7, F1–F4 за макетом.
4.3 E4 Søknadshjelp + I17, I18, I22.
4.4 F5 Kontakt oss + K3 (валідація) + F6 + I13, I14.
4.5 F7 For skoler + K4.

### Фаза 5. Діалоги, мобільний, мова
5.1 I1, I2, I20 (за рішенням).
5.2 Мобільні H1–H5, J1–J15.
5.3 «Lytt til siden» (I15, J13): Web Speech API, пауза/прогрес, мова сторінки.
5.4 UK й EN для всіх нових текстів (D2 екран).

### Фаза 6. Приймання
6.1 Проходження 12 флоу й 7 завдань.
6.2 Матриця екранів і режимів (розділ 5).
6.3 Звіт паритету: для кожного вузла Figma «реалізовано / відхилення / не робимо».

---

## 5. Тестування

### 5.1 Матриця
| Вісь | Значення |
|---|---|
| Ширина | 320, 360, 390, 768, 1024, 1280, 1440 (дизайн), 1920 |
| Масштаб | 100 %, 200 % (reflow без горизонтальної прокрутки, WCAG 1.4.10) |
| Розмір тексту | звичайний, більший, найбільший |
| Тема | зелена, синя, темна, висока контрастність |
| Мова | nb, en, uk |
| Введення | миша, тільки клавіатура (Tab/Shift+Tab/Esc/Enter/Space), дотик |
| Рух | `prefers-reduced-motion: reduce` |
| Інше | друк, без JS (статичні сторінки шкіл), повільна мережа, офлайн-помилки API |

### 5.2 Автоматизована перевірка паритету (ядро)
Для кожного кадру Figma формується маніфест: усі видимі текстові вузли (нормалізовані), усі кнопки/посилання/поля та розміри ключових блоків. Скрипт відкриває відповідну сторінку у браузері й перевіряє:
- кожен текст кадру є в DOM (або в списку погоджених відхилень);
- у кожної кнопки/посилання є доступна назва, а навігація клавішею Tab її досягає;
- ключові розміри (висота шапки, колонки, картки) збігаються з макетом в межах 1 px на 1440 і 390 px;
- немає горизонтальної прокрутки, помилок консолі й 404 у мережі.

### 5.3 Ручні перевірки
- Скрінрідер: VoiceOver (macOS/iOS), розмітка діалогів, оголошення тостів.
- Копіювання в буфер, `sms:`, `mailto:`, `tel:`, друк у PDF.
- Геолокація: дозвіл, відмова, тайм-аут.
- Сценарії завдань 1–7 з розділу 2, з фіксацією часу й помилок.

### 5.4 Критерії завершення
Усі кроки фаз 1–5 виконані; 12 флоу й 7 завдань проходять; матриця без критичних дефектів; жодного вузла без статусу у звіті паритету; без вигаданих даних (усе, що без джерела, показано як «Ukjent»).

---

## 6. Журнал виконання

| Крок | Статус | Перевірено |
|---|---|---|
| 0 Аудит і план | ✅ | 110 кадрів зіставлено з сайтом; TESTGUIDE розібрано |
| 1.1 Компонент діалогу й аркуша `ui.js` | ✅ | десктоп: панель 520×305 на (460, 24), кнопки 454×52, тінь 0 8 32 / 18 %, радіус 16; мобільний (375): карта 16 px від країв, аркуш зі «шпилькою» 40×4; Esc, клік поза вікном, повернення фокусу, зняття прокрутки, Tab лишається у вікні (рідний `<dialog>`) |
| 1.2 Підтвердження «Lagret» / «Skolen er fjernet» (I6, I7, J8) | ✅ | «Angre» відновлює школу, закладки й «Lagrede skoler (N)» оновлюються на всій сторінці |
| Рішення D1, D2 | ✅ | 2026-11-13: головна робиться за прототипом (A1), крок A4 з чесним «Ukjent» |
| 2.1 Головна A1 «Steg 1 av 2» | 🟡 | розміри збігаються з Figma до 4 px (текстова колонка 660, картка допомоги 396, кроки 357×141). Немає двох посилань «Ser dere på flere boliger?» (чекає C2/I21) і «Skoleord forklart» (у прототипі немає екрана). Картка «Barn med særskilte behov» веде на ще не створену сторінку E1 |
| 2.2 Підказки пошуку | ✅ | групи з F1 10.1 лишилися |
| 2.3 A3 «Vi fikk ikke bruke posisjonen din» + I19 | ✅ | перевірено з імітацією відмови; діалог «Slik tillater du posisjon» |
| 2.4 A4 «Hva er viktig for dere?» | 🟡 | 6 груп, 13 карток, «N valgt», «Hopp over», «Vis skoler (N)», примітка про приватність; вибір у URL (`prio=`) і лише в браузері. Висота картки 91 px проти 97/101 у Figma, треба підігнати |
| 2.5–2.6 A6 результати | 🟡 | шапка (адреса, пріоритети з ✕, «Endre prioriteringer»), текст «N skoler innen 3 km · sortert etter …», «Sorter: Passer best», «Filter (N)», «Liste · Kart», легенда «Slik leser du kortene», картка «Skolekort» («Passer X av N», факти Bekreftet / Ukjent / Verdt å sjekke). Пріоритети з даними: мобінг і самопочуття, нац. тести, норвезька; решта «Ukjent» |
| 2.9 G1 «Vi fant ingen adresse…», G2 порожній стан | 🟡 | G1 з «Mente du»; G2 спрощено (розширити радіус, прибрати фільтри, змінити пріоритети) |
| Кроки A→A4→A6, «Назад» | ✅ | перевірено: Neste, Hopp over, назад, вперед, «Endre adresse», «Endre prioriteringer»; адреса зберігається |
| EN і UK для нових текстів | ✅ | 131 рядок, `check_i18n.py` 1195 / 1195 |
| 1.3 «Visning» (розмір тексту, контраст) | ❌ | наступний |
| Решта | ❌ | чекає |

### Журнал, 2026-11-13/14 (друга частина)

| Крок | Статус | Що зроблено / що відхиляється від Figma |
|---|---|---|
| E1 «Barn med særskilte behov» (321:31551) | ✅ | `barn-med-sarskilte-behov.html`: тексти дослівно з Figma, відступи звірені (заголовки 36 px зверху, 20 px між блоками, картка «Relatert» 280 px). **Відхилення:** мітка «Utkast – ikke faglig kontrollert» (правило ШІ: юридичні тексти перевіряє людина); без посилання «Legg fristene i kalenderen» (немає конкретної дати); «Lytt til siden» = Web Speech API браузера, нічого не надсилається. Додано в меню, футер, sitemap |
| «Visning» (D1 321:31327) | ✅ | Панель 420 px: розмір тексту (CSS `zoom` 1,15/1,3), контраст (високий), фарботема (Grønn/Blå — **темної теми немає**, її свідомо прибрали раніше), менше руху, «Spar data» (карта без підкладки, поки не натиснуть «Vis kart»), показ кнопки «Lytt». Зберігається в localStorage; за замовчуванням береться `prefers-contrast` і `prefers-reduced-motion`. «Lytt» за замовчуванням увімкнено (у макеті E1 кнопка є, у панелі вимкнена — суперечність у дизайні) |
| A4 висота карток | ✅ | 97 px / 101 px, шрифти 18/16, чекбокс 28, відступи, панель дій 100 px, «N valgt», примітка 16 px — збігається з Figma до 1 px |
| A6 смуга й тулбар | ✅ | смуга 216 px, тулбар з y=292, кнопка «Legg til адресу (maks 3)» 250×44; бічна колонка 996/380 px (картки 325 і 450 px) у виді «Liste» |
| A6 повідомлення «Hvilken skole hører adressen til?» | ✅ | замінює блок «Skolekrets for adressen» (і там, де є пілотні дані кола, і там, де їх нема); школи лишаються в списку |
| R6 «Lagrede skoler» (321:22937) | ✅ | `sammenlign.html` + `compare.js`: «Del listen» (Kopier lenke / SMS / e-post), друк/PDF, таблиця порівняння по рядках, «Neste steg», нотатки. Заголовок «Lagrede skoler» тепер веде з шапки й меню сюди. **Відхилення:** нотатки лишаються лише в цьому браузері й **не** йдуть у посиланні (приватність), посилання — справжній `?s=…&prio=…`, а не `skolekartet.no/liste/KOD` (D7); «Skolekrets» усюди «не підтверджено» (нема даних під адресу на цій сторінці); рядок «Trinnfri skolevei» → «Skolevei» (лише відстань по прямій) |
| C2/I21 «Sammenlign adresser» | ✅ | `sammenlign-adresser.html` + `addresses.js`: до 3 адрес у сесії, діалог «Legg til en adresse», рядки «Skole som passer best», «Skoler som passer alle valg», «Skolekrets» (ukjent), «Trivsel ved nærmeste skole», «Skolevei». Посилання на A1 та кнопка в смузі A6 |
| Посилання «Skoleord forklart – ordliste på seks språk» | ⛔ | не зроблено: у прототипі немає екрана, у нас лише три мови, а тлумачення термінів — зміст, який має перевірити людина |
| Піксельне порівняння A1, A4, A6 | 🟡 | A1, A4, A6 (смуга, тулбар, бічна колонка), E1, R6 звірено геометрично з Figma (тексти, відступи, розміри шрифтів); решту карток A6 і мобільний вигляд не перевірено попіксельно |

### Журнал, 2026-11-14

| Крок | Статус | Що зроблено |
|---|---|---|
| Нотатки й пріоритети в посиланні | ✅ | `sammenlign?s=…&prio=…&n=…`: нотатки йдуть у посиланні (як у макеті), посилання оновлюється, поки пишуть; одержувач бачить нотатки відправника. Текст підзаголовка змінено: «Lenken inneholder skolene, prioriteringene og notatene dere skriver selv» і підказка «Ikke skriv personopplysninger i notatene» (нотатки — вільний текст). Речення «Lenken kan når som helst slettes» не додано: посилання не зберігається на сервері |
| Skolekrets з карти | ✅ | `lookupKrets` у `shared.js` (ті самі дані `skolekretser.json`, що малюються на карті: Oslo, Stavanger, Halden, Fredrikstad). R6: «Skolekretsen er ikke bekreftet for N av скolene» рахується з даних (приклад Kirkeveien 64A: 2 з 3), рядок «Skolekrets for adressen» у таблиці, зелений блок, коли підтверджено для всіх. C2: рядок «Skolekrets» з назвами шкіл кола. Поза цими 4 кommunами лишається «Ukjent» |
| A6 мобільний (H1) | ✅ | компактна смуга (адреса з піном, дві пріоритети + «+ N prioriteringer til · Endre», «Liste | Kart» на всю ширину), Sorter + Filter в один рядок, лічильник «N skoler innen 3 km», коротке повідомлення про округ, закладка квадратом у куті картки, фіксована панель «N lagret · Sammenlign» |
| Таблиця порівняння на телефоні | ✅ | підписи рядків залишаються при прокручуванні вбік |
| Шапка на сторінках шкіл `skoler/…` | ✅ | перевірено на Majorstuen: нові пункти меню, «Lagrede skoler» → `/sammenlign`, панель «Visning» як нижній аркуш (J2); версії скриптів оновлено на всіх 2939 сторінках |
| Планшет 641–1023 px | ✅ | бічна колонка списку йде під список |
| Не перевірено/не зроблено | ⛔ | темна тема (H5), «Høy kontrast» на H4 звірено лише за кольорами без попіксельного порівняння, ordliste на seks språk, решта мобільних аркушів J3–J15 |

### Журнал, 2026-11-14 (тексти, дані, J3–J15)

**Прибрано з обсягу (рішення користувачки 2026-11-14):** «Skoleord forklart – ordliste på seks språk» і темна тема (H5, «Mørkt» у «Visning»). Не робимо.

| Що | Статус | Примітки |
|---|---|---|
| Перевірка текстів за джерелами | ✅ | Звірено з oslo.kommune.no / Udir: SFO/AKS (безкоштовне місце на 4 трінні — лише для доходу до 1,5 млн, години роботи прибрано, бо їх нема на сторінці кommune, «стенгт i juli» ✓, діти з особливими потребами 5.–7. трінн додано), E1 (спецгрупа в Осло: строк 1. desember, відповідь до червня, 1. трінн зазвичай ні), nettfilter (+ strømmetjenester og KI), skolebytte в Осло (новий розділ на «Om skolekrets»), «Personvern» (нові ключі сховища, що йде в посиланні, читання вголос), «Tilgjengelighet» (Visning), «Om fargefordelingen» (2 280 шкіл, 49,29, повна таблиця інтервалів), «Datakilder» і футер (що оновлюється щоночі, а що вручну), підписи фільтрів «Trivsel 4,2 eller høyere», «Mobbing under 10 %», «Gangtid (anslag ut fra luftlinje)», підказка GSI. Тексти A4 «Vi viser heis/teleslynge/trinnfri rute» замінено на чесні «Det finnes ikke åpne data … ennå» |
| Аудит даних | ✅ | Мок-даних немає. Усі числа з Udir (статистикбанк, GSI, NSR), Kartverket/Geonorge, OSM, сторінок Oslo kommune; Oslo-кола — PBE з дозволом. 10 з 13 пріоритетів A4 не мають даних (показуються «Ukjent»). Ручне оновлення: nasjonale prøver, GSI, OSM, сторінки шкіл Осло |
| Ще не виправлено | ⚠️ | межа кольору 49,31 зашита в коді (не дорівнює сучасному середньому 49,29 і національному 49,3/49,7); TRIVSEL_NATIONAL = 4,1 зашите; для 908 шкіл частка «forsterket norsk» з попередніх років; розділи лише для Осло мовчки відсутні в інших kommunах |
| J3 Språk | ➖ | у нас 3 мови (nb/en/uk), у макеті 6 — інших перекладів немає |
| J4 Filter «Må ha» | ➖ | фільтрів доступності немає даних — у фільтрі пояснення замість них |
| J5 Sorter | ✅ | нижній аркуш на телефоні, пункти «Passer best for dere», «Nærmest først», «Mest bekreftet informasjon» (новий), «Navn A–Å» |
| J6 Endre adresse | ➖ | «Endre» веде на крок 1 з полем адреси, не аркуш |
| J7 Tegnforklaring | ➖ | наші маркери на карті кольорові за нац. тестами, не за «Passer X/4», тож легенда інша |
| J8 Lagret | ✅ | раніше |
| J9 Del skolen | ✅ | аркуш SMS / Kopier lenke / e-post; речення «Lenken åpnes med stor tekst og Lytt-knapp» не додано (неправда) |
| J10 / J12 | ✅ | «✓ Lenken er kopiert», «✓ N spørsmål er kopiert – Lim dem inn i notater før du ringer.»; якщо браузер не дає копіювати — діалог з виділеним текстом |
| J11 Ring skolen | ✅ | аркуш з номером і назвою школи, «Ring nå» / «Avbryt»; годин роботи («hverdager 08–15») немає в даних — не показуємо |
| J13 Spiller | ✅ | панель «▶ Leser opp siden · 00:18», Pause / Fortsett / Stopp |
| J14 | ➖ | лише для тесту прототипу |
| J15 Kontakt oss | ➖ | у макеті вигадані телефон і e-пошта; у нас справжня форма |

### 2026-11-14 – kolorskala og trivsel følger dataene

- Skillet mellom oransje og lysegrønn er nå landssnittet for samme nivå og skoleår (create_map.py `national_cuts`, fra Udirs rad «Hele landet»): 49,33 på 5. trinn og 49,67 på 8. trinn for 2025–26, i stedet for faste 49,31. Hver skole har `nationalAverage`; `metadata.resultater` har begge.
- Trivsel sammenlignes med landssnittet for samme trinn fra Elevundersøkelsen (`trivsel.national`, `metadata.trivsel`), i stedet for faste 4,1. Den nattlige oppdateringen lagrer nå landstallet i cached-data/trivsel.json; eldre cache tar det fra historikkfila.
- `scoreBand(avg, national)` og `trivselWord(value, national)` i shared.js; `levelNumbers` gir `avgNational` og `trivNational`.
- Følge: 44 ungdomsskoler med snitt 49,33 (og én med 49,5) gikk fra lysegrønn til oransje. Ingen andre felt endret.
- Tekster: filteret («Landssnittet – 55», «45 – landssnittet»), Snitt-hjelpen (tallene fra dataene), Om fargefordelingen (nye andeler 46,9 % / 44,8 %, nye rader i tabellen, ny begrunnelse).
- 2 924 sider under skoler/ lastet shared.js?v=28; nå v=37 overalt.
- Fortsatt åpent: GSI-året vises ikke ved norsk-tallene når det er eldre enn siste år.

### 2026-11-16 – main flettet inn, språkbytte beholder søket

- origin/main (Nordre Follo og 49 nye kommuner med skolekretser, tester og CI, 404-side, tilgjengelighetsgjennomgangen 6. november) er flettet inn. Vår design og logikk er beholdt; fra main er tatt: statisk bunntekst, `sameKommune` i kretsoppslaget, skjermleserteller for listen, `labelParts` på skolesiden, kartfeilmelding, `defer` på skriptene, WCAG 2.2.
- Sidene under skoler/ er bygd på nytt med site_pages.py; school-data.json med create_map.py.
- Språkbytte: lenken får adressen i det øyeblikket den brukes, og på forsiden kommer adresse, steg, prioriteringer og kart tilbake etter byttet (sessionStorage, som «Tilbake»). Prioriteringer på steg 2 skrives i adressen med en gang. Båndet over resultatene tegnes på nytt etter gjenoppretting (gjaldt også «Tilbake»).
- Tester: nye JS-tester for `scoreBand`, `trivselWord`, `levelNumbers`; test for trivsel med landstall.

### 2026-11-16 · Два шляхи пошуку й одне поле
- На прохання власниці продукту покроковий флоу A1 → A4 → A6 («Steg 1 av 2 / 2 av 2») замінено на два шляхи: швидкий пошук (адреса → одразу школи, як у `main`) і необов'язковий пошук за критеріями («Velg hva som er viktig» → A4 → результати за «Passer best»).
- Поле пошуку одне і стоїть під хедером на старті, на A4 і на результатах на тій самій висоті (перевірено: 215 px на 1280, 219 px на 375 з «Ekstra stor» текстом).
- Опис флоу: [docs/user-flow.md](user-flow.md). Це відхилення від кадрів A1/A4/A6 прототипа; Figma не оновлено.
- Того ж дня головну повернуто до макета F0 (`303:24833`): смуга «Leter du etter en skole?» з полем і «Filter», «Slik kan dere begynne», права колонка «Lagrede skoler» і «Kart». Другий шлях — картка «Vet dere hva som er viktigst?» → «Hva er viktig for dere?» → результати. У «Kart» кнопка «Se skolekretser» веде на карту з шарами округів. Hero з прототипа («Slik hjelper vi dere», «Trenger barnet tilrettelegging?») прибрано разом зі стилями й перекладами.
- Виправлено посилання «Se kretsgrensen på kartet»: воно передавало неіснуючий шар `skolekretser`, тепер `kretser-barneskole,kretser-ungdomsskole`.
- Блок «Slik kan dere begynne» замінено на «Slik leser du fargene»: п'ять кольорів з межами й словами, середнє по країні з `metadata.resultater` і посилання на `om-fargefordelingen`. Стилі й переклади трьох карток прибрано.
- На старті прибрано праву колонку («Lagrede skoler», «Kart»), картку «Vet dere hva som er viktigst?» піднято над «Slik leser du fargene». На результатах права колонка лишилась.
- «Hva er viktig for dere?» отримала ті самі розміри шрифтів, що й смуга пошуку: заголовок 24/32, вступ 17/25, групи 18/26, варіанти 16/24 і 15/22. Заголовки, на які скрипт переводить фокус, більше не мають рамки фокусу. Колонки футера стискаються пропорційно, тож на 1280 px сторінка не прокручується вбік.

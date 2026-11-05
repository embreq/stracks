// ==UserScript==
// @name         stracks-mobile.user.js
// @version      0.0.8
// @description  Scannt alle Abfahrten einer Station, liest pro Zug die Wagenreihung aus und erstellt daraus einen mobilfreundlichen HTML-Report mit Suche und Filter.
// @author       embreq
// @match        https://bahn.expert/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const fabStyle = document.createElement('style');
    fabStyle.textContent = `
        .evn-fab {
            position: fixed; top: 15px; z-index: 99999; width: 58px; height: 58px;
            border: none; border-radius: 16px; padding: 0; margin: 0; color: #fff; cursor: pointer;
            display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 4px;
            font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
            font-weight: 700; font-size: 11px; letter-spacing: 0.8px; line-height: 1; text-align: center;
            text-shadow: 0 1px 2px rgba(0,0,0,0.45); overflow: hidden;
            box-shadow: 0 6px 18px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.28);
            transition: transform .15s ease, box-shadow .15s ease, filter .15s ease;
        }
        .evn-fab:hover:not(:disabled) { transform: translateY(-2px); filter: brightness(1.1);
            box-shadow: 0 10px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.28); }
        .evn-fab:active:not(:disabled) { transform: scale(0.94); }
        .evn-fab:disabled { cursor: default; }
        .evn-fab svg { display: block; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.35)); }
        .evn-fab .evn-num { font-size: 18px; letter-spacing: 0; }
        .evn-fab .evn-sub { font-size: 10px; font-weight: 600; opacity: 0.85; letter-spacing: 0.3px; }
        #evn-scan-btn { right: 75px; background: linear-gradient(160deg, #2b8cf2, #1565c0); }
        #evn-cfg-btn { right: 141px; background: linear-gradient(160deg, #6d8391, #3a4a54); }
        #evn-cfg-btn .evn-gear { transition: transform .45s ease; }
        #evn-cfg-btn:hover:not(:disabled) .evn-gear { transform: rotate(90deg); }
        #evn-stop-btn { right: 141px; background: linear-gradient(160deg, #ef5350, #c62828);
            animation: evn-pop .2s ease-out; }
        @keyframes evn-pop { from { opacity: 0; transform: scale(0.7); } to { opacity: 1; transform: scale(1); } }
    `;
    document.head.appendChild(fabStyle);

    const ICON_SEARCH = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><circle cx="10" cy="10" r="6.2"/><line x1="14.8" y1="14.8" x2="20" y2="20"/></svg>`;
    const ICON_STOP = `<svg width="22" height="22" viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="3.5" fill="#fff"/></svg>`;

    const btn = document.createElement('button');
    btn.id = 'evn-scan-btn';
    btn.className = 'evn-fab';
    btn.title = 'Abfahrten scannen und Report erstellen';
    document.body.appendChild(btn);

    function setScanIdle() {
        btn.style.background = '';
        btn.innerHTML = `${ICON_SEARCH}<span>SCAN</span>`;
    }
    function setScanProgress(done, total) {
        const pct = Math.round((done / total) * 100);
        btn.style.background = `linear-gradient(to top, #5bb0ff ${pct}%, #1565c0 ${pct}%)`;
        btn.innerHTML = `<span class="evn-num">${done}</span><span class="evn-sub">von ${total}</span>`;
    }
    setScanIdle();

    let stopRequested = false;
    const stopBtn = document.createElement('button');
    stopBtn.id = 'evn-stop-btn';
    stopBtn.className = 'evn-fab';
    stopBtn.title = 'Scan abbrechen und Report mit bisherigen Zügen erstellen';
    stopBtn.style.display = 'none';
    const setStopIdle = () => { stopBtn.innerHTML = `${ICON_STOP}<span>STOP</span>`; };
    setStopIdle();
    stopBtn.onclick = () => {
        stopRequested = true;
        stopBtn.disabled = true;
        stopBtn.style.filter = 'saturate(0.6) brightness(0.9)';
        stopBtn.innerHTML = `<span class="evn-num">…</span><span class="evn-sub">stoppt</span>`;
        const st = document.getElementById('evn-ov-status');
        if (st) st.textContent = 'Wird beendet';
        const hint = document.getElementById('evn-ov-hint');
        if (hint) hint.style.visibility = 'hidden';
    };
    document.body.appendChild(stopBtn);

    const BAHNEXPERT_SETTINGS = {
        fahrzeugGruppe: 'true',
        lineAndNumber: 'true',
        showEVN: 'true',
        showTransportCategory: 'true',
        onlyRegional: 'false'
    };
    const ICON_GEAR = `<svg class="evn-gear" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

    const cfgBtn = document.createElement('button');
    cfgBtn.id = 'evn-cfg-btn';
    cfgBtn.className = 'evn-fab';
    cfgBtn.title = 'bahn.expert-Einstellungen setzen (EVN, Fahrzeuggruppe, Linie/Nummer, Verkehrsart) und Seite neu laden';
    cfgBtn.innerHTML = `${ICON_GEAR}<span>SETUP</span>`;
    cfgBtn.onclick = () => {
        for (const [name, value] of Object.entries(BAHNEXPERT_SETTINGS)) {
            document.cookie = `${name}=${value}; path=/; max-age=31536000; SameSite=Lax`;
        }
        const toast = document.createElement('div');
        toast.innerHTML = "<b>EINSTELLUNGEN GESETZT ✔</b><br><span style='font-size:12px;'>Seite wird neu geladen …</span>";
        toast.style = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background:#0b3b20; color: white; padding: 12px 25px;
            border-radius: 4px; font-family: sans-serif; font-size: 16px;
            z-index: 100000; box-shadow: 0 4px 15px rgba(0,0,0,0.4);
            text-align: center; border: 1px solid white;
        `;
        document.body.appendChild(toast);
        cfgBtn.disabled = true;
        setTimeout(() => location.reload(), 900);
    };
    document.body.appendChild(cfgBtn);

    function findCards() {
        const links = Array.from(document.querySelectorAll('a[href^="/details/"]'));
        const cards = [];
        const seen = new Set();

        links.forEach(link => {
            let el = link;
            let card = null;
            while (el && el.parentElement) {
                el = el.parentElement;
                if (el.querySelector('.css-b2nyxf') && el.querySelector('.css-1u8qly9')) {
                    card = el;
                    break;
                }
            }
            if (card && !seen.has(card)) {
                seen.add(card);
                cards.push({ clickTarget: card, scanContainer: card.parentElement || card });
            }
        });
        return cards;
    }

    function waitForWaggons(container, timeoutMs) {
        return new Promise(resolve => {
            const start = Date.now();
            const check = () => {
                if (container.querySelector('.css-760knn span') || Date.now() - start > timeoutMs) {
                    resolve();
                } else {
                    setTimeout(check, 150);
                }
            };
            check();
        });
    }

    btn.onclick = async () => {
        let stationName = document.title.split('|')[0].split('–')[0].trim();

        const containers = findCards();
        if (containers.length === 0) return alert("Keine Abfahrten gefunden!");

        btn.disabled = true;
        stopRequested = false;
        stopBtn.disabled = false;
        stopBtn.style.filter = '';
        setStopIdle();
        stopBtn.style.display = 'flex';
        cfgBtn.style.display = 'none';

        const overlay = document.createElement('div');
        overlay.style = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: radial-gradient(ellipse at 50% 0%, rgba(20,38,56,0.97) 0%, rgba(4,7,11,0.97) 70%);
            z-index: 99998; display: flex; flex-direction: column; justify-content: flex-start;
            padding-top: 9vh; align-items: center; gap: 10px; text-align: center;
            color: #a5b7c9; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
            pointer-events: none;
        `;
        overlay.innerHTML = `
            <style>
                @keyframes evn-dots { 0%, 80%, 100% { opacity: .2; } 40% { opacity: 1; } }
                @keyframes evn-nudge { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(9px); } }
                @keyframes evn-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
                #evn-ov-dots span { display: inline-block; animation: evn-dots 1.2s infinite; }
                #evn-ov-dots span:nth-child(2) { animation-delay: .2s; }
                #evn-ov-dots span:nth-child(3) { animation-delay: .4s; }
            </style>
            <div style="font-size:clamp(2.2rem,9vw,3.6rem);font-weight:900;letter-spacing:3px;line-height:1;color:#fff;">S<span style="color:#d9a400;">//</span>TRACKS</div>
            <div id="evn-ov-station" style="font-size:1rem;color:#7f93a6;letter-spacing:.5px;"></div>
            <div style="margin-top:22px;font-size:1.35rem;font-weight:600;color:#e6eef6;">
                <span id="evn-ov-status">Scan läuft</span><span id="evn-ov-dots"><span>.</span><span>.</span><span>.</span></span>
            </div>
            <div style="width:min(320px,76vw);height:10px;border-radius:6px;background:#1b2836;overflow:hidden;box-shadow:inset 0 1px 3px rgba(0,0,0,.6);">
                <div id="evn-ov-fill" style="height:100%;width:0%;border-radius:6px;background:linear-gradient(90deg,#1565c0,#5bb0ff,#1565c0);background-size:200% 100%;animation:evn-shimmer 2.2s linear infinite;transition:width .25s ease;"></div>
            </div>
            <div id="evn-ov-count" style="font-size:.95rem;color:#c3d0dc;">Starte …</div>
            <div id="evn-ov-time" style="font-size:.8rem;color:#6d8194;">Laufzeit 00:00</div>
            <div id="evn-ov-hint" style="margin-top:26px;font-size:.85rem;color:#6d8194;display:flex;align-items:center;gap:8px;">
                Zum Abbrechen: STOP oben rechts
                <svg style="animation:evn-nudge 1.2s ease-in-out infinite;" width="22" height="14" viewBox="0 0 22 14" fill="none" stroke="#6d8194" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 7h18M13 1l6 6-6 6"/></svg>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('#evn-ov-station').textContent = stationName;

        const updateOverlay = (done, total) => {
            const pct = Math.round((done / total) * 100);
            overlay.querySelector('#evn-ov-fill').style.width = pct + '%';
            overlay.querySelector('#evn-ov-count').textContent = `Zug ${done} von ${total} · ${pct} %`;
        };

        let reportData = [];
        let aborted = false;
        const startTime = new Date();
        const ovTimer = setInterval(() => {
            const sec = Math.floor((Date.now() - startTime.getTime()) / 1000);
            const el = overlay.querySelector('#evn-ov-time');
            if (el) el.textContent = `Laufzeit ${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
        }, 500);

        for (let i = 0; i < containers.length; i++) {
            if (stopRequested) { aborted = true; break; }
            const { clickTarget, scanContainer: container } = containers[i];
            setScanProgress(i + 1, containers.length);
            updateOverlay(i + 1, containers.length);

            try {
                const timeElements = container.querySelectorAll('.css-1u8qly9');
                let time = "--:--";
                if (timeElements.length > 0) {
                    const match = timeElements[0].innerText.match(/(\d{2}):(\d{2})/);
                    if (match) time = match[0];
                }

                const detailAnchor = container.querySelector('a[href^="/details/"]');
                let trainDisplay = detailAnchor?.innerText?.trim() || "?";
                let detailHref = detailAnchor?.href || "";

                const trainFullElement = container.querySelector('.css-1kw7u7o');
                let trainFull = trainFullElement?.innerText?.trim() || trainDisplay;

                const destElement = container.querySelector('.css-b2nyxf');
                let destination = destElement?.innerText?.trim() || "Ziel";

                clickTarget.scrollIntoView({ block: "center" });
                clickTarget.click();
                await waitForWaggons(container, 3000);

                let evns = [];
                const waggonElements = container.querySelectorAll('.css-760knn span');
                waggonElements.forEach(el => {
                    const text = el.innerText.trim();
                    if (/\d{4}\s\d{3}/.test(text)) evns.push(text);
                });
                evns = [...new Set(evns)];

                reportData.push({ time, train: trainFull, nr: trainDisplay, link: detailHref, dest: destination, evns });

                clickTarget.click();
                await new Promise(r => setTimeout(r, 200));

            } catch (e) {
                console.error("Error processing container", i, e);
            }
        }

        clearInterval(ovTimer);
        if (overlay) overlay.remove();

        stopBtn.style.display = 'none';
        cfgBtn.style.display = 'flex';
        btn.disabled = false;
        setScanIdle();

        const popup = document.createElement('div');
        popup.innerHTML = aborted
            ? `<b>SCAN ABGEBROCHEN ■</b><br><span style='font-size:12px;'>Report mit ${reportData.length} von ${containers.length} Zügen erstellt</span>`
            : "<b>SCAN FERTIG ✔</b><br><span style='font-size:12px;'>Report wurde erstellt</span>";
        popup.style = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background:${aborted ? '#7a4a00' : '#0b3b20'}; color: white; padding: 12px 25px;
            border-radius: 4px; font-family: sans-serif; font-size: 16px;
            z-index: 100000; box-shadow: 0 4px 15px rgba(0,0,0,0.4);
            text-align: center; border: 1px solid white;
        `;
        document.body.appendChild(popup);

        setTimeout(() => {
            popup.style.opacity = "0";
            popup.style.transition = "opacity 0.5s ease";
            setTimeout(() => popup.remove(), 500);
        }, 4000);

        exportHTML(stationName, startTime, reportData, Date.now() - startTime.getTime(),
            aborted ? { scanned: reportData.length, total: containers.length } : null);
    };

    function groupEvns(evns) {
        const last3 = evns.map(e => parseInt(e.replace(/\s/g, '').slice(-3), 10));
        const groups = [];
        let i = 0;
        while (i < evns.length) {
            let j = -1;
            for (let k = i + 1; k < evns.length; k++) {
                if (Math.abs(last3[k] - last3[i]) === 500) { j = k; break; }
            }
            if (j === -1) {
                groups.push(evns.slice(i));
                break;
            }
            while (j + 1 < evns.length && last3[j + 1] === last3[j]) j++;
            groups.push(evns.slice(i, j + 1));
            i = j + 1;
        }
        return groups;
    }

    function exportHTML(station, dateObj, data, durationMs, abortInfo) {
        const totalSec = Math.round((durationMs || 0) / 1000);
        const durMin = Math.floor(totalSec / 60);
        const durSec = totalSec % 60;
        const durText = durMin > 0 ? `${durMin} min ${durSec} s` : `${durSec} s`;
        const noWaggons = data.filter(d => !d.evns || d.evns.length === 0).length;

        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const year = dateObj.getFullYear();
        const hours = String(dateObj.getHours()).padStart(2, '0');
        const mins = String(dateObj.getMinutes()).padStart(2, '0');
        const timeStamp = `${day}-${month}-${year}_${hours}-${mins}`;

        let html = `<html lang="de"><head><meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>S//Tracks.Mobile - ${station} ${dateObj.toLocaleString('de-DE')}</title>
        <style>
            * { box-sizing: border-box; }
            body { font-family: sans-serif; padding: 20px; margin: 0; }
            #topbar { position: sticky; top: 0; z-index: 999; margin: -20px -20px 16px -20px; box-shadow: 0 2px 8px rgba(0,0,0,0.4); }
            .header { background: #111; color: #fff; padding: 12px 16px 10px; }
            .header h1 { font-size: 2.2rem; margin: 0; font-weight: 900; letter-spacing: 2px; line-height: 1.1; }
            .header h1 .sl { color: #d9a400; }
            .header .meta { display: flex; flex-wrap: wrap; gap: 2px 22px; font-size: 0.9rem; margin-top: 6px; color: #cfd6dd; }
            .header .meta b { color: #fff; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ccc; padding: 10px; vertical-align: middle; }
            th { background: #f2f2f2; color: #003366; text-transform: uppercase; }
            .evn { display: inline-block; background: #eeeeee; padding: 4px 8px; border-radius: 4px; font-family: monospace; font-weight: bold; border: 1px solid #ccc; margin: 2px 3px 2px 0; }
            .unit { padding: 4px 8px; margin: 0 0 6px 0; border-left: 5px solid #2b70b5; background: #f4f8fc; border-radius: 3px; }
            .unit:nth-child(even) { border-left-color: #624887; background: #f7f4fb; }
            .unit:last-child { margin-bottom: 0; }
            .clip-box { display: inline-block; background: #624887; border: 2px solid #ccc; border-radius: 6px; padding: 4px 10px; text-decoration: none; font-size: 1.5rem; }
            #filterbar { background: #0d2d4d; padding: 10px 16px;
                display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
            .sbox { display: flex; gap: 6px; align-items: center; }
            #filterbar input { padding: 9px 12px; border-radius: 10px; border: 1px solid #3d5570;
                font-size: 16px; width: 220px; height: 40px; background: #1c3149; color: white; outline: none; }
            #filterbar input:focus { border-color: #5bb0ff; }
            .fb { height: 40px; padding: 0 14px; border: none; border-radius: 10px; color: #fff; cursor: pointer;
                display: inline-flex; align-items: center; justify-content: center; gap: 7px;
                font-family: inherit; font-size: 13px; font-weight: 700; letter-spacing: 0.3px; white-space: nowrap;
                text-shadow: 0 1px 2px rgba(0,0,0,0.4);
                box-shadow: 0 3px 8px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.25);
                transition: transform .12s ease, filter .12s ease; }
            .fb:hover { filter: brightness(1.12); }
            .fb:active { transform: scale(0.94); }
            .fb svg { display: block; flex: none; }
            #btnSearch { width: 44px; padding: 0; background: linear-gradient(160deg, #2b8cf2, #1565c0); }
            #btnToggle { background: linear-gradient(160deg, #6d8391, #3a4a54); }
            #btnToggle.on { background: linear-gradient(160deg, #2b8cf2, #1565c0); }
            #btnReset { background: linear-gradient(160deg, #ef5350, #c62828); }
            #chipArea { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; flex: 1; min-width: 150px; }
            .chip { background: #2b70b5; color: white; padding: 6px 12px; border-radius: 20px;
                font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
            #counter { font-size: 13px; color: #9eb5af; background: #111;
                padding: 4px 10px; border-radius: 4px; white-space: nowrap; }

            @media (max-width: 700px) {
                body { padding: 10px; }
                #topbar { margin: -10px -10px 12px -10px; }
                #filterbar { padding: 8px 10px; }
                .sbox { flex: 1 1 100%; }
                #filterbar input { flex: 1; width: 100%; min-width: 0; }
                .fb.lbl { flex: 1 1 auto; }
                #chipArea { flex: 1 1 100%; }
                .header { padding: 8px 10px 6px; }
                .header h1 { font-size: 1.6rem; letter-spacing: 1px; }
                .header .meta { font-size: 0.75rem; gap: 1px 14px; margin-top: 3px; }
                table, tbody, tr, td { display: block; width: 100%; }
                thead { display: none; }
                tr { border: 1px solid #ccc; border-radius: 8px; margin-bottom: 10px; padding: 8px 10px; background: #fff; }
                td { border: none; padding: 4px 0; text-align: left !important; }
                td::before { content: attr(data-label); display: block; font-size: 11px; color: #667; text-transform: uppercase; }
                td.t-time b { font-size: 1.3rem; }
                .clip-box { padding: 8px 16px; }
            }
        </style></head><body>

        <div id="topbar">
        <div class="header"><h1>S<span class="sl">//</span>TRACKS</h1>
            <div class="meta">
                <span><b>Station:</b> ${station}</span>
                <span><b>Datum:</b> ${dateObj.toLocaleString('de-DE')}</span>
                <span><b>Scan-Dauer:</b> ${durText}</span>
                <span><b>Z&uuml;ge:</b> ${data.length} gesamt &middot; ${noWaggons} ohne Wagenreihung${abortInfo ? ` &middot; <b style="color:#ff8a80;">abgebrochen</b> (${abortInfo.scanned} von ${abortInfo.total})` : ''}</span>
            </div></div>
        <div id="filterbar">
            <div id="chipArea"><span style="color:#7a8fa0;font-size:13px;">Keine aktiven Filter</span></div>
            <div class="sbox">
                <input id="searchInput" placeholder="Volltextsuche … dann Enter" enterkeyhint="search" />
                <button class="fb" id="btnSearch" onclick="addSearch()" title="Suchbegriff hinzuf&uuml;gen" aria-label="Suchen"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><circle cx="10" cy="10" r="6.2"/><line x1="14.8" y1="14.8" x2="20" y2="20"/></svg></button>
            </div>
            <button class="fb lbl" id="btnToggle" onclick="toggleHide()" title="Nur Zeilen mit Treffer zeigen"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3"/></svg>Nur Treffer</button>
            <button class="fb lbl" id="btnReset" onclick="resetAll()" title="Alle Filter zur&uuml;cksetzen"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 9 8 9"/></svg>Reset</button>
            <span id="counter"></span>
        </div>

        </div>

        <table><thead><tr><th>Zeit</th><th>Zug / Nr</th><th>Ziel</th><th>Wagenreihung</th><th style="width:40px;">LINKS</th></tr></thead><tbody>`;

        data.forEach(item => {
            const evnsHtml = groupEvns(item.evns).map(g =>
                `<div class="unit">${g.map(e => `<span class="evn">${e}</span>`).join(" ")}</div>`
            ).join("");
            const clipHtml = item.link
                ? `<a href="${item.link}" target="_blank" class="clip-box">&#x1F517;</a>`
                : `<span style="color:#aaa;">–</span>`;
            html += `<tr>
                <td class="t-time" data-label="Zeit"><b>${item.time}</b></td>
                <td data-label="Zug / Nr"><b>${item.nr}</b><br><small>${item.train}</small></td>
                <td data-label="Ziel"><b>${item.dest}</b></td>
                <td data-label="Wagenreihung">${evnsHtml}</td>
                <td data-label="Link" style="text-align:center;">${clipHtml}</td>
            </tr>`;
        });
        html += `</tbody></table>
        <script>
            var searches = [];
            var hideNoMatch = false;

            document.getElementById('searchInput').addEventListener('keydown', function(e) {
                if (e.key === 'Enter') addSearch();
            });

            function addSearch() {
                var val = document.getElementById('searchInput').value.trim().toLowerCase();
                if (!val || searches.includes(val)) { document.getElementById('searchInput').value = ''; return; }
                searches.push(val);
                document.getElementById('searchInput').value = '';
                renderChips();
                applyFilter();
            }

            function removeSearch(val) {
                searches = searches.filter(function(s) { return s !== val; });
                renderChips();
                applyFilter();
            }

            function resetAll() {
                searches = [];
                hideNoMatch = false;
                document.getElementById('btnToggle').classList.remove('on');
                renderChips();
                applyFilter();
            }

            function toggleHide() {
                hideNoMatch = !hideNoMatch;
                document.getElementById('btnToggle').classList.toggle('on', hideNoMatch);
                applyFilter();
            }

            function renderChips() {
                var area = document.getElementById('chipArea');
                area.innerHTML = '';
                if (searches.length === 0) {
                    area.innerHTML = '<span style="color:#7a8fa0;font-size:13px;">Keine aktiven Filter</span>';
                    return;
                }
                searches.forEach(function(s) {
                    var chip = document.createElement('span');
                    chip.className = 'chip';
                    chip.innerHTML = s + ' <b style="font-size:16px;line-height:1;">&#x00D7;</b>';
                    chip.title = 'Klicken zum Entfernen';
                    chip.onclick = function() { removeSearch(s); };
                    area.appendChild(chip);
                });
            }

            function applyFilter() {
                var rows = document.querySelectorAll('table tbody tr');
                var total = rows.length;
                var visible = 0;
                rows.forEach(function(row) {
                    if (searches.length === 0) {
                        row.style.display = hideNoMatch ? 'none' : '';
                        row.style.background = '';
                        if (!hideNoMatch) visible++;
                    } else {
                        var text = row.innerText.toLowerCase();
                        var matched = searches.filter(function(s) { return text.includes(s); });
                        if (matched.length > 0) {
                            row.style.display = '';
                            row.style.background = '#b6dbbc';
                            visible++;
                        } else {
                            row.style.display = hideNoMatch ? 'none' : '';
                            row.style.background = '';
                        }
                    }
                });
                document.getElementById('counter').textContent = visible + ' / ' + total + ' Z\u00FCge';
            }

            applyFilter();
        <\/script>
        </body></html>`;

        const blob = new Blob(['\uFEFF' + html], { type: 'text/html;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `stracks_${timeStamp}-${station.replace(/[^a-z0-9]/gi, '_')}.html`;
        a.click();
    }
})();
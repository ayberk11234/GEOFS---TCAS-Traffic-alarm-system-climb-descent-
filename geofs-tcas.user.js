// ==UserScript==
// @name         GeoFS TCAS II v7.1 System (Boeing 737/777 Spec)
// @namespace    http://tampermonkey.net/
// @version      4.5
// @description  GeoFS _apiLla & multiplayer.users Tam Entegrasyonlu Kusursuz TCAS II (Özel GitHub MP3 Sesli)
// @author       GeoFS Aviator
// @match        https://*.geo-fs.com/geofs.php*
// @match        https://geo-fs.com/geofs.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=geo-fs.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // SENİN GITHUB'A YÜKLEDİĞİN SES DOSYASI:
    const TCAS_AUDIO_URL = "https://raw.githubusercontent.com/ayberk11234/geofs-sounds/main/tcas-traffic-warning.mp3";

    // ==========================================
    // 1. KOKPİT SES VE ANONS MOTORU
    // ==========================================
    class CockpitAudioEngine {
        constructor() {
            this.synth = window.speechSynthesis;
            this.audioCtx = null;
            this.lastSpokenText = "";
            this.lastSpeakTime = 0;

            // GitHub MP3 ses nesnesi:
            this.trafficWarningAudio = new Audio(TCAS_AUDIO_URL);
            this.trafficWarningAudio.volume = 1.0;

            setInterval(() => {
                if (this.synth && this.synth.paused) {
                    this.synth.resume();
                }
            }, 1000);
        }

        initContext() {
            if (!this.audioCtx) {
                const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
                if (AudioCtxClass) {
                    this.audioCtx = new AudioCtxClass();
                }
            }
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }
        }

        // GitHub'daki MP3'ü çalan fonksiyon:
        playTrafficMp3() {
            try {
                this.initContext();
                this.trafficWarningAudio.currentTime = 0;
                this.trafficWarningAudio.play().catch(err => {
                    console.warn('[TCAS Audio] Ses çalınamadı:', err);
                });
            } catch (e) {}
        }

        playBeep(frequency, duration, type = "sine") {
            try {
                this.initContext();
                if (!this.audioCtx) return;

                const osc = this.audioCtx.createOscillator();
                const gain = this.audioCtx.createGain();

                osc.type = "sawtooth";
                osc.frequency.setValueAtTime(frequency, this.audioCtx.currentTime);
                gain.gain.setValueAtTime(0.8, this.audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);

                osc.connect(gain);
                gain.connect(this.audioCtx.destination);

                osc.start();
                osc.stop(this.audioCtx.currentTime + duration);
            } catch (e) {}
        }

        speak(text, priority = false) {
            const now = Date.now();
            if (!priority && this.lastSpokenText === text && (now - this.lastSpeakTime) < 3500) {
                return;
            }

            if (!this.synth) return;

            if (priority) {
                this.synth.cancel();
            }

            const utterance = new SpeechSynthesisUtterance(text);
            const voices = this.synth.getVoices();

            const boeingVoice = voices.find(v => (v.name.includes("David") || v.name.includes("Male") || v.name.includes("Natural") || v.name.includes("Mark")) && v.lang.startsWith("en")) ||
                                voices.find(v => v.lang.startsWith("en")) || null;

            if (boeingVoice) utterance.voice = boeingVoice;
            utterance.rate = 1.05;
            utterance.pitch = 0.82;
            utterance.volume = 1.0;

            this.lastSpokenText = text;
            this.lastSpeakTime = now;

            this.synth.speak(utterance);
        }
    }

    // ==========================================
    // 2. BOEING MINI TCAS RADAR GÖSTERGESİ (UI)
    // ==========================================
    function createTcasDisplay() {
        const hud = document.createElement("div");
        hud.id = "geofs-tcas-hud";
        hud.style.cssText = `
            position: fixed;
            bottom: 270px;
            right: 25px;
            width: 230px;
            background: rgba(10, 15, 20, 0.92);
            border: 2px solid #2a3b4c;
            border-radius: 8px;
            color: #d1d8e0;
            font-family: 'Consolas', 'Courier New', monospace;
            padding: 12px 14px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.7);
            z-index: 10000;
            user-select: none;
            backdrop-filter: blur(4px);
        `;

        hud.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #334e68; padding-bottom:5px; margin-bottom:8px;">
                <span style="font-weight:bold; font-size:13px; color:#9fb3c8; letter-spacing:1px;">TCAS II v7.1</span>
                <span id="tcas-mode-badge" style="font-weight:bold; font-size:11px; padding:2px 6px; border-radius:3px; background:#486581; color:#fff;">STBY</span>
            </div>
            <div style="font-size:11px; line-height: 1.6;">
                <div>TRAFFIC: <span id="tcas-callsign" style="color:#f0f4f8; font-weight:bold;">NONE</span></div>
                <div>DIST: <span id="tcas-dist" style="color:#f0f4f8; font-weight:bold;">--.- NM</span></div>
                <div>ALT DIFF: <span id="tcas-alt" style="color:#f0f4f8; font-weight:bold;">---- FT</span></div>
            </div>
            <div id="tcas-action-box" style="margin-top:8px; padding:6px; text-align:center; font-weight:bold; font-size:13px; border-radius:4px; display:none;">
                NO CONFLICT
            </div>
        `;

        document.body.appendChild(hud);
        return {
            modeBadge: document.getElementById("tcas-mode-badge"),
            callsign: document.getElementById("tcas-callsign"),
            dist: document.getElementById("tcas-dist"),
            alt: document.getElementById("tcas-alt"),
            actionBox: document.getElementById("tcas-action-box")
        };
    }

    // ==========================================
    // 3. HAVACILIK VE MATEMATİK FONKSİYONLARI
    // ==========================================
    const M_TO_FEET = 3.28084;
    const DEG_TO_RAD = Math.PI / 180;

    function calculateHorizontalDistanceNM(lat1, lon1, lat2, lon2) {
        const R = 3440.065;
        const dLat = (lat2 - lat1) * DEG_TO_RAD;
        const dLon = (lon2 - lon1) * DEG_TO_RAD;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // ==========================================
    // 4. TCAS ANA MANTIK VE MOTOR ÇEKİRDEĞİ
    // ==========================================
    class TCASController {
        constructor() {
            this.audio = new CockpitAudioEngine();
            this.ui = createTcasDisplay();
            this.previousDistances = new Map();
            this.currentAlertLevel = "NONE";
        }

        getOwnShip() {
            if (!window.geofs || !geofs.aircraft || !geofs.aircraft.instance) return null;
            const inst = geofs.aircraft.instance;
            const lla = inst.llaLocation;
            if (!lla) return null;

            const animValues = geofs.animation ? geofs.animation.values : {};
            const groundContact = animValues.groundContact === 1 || animValues.groundContact === true;

            let agl = animValues.altitudeAboveGround;
            if (agl === undefined || agl === null) {
                agl = (animValues.haglFeet !== undefined) ? animValues.haglFeet : (lla[2] * M_TO_FEET);
            }

            let ownAltFeet = (animValues.altitudeMeters !== undefined) ? (animValues.altitudeMeters * M_TO_FEET) : (lla[2] * M_TO_FEET);

            return {
                lat: lla[0],
                lon: lla[1],
                altFeet: ownAltFeet,
                aglFeet: agl,
                groundContact: groundContact
            };
        }

        scanTraffic(ownShip) {
            const targets = [];
            if (!window.multiplayer) return targets;

            const rawUsers = window.multiplayer.users || window.multiplayer.visibleUsers || {};
            const now = Date.now();

            for (const id in rawUsers) {
                const ac = rawUsers[id];
                if (!ac || ac === geofs.aircraft.instance) continue;

                let lat = null, lon = null, altMeters = null;

                if (ac._apiLla && Array.isArray(ac._apiLla)) {
                    lat = ac._apiLla[0];
                    lon = ac._apiLla[1];
                    altMeters = ac._apiLla[2];
                } else if (ac.referencePoint && ac.referencePoint.lla) {
                    lat = ac.referencePoint.lla[0];
                    lon = ac.referencePoint.lla[1];
                    altMeters = ac.referencePoint.lla[2];
                } else if (ac.llaLocation && Array.isArray(ac.llaLocation)) {
                    lat = ac.llaLocation[0];
                    lon = ac.llaLocation[1];
                    altMeters = ac.llaLocation[2];
                }

                if (lat === null || lon === null || isNaN(lat) || isNaN(lon)) {
                    continue;
                }

                altMeters = altMeters || 0;
                const altFeet = altMeters * M_TO_FEET;

                const distNM = calculateHorizontalDistanceNM(ownShip.lat, ownShip.lon, lat, lon);

                if (isNaN(distNM) || distNM > 25.0) continue;
                if (distNM < 0.05 && Math.abs(altFeet - ownShip.altFeet) < 80) continue;

                const altDiffFeet = altFeet - ownShip.altFeet;

                let closingRate = 0;
                if (this.previousDistances.has(id)) {
                    const prev = this.previousDistances.get(id);
                    const dt = (now - prev.time) / 1000;
                    if (dt > 0.4) {
                        closingRate = (prev.dist - distNM) / dt;
                    }
                }
                this.previousDistances.set(id, { dist: distNM, time: now });

                const callsign = ac.callsign || (ac.user && ac.user.callsign) || ac.name || `TFC-${String(id).substring(0,4)}`;

                targets.push({
                    id: id,
                    callsign: callsign,
                    distNM: distNM,
                    altDiffFeet: altDiffFeet,
                    altFeet: altFeet,
                    closingRate: closingRate
                });
            }

            if (this.previousDistances.size > 200) {
                this.previousDistances.clear();
            }

            targets.sort((a, b) => a.distNM - b.distNM);
            return targets;
        }

        update() {
            const ownShip = this.getOwnShip();
            if (!ownShip) return;

            if (ownShip.groundContact || ownShip.aglFeet < 150) {
                this.setStandbyMode();
                return;
            }

            const trafficList = this.scanTraffic(ownShip);
            const nearest = trafficList[0];

            if (!nearest) {
                this.setArmedMode(null);
                return;
            }

            const absAltDiff = Math.abs(nearest.altDiffFeet);
            const isClosing = nearest.closingRate > -0.01;

            // B. RESOLUTION ADVISORY (RA)
            const isRA = (nearest.distNM < 2.5 && absAltDiff < 850 && isClosing) || (nearest.distNM < 1.2 && absAltDiff < 900);

            // A. TRAFFIC ADVISORY (TA)
            const isTA = (nearest.distNM < 6.5 && absAltDiff < 1500 && isClosing);

            if (isRA) {
                this.handleResolutionAdvisory(ownShip, nearest);
            } else if (isTA) {
                this.handleTrafficAdvisory(nearest);
            } else {
                if (this.currentAlertLevel === "RA" || this.currentAlertLevel === "TA") {
                    this.handleClearOfConflict();
                }
                this.setArmedMode(nearest);
            }
        }

        setStandbyMode() {
            this.currentAlertLevel = "NONE";
            this.ui.modeBadge.innerText = "STBY";
            this.ui.modeBadge.style.background = "#52606d";
            this.ui.callsign.innerText = "INHIBITED (GND)";
            this.ui.dist.innerText = "--.- NM";
            this.ui.alt.innerText = "---- FT";
            this.ui.actionBox.style.display = "none";
        }

        setArmedMode(nearest) {
            this.currentAlertLevel = "NONE";
            this.ui.modeBadge.innerText = "ARMED";
            this.ui.modeBadge.style.background = "#2b6cb0";

            if (nearest) {
                this.ui.callsign.innerText = nearest.callsign;
                this.ui.dist.innerText = `${nearest.distNM.toFixed(1)} NM`;
                const sign = nearest.altDiffFeet >= 0 ? "+" : "";
                this.ui.alt.innerText = `${sign}${Math.round(nearest.altDiffFeet)} FT`;
            } else {
                this.ui.callsign.innerText = "CLEAR";
                this.ui.dist.innerText = "--.- NM";
                this.ui.alt.innerText = "---- FT";
            }

            this.ui.actionBox.style.display = "none";
        }

        handleTrafficAdvisory(target) {
            const isFirstTrigger = this.currentAlertLevel !== "TA";
            this.currentAlertLevel = "TA";
            this.ui.modeBadge.innerText = "TA";
            this.ui.modeBadge.style.background = "#d69e2e";

            this.ui.callsign.innerText = target.callsign;
            this.ui.dist.innerText = `${target.distNM.toFixed(1)} NM`;
            const sign = target.altDiffFeet >= 0 ? "+" : "";
            this.ui.alt.innerText = `${sign}${Math.round(target.altDiffFeet)} FT`;

            this.ui.actionBox.style.display = "block";
            this.ui.actionBox.style.background = "rgba(214, 158, 46, 0.25)";
            this.ui.actionBox.style.border = "1px solid #d69e2e";
            this.ui.actionBox.style.color = "#f6e05e";
            this.ui.actionBox.innerText = "TRAFFIC, TRAFFIC";

            // YÜKLEDİĞİN MP3 SESİNİ BURADA ÇALIYORUZ:
            if (isFirstTrigger) {
                this.audio.playTrafficMp3();
            }
        }

        handleResolutionAdvisory(ownShip, target) {
            this.currentAlertLevel = "RA";
            this.ui.modeBadge.innerText = "RA";
            this.ui.modeBadge.style.background = "#e53e3e";

            this.ui.callsign.innerText = target.callsign;
            this.ui.dist.innerText = `${target.distNM.toFixed(1)} NM`;
            const sign = target.altDiffFeet >= 0 ? "+" : "";
            this.ui.alt.innerText = `${sign}${Math.round(target.altDiffFeet)} FT`;

            this.ui.actionBox.style.display = "block";
            this.ui.actionBox.style.background = "rgba(229, 62, 62, 0.3)";
            this.ui.actionBox.style.border = "1px solid #e53e3e";
            this.ui.actionBox.style.color = "#fc8181";

            let escapeCommand = "";

            if (ownShip.aglFeet < 1000) {
                escapeCommand = "CLIMB, CLIMB NOW!";
            } else {
                if (target.altDiffFeet <= 0) {
                    escapeCommand = "CLIMB, CLIMB NOW!";
                } else {
                    escapeCommand = "DESCEND, DESCEND NOW!";
                }
            }

            this.ui.actionBox.innerText = escapeCommand;
            this.audio.playBeep(1200, 0.25, "sawtooth");
            this.audio.speak(escapeCommand, true);
        }

        handleClearOfConflict() {
            this.currentAlertLevel = "NONE";
            this.ui.actionBox.style.display = "block";
            this.ui.actionBox.style.background = "rgba(56, 161, 105, 0.25)";
            this.ui.actionBox.style.border = "1px solid #38a169";
            this.ui.actionBox.style.color = "#68d391";
            this.ui.actionBox.innerText = "CLEAR OF CONFLICT";

            this.audio.speak("Clear of conflict.");

            setTimeout(() => {
                if (this.currentAlertLevel === "NONE") {
                    this.ui.actionBox.style.display = "none";
                }
            }, 3500);
        }
    }

    // ==========================================
    // 5. BAŞLATICI (LOADER)
    // ==========================================
    function initWhenReady() {
        if (window.geofs && geofs.aircraft && geofs.aircraft.instance && geofs.aircraft.instance.llaLocation && window.multiplayer) {
            console.log("[TCAS II v4.5] Boeing TCAS MP3 Entegrasyonu Aktif!");
            const tcas = new TCASController();

            setInterval(() => {
                try {
                    tcas.update();
                } catch (err) {
                    console.error("[TCAS Loop Error]", err);
                }
            }, 1000);
        } else {
            setTimeout(initWhenReady, 1000);
        }
    }

    window.addEventListener('click', function unlockAudio() {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
            const ctx = new AudioCtx();
            ctx.resume().then(() => ctx.close());
        }
        if (window.speechSynthesis) {
            window.speechSynthesis.resume();
        }
    });

    initWhenReady();
})();

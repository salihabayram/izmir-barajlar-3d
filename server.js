const express = require("express");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const IZSU_API_URL = "https://izsu.gov.tr/api/proxy/DamWaterStatus/WithInfoList";
const IZSU_SOURCE_URL = "https://izsu.gov.tr/bilgi-merkezi/barajlar/su-durumu";
const IZMIR_GOLLER_API_URL = "https://openapi.izmir.bel.tr/api/ibb/cbs/goller";
const CACHE_TTL_MS = Number(process.env.BARAJ_CACHE_TTL_MS) || 15 * 60 * 1000;
const HISTORY_CACHE_TTL_MS = 60 * 60 * 1000;
const LOCATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const BARAJ_ENDPOINTLERI = Object.freeze({
    tahtali: "tahtali",
    balcova: "balcova",
    urkmez: "urkmez",
    gordes: "gordes",
    alacati: "alacati"
});

const tarihCache = new Map();
const devamEdenIstekler = new Map();
let resmiSayfaCache = null;
let barajKonumCache = null;

app.use(express.static(__dirname));

// Uygulama kökünden açıldığında ve tarayıcı favicon istediğinde gereksiz
// 404 üretme. Statik dosya yolları aynı kalır.
app.get("/", (_req, res) => res.sendFile(`${__dirname}/anasayfa.html`));
app.get("/favicon.ico", (_req, res) => res.status(204).end());

function asciiAnahtar(value) {
    return String(value || "")
        .toLocaleLowerCase("tr-TR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\u0131/g, "i")
        .replace(/\u011f/g, "g")
        .replace(/\u015f/g, "s")
        .replace(/\u00fc/g, "u")
        .replace(/\u00f6/g, "o")
        .replace(/\u00e7/g, "c")
        .replace(/[^a-z0-9]/g, "");
}

function barajSlugunuBul(name) {
    const key = asciiAnahtar(name);
    if (key.includes("tahtali")) return "tahtali";
    if (key.includes("balcova")) return "balcova";
    if (key.includes("urkmez")) return "urkmez";
    if (key.includes("gordes")) return "gordes";
    if (key.includes("alacati") || key.includes("kutluaktas")) return "alacati";
    return null;
}

function turkceBaslik(value) {
    return String(value || "")
        .trim()
        .toLocaleLowerCase("tr-TR")
        .replace(/(^|[\s-])\p{L}/gu, (letter) => letter.toLocaleUpperCase("tr-TR"));
}

async function barajKonumlariniGetir() {
    if (barajKonumCache && Date.now() - barajKonumCache.zaman < LOCATION_CACHE_TTL_MS) {
        return barajKonumCache.veri;
    }

    try {
        const response = await fetch(IZMIR_GOLLER_API_URL, {
            headers: {
                Accept: "application/json",
                "User-Agent": "3DBaraj/2.0 (Izmir open data reader)"
            },
            signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) throw new Error(`İzmir Açık Veri API HTTP ${response.status} döndürdü.`);

        const payload = await response.json();
        const locations = {};
        for (const item of Array.isArray(payload?.onemliyer) ? payload.onemliyer : []) {
            const slug = barajSlugunuBul(item?.ADI);
            if (!slug || !BARAJ_ENDPOINTLERI[slug] || locations[slug]) continue;
            locations[slug] = {
                slug,
                name: String(item.ADI || "").trim(),
                district: turkceBaslik(item.ILCE),
                neighborhood: turkceBaslik(item.MAHALLE),
                latitude: Number(item.ENLEM),
                longitude: Number(item.BOYLAM),
                source: IZMIR_GOLLER_API_URL
            };
        }

        barajKonumCache = { zaman: Date.now(), veri: locations };
        return locations;
    } catch (error) {
        if (barajKonumCache) return barajKonumCache.veri;
        throw error;
    }
}

function isoTarih(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}T00:00:00` : value;
}

function izsuKaydiniDonustur(item) {
    const name = item?.damWellFacility?.name || "";
    return {
        BARAJ_KUYU_ADI: name,
        DURUM_TARIHI: isoTarih(item?.date),
        DOLULUK_ORANI: Number(item?.occupancyRate ?? 0),
        SU_YUKSEKLIGI: Number(item?.waterLevel ?? 0),
        SU_DURUMU: Number(item?.waterStatus ?? 0),
        TUKETILEBILIR_SU_KAPASITESI: Number(item?.usableWaterStatus ?? 0),
        MAKSIMUM_SU_KAPASITESI: Number(item?.maximumWaterCapacity ?? 0),
        KULLANILABILIR_SU_KAPASITESI: Number(item?.usableWaterCapacity ?? 0),
        slug: barajSlugunuBul(name),
        KAYNAK: IZSU_SOURCE_URL
    };
}

function tarihParametresiniDogrula(value) {
    if (!value) return null;
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) throw new Error("Tarih YYYY-MM-DD biçiminde olmalıdır.");
    const date = new Date(`${value}T12:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        throw new Error("Geçersiz tarih.");
    }
    return value;
}

function nextFlightPayloadunuAyikla(html, key, nextKey) {
    const decodedSegments = [];
    const pushPattern = /self\.__next_f\.push\(\[1,"((?:\\.|[^"\\])*)"\]\)/g;
    let match;
    while ((match = pushPattern.exec(String(html || "")))) {
        try {
            decodedSegments.push(JSON.parse(`"${match[1]}"`));
        } catch (_error) {
            // Başka bir Next.js flight parçası bozuksa kalan parçaları dene.
        }
    }

    const decodedFlight = decodedSegments.join("\n");
    const payloadPattern = new RegExp(`"${key}":(\\{.*?\\}),"${nextKey}"`, "s");
    const payloadMatch = decodedFlight.match(payloadPattern);
    if (!payloadMatch) return null;
    try {
        return JSON.parse(payloadMatch[1]);
    } catch (_error) {
        return null;
    }
}

function izsuSayfaVerisiniAyikla(html) {
    const today = nextFlightPayloadunuAyikla(html, "initialTodayData", "initialOneYearAgoData");
    const previous = nextFlightPayloadunuAyikla(html, "initialOneYearAgoData", "initialFacilityData");
    return {
        today: Array.isArray(today?.data) ? today.data : [],
        previous: Array.isArray(previous?.data) ? previous.data : []
    };
}

async function izsuResmiSayfaVerisiniGetir() {
    if (resmiSayfaCache && Date.now() - resmiSayfaCache.zaman < CACHE_TTL_MS) {
        return resmiSayfaCache.veri;
    }

    const response = await fetch(IZSU_SOURCE_URL, {
        headers: {
            Accept: "text/html,application/xhtml+xml",
            "User-Agent": "3DBaraj/2.0 (IZSU public data reader)"
        },
        signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`İZSU su durumu sayfası HTTP ${response.status} döndürdü.`);
    const veri = izsuSayfaVerisiniAyikla(await response.text());
    if (!veri.today.length && !veri.previous.length) {
        throw new Error("İZSU sayfasındaki tarihsel veri ayrıştırılamadı.");
    }
    resmiSayfaCache = { zaman: Date.now(), veri };
    return veri;
}

async function izsudanBarajlariGetir(tarih = null) {
    const tarihKey = tarihParametresiniDogrula(tarih) || "latest";
    const cached = tarihCache.get(tarihKey);
    if (cached && Date.now() - cached.zaman < CACHE_TTL_MS) return cached.veri;
    if (devamEdenIstekler.has(tarihKey)) return devamEdenIstekler.get(tarihKey);

    const promise = (async () => {
        // İZSU'nun WithInfoList endpoint'i `date` parametresini yok sayıp güncel
        // günü döndürüyor. Resmî su durumu sayfası ise aynı günün geçen yıl
        // kayıtlarını `initialOneYearAgoData` içinde gerçek tarihleriyle sunuyor.
        // Önce bu doğrulanmış tarihsel kaynağı kullan.
        if (tarih) {
            try {
                const pageData = await izsuResmiSayfaVerisiniGetir();
                const exactPageRecords = [...pageData.today, ...pageData.previous]
                    .filter((item) => String(item?.date || "").slice(0, 10) === tarih)
                    .map(izsuKaydiniDonustur)
                    .filter((item) => item.slug && BARAJ_ENDPOINTLERI[item.slug]);
                if (exactPageRecords.length) {
                    tarihCache.set(tarihKey, { zaman: Date.now(), veri: exactPageRecords });
                    return exactPageRecords;
                }
            } catch (_error) {
                // Sayfa snapshot'ı alınamazsa aşağıdaki API fallback'ini dene.
            }
        }

        const url = tarih ? `${IZSU_API_URL}?date=${encodeURIComponent(tarih)}` : IZSU_API_URL;
        const response = await fetch(url, {
            headers: {
                Accept: "application/json",
                "User-Agent": "3DBaraj/2.0 (IZSU public data reader)"
            },
            signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) throw new Error(`İZSU API HTTP ${response.status} döndürdü.`);

        const payload = await response.json();
        if (!payload?.ok || !Array.isArray(payload.data)) {
            throw new Error(payload?.errorMessage || "İZSU API geçerli veri döndürmedi.");
        }

        let veri = payload.data
            .map(izsuKaydiniDonustur)
            .filter((item) => item.slug && BARAJ_ENDPOINTLERI[item.slug]);

        if (tarih) {
            veri = veri.filter((item) => String(item.DURUM_TARIHI || "").slice(0, 10) === tarih);
        } else {
            const latestBySlug = new Map();
            for (const item of veri) {
                const existing = latestBySlug.get(item.slug);
                if (!existing || String(item.DURUM_TARIHI) > String(existing.DURUM_TARIHI)) {
                    latestBySlug.set(item.slug, item);
                }
            }
            veri = [...latestBySlug.values()];
        }
        // Tarih iki resmî kaynağın hiçbirinde yoksa kontrollü boş sonuç dön.
        if (!veri.length && tarih) {
            tarihCache.set(tarihKey, { zaman: Date.now(), veri: [] });
            return [];
        }
        if (!veri.length) throw new Error("Güncel baraj verisi bulunamadı.");
        tarihCache.set(tarihKey, { zaman: Date.now(), veri });
        return veri;
    })();

    devamEdenIstekler.set(tarihKey, promise);
    try {
        return await promise;
    } catch (error) {
        if (cached) return cached.veri;
        // Tarihsel kaynak erişilemiyorsa sayfaya 502 yansıtmak yerine boş sonuç
        // ver. Güncel endpoint gerçek hatayı bildirmeye devam eder.
        if (tarih) {
            tarihCache.set(tarihKey, { zaman: Date.now(), veri: [] });
            return [];
        }
        throw error;
    } finally {
        devamEdenIstekler.delete(tarihKey);
    }
}

async function barajEndpointi(req, res, slug) {
    try {
        const barajlar = await izsudanBarajlariGetir(req.query.date || null);
        const baraj = barajlar.find((item) => item.slug === slug);
        if (!baraj) return res.status(404).json({ hata: `${slug} bulunamadı.` });
        res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
        return res.json(baraj);
    } catch (error) {
        return res.status(502).json({ hata: error.message });
    }
}

function oncekiGunler(endDate, count) {
    const end = new Date(`${endDate}T12:00:00Z`);
    return Array.from({ length: count }, (_, index) => {
        const date = new Date(end);
        date.setUTCDate(end.getUTCDate() - (count - 1 - index));
        return date.toISOString().slice(0, 10);
    });
}

async function trendVerisiniGetir(slug, endDate) {
    const cacheKey = `trend:${slug}:${endDate}`;
    const cached = tarihCache.get(cacheKey);
    if (cached && Date.now() - cached.zaman < HISTORY_CACHE_TTL_MS) return cached.veri;

    const dates = oncekiGunler(endDate, 30);
    const points = [];
    const batchSize = 6;
    for (let start = 0; start < dates.length; start += batchSize) {
        const batch = dates.slice(start, start + batchSize);
        const results = await Promise.all(batch.map(async (date) => {
            try {
                const records = await izsudanBarajlariGetir(date);
                return records.find((item) => item.slug === slug) || null;
            } catch (_error) {
                return null;
            }
        }));
        results.forEach((item, index) => {
            if (!item) return;
            points.push({
                date: batch[index],
                occupancy: Number(item.DOLULUK_ORANI),
                volume: Number(item.SU_DURUMU)
            });
        });
    }

    if (!points.length) throw new Error("30 günlük trend verisi bulunamadı.");
    points.sort((a, b) => a.date.localeCompare(b.date));
    tarihCache.set(cacheKey, { zaman: Date.now(), veri: points });
    return points;
}

app.get("/api/barajlar", async (req, res) => {
    try {
        const barajlar = await izsudanBarajlariGetir(req.query.date || null);
        res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
        res.json(barajlar);
    } catch (error) {
        res.status(502).json({ hata: error.message });
    }
});

for (const slug of Object.keys(BARAJ_ENDPOINTLERI)) {
    app.get(`/api/${slug}`, (req, res) => barajEndpointi(req, res, slug));
}

async function trendEndpointi(req, res) {
    const slug = req.params.slug;
    if (!BARAJ_ENDPOINTLERI[slug]) return res.status(404).json({ hata: "Baraj bulunamadı." });
    try {
        const latestRecords = req.query.endDate
            ? null
            : await izsudanBarajlariGetir();
        const endDate = tarihParametresiniDogrula(req.query.endDate)
            || latestRecords[0].DURUM_TARIHI.slice(0, 10);
        const points = await trendVerisiniGetir(slug, endDate);
        res.set("Cache-Control", "public, max-age=900, stale-while-revalidate=3600");
        res.json({ slug, endDate, points });
    } catch (error) {
        if (/trend verisi bulunamadı/i.test(error.message)) {
            return res.json({
                slug,
                endDate: req.query.endDate || null,
                points: [],
                unavailable: true,
                message: error.message
            });
        }
        res.status(502).json({ hata: error.message });
    }
}

app.get("/api/health", (_req, res) => {
    res.json({ ok: true, apiVersion: 2, trend: true, historicalDates: true, locations: true });
});

app.get("/api/baraj-konumlari", async (_req, res) => {
    try {
        const locations = await barajKonumlariniGetir();
        res.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
        res.json(locations);
    } catch (error) {
        res.status(502).json({ hata: error.message });
    }
});

app.get("/api/trend/:slug", trendEndpointi);
app.get("/api/:slug/trend", trendEndpointi);

if (require.main === module) {
    app.listen(PORT, () => console.log(`Sunucu çalışıyor: http://localhost:${PORT}`));
}

module.exports = {
    app,
    izsudanBarajlariGetir,
    izsuKaydiniDonustur,
    izsuSayfaVerisiniAyikla,
    trendVerisiniGetir,
    barajKonumlariniGetir
};

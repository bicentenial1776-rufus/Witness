// Parse the OCR text of John Camden Hotten, *The Original Lists of
// Persons of Quality* (1874, public domain) — the London port registers
// of 1600s emigrants — into per-voyage passenger CSVs.
//
// The registers are certificate blocks: a date, a formula ("THEIS vnder
// written names are to be transported to New-England imbarqued in ye
// Planter…"), then ALL-CAPS name lines with a trailing age. Only lines
// that end in an age are taken as passengers — prose never does — so the
// book's narrative and parish-register sections fall away on their own.
// Ages become derived birth years ("c. 1608") since the matcher weighs
// years, not ages. Given-name abbreviations (JO:, THO:, WM…) expand from
// a table; OCR 'l'-for-'I' inside caps runs is repaired; a ship-name
// alias table absorbs the worst misreadings (Hopewcll, Rabecca).
//
//   npx tsx scripts/parse-hotten.ts <hotten.txt> <outDir>
//
// Emits <outDir>/<voyage-id>.csv, <outDir>/voyages.json (grouped by
// ship + year), and <outDir>/coverage.txt.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const SOURCE = 'John Camden Hotten, The Original Lists of Persons of Quality (1874)';
const GIVEN_ABBREV = {
    jo: 'John', tho: 'Thomas', wm: 'William', geo: 'George', rich: 'Richard',
    ric: 'Richard', sam: 'Samuel', nic: 'Nicholas', nica: 'Nicholas',
    rob: 'Robert', robt: 'Robert', edw: 'Edward', fra: 'Francis',
    franc: 'Francis', mich: 'Michael', dan: 'Daniel', nath: 'Nathaniel',
    benj: 'Benjamin', anth: 'Anthony', chr: 'Christopher', hen: 'Henry',
    eliz: 'Elizabeth', eliza: 'Elizabeth', marg: 'Margaret', margt: 'Margaret',
    kath: 'Katherine', math: 'Matthew', mat: 'Matthew', abra: 'Abraham',
    tim: 'Timothy', walt: 'Walter', phil: 'Philip', ste: 'Stephen',
    steph: 'Stephen', gab: 'Gabriel', lawr: 'Lawrence', arth: 'Arthur',
    jon: 'Jonathan', jos: 'Joseph', humph: 'Humphrey', barth: 'Bartholomew',
    theo: 'Theophilus', zach: 'Zachary', jeff: 'Jeffrey', greg: 'Gregory',
    wittm: 'William', wlftm: 'William', wiftm: 'William', wllm: 'William',
    anto: 'Anthony', antho: 'Anthony',
};
// The worst recurring OCR misreadings of ship names in the register
// formulas. Anything not in this table keeps its cleaned reading.
const SHIP_ALIASES = {
    hopewcll: 'hopewell', hopcwell: 'hopewell', hopnvell: 'hopewell',
    hopeivcll: 'hopewell', rabecca: 'rebecca', elisabeth: 'elizabeth',
    elizabetli: 'elizabeth', 'eliz': 'elizabeth', encrease: 'increase',
    trulove: 'truelove', faulcon: 'falcon', abigaill: 'abigail',
    abigall: 'abigail', abbigall: 'abigail', tjiomas: 'thomas',
    'mat/iew': 'mathew', matiiew: 'mathew', 'pidc-coivc': 'pied cow',
    "rictc-con'c": 'pied cow', 'pied-cow': 'pied cow',
    merch: 'merchant bonaventure', "merch'": 'merchant bonaventure',
    'susan and ellin': 'susan and ellen', plaine: 'plain joan',
    'ann and eliz': 'ann and elizabeth', 'eliz and ann': 'elizabeth and ann',
    'hopewcll captcn': 'hopewell', 'merch bonavunture': 'merchant bonaventure',
    "merch' bonavunture": 'merchant bonaventure',
    'america wlftm': 'america', 'david jo the minister': 'david',
    'elizabetli and ann wlftm': 'elizabeth and ann', 'plaine joan': 'plain joan',
    'primrose capten': 'primrose', expectacon: 'expectation',
    'peter bonaven': 'peter bonaventure',
};
function slug(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
/** Repair 'l' misread for 'I' inside an uppercase run (WlLCOCK → WILCOCK). */
function fixCapsL(s) {
    let out = s;
    for (let pass = 0; pass < 3; pass += 1) {
        out = out.replace(/([A-Z])l(?=[A-Z])/g, '$1I').replace(/(^|\s)l([A-Z])/g, '$1I$2');
    }
    // A glued footnote mark after a caps run: "HEFORDf" — never a real
    // lowercase ending in these all-caps registers.
    return out.replace(/([A-Z]{3,})[ft*]\b/g, '$1');
}
function titleCase(s) {
    return s
        .toLowerCase()
        .replace(/(^|[\s-])[a-z]/g, (c) => c.toUpperCase())
        .replace(/\bAnd\b/g, 'and');
}
function expandGiven(token) {
    const key = token.toLowerCase().replace(/[:.°'’]+$/, '');
    return GIVEN_ABBREV[key] ?? titleCase(token.replace(/[:.°]+$/, ''));
}
function normalizeAge(raw) {
    const cleaned = raw.replace(/[Oo]/g, '0').replace(/[lI!]/g, '1').replace(/S/g, '5');
    const n = Number(cleaned);
    return Number.isFinite(n) && n > 0 && n < 100 ? n : null;
}
/**
 * Passenger entries on one register line. A line may hold several people
 * joined by '&' ("EDMOND WEAVER 28 yers & his wife MARGRETT aged 30");
 * a lone given name inherits the surname of the person before it, and an
 * age becomes a derived birth year ("c. 1607").
 */
export function extractEntries(line, year, lastSurname) {
    const entries = [];
    const segments = line.split(/\s+&\s+/);
    for (const seg of segments) {
        const m = /([A-Z][A-Za-z:.'’°\[\]\- ]{1,40}?)[\s.…_\-•'’,*]*([0-9OoIl!Si]{1,2})[.,]?\s*(?:yeres|yers|yeeres|yeres\.)?\.?\s*$/.exec(seg.trim().replace(/[*†|]/g, ''));
        if (!m)
            continue;
        const age = normalizeAge(m[2]);
        if (age === null)
            continue;
        // Strip leading occupation prose: keep from the last run of 2+ caps-ish
        // name tokens. Bracketed corrections win over the misreading.
        const namePart = fixCapsL(m[1])
            .replace(/[A-Za-z'’]+\s*\[\s*(?:or\s+)?([A-Za-z'’]+)\s*\]/g, '$1')
            .replace(/[.…_]+/g, ' ')
            .trim();
        const tokens = namePart.split(/\s+/).filter((t) => /^[A-Za-z:'’°-]+$/.test(t));
        // Name tokens are (mostly) upper-case in the registers; occupation
        // prefixes are not. Walk from the end collecting caps-run tokens.
        const nameTokens = [];
        for (let t = tokens.length - 1; t >= 0 && nameTokens.length < 4; t -= 1) {
            const tok = tokens[t];
            const letters = tok.replace(/[^A-Za-z]/g, '');
            const upper = letters.replace(/[^A-Z]/g, '').length;
            // "Jo:"/"NlC°:" — an abbreviated given name is a name token even
            // though its caps ratio is low.
            const abbreviated = /^[A-Z][A-Za-z]{0,5}[:°]$/.test(tok);
            if (abbreviated || (letters.length >= 2 && upper / letters.length >= 0.6)) {
                nameTokens.unshift(tok);
            }
            else if (nameTokens.length > 0)
                break;
        }
        if (nameTokens.length === 0)
            continue;
        const prefix = tokens.slice(0, tokens.length - nameTokens.length).join(' ');
        let given;
        let surname;
        if (nameTokens.length === 1) {
            // "his wife MARGRETT aged 30" — a lone name inherits the surname.
            given = expandGiven(nameTokens[0]);
            surname = lastSurname;
            if (!surname)
                continue;
        }
        else {
            surname = titleCase(fixCapsL(nameTokens[nameTokens.length - 1]).replace(/[:.°'’]+$/, ''));
            given = nameTokens.slice(0, -1).map(expandGiven).join(' ');
            lastSurname = surname;
        }
        const notes = [prefix && /^[A-Za-z]/.test(prefix) ? prefix : '', `aged ${age} in ${year}`]
            .filter(Boolean)
            .join('; ');
        entries.push({ given, surname, birth: `c. ${year - age}`, notes });
    }
    return { entries, lastSurname };
}
function main() {
    const [input, outDir] = process.argv.slice(2);
    if (!input || !outDir) {
        console.error('usage: parse-hotten.ts <hotten.txt> <outDir>');
        process.exit(1);
    }
    let text = readFileSync(input, 'utf8');
    text = text
        .replace(/¬\s*\n+\s*/g, '')
        .replace(/([A-Za-z])-\s*\n+\s*(?=[A-Za-z])/g, '$1') // rejoin split names
        .replace(/[£]/g, '&');
    const lines = text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim());
    const rowsByVoyage = new Map();
    const voyageMeta = new Map();
    let year = 1634;
    let currentKey = null;
    let inBlock = false;
    let staleLines = 0;
    let consumed = 0;
    let skippedSample = [];
    let lastSurname = '';
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (!line)
            continue;
        // Running year from any date-ish token, tolerating OCR 1→i/l/[' noise.
        const ym = /(?:^|[\s'\[])[1iIl!']?(6[0-4][0-9])(?:$|[\s\].,])/.exec(line);
        if (ym && !/&/.test(line)) {
            const y = Number(`1${ym[1]}`);
            if (y >= 1607 && y <= 1660)
                year = y;
        }
        // A register formula opens a block and names the ship.
        if (/imbarqu/i.test(line) || /imbarqu/i.test(lines[i + 1] ?? '')) {
            // In the formulas the OCR reads '&' between ship-name words as a
            // bare 'f' ("Ann f Elizabeth"); repair before extracting.
            const window = [lines[i - 1], line, lines[i + 1], lines[i + 2]]
                .filter(Boolean)
                .join(' ')
                .replace(/\s[f£]\s/g, ' and ')
                .replace(/\s&\s/g, ' and ')
                .replace(/\bEliz:\s*/g, 'Eliz ');
            // "imbarqued in the said Shipp" continues the previous register.
            if (/imbarqued?\s+in\s+(?:ye|the)\s+said\b/i.test(window) && currentKey) {
                inBlock = true;
                staleLines = 0;
                continue;
            }
            // No /i flag: under it [A-Z]{2} would match any two letters and clip
            // "Susan and Ellin" to "Susan". Case variants are spelled out, and
            // the master-name terminators tolerate OCR'd caps (NlC°:, Jo:).
            const shipMatch = /[Ii]mbarqued?\s+[Ii]n\s+(?:[Yy]e|y[e'’=]|[Tt]he|\^?)\s*([A-Za-z&'’ \-]{3,30}?)(?=\s+(?:de\s|of\s|[A-Z]{2}|[A-Z][l!1][A-Z]|[A-Z][a-z]*[:°]|Mr\b|M[1l']\b|Capt?\b|bound|prd|now|ryding|aforesaid|,|\.|:|$))/.exec(window);
            if (!shipMatch && /imbarqu/i.test(line)) {
                // A formula whose ship we cannot read must still END the previous
                // block, or its passengers pile into the wrong ship.
                inBlock = false;
                currentKey = null;
                continue;
            }
            if (shipMatch) {
                let ship = shipMatch[1].trim().toLowerCase().replace(/\s+/g, ' ');
                ship = SHIP_ALIASES[ship] ?? ship;
                const destMatch = /transported\s+to\s+([A-Za-z£&' \-]{3,25}?)(?=\s*[,.:]|\s+imbarqu|$)/i.exec(window);
                const dest = destMatch ? destMatch[1].trim() : '';
                const key = `${slug(ship)}-${year}`;
                currentKey = key;
                inBlock = true;
                staleLines = 0;
                lastSurname = '';
                if (!voyageMeta.has(key)) {
                    voyageMeta.set(key, { ship: titleCase(ship), year, dests: new Set() });
                    rowsByVoyage.set(key, []);
                }
                if (dest)
                    voyageMeta.get(key).dests.add(titleCase(dest));
                continue;
            }
        }
        if (!inBlock || !currentKey)
            continue;
        // Page furniture and tallies end nothing but are never passengers.
        if (/\b(psons|PASSINGER|PASSED FROM|Certificate|Minister|Justices|Attestacon|oath|Subsedy)\b/i.test(line))
            continue;
        if (/^[\[\]*†\d]/.test(line))
            continue;
        // A passenger line ends in an age. Multi-person lines join with '&'.
        const extracted = extractEntries(line, year, lastSurname);
        lastSurname = extracted.lastSurname;
        let matchedAny = extracted.entries.length > 0;
        for (const e of extracted.entries) {
            rowsByVoyage.get(currentKey).push({
                ...e,
                source: `${SOURCE} — ${voyageMeta.get(currentKey).ship} (${year}) register`,
            });
            consumed += 1;
        }
        if (matchedAny) {
            staleLines = 0;
        }
        else {
            if (/[A-Z]{3}/.test(line) && skippedSample.length < 300) {
                skippedSample.push(`[${currentKey}] ${line}`);
            }
            // A register is a dense run of name+age lines; a long dry spell
            // means the block ended and narrative (or another kind of list —
            // Barbados tickets-of-leave, parish registers) has begun.
            staleLines += 1;
            if (staleLines > 25) {
                inBlock = false;
                currentKey = null;
            }
        }
    }
    mkdirSync(outDir, { recursive: true });
    const voyages = [];
    for (const [id, meta] of voyageMeta) {
        const rows = rowsByVoyage.get(id);
        if (rows.length === 0)
            continue;
        voyages.push({
            id,
            ship: meta.ship,
            arrivalYear: meta.year,
            notes: `London port register certificates${meta.dests.size ? `, bound for ${[...meta.dests].join(' / ')}` : ''}. Ages as sworn at embarkation; birth years derived from them.`,
            source: SOURCE,
        });
        const csv = ['given,surname,birth,notes,source']
            .concat(rows.map((r) => [r.given, r.surname, r.birth, r.notes, r.source]
            .map((f) => (/[",]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f))
            .join(',')))
            .join('\n');
        writeFileSync(join(outDir, `${id}.csv`), csv + '\n');
    }
    voyages.sort((a, b) => a.arrivalYear - b.arrivalYear || a.id.localeCompare(b.id));
    writeFileSync(join(outDir, 'voyages.json'), JSON.stringify(voyages, null, 2) + '\n');
    writeFileSync(join(outDir, 'coverage.txt'), skippedSample.join('\n') + '\n');
    console.log(`${voyages.length} voyages, ${consumed} passengers.`);
    for (const v of voyages)
        console.log(`  ${v.id}: ${rowsByVoyage.get(v.id).length}`);
}
if (process.argv[1]?.endsWith('parse-hotten.ts'))
    main();

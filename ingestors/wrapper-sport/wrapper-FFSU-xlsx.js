const axios = require('axios');
const cheerio = require('cheerio');
const xlsx = require('xlsx');

// --- CONFIGURATION ---
const SOURCE_URL = 'https://sport-u-auvergnerhonealpes.com/sports-co-lyon-2-2-2/';
const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_TOKEN) throw new Error('DIRECTUS_TOKEN env variable is required');

const HEADERS = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${DIRECTUS_TOKEN}`
};

/**
 * Utilitaire: Génère un entier de 31 bits à partir d'une chaîne de caractères
 */
function stringToHashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0; // Convertit en entier 32 bits
    }
    // On retourne la valeur absolue pour éviter les IDs négatifs
    return Math.abs(hash);
}

/**
 * Étape 1 : Récupère les liens des fichiers Excel depuis la page
 */
async function fetchExcelLinks(url) {
    try {
        console.log(`Récupération de la page: ${url}`);
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        const links = [];

        // Recherche de tous les liens qui terminent par .xlsx ou .xls
        $('a').each((i, element) => {
            const href = $(element).attr('href');
            if (href && (href.toLowerCase().endsWith('.xlsx') || href.toLowerCase().endsWith('.xls'))) {
                links.push(href);
            }
        });
        
        console.log(`${links.length} fichiers Excel trouvés sur la page.`);
        return links;
    } catch (error) {
        console.error(`Erreur lors de la récupération de l'URL ${url}:`, error.message);
        return [];
    }
}

/**
 * Étape 2 : Télécharge et parse un fichier Excel depuis son URL
 */
async function parseExcelFromUrl(fileUrl) {
    try {
        console.log(`Téléchargement de: ${fileUrl}`);
        // Récupérer le fichier sous forme de buffer
        const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
        const buffer = response.data;
        
        // Lire le buffer avec la librairie xlsx
        // raw: false permet de convertir les dates Excel au format texte
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        const allEvents = [];
        
        // On ne regarde que la première feuille de l'Excel
        if (workbook.SheetNames.length > 0) {
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            // header: 1 permet de récupérer chaque ligne sous forme de tableau (['4/23/26', 'VB', 'M', ...])
            const data = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false });
            allEvents.push(...data);
        }

        return allEvents;
    } catch (error) {
        console.error(`Erreur lors du parsing de l'Excel ${fileUrl}:`, error.message);
        return [];
    }
}

/**
 * Dictionnaire de correspondances des sports
 */
const SPORT_MAP = {
    'RB': 'Rugby',
    'FB': 'Football',
    'FB à 8': 'Football à 8',
    'VB': 'Volleyball',
    'BEACH VOLLEY': 'Beach Volley',
    'BB': 'Basketball',
    'HB': 'Handball'
};

const ORGANIZER_NAME_MAP = {
    'Rugby': 'AS Rugby',
    'Football': 'AS Football',
    'Football à 8': 'AS Football',
    'Volleyball': 'AS Volleyball',
    'Beach Volley': 'AS Volleyball',
    'Basketball': 'AS Basketball',
    'Handball': 'AS Handball'
};

const LOGO_MAP = {
    'AS Rugby': 'https://www.osvilleurbanne.com/wp-content/uploads/2021/08/AS-INSA-LYON-1.png',
    'AS Football': 'https://www.osvilleurbanne.com/wp-content/uploads/2021/08/AS-INSA-LYON-1.png',
    'AS Volleyball': 'https://www.osvilleurbanne.com/wp-content/uploads/2021/08/AS-INSA-LYON-1.png',
    'AS Basketball': 'https://www.osvilleurbanne.com/wp-content/uploads/2021/08/AS-INSA-LYON-1.png',
    'AS Handball': 'https://www.osvilleurbanne.com/wp-content/uploads/2021/08/AS-INSA-LYON-1.png'
};

/**
 * Étape 3 : Filtre les événements INSA et formate pour Directus
 */
function filterAndFormatEvents(rawRows, fileName) {
    const insaEvents = [];

    // On s'attend à ce que rawRows contienne des tableaux complets extraits avec header: 1
    for (const [index, row] of rawRows.entries()) {
        if (!Array.isArray(row)) continue;

        // Convertir la ligne en string pour chercher le mot clé "INSA" de façon globale, peu importe la colonne
        const rowString = JSON.stringify(row).toLowerCase();

        if (rowString.includes('insa')) {
            // On extrait les variables selon leur position dans le tableau
            const date = row[0] || null;
            const defaultSportCode = fileName.replace(/_/g, ' ') || 'Sport Co';
            let sportCode = row[1] || '';
            const sportName = SPORT_MAP[sportCode.toUpperCase()] || defaultSportCode;

            const poule = row[3] || '';
            const teamLocal = row[4] || 'Equipe 1 inconnue';
            const teamVisitor = row[5] || 'Equipe 2 inconnue';
            const time = row[6] || '';
            const location = row[7] || 'Lieu non spécifié';

            const matchFingerprint = `${date}_${sportName}_${teamLocal}_${teamVisitor}_${time}`;

            const organizerName = ORGANIZER_NAME_MAP[sportName] || null;
            const organizerId = organizerName ? `ffsu-${organizerName.toLowerCase().replace(/\s+/g, '-')}` : null;

            const formattedEvent = {
                external_id: stringToHashCode(matchFingerprint),
                status: "draft",
                name: `Match de ${sportName}: ${teamLocal.trim()} - ${teamVisitor.trim()}`,
                startDate: parseDate(date, time),
                endDate: parseDate(date, time, 3),  // arbitraire
                location: String(location).trim(),
                description: `Match de ${sportName} ${teamLocal.trim()} contre ${teamVisitor.trim()}.${poule ? ' Poule ' + poule.trim() : ''}`,
                categories: ["Sport"],
                logo_url: organizerName ? (LOGO_MAP[organizerName] || null) : null,
                organizer: organizerId,
                rawData: organizerName ? { association: { id: organizerId, name: organizerName } } : null,
                _organizerName: organizerName
            };

            insaEvents.push(formattedEvent);
        }
    }

    return insaEvents;
}

/**
 * Utilitaire: Construit un objet Date ISO depuis des textes comme "15/12/2026" et "14:30"
 */
function parseDate(dateStr, timeStr, addHours = 0) {
    if (!dateStr) return null;
    
    try {
        // Exemple simple : on suppose un format Français "DD/MM/YYYY" ou "MM/DD/YY" récupéré depuis xlsx en raw:false
        // NOTE: À modifier si le format de date obtenu est différent dans tes fichiers (ex: numéros de série Excel)
        const dateObj = new Date(dateStr + (timeStr ? ` ${timeStr}` : ''));
        if (isNaN(dateObj.getTime())) {
            // Si la date est invalide, retourner la date actuelle par précaution pour éviter une erreur Directus
            const fallback = new Date();
            fallback.setHours(fallback.getHours() + addHours);
            return fallback.toISOString();
        }
        dateObj.setHours(dateObj.getHours() + addHours);
        return dateObj.toISOString();
    } catch {
        return null;
    }
}

/**
 * Étape 4a : Upsert de l'organisateur
 */
async function upsertOrganizer(organizerId, organizerName) {
    try {
        const checkRes = await fetch(`${DIRECTUS_URL}/items/organizers/${organizerId}`, { headers: HEADERS });
        const checkData = await checkRes.json();
        if (checkRes.ok && checkData?.data != null) return;

        const createRes = await fetch(`${DIRECTUS_URL}/items/organizers`, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify({ id: organizerId, name: organizerName })
        });
        if (!createRes.ok) {
            const err = await createRes.json();
            console.warn(`[Organisateur] Échec création "${organizerName}": ${err?.errors?.[0]?.message}`);
        } else {
            console.log(`[Organisateur] Créé "${organizerName}" (${organizerId})`);
        }
    } catch (err) {
        console.error(`[Organisateur] Erreur réseau pour "${organizerName}":`, err.message);
    }
}

/**
 * Étape 4b : Upsert vers l'API de Directus (création ou mise à jour)
 */
async function upsertEvent(eventData) {
    try {
        const searchRes = await fetch(
            `${DIRECTUS_URL}/items/events?filter[external_id][_eq]=${encodeURIComponent(eventData.external_id)}&limit=1`,
            { headers: HEADERS }
        );
        const searchJson = await searchRes.json();
        const existing = searchJson?.data?.[0];

        let response;
        if (existing) {
            response = await fetch(`${DIRECTUS_URL}/items/events/${existing.id}`, {
                method: 'PATCH',
                headers: HEADERS,
                body: JSON.stringify(eventData)
            });
        } else {
            response = await fetch(`${DIRECTUS_URL}/items/events`, {
                method: 'POST',
                headers: HEADERS,
                body: JSON.stringify(eventData)
            });
        }

        const rawText = await response.text();
        let responseData;
        try {
            responseData = rawText ? JSON.parse(rawText) : {};
        } catch {
            throw new Error(`Statut HTTP ${response.status} sans JSON valide. Contenu: ${rawText}`);
        }

        if (!response.ok) {
            console.warn(`[Erreur] Détails Directus pour "${eventData.name}":`, JSON.stringify(responseData, null, 2));
            return;
        }

        const action = existing ? 'Mise à jour' : 'Ajout';
        console.log(`[Succès] ${action} de "${eventData.name}" (ID Directus: ${responseData.data?.id})`);

    } catch (error) {
        console.error(`[Erreur réseau] Échec pour "${eventData.name}":`, error.message);
    }
}

/**
 * Orchestrateur
 */
async function runWrapper() {
    console.log("=== DÉBUT DU WRAPPER FFSU ===");

    // 1. Récupération des liens
    const links = await fetchExcelLinks(SOURCE_URL);
    
    let totalInsaEvents = 0;
    
    // 2. Traitement de chaque fichier
    for (const link of links) {
        const fileName = link.split('/').pop().split('.')[0];
        
        // Téléchargement et Parsing
        const rawRows = await parseExcelFromUrl(link);
        
        // Filtrage et Formatage
        const insaEvents = filterAndFormatEvents(rawRows, fileName);
        totalInsaEvents += insaEvents.length;
        
        console.log(`-> ${insaEvents.length} événements INSA trouvés dans ${fileName}`);

        // 3. Envoi à Directus
        for (const event of insaEvents) {
            if (event._organizerName) await upsertOrganizer(event.organizer, event._organizerName);
            delete event._organizerName;
            await upsertEvent(event);
        }
    }

    console.log(`=== FIN DU WRAPPER (${totalInsaEvents} événements insérés au total) ===`);
}

// Lancement
runWrapper();

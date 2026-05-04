const axios = require('axios');
const cheerio = require('cheerio');
const xlsx = require('xlsx');

// --- CONFIGURATION ---
const SOURCE_URL = 'https://sport-u-auvergnerhonealpes.com/sports-co-lyon-2-2-2/';
const DIRECTUS_URL = 'http://localhost:8055'; // A vérifier lors de la configuration de Directus
const DIRECTUS_TOKEN = ''; // A mettre 

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

/**
 * Étape 3 : Filtre les événements INSA et formate pour Directus
 */
function filterAndFormatEvents(rawRows, fileName) {
    const insaEvents = [];

    // On s'attend à ce que rawRows contienne des tableaux complets extraits avec header: 1
    for (const row of rawRows) {
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

            const formattedEvent = {
                external_id: `FFSU_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, 
                title: `Match de ${sportName}: ${teamLocal.trim()} - ${teamVisitor.trim()}`,
                start_date: parseDate(date, time),
                end_date: null, // Pas de end_date demandée
                location: String(location).trim(),
                description: `Match de ${sportName} ${teamLocal.trim()} contre ${teamVisitor.trim()}.${poule ? ' Poule ' + poule.trim() : ''}`,
                source: "FFSU Sport-U"
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
 * Étape 4 : Chargement vers l'API de Directus
 */
async function sendToDirectus(eventData) {
    try {
        const response = await fetch(`${DIRECTUS_URL}/items/events`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DIRECTUS_TOKEN}`
            },
            body: JSON.stringify(eventData)
        });

        if (!response.ok) {
            const errorDetails = await response.json();
            console.warn(`[Avertissement] Rejet Directus pour "${eventData.title}" : ${errorDetails.errors?.[0]?.message}`);
            return;
        }

        const result = await response.json();
        console.log(`[Succès] Ajout de "${eventData.title}" (ID Directus: ${result.data.id})`);
        
    } catch (error) {
        console.error(`[Erreur réseau] Échec pour "${eventData.title}":`, error.message);
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
            await sendToDirectus(event);
        }
    }

    console.log(`=== FIN DU WRAPPER (${totalInsaEvents} événements insérés au total) ===`);
}

// Lancement
runWrapper();

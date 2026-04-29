const ical = require('node-ical');
//LA bibliothèque ical parse le calendrier et renomme les var ical en variables plus lisibles 

// L'URL cible reste la même
const ICS_URL = 'https://portail.asso-insa-lyon.fr/events/calendar';

// 1. Fonction d'extraction (identique)
async function fetchPortailVAEvents() {
    try {
        console.log(`Telechargement du calendrier depuis ${ICS_URL}...`);
        const events = await ical.async.fromURL(ICS_URL);
        
        const parsedEvents = [];
        for (const k in events) {
            if (events.hasOwnProperty(k) && events[k].type === 'VEVENT') {
                parsedEvents.push(events[k]);
            }
        }
        return parsedEvents;
    } catch (err) {
        console.error("Erreur de telechargement :", err);
        return [];
    }
}

// 2. Fonction de transformation (identique)
function mapToDirectusEventFormat(icalEvent) {
    return {
        external_id: icalEvent.uid, 
        name: icalEvent.summary,
        // Conversion de l'objet Date JavaScript en format ISO attendu par Directus
        startDate: icalEvent.start ? icalEvent.start.toISOString() : null,
        endDate: icalEvent.end ? icalEvent.end.toISOString() : null,
        location: icalEvent.location || 'Lieu non précisé',
        geo : icalEvent.geo ? `${icalEvent.geo.lat},${icalEvent.geo.lon}` : null,
        description: icalEvent.description || '',
        source: "Portail VA",
        rawData: JSON.stringify(icalEvent) 
    };
}

// 3. Fonction de Test (Remplace sendToDirectus)
async function runTest() {
    console.log("--- DEMARRAGE DU TEST EN LOCAL ---");
    
    // Extraction
    const rawEvents = await fetchPortailVAEvents();
    console.log(`${rawEvents.length} evenements bruts trouves.\n`);

    console.log("--- VOICI TOUTES LES VARIABLES DU PREMIER ÉVÉNEMENT ---");
    console.log(rawEvents[0]);

    const formattedEvents = [];

    // Transformation
    for (const rawEvent of rawEvents) {
        if (rawEvent.start && rawEvent.summary) {
            const formatted = mapToDirectusEventFormat(rawEvent);
            formattedEvents.push(formatted);
        }
    }

    // Affichage des resultats
    console.log("--- APERCU DES 3 PREMIERS EVENEMENTS FORMATES ---");
    console.log(JSON.stringify(formattedEvents.slice(0, 5), null, 2));

    console.log(`\n--- TEST TERMINE : ${formattedEvents.length} evenements sont valides et prets pour Directus. ---`);
}

// Lancement du test
runTest();

// Lancer le test : 
// npm install node-ical node-fetch
// node ./test-wrapper-va.js
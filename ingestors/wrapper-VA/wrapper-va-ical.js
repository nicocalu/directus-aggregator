const ical = require('node-ical');

// --- CONFIGURATION ---
const ICS_URL = 'https://portail.asso-insa-lyon.fr/events/calendar';
const DIRECTUS_URL = 'http://localhost:8055'; //A vérifier lors de la configuration de Directus
const DIRECTUS_TOKEN = 'oV4qpO56jJc0FTmoB30cQpb77XuIytP3'; 

/**
 * Étape 1 : Extraction
 * Télécharge et parse (analyse) le fichier iCal distant.
 */
async function fetchPortailVAEvents() {
    try {
        console.log(`Téléchargement du calendrier depuis ${ICS_URL}...`);
        const events = await ical.async.fromURL(ICS_URL);
        
        const parsedEvents = [];
        for (const k in events) {
            if (events.hasOwnProperty(k) && events[k].type === 'VEVENT') {
                parsedEvents.push(events[k]);
            }
        }
        return parsedEvents;
    } catch (err) {
        console.error("Erreur lors de l'extraction de l'iCal:", err);
        return [];
    }
}

/**
 * Étape 2 : Transformation
 * Mappe les champs iCal vers la structure de votre base Directus.
 */
function mapToDirectusEventFormat(icalEvent) {
    return {
        external_id: icalEvent.uid, 
        name: icalEvent.summary,
        // Conversion de l'objet Date JavaScript en format ISO attendu par Directus
        startDate: icalEvent.start ? icalEvent.start.toISOString() : null,
        endDate: icalEvent.end ? icalEvent.end.toISOString() : null,
        location: icalEvent.location || 'Lieu non précisé',
        geo : icalEvent.geo ? `{"type": "Point", "coordinates": [${icalEvent.geo.lon}, ${icalEvent.geo.lat}]}` : null,
        description: icalEvent.description || '',
        source: "Portail VA",
        rawData: JSON.stringify(icalEvent) 
    };
}

/**
 * Étape 3 : Chargement
 * Envoie l'événement vers l'API de Directus en utilisant node-fetch natif.
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
            // Code 400 (Bad Request) indique souvent une erreur de validation ou de doublon (si external_id est mis en "unique" dans Directus)
            console.warn(`[Avertissement] Rejet Directus pour "${eventData.name}" : ${errorDetails.errors[0].message}`);
            return;
        }

        const result = await response.json();
        console.log(`[Succès] Ajout de "${eventData.name}" (ID Directus: ${result.data.id})`);
        
    } catch (error) {
        console.error(`[Erreur réseau] Échec pour "${eventData.name}":`, error.message);
    }
}

/**
 * Orchestrateur
 */
async function runWrapper() {
    console.log("=== DÉBUT DU WRAPPER PORTAIL VA ===");
    
    // 1. Récupération des données brutes de l'agenda
    const rawEvents = await fetchPortailVAEvents();
    console.log(`${rawEvents.length} événements extraits de l'iCal.`);

    // 2 & 3. Boucle de Traitement
    for (const rawEvent of rawEvents) {
        // On évite d'envoyer des événements sans date de début ou sans titre
        if (rawEvent.start && rawEvent.summary) {
            const formattedEvent = mapToDirectusEventFormat(rawEvent);
            await sendToDirectus(formattedEvent);
        }
    }

    console.log("=== FIN DU WRAPPER ===");
}

// Lancement
runWrapper();
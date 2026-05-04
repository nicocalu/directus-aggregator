// --- CONFIGURATION ---
const API_URL = 'https://portail.asso-insa-lyon.fr/api/v1/events/';
const DIRECTUS_URL = 'http://localhost:8055';
const DIRECTUS_TOKEN = 'uUj4ckksPzS1ez7r2iTMgrRNBMyLiq7w';

const HEADERS = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${DIRECTUS_TOKEN}`
};

async function fetchPortailVAEvents() {
    try {
        console.log(`Téléchargement des événements depuis ${API_URL}...`);
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (err) {
        console.error("Erreur lors de l'extraction de l'API:", err.message);
        return [];
    }
}

function mapToDirectusEventFormat(apiEvent) {
    const geo = apiEvent.location?.lat && apiEvent.location?.long
        ? { type: 'Point', coordinates: [parseFloat(apiEvent.location.long), parseFloat(apiEvent.location.lat)] }
        : null;

    return {
        external_id: `insa-lyon-portal-${apiEvent.id}`,
        name: apiEvent.name,
        startDate: apiEvent.begins_at,
        endDate: apiEvent.ends_at,
        description: apiEvent.description || '',
        location: apiEvent.location?.name || null,
        geo,
        categories: apiEvent.type ? [apiEvent.type.name] : null,
        logo_url: apiEvent.logo_url || null,
        website_url: apiEvent.website_url || null,
        organizer: apiEvent.association ? `insa-lyon-asso-${apiEvent.association.id}` : null,
        rawData: apiEvent
    };
}

async function upsertOrganizer(association) {
    if (!association) return;

    const organizerId = `insa-lyon-asso-${association.id}`;
    const payload = {
        id: organizerId,
        name: association.name,
        acronym: association.acronym || null
    };

    try {
        const checkRes = await fetch(`${DIRECTUS_URL}/items/organizers/${organizerId}`, {
            headers: HEADERS
        });
        const checkData = await checkRes.json();
        const organizerExists = checkRes.ok && checkData?.data != null;

        if (!organizerExists) {
            const createRes = await fetch(`${DIRECTUS_URL}/items/organizers`, {
                method: 'POST',
                headers: HEADERS,
                body: JSON.stringify(payload)
            });
            if (!createRes.ok) {
                const err = await createRes.json();
                console.warn(`[Organisateur] Échec création "${association.name}": ${err?.errors?.[0]?.message}`);
            }
        }
    } catch (err) {
        console.error(`[Organisateur] Erreur réseau pour "${association.name}":`, err.message);
    }
}

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
            const errorMessage = responseData?.errors?.[0]?.message || 'Erreur inconnue';
            console.warn(`[Avertissement] Rejet Directus pour "${eventData.name}" (${response.status}): ${errorMessage}`);
            return;
        }

        const action = existing ? 'Mise à jour' : 'Ajout';
        console.log(`[Succès] ${action} de "${eventData.name}" (ID Directus: ${responseData.data?.id})`);

    } catch (error) {
        console.error(`[Erreur réseau] Échec pour "${eventData.name}":`, error.message);
    }
}

async function runWrapper() {
    console.log("=== DÉBUT DU WRAPPER PORTAIL VA ===");

    const rawEvents = await fetchPortailVAEvents();
    console.log(`${rawEvents.length} événements extraits de l'API.`);

    for (const rawEvent of rawEvents) {
        if (!rawEvent.begins_at || !rawEvent.name) continue;

        await upsertOrganizer(rawEvent.association);

        const formattedEvent = mapToDirectusEventFormat(rawEvent);
        await upsertEvent(formattedEvent);
    }

    console.log("=== FIN DU WRAPPER ===");
}

runWrapper();

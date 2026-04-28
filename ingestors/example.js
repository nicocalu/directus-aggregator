async function runIngestor() {
    // 1. Fetch your raw data (Simulated here)
    // const response = await fetch('https://source-a.com/api/events');
    // const rawData = await response.json();
    const rawData = [
        { name: "Test Event", begin: "2026-04-29T18:00:24Z", end: "2026-04-29T22:00:00Z" }
    ];

    // 2. Transform the data to match your Directus schema
    const formattedEvents = rawData.map(event => ({
        title: event.name,
        start: event.begin,
        end: event.end,
        source: "Source A",
        raw_data: event // Save the original payload just in case!
    }));

    // 3. POST to Directus
    const directusUrl = 'http://localhost:8055/items/events';
    const token = 'my-super-secret-token'; // Replace with your Ingestor User token

    try {
        const result = await fetch(directusUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(formattedEvents)
        });

        if (result.ok) {
            console.log("Successfully ingested events!");
        } else {
            const error = await result.json();
            console.error("Failed to ingest:", error);
        }
    } catch (err) {
        console.error("Network error:", err);
    }
}

runIngestor();

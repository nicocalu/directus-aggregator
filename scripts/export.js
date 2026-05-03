// scripts/export-config.js
const fs = require('fs');

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'your-admin-token'; // Create a static token for your Admin user in the UI

async function fetchFromAPI(endpoint) {
    const res = await fetch(`${DIRECTUS_URL}/${endpoint}`, {
        headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
    });
    if (!res.ok) throw new Error(`Failed to fetch ${endpoint}: ${res.statusText}`);
    const json = await res.json();
    return json.data;
}

async function exportConfig() {
    try {
        console.log('📦 Exporting Directus Configuration...');

        // Fetch entities, filtering out the default Admin to avoid conflicts
        const roles = await fetchFromAPI('roles');
        const policies = await fetchFromAPI('policies');
        const users = await fetchFromAPI('users');
        const permissions = await fetchFromAPI('permissions');
        // Add flows and operations if you start using them
        // const flows = await fetchFromAPI('flows');
        // const operations = await fetchFromAPI('operations');

        const config = {
            roles: roles.filter(r => r.name !== 'Administrator'),
            policies: policies.filter(p => p.name !== 'Administrator'),
            users: users.filter(u => u.email !== 'admin@example.com'),
            permissions: permissions
        };

        fs.writeFileSync('./scripts/config-backup.json', JSON.stringify(config, null, 2));
        console.log('✅ Successfully exported to config-backup.json');

    } catch (err) {
        console.error('❌ Export failed:', err);
    }
}

exportConfig();

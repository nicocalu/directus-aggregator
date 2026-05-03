// scripts/import-config.js
const fs = require('fs');

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'your-admin-token';

async function pushToAPI(endpoint, data) {
    // If the data array is empty, skip
    if (!data || data.length === 0) return;

    for (const item of data) {
        // Try to create the item
        const res = await fetch(`${DIRECTUS_URL}/${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ADMIN_TOKEN}`
            },
            body: JSON.stringify(item)
        });

        if (res.status === 409 || res.status === 400) {
            // If it already exists (Conflict), try to update it instead via PATCH
            const patchRes = await fetch(`${DIRECTUS_URL}/${endpoint}/${item.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ADMIN_TOKEN}`
                },
                body: JSON.stringify(item)
            });
            if (patchRes.ok) {
                console.log(`⏩ Updated existing ${endpoint}: ${item.name || item.id}`);
            } else {
                console.error(`❌ Failed to update ${endpoint}:`, await patchRes.text());
            }
        } else if (!res.ok) {
            console.error(`❌ Failed to create ${endpoint}:`, await res.text());
        } else {
            console.log(`✅ Created ${endpoint}: ${item.name || item.id}`);
        }
    }
}

async function importConfig() {
    try {
        console.log('📦 Importing Directus Configuration...');
        
        if (!fs.existsSync('./scripts/config-backup.json')) {
            throw new Error('config-backup.json not found!');
        }

        const config = JSON.parse(fs.readFileSync('./scripts/config-backup.json', 'utf8'));

        // The order matters here! 
        // 1. Roles & Policies
        await pushToAPI('roles', config.roles);
        await pushToAPI('policies', config.policies);
        
        // 2. Users (depends on roles)
        await pushToAPI('users', config.users);
        
        // 3. Permissions (depends on policies)
        // Note: permissions don't always have UUIDs in older versions, but v11 handles it gracefully
        await pushToAPI('permissions', config.permissions);

        console.log('✅ Import complete!');
    } catch (err) {
        console.error('❌ Import failed:', err);
    }
}

importConfig();

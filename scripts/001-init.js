const { randomUUID } = require('crypto');
const knex = require('knex')({
    client: 'pg',
    connection: {
        host: process.env.DB_HOST || '127.0.0.1',
        port: process.env.DB_PORT || 5432,
        user: process.env.DB_USER || 'directus',
        password: process.env.DB_PASSWORD || 'password',
        database: process.env.DB_DATABASE || 'directus',
    }
});

async function run() {
    try {
        console.log('Running Directus Auth Seeder...');

        const INGESTOR_ROLE_ID = '1192d52a-93b5-4d37-bd36-d59976d74a44';
        const INGESTOR_USER_ID = '3b9efe59-69f2-44f0-b3b9-925466f6e596';
        const INGESTOR_POLICY_ID = 'e79b4800-faef-4c47-b713-6e8e08df6c1d';
        const PUBLIC_POLICY_ID = 'abf8a154-5b1c-4a46-ac9c-7300570f4f17';
        const INGESTOR_TOKEN = 'my-super-secret-token';

        // 1. Create the 'Ingestor' Role
        const roleExists = await knex('directus_roles').where({ id: INGESTOR_ROLE_ID }).first();
        if (!roleExists) {
            await knex('directus_roles').insert({
                id: INGESTOR_ROLE_ID,
                name: 'Ingestor',
                icon: 'smart_toy',
                description: 'Automated bot for pushing JSON data'
            });
            console.log('✅ Created Ingestor Role');
        } else {
            console.log('⏩ Ingestor Role already exists');
        }

        // 2. Create the 'Ingestion Bot' User
        const userExists = await knex('directus_users').where({ id: INGESTOR_USER_ID }).first();
        if (!userExists) {
            await knex('directus_users').insert({
                id: INGESTOR_USER_ID,
                role: INGESTOR_ROLE_ID,
                first_name: 'Ingestion',
                last_name: 'Bot',
                token: INGESTOR_TOKEN,
                status: 'active'
            });
            console.log('✅ Created Ingestion Bot User');
        } else {
            console.log('⏩ Ingestion Bot User already exists');
        }

        // 3. Create the Access Policies
        const policies = [
            { id: INGESTOR_POLICY_ID, name: 'Ingestor Policy', app_access: false, admin_access: false },
            { id: PUBLIC_POLICY_ID, name: 'Public Event Access', app_access: false, admin_access: false }
        ];

        for (const policy of policies) {
            const policyExists = await knex('directus_policies').where({ id: policy.id }).first();
            if (!policyExists) {
                await knex('directus_policies').insert(policy);
                console.log(`✅ Created Policy: ${policy.name}`);
            } else {
                console.log(`⏩ Policy '${policy.name}' already exists`);
            }
        }
        
        // 4. Bridge the Policies in directus_access
        // Attach Ingestor Policy to the Ingestor Role
        const ingestorAccessExists = await knex('directus_access')
            .where({ policy: INGESTOR_POLICY_ID, role: INGESTOR_ROLE_ID })
            .first();
        if (!ingestorAccessExists) {
            await knex('directus_access').insert({
		id: randomUUID(),
                policy: INGESTOR_POLICY_ID,
                role: INGESTOR_ROLE_ID
            });
            console.log('✅ Bridged Ingestor Policy to Role');
        }

        // Attach Public Policy to the Public group (role/user are null)
        const publicAccessExists = await knex('directus_access')
            .where({ policy: PUBLIC_POLICY_ID })
            .whereNull('role')
            .whereNull('user')
            .first();
        if (!publicAccessExists) {
            await knex('directus_access').insert({
		id: randomUUID(),
                policy: PUBLIC_POLICY_ID,
                role: null, 
                user: null
            });
            console.log('✅ Bridged Public Policy to Public Group');
        }

        // 5. Attach Permissions to the Policies
        const permissions = [
            { policy: INGESTOR_POLICY_ID, collection: 'events', action: 'create' },
            { policy: INGESTOR_POLICY_ID, collection: 'events', action: 'update' },
            { policy: PUBLIC_POLICY_ID, collection: 'events', action: 'read' }
        ];

        for (const p of permissions) {
            const exists = await knex('directus_permissions')
                .where({ policy: p.policy, collection: p.collection, action: p.action }).first();
            if (!exists) {
                await knex('directus_permissions').insert(p);
                console.log(`✅ Granted ${p.action} permission on ${p.collection} for policy ${p.policy}`);
            }
        }
        
        console.log('✅ Successfully seeded Roles, Policies, Users, and Permissions!');
    } catch (error) {
        console.error('❌ Error seeding data:', error);
    } finally {
        await knex.destroy();
    }
}

run();

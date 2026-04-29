module.exports = {
    // The 'up' function runs when the migration is applied
    async up(knex) {
        // We use static UUIDs so the IDs remain exactly the same across all environments
        const INGESTOR_ROLE_ID = '1192d52a-93b5-4d37-bd36-d59976d74a44';
        const INGESTOR_USER_ID = '3b9efe59-69f2-44f0-b3b9-925466f6e596';
        const INGESTOR_POLICY_ID = 'e79b4800-faef-4c47-b713-6e8e08df6c1d';
	const PUBLIC_POLICY_ID = 'abf8a154-5b1c-4a46-ac9c-7300570f4f17';
        const INGESTOR_TOKEN = 'my-super-secret-token'; // The token your external scripts will use

        // 1. Create the 'Ingestor' Role (if it doesn't exist)
        const roleExists = await knex('directus_roles').where({ id: INGESTOR_ROLE_ID }).first();
        if (!roleExists) {
            await knex('directus_roles').insert({
                id: INGESTOR_ROLE_ID,
                name: 'Ingestor',
                icon: 'smart_toy',
                description: 'Automated bot for pushing JSON data'
            });
            console.log('✅ Created Ingestor Role');
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
        }

	// 3. Create the Access Policies
        await knex('directus_policies').insert([
            { id: INGESTOR_POLICY_ID, name: 'Ingestor Policy', app_access: false, admin_access: false },
            { id: PUBLIC_POLICY_ID, name: 'Public Event Access', app_access: false, admin_access: false }
        ]).onConflict('id').ignore();
        
        // 4. Bridge the Policies (directus_access table bridges Roles/Users to Policies)
        // Attach Ingestor Policy to the Ingestor Role
        await knex('directus_access').insert({
            policy: INGESTOR_POLICY_ID,
            role: INGESTOR_ROLE_ID
        }).onConflict(['policy', 'role']).ignore();

        // Attach Public Policy to the Public (null role/user means Public in Directus)
        // Note: Check your specific Directus version; sometimes Public is defined via a specific constant, but usually null role/user represents the public group.
        await knex('directus_access').insert({
            policy: PUBLIC_POLICY_ID,
            role: null, 
            user: null
        }).ignore();

        // 5. Attach Permissions to the Policies (NOT the roles!)
        const permissions = [
            // Ingestor can Create and Update events
            { policy: POLICY_ID, collection: 'events', action: 'create' },
            { policy: POLICY_ID, collection: 'events', action: 'update' },
            // Public can Read events
            { policy: PUBLIC_POLICY_ID, collection: 'events', action: 'read' }
        ];

        for (const p of permissions) {
            const exists = await knex('directus_permissions')
                .where({ policy: p.policy, collection: p.collection, action: p.action }).first();
            if (!exists) {
                await knex('directus_permissions').insert(p);
            }
        }
        
        console.log('✅ Successfully seeded Roles, Policies, Users, and Permissions!');

    },

    // The 'down' function runs if you ever tell Directus to rollback the migration
    async down(knex) {
        const INGESTOR_ROLE_ID = '1192d52a-93b5-4d37-bd36-d59976d74a44';
        const INGESTOR_USER_ID = '3b9efe59-69f2-44f0-b3b9-925466f6e596';
        const INGESTOR_POLICY_ID = 'e79b4800-faef-4c47-b713-6e8e08df6c1d';
        const PUBLIC_POLICY_ID = 'abf8a154-5b1c-4a46-ac9c-7300570f4f17';

        await knex('directus_permissions').whereIn('policy', [POLICY_ID, PUBLIC_POLICY_ID]).delete();
        await knex('directus_access').whereIn('policy', [POLICY_ID, PUBLIC_POLICY_ID]).delete();
        await knex('directus_policies').whereIn('id', [POLICY_ID, PUBLIC_POLICY_ID]).delete();
        await knex('directus_users').where({ id: USER_ID }).delete();
        await knex('directus_roles').where({ id: ROLE_ID }).delete();
    }
};

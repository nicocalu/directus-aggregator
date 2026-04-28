export default {
    id: 'ical', // The route will be accessible at /ical
    
    handler: (router, context) => {
        // Extract the required tools from the Directus context
        const { services, getSchema } = context;
        const { ItemsService } = services;

        // Note we added 'next' here for error handling as per the docs
        router.get('/', async (req, res, next) => {
            try {
                // 1. Fetch the schema asynchronously
                const schema = await getSchema();

                // 2. Connect to the 'events' collection
                const eventService = new ItemsService('events', { 
                    schema: schema, 
                    accountability: req.accountability 
                });

                // 3. Fetch all events from the database
                const events = await eventService.readByQuery({
                    fields: ['*'], // Get all columns
                    limit: -1      // Get everything
                });

                // 4. Build the iCalendar string
                let ical = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Your Event Aggregator//EN\r\n';
                
                for (const evt of events) {
                    if (!evt.startDate || !evt.endDate) continue; // Skip events without dates

                    // Convert standard dates to iCal format (20260429T180024Z)
                    const startFormat = new Date(evt.startDate).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
                    const endFormat = new Date(evt.endDate).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

                    ical += 'BEGIN:VEVENT\r\n';
                    ical += `UID:event-${evt.id}@yourdomain.com\r\n`;
                    ical += `DTSTART:${startFormat}\r\n`;
                    ical += `DTEND:${endFormat}\r\n`;
                    ical += `SUMMARY:${evt.name}\r\n`;
                    
                    if (evt.description) {
                        const cleanDesc = evt.description.replace(/\n/g, '\\n').replace(/\r/g, '');
                        ical += `DESCRIPTION:${cleanDesc}\r\n`;
                    }
                    if (evt.location) ical += `LOCATION:${evt.location}\r\n`;
                    
                    ical += 'END:VEVENT\r\n';
                }
                
                ical += 'END:VCALENDAR';

                // 5. Send the response as a downloadable .ics file
                res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
                res.setHeader('Content-Disposition', 'attachment; filename="events.ics"');
                res.send(ical);

            } catch (error) {
                // Pass errors to the Directus error handler to prevent server crashes
                next(error);
            }
        });
    }
};
